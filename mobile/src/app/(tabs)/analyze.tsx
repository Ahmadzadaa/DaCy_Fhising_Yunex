import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AnalyzingCard } from '@/components/AnalyzingCard';
import { ModeBadge } from '@/components/ModeBadge';
import { NotifyFamilyButton } from '@/components/NotifyFamilyButton';
import { ResultView } from '@/components/result/ResultView';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { InlineNotice } from '@/components/ui/misc';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { defineStrings, fmt, tr, useStrings, useUiLanguage } from '@/i18n';
import { resolveMode, runScreenshotAnalysis, runTextAnalysis } from '@/services/ai/modelProvider';
import { useHistory } from '@/state/history';
import { useProviderContext } from '@/state/useProviderContext';
import type { ScanSource, TextScanResult } from '@/types/security';

const MAX_CHARS = 20_000;

const S = defineStrings({
  en: {
    title: 'Check a message',
    subtitle: 'Paste an SMS, WhatsApp/Telegram message or link. DaCy explains exactly what is suspicious.',
    placeholder: 'Paste or type the message here…',
    paste: 'Paste',
    clear: 'Clear',
    screenshot: 'Screenshot',
    analyze: 'Analyse',
    chars: '{n} / {max}',
    clipboardEmpty: 'The clipboard has no text.',
    tipTitle: 'Faster: Screen Scan',
    tipBody: 'Scan whatever is on your screen with one tap from Control Center, the Action Button or Back Tap.',
    tipAction: 'Set it up',
    again: 'Check another message',
    permission: 'Photo access is needed to pick a screenshot.',
  },
  az: {
    title: 'Mesajı yoxla',
    subtitle: 'SMS, WhatsApp/Telegram mesajını və ya linki yapışdırın. DaCy nəyin şübhəli olduğunu dəqiq izah edir.',
    placeholder: 'Mesajı bura yapışdırın və ya yazın…',
    paste: 'Yapışdır',
    clear: 'Təmizlə',
    screenshot: 'Ekran şəkli',
    analyze: 'Analiz et',
    chars: '{n} / {max}',
    clipboardEmpty: 'Buferdə mətn yoxdur.',
    tipTitle: 'Daha sürətli: Ekran skanı',
    tipBody: 'Ekranda nə varsa, İdarəetmə Mərkəzi, Action düyməsi və ya Back Tap ilə bir toxunuşla yoxlayın.',
    tipAction: 'Qur',
    again: 'Başqa mesajı yoxla',
    permission: 'Ekran şəklini seçmək üçün foto icazəsi lazımdır.',
  },
});

export default function AnalyzeScreen() {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const ctx = useProviderContext();
  const { add } = useHistory();
  const [text, setText] = useState('');
  const [source, setSource] = useState<ScanSource>('manual');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<TextScanResult | null>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const effective = resolveMode(ctx);

  const finish = (scan: TextScanResult) => {
    add(scan);
    setResult(scan);
    const band = scan.assessment.band;
    Haptics.notificationAsync(
      band === 'critical' || band === 'high'
        ? Haptics.NotificationFeedbackType.Error
        : band === 'moderate'
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success,
    ).catch(() => undefined);
  };

  const analyze = async () => {
    const value = text.trim();
    if (!value || busy) return;
    inputRef.current?.blur();
    setBusy(true);
    setNotice(null);
    setResult(null);
    try {
      finish(await runTextAnalysis({ text: value, source, ctx }));
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    const value = await Clipboard.getStringAsync().catch(() => '');
    if (!value.trim()) {
      setNotice(t.clipboardEmpty);
      return;
    }
    setNotice(null);
    setText(value.slice(0, MAX_CHARS));
    setSource('clipboard');
    setResult(null);
  };

  const pickScreenshot = async () => {
    setNotice(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNotice(t.permission);
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setBusy(true);
    setResult(null);
    try {
      const outcome = await runScreenshotAnalysis({
        image: { uri: asset.uri, name: asset.fileName ?? 'screenshot.jpg', type: asset.mimeType ?? 'image/jpeg' },
        ctx,
      });
      if (outcome.ok) {
        setText(outcome.result.text);
        setSource('screenshot');
        finish(outcome.result);
      } else {
        setNotice(tr(outcome.message, lang));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t.title} subtitle={t.subtitle} titleAccessory={<ModeBadge mode={effective.mode} />}>

      <Card padding={spacing.md}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={(v) => {
            setText(v.slice(0, MAX_CHARS));
            setSource('manual');
            if (result) setResult(null);
          }}
          placeholder={t.placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          style={styles.input}
          accessibilityLabel={t.placeholder}
          autoCorrect={false}
        />
        <View style={styles.inputBar}>
          <Button label={t.paste} icon="clipboard-outline" variant="secondary" size="sm" onPress={paste} />
          <Button label={t.screenshot} icon="image-outline" variant="secondary" size="sm" onPress={pickScreenshot} disabled={busy} />
          {text ? (
            <Button
              label={t.clear}
              icon="close-outline"
              variant="ghost"
              size="sm"
              onPress={() => {
                setText('');
                setResult(null);
                setNotice(null);
              }}
            />
          ) : null}
          <View style={styles.flex} />
          <AppText variant="small" color={colors.textMuted}>
            {fmt(t.chars, { n: text.length, max: MAX_CHARS })}
          </AppText>
        </View>
      </Card>

      {notice ? <InlineNotice tone="warning">{notice}</InlineNotice> : null}

      <Button label={t.analyze} icon="shield-checkmark-outline" size="lg" fullWidth onPress={analyze} loading={busy} disabled={!text.trim()} />

      {busy ? <AnalyzingCard mode={effective.mode} /> : null}

      {result && !busy ? (
        <ResultView
          result={result}
          actions={
            <>
              <NotifyFamilyButton assessment={result.assessment} source={result.source === 'shortcut' ? 'screen' : 'message'} />
              <Button
                label={t.again}
                icon="refresh-outline"
                variant="ghost"
                fullWidth
                onPress={() => {
                  setResult(null);
                  setText('');
                  inputRef.current?.focus();
                }}
              />
            </>
          }
        />
      ) : null}

      {!result && !busy ? (
        <>
          <Card onPress={() => router.push('/shortcut-guide')}>
            <View style={styles.tipRow}>
              <Ionicons name="scan-circle-outline" size={28} color={colors.cyan} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{t.tipTitle}</AppText>
                <AppText variant="small">{t.tipBody}</AppText>
              </View>
              <AppText variant="smallStrong" color={colors.primary}>
                {t.tipAction}
              </AppText>
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    minHeight: 140,
    maxHeight: 280,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    padding: spacing.sm,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
  },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});

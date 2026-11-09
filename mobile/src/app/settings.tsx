import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { MODE_ICON, MODE_LABEL } from '@/components/ModeBadge';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider, InlineNotice, KeyValueRow, SectionHeader, SegmentedControl, ToggleRow } from '@/components/ui/misc';
import { Screen } from '@/components/ui/Screen';
import { colors, modePalette, radius, spacing } from '@/constants/theme';
import { defineStrings, formatDateTime, tr, useStrings, useUiLanguage } from '@/i18n';
import { getModeAvailability, resolveMode } from '@/services/ai/modelProvider';
import { resolveServerUrl } from '@/services/api/serverUrl';
import { ENGINE_VERSION } from '@/services/security/riskEngine';
import { useHistory } from '@/state/history';
import { useServerStatus } from '@/state/serverStatus';
import { useSettings } from '@/state/settings';
import { useProviderContext } from '@/state/useProviderContext';
import type { InferenceMode } from '@/types/security';

const S = defineStrings({
  en: {
    language: 'Language',
    uiLanguage: 'App language',
    speechLanguage: 'Speech recognition language',
    speechHint: 'English is the default. Azerbaijani works too; “Auto” lets the model detect it.',
    auto: 'Auto',
    inference: 'AI inference mode',
    inferenceHint: 'The final 0–100 score is always calculated by the deterministic engine on this phone. AI only adds evidence-backed indicators.',
    active: 'Currently running',
    unavailable: 'Unavailable',
    server: 'DaCy server',
    serverUrl: 'Server address',
    serverHint: 'Leave empty to auto-detect from the Expo dev server (same Wi-Fi). Use a full URL for a tunnel.',
    test: 'Test connection',
    online: 'Online',
    offline: 'Offline',
    checking: 'Checking…',
    lastChecked: 'Last check',
    model: 'AI model',
    stt: 'Speech-to-text',
    tts: 'Server voice',
    none: 'not configured',
    privacy: 'Privacy',
    storeText: 'Save message text in history',
    storeTextHint: 'Saved only on this phone, with codes and card numbers masked. Calls never store transcripts.',
    spoken: 'Spoken warnings during calls',
    spokenHint: 'DaCy says the warning out loud when it detects fraud.',
    linkInspection: 'Server link sandbox',
    linkInspectionHint: 'Links are opened on the DaCy server in isolation (no JavaScript, no form submission), never on your phone.',
    clearHistory: 'Delete all history',
    confirmClear: 'Tap again to delete everything',
    cleared: 'History deleted.',
    about: 'About',
    engine: 'Risk engine',
    app: 'App version',
    honesty:
      'DaCy does not claim 100% safety. iOS does not let any app hear phone-call audio, so in this version Call Guard listens through the microphone (speakerphone); in production the audio would come from the mobile operator.',
  },
  az: {
    language: 'Dil',
    uiLanguage: 'Tətbiqin dili',
    speechLanguage: 'Nitq tanıma dili',
    speechHint: 'Əsas dil ingiliscədir. Azərbaycan dili də işləyir; “Avto” rejimində model dili özü təyin edir.',
    auto: 'Avto',
    inference: 'AI işləmə rejimi',
    inferenceHint: 'Yekun 0–100 xalı həmişə bu telefondakı deterministik mühərrik hesablayır. AI yalnız sübuta əsaslanan göstəricilər əlavə edir.',
    active: 'Hazırda işləyən',
    unavailable: 'Mövcud deyil',
    server: 'DaCy serveri',
    serverUrl: 'Server ünvanı',
    serverHint: 'Boş saxlasanız, Expo dev serverindən avtomatik tapılır (eyni Wi-Fi). Tunel üçün tam URL yazın.',
    test: 'Bağlantını yoxla',
    online: 'Onlayn',
    offline: 'Oflayn',
    checking: 'Yoxlanılır…',
    lastChecked: 'Son yoxlama',
    model: 'AI modeli',
    stt: 'Nitqin mətnə çevrilməsi',
    tts: 'Server səsi',
    none: 'qurulmayıb',
    privacy: 'Məxfilik',
    storeText: 'Mesaj mətnini tarixçədə saxla',
    storeTextHint: 'Yalnız bu telefonda, kodlar və kart nömrələri gizlədilərək saxlanılır. Zənglərin transkripti heç vaxt saxlanılmır.',
    spoken: 'Zəng zamanı səsli xəbərdarlıq',
    spokenHint: 'Fırıldaq aşkarlananda DaCy xəbərdarlığı səsli deyir.',
    linkInspection: 'Serverdə link sandbox',
    linkInspectionHint: 'Linklər telefonunuzda deyil, DaCy serverində təcrid olunmuş şəkildə açılır (JavaScript işlədilmir, form göndərilmir).',
    clearHistory: 'Bütün tarixçəni sil',
    confirmClear: 'Hər şeyi silmək üçün yenidən toxunun',
    cleared: 'Tarixçə silindi.',
    about: 'Haqqında',
    engine: 'Risk mühərriki',
    app: 'Tətbiq versiyası',
    honesty:
      'DaCy 100% təhlükəsizlik iddia etmir. iOS heç bir tətbiqə telefon zənginin səsini eşitməyə icazə vermir, ona görə bu versiyada Zəng qoruması mikrofonla (dinamik rejimində) dinləyir; real məhsulda səs mobil operatordan gələcək.',
  },
});

export default function SettingsScreen() {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const { settings, update } = useSettings();
  const { baseUrl, status, health, lastCheckedAt, lastError, refresh } = useServerStatus();
  const { clearAll } = useHistory();
  const ctx = useProviderContext();
  const [urlDraft, setUrlDraft] = useState(settings.serverUrlOverride);
  const [testing, setTesting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);

  const availability = getModeAvailability(ctx);
  const running = resolveMode(ctx).mode;

  const testConnection = async () => {
    setTesting(true);
    if (urlDraft.trim() !== settings.serverUrlOverride) update({ serverUrlOverride: urlDraft.trim() });
    await new Promise((r) => setTimeout(r, 50));
    await refresh();
    setTesting(false);
  };

  return (
    <Screen edges={['bottom']}>
      <SectionHeader title={t.language} />
      <Card>
        <AppText variant="bodyStrong">{t.uiLanguage}</AppText>
        <SegmentedControl
          value={settings.uiLanguage}
          onChange={(v) => update({ uiLanguage: v })}
          options={[
            { value: 'en', label: 'English' },
            { value: 'az', label: 'Azərbaycanca' },
          ]}
        />
        <Divider />
        <AppText variant="bodyStrong">{t.speechLanguage}</AppText>
        <SegmentedControl
          value={settings.speechLanguage}
          onChange={(v) => update({ speechLanguage: v })}
          options={[
            { value: 'en', label: 'English' },
            { value: 'az', label: 'Azərbaycanca' },
            { value: 'auto', label: t.auto },
          ]}
        />
        <AppText variant="small">{t.speechHint}</AppText>
      </Card>

      <SectionHeader title={t.inference} />
      <Card>
        <AppText variant="small">{t.inferenceHint}</AppText>
        {availability.map((item) => {
          const selected = settings.inferenceMode === item.mode;
          const palette = modePalette[item.mode];
          return (
            <Pressable
              key={item.mode}
              onPress={() => update({ inferenceMode: item.mode as InferenceMode })}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.modeRow, selected && { borderColor: palette.border, backgroundColor: palette.bg }]}>
              <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? palette.fg : colors.textMuted} />
              <Ionicons name={MODE_ICON[item.mode]} size={20} color={palette.fg} />
              <View style={styles.flex}>
                <View style={styles.modeTitle}>
                  <AppText variant="bodyStrong">{tr(MODE_LABEL[item.mode], lang)}</AppText>
                  {running === item.mode ? (
                    <AppText variant="smallStrong" color={colors.low}>
                      · {t.active}
                    </AppText>
                  ) : !item.available ? (
                    <AppText variant="smallStrong" color={colors.textMuted}>
                      · {t.unavailable}
                    </AppText>
                  ) : null}
                </View>
                <AppText variant="small">{tr(item.reason, lang)}</AppText>
              </View>
            </Pressable>
          );
        })}
      </Card>

      <SectionHeader title={t.server} />
      <Card>
        <View style={styles.serverTop}>
          <View
            style={[styles.dot, { backgroundColor: status === 'online' ? colors.low : status === 'checking' ? colors.moderate : colors.critical }]}
          />
          <AppText variant="bodyStrong" style={styles.flex}>
            {status === 'online' ? t.online : status === 'checking' ? t.checking : t.offline}
          </AppText>
        </View>
        <KeyValueRow label="URL" value={baseUrl} mono />
        {lastCheckedAt ? <KeyValueRow label={t.lastChecked} value={formatDateTime(lastCheckedAt, lang)} /> : null}
        {health ? (
          <>
            <KeyValueRow label={t.model} value={health.capabilities.llmModel ?? t.none} mono />
            <KeyValueRow
              label={t.stt}
              value={health.capabilities.stt ? `${health.capabilities.sttProvider} · ${health.capabilities.sttModel}` : t.none}
              mono
            />
            <KeyValueRow label={t.tts} value={health.capabilities.tts ? '✓' : t.none} />
          </>
        ) : null}
        {status === 'offline' && lastError ? <InlineNotice tone="warning">{lastError}</InlineNotice> : null}
        <AppText variant="smallStrong">{t.serverUrl}</AppText>
        <TextInput
          value={urlDraft}
          onChangeText={setUrlDraft}
          placeholder={resolveServerUrl('')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          accessibilityLabel={t.serverUrl}
        />
        <AppText variant="small">{t.serverHint}</AppText>
        <Button label={t.test} icon="pulse-outline" variant="secondary" onPress={testConnection} loading={testing} fullWidth />
      </Card>

      <SectionHeader title={t.privacy} />
      <Card>
        <ToggleRow label={t.storeText} description={t.storeTextHint} value={settings.storeTextInHistory} onValueChange={(v) => update({ storeTextInHistory: v })} />
        <Divider />
        <ToggleRow label={t.spoken} description={t.spokenHint} value={settings.spokenWarnings} onValueChange={(v) => update({ spokenWarnings: v })} />
        <Divider />
        <ToggleRow
          label={t.linkInspection}
          description={t.linkInspectionHint}
          value={settings.serverLinkInspection}
          onValueChange={(v) => update({ serverLinkInspection: v })}
        />
        <Divider />
        {cleared ? <InlineNotice tone="success">{t.cleared}</InlineNotice> : null}
        <Button
          label={confirmClear ? t.confirmClear : t.clearHistory}
          icon="trash-outline"
          variant={confirmClear ? 'danger' : 'secondary'}
          fullWidth
          onPress={async () => {
            if (!confirmClear) {
              setConfirmClear(true);
              setCleared(false);
              return;
            }
            await clearAll();
            setConfirmClear(false);
            setCleared(true);
          }}
        />
      </Card>

      <SectionHeader title={t.about} />
      <Card variant="sunken">
        <KeyValueRow label={t.engine} value={ENGINE_VERSION} mono />
        <KeyValueRow label={t.app} value={Constants.expoConfig?.version ?? '1.0.0'} mono />
        <AppText variant="small">{t.honesty}</AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  serverTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  input: {
    color: colors.text,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
});

/**
 * Setup guide for the one-tap Screen Scan (Feature 1).
 * Uses only Apple's Shortcuts app: the screenshot and OCR happen on the phone
 * (Apple's on-device "Extract Text from Image"), then the text opens DaCy.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { InlineNotice, SectionHeader } from '@/components/ui/misc';
import { Screen } from '@/components/ui/Screen';
import type { IconName } from '@/constants/indicators';
import { colors, radius, spacing } from '@/constants/theme';
import { defineStrings, useStrings } from '@/i18n';

const S = defineStrings({
  en: {
    intro:
      'Tap once while any suspicious message is on screen (SMS, WhatsApp, Telegram, a website). Your iPhone takes a screenshot, reads the text on-device and opens DaCy with the result. Nothing is pasted by hand.',
    build: 'Build the shortcut (once)',
    s1: 'Open the Shortcuts app → tap + (New Shortcut).',
    s2: 'Add the action “Take Screenshot”.',
    s3: 'Add “Extract Text from Image” (input: Screenshot). This OCR runs on the iPhone.',
    s4: 'Add “URL Encode” (input: Text).',
    s5: 'Add “Open URLs” and paste the link below, then insert the “URL Encoded Text” variable right after “text=”.',
    s6: 'Name it “DaCy Scan”. When iOS asks to allow opening the link, choose Always Allow.',
    link: 'Link for step 5',
    copy: 'Copy link',
    copied: 'Copied',
    trigger: 'Put it one tap away',
    controlCenter: 'Control Center (iOS 18+)',
    controlCenterBody: 'Swipe down from the top-right → tap + → Add a Control → Shortcuts → Run Shortcut → DaCy Scan.',
    actionButton: 'Action Button (iPhone 15 Pro)',
    actionButtonBody: 'Settings → Action Button → swipe to Shortcut → choose DaCy Scan.',
    backTap: 'Back Tap',
    backTapBody: 'Settings → Accessibility → Touch → Back Tap → Double Tap → DaCy Scan.',
    tip: 'If the screenshot ever captures Control Center itself, add a “Wait 1 second” action before “Take Screenshot”, or use the Action Button / Back Tap.',
    devNote: 'This link points to your Expo dev server. If the Wi-Fi network or computer changes, update the link in the shortcut.',
    fallbackTitle: 'Fallback for very long screens',
    fallbackBody: 'Instead of URL Encode + text=, add “Copy to Clipboard” and open the link with “?from=clipboard”. DaCy then reads the copied text.',
  },
  az: {
    intro:
      'Ekranda hər hansı şübhəli mesaj (SMS, WhatsApp, Telegram, sayt) açıq olanda bir dəfə toxunun. iPhone ekran şəkli çəkir, mətni telefonun özündə oxuyur və DaCy-ni nəticə ilə açır. Heç nəyi əllə yapışdırmaq lazım deyil.',
    build: 'Qısayolu qurun (bir dəfə)',
    s1: 'Shortcuts (Qısayollar) tətbiqini açın → + (Yeni qısayol) toxunun.',
    s2: '“Take Screenshot” (Ekran şəkli çək) əməliyyatını əlavə edin.',
    s3: '“Extract Text from Image” (Şəkildən mətn çıxar) əlavə edin (giriş: Screenshot). Bu OCR iPhone-un özündə işləyir.',
    s4: '“URL Encode” əlavə edin (giriş: Text).',
    s5: '“Open URLs” əlavə edin, aşağıdakı linki yapışdırın və “text=” hissəsindən dərhal sonra “URL Encoded Text” dəyişənini qoyun.',
    s6: 'Adını “DaCy Scan” qoyun. iOS linki açmağa icazə soruşanda “Always Allow” seçin.',
    link: '5-ci addım üçün link',
    copy: 'Linki kopyala',
    copied: 'Kopyalandı',
    trigger: 'Bir toxunuş məsafəsinə gətirin',
    controlCenter: 'İdarəetmə Mərkəzi (iOS 18+)',
    controlCenterBody: 'Yuxarı sağdan aşağı sürüşdürün → + → Add a Control → Shortcuts → Run Shortcut → DaCy Scan.',
    actionButton: 'Action düyməsi (iPhone 15 Pro)',
    actionButtonBody: 'Ayarlar → Action Button → Shortcut seçiminə keçin → DaCy Scan.',
    backTap: 'Back Tap (arxaya toxunuş)',
    backTapBody: 'Ayarlar → Əlçatanlıq → Toxunuş → Back Tap → İki dəfə toxunuş → DaCy Scan.',
    tip: 'Əgər ekran şəkli İdarəetmə Mərkəzinin özünü çəkərsə, “Take Screenshot”dan əvvəl “1 saniyə gözlə” (Wait) əməliyyatı əlavə edin və ya Action düyməsi / Back Tap istifadə edin.',
    devNote: 'Bu link Expo dev serverinizə işarə edir. Wi-Fi şəbəkəsi və ya kompüter dəyişsə, qısayoldakı linki yeniləyin.',
    fallbackTitle: 'Çox uzun ekranlar üçün alternativ',
    fallbackBody: 'URL Encode + text= əvəzinə “Copy to Clipboard” əlavə edin və linki “?from=clipboard” ilə açın. DaCy kopyalanmış mətni oxuyacaq.',
  },
});

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <AppText variant="smallStrong" color={colors.primary}>
          {n}
        </AppText>
      </View>
      <AppText variant="body" style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

function Trigger({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <View style={styles.trigger}>
      <Ionicons name={icon} size={22} color={colors.cyan} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="small">{body}</AppText>
      </View>
    </View>
  );
}

export default function ShortcutGuideScreen() {
  const t = useStrings(S);
  const [copied, setCopied] = useState(false);
  const scanLink = `${Linking.createURL('/scan')}?text=`;
  const clipboardLink = `${Linking.createURL('/scan')}?from=clipboard`;

  return (
    <Screen edges={['bottom']}>
      <Card variant="raised">
        <View style={styles.introRow}>
          <Ionicons name="scan-circle" size={40} color={colors.cyan} />
          <AppText variant="body" style={styles.flex}>
            {t.intro}
          </AppText>
        </View>
      </Card>

      <SectionHeader title={t.build} />
      <Card>
        <Step n={1} text={t.s1} />
        <Step n={2} text={t.s2} />
        <Step n={3} text={t.s3} />
        <Step n={4} text={t.s4} />
        <Step n={5} text={t.s5} />
        <View style={styles.linkBox}>
          <AppText variant="caption">{t.link}</AppText>
          <AppText variant="mono" selectable>
            {scanLink}
          </AppText>
          <Button
            label={copied ? t.copied : t.copy}
            icon={copied ? 'checkmark-outline' : 'copy-outline'}
            variant="secondary"
            size="sm"
            onPress={async () => {
              await Clipboard.setStringAsync(scanLink);
              setCopied(true);
            }}
          />
        </View>
        <Step n={6} text={t.s6} />
      </Card>

      <SectionHeader title={t.trigger} />
      <Card>
        <Trigger icon="options-outline" title={t.controlCenter} body={t.controlCenterBody} />
        <Trigger icon="radio-button-on-outline" title={t.actionButton} body={t.actionButtonBody} />
        <Trigger icon="hand-left-outline" title={t.backTap} body={t.backTapBody} />
      </Card>

      <InlineNotice tone="info">{t.tip}</InlineNotice>
      <InlineNotice tone="warning">{t.devNote}</InlineNotice>

      <Card variant="sunken">
        <AppText variant="bodyStrong">{t.fallbackTitle}</AppText>
        <AppText variant="small">{t.fallbackBody}</AppText>
        <AppText variant="mono" selectable>
          {clipboardLink}
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  introRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: 38,
  },
  trigger: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
});

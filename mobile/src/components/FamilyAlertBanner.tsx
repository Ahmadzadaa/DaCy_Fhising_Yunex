/**
 * Floating banner shown on the guardian's phone when a family member's device
 * reports a high/critical risk event. Shows only minimal metadata — plus, for a
 * child-safety alert, the first thing to do ("stay calm, don't blame your child")
 * and a "Demo" mark for simulator / test alerts.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { isChildSafetyAlert } from '@/constants/childSafetyGuidance';
import { INDICATOR_META } from '@/constants/indicators';
import { MONITORED_APPS } from '@/constants/monitoredApps';
import { colors, radius, riskPalette, spacing, elevation } from '@/constants/theme';
import { defineStrings, formatTime, tr, useStrings, useUiLanguage } from '@/i18n';
import { useFamily } from '@/state/family';
import type { FamilyAlert } from '@/types/security';

const S = defineStrings({
  en: {
    title: 'Family alert · {name}',
    demoTitle: 'Demo alert · {name}',
    high: 'High risk',
    critical: 'Critical risk',
    open: 'Open',
    call: 'call',
    message: 'message',
    screen: 'screen scan',
    voice: 'voice check',
    app: 'app',
    childLine: 'Stay calm and don’t blame your child — open for next steps.',
  },
  az: {
    title: 'Ailə xəbərdarlığı · {name}',
    demoTitle: 'Demo xəbərdarlıq · {name}',
    high: 'Yüksək risk',
    critical: 'Kritik risk',
    open: 'Aç',
    call: 'zəng',
    message: 'mesaj',
    screen: 'ekran skanı',
    voice: 'səs yoxlaması',
    app: 'tətbiq',
    childLine: 'Sakit olun, uşağınızı günahlandırmayın — növbəti addımlar üçün açın.',
  },
});

/** "Instagram" for DaCy Kids app alerts, otherwise the localized source kind. */
function sourceLabel(alert: FamilyAlert, t: { [K in keyof typeof S.en]: string }): string {
  if (alert.source === 'app') return alert.app && MONITORED_APPS[alert.app] ? MONITORED_APPS[alert.app].name : t.app;
  return t[alert.source];
}

export function FamilyAlertBanner() {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const insets = useSafeAreaInsets();
  const { alerts, unseenCount, link, markAlertsSeen } = useFamily();
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const latest = alerts.find((a) => a.fromMemberId !== link?.memberId && a.familyId !== 'local');
  const visible = link?.role === 'guardian' && unseenCount > 0 && !!latest && latest.id !== dismissedId;

  useEffect(() => {
    if (!visible || !latest) return;
    const timer = setTimeout(() => setDismissedId(latest.id), 15_000);
    return () => clearTimeout(timer);
  }, [visible, latest]);

  if (!visible || !latest) return null;
  const palette = riskPalette[latest.band];

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLiveRegion="assertive"
        onPress={() => {
          setDismissedId(latest.id);
          markAlertsSeen();
          router.navigate('/family');
        }}
        style={[styles.banner, { borderColor: palette.border }, elevation]}>
        <View style={[styles.icon, { backgroundColor: palette.bg }]}>
          <Ionicons
            name={latest.source === 'app' && latest.app && MONITORED_APPS[latest.app] ? MONITORED_APPS[latest.app].icon : 'warning'}
            size={20}
            color={palette.fg}
          />
        </View>
        <View style={styles.body}>
          <AppText variant="smallStrong" color={palette.fg}>
            {(latest.demo ? t.demoTitle : t.title).replace('{name}', latest.fromName)}
          </AppText>
          <AppText variant="small" color={colors.text} numberOfLines={2}>
            {latest.band === 'critical' ? t.critical : t.high} · {tr(INDICATOR_META[latest.category].label, lang)} · {sourceLabel(latest, t)} ·{' '}
            {formatTime(latest.createdAt)}
          </AppText>
          {isChildSafetyAlert(latest) ? (
            <AppText variant="small" color={colors.textSecondary} numberOfLines={2}>
              {t.childLine}
            </AppText>
          ) : null}
        </View>
        <AppText variant="smallStrong" color={colors.primary}>
          {t.open}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center' },
  banner: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.surfaceRaised,
  },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
});

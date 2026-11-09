import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { BAND_META, INDICATOR_META, type IconName } from '@/constants/indicators';
import { colors, riskPalette, spacing, radius } from '@/constants/theme';
import { defineStrings, formatDuration, formatRelative, tr, useStrings, useUiLanguage } from '@/i18n';
import { entryBand, entryScore } from '@/services/storage/historyRepository';
import type { HistoryEntry } from '@/types/security';

const S = defineStrings({
  en: {
    text: 'Message check',
    shortcut: 'Screen scan',
    screenshot: 'Screenshot',
    voice: 'Voice analysis',
    call: 'Call guard',
    trusted: 'Trusted caller · stopped after 5 s',
    noText: 'Text not stored',
    warned: 'Warning spoken',
    noRisk: 'No risk detected',
    stopped: 'Stopped by user',
  },
  az: {
    text: 'Mesaj yoxlaması',
    shortcut: 'Ekran skanı',
    screenshot: 'Ekran şəkli',
    voice: 'Səs analizi',
    call: 'Zəng qoruması',
    trusted: 'Etibarlı zəng · 5 san sonra dayandı',
    noText: 'Mətn saxlanılmayıb',
    warned: 'Xəbərdarlıq edildi',
    noRisk: 'Risk tapılmadı',
    stopped: 'İstifadəçi dayandırdı',
  },
});

function entryIcon(entry: HistoryEntry): IconName {
  if (entry.kind === 'call') return 'call-outline';
  if (entry.kind === 'voice') return 'mic-outline';
  if (entry.source === 'shortcut') return 'scan-outline';
  if (entry.source === 'screenshot') return 'image-outline';
  return 'chatbox-ellipses-outline';
}

export function ScanListItem({ entry, onPress }: { entry: HistoryEntry; onPress?: () => void }) {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const band = entryBand(entry);
  const score = entryScore(entry);
  const palette = riskPalette[band];

  let title: string;
  let subtitle: string;
  if (entry.kind === 'call') {
    title = `${t.call} · ${entry.callerLabel}`;
    subtitle =
      entry.outcome === 'TRUSTED_STOPPED'
        ? t.trusted
        : entry.outcome === 'WARNED'
          ? `${t.warned} · ${formatDuration(entry.durationMs)}`
          : entry.outcome === 'STOPPED_BY_USER'
            ? `${t.stopped} · ${formatDuration(entry.durationMs)}`
            : `${t.noRisk} · ${formatDuration(entry.durationMs)}`;
  } else if (entry.kind === 'voice') {
    title = t.voice;
    subtitle = entry.transcript || t.noText;
  } else {
    title = entry.source === 'shortcut' ? t.shortcut : entry.source === 'screenshot' ? t.screenshot : t.text;
    subtitle = entry.text || t.noText;
  }
  const topIndicator =
    entry.kind === 'call'
      ? entry.indicatorTypes[0]
      : entry.assessment.indicators.find((i) => i.points > 0)?.type;

  return (
    <Card onPress={onPress} padding={spacing.md} accessibilityLabel={`${title}, ${tr(BAND_META[band].label, lang)}, ${score}`}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: palette.bg, borderColor: palette.border }]}>
          <Ionicons name={entryIcon(entry)} size={20} color={palette.fg} />
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
              {title}
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              {formatRelative(entry.createdAt, lang)}
            </AppText>
          </View>
          <AppText variant="small" numberOfLines={1}>
            {subtitle}
          </AppText>
          <View style={styles.metaRow}>
            <View style={[styles.score, { borderColor: palette.border, backgroundColor: palette.bg }]}>
              <AppText variant="smallStrong" color={palette.fg}>
                {score} · {tr(BAND_META[band].short, lang)}
              </AppText>
            </View>
            {topIndicator ? (
              <AppText variant="small" color={colors.textMuted} numberOfLines={1} style={styles.flex}>
                {tr(INDICATOR_META[topIndicator].label, lang)}
              </AppText>
            ) : null}
          </View>
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 42, height: 42, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  score: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  flex: { flex: 1 },
});

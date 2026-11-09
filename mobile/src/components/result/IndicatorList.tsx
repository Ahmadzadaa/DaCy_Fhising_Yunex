import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { HIGHLIGHT } from '@/components/result/HighlightedText';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/misc';
import { CATEGORY_LABEL, INDICATOR_META } from '@/constants/indicators';
import { isMention } from '@/features/callGuard/callExplain';
import { colors, radius, spacing } from '@/constants/theme';
import { defineStrings, tr, useStrings, useUiLanguage } from '@/i18n';
import type { Indicator, IndicatorSource } from '@/types/security';

const S = defineStrings({
  en: {
    rules: 'Rules',
    ai: 'AI',
    url_scan: 'Link scan',
    none: 'No risk indicators',
    noneBody: 'Nothing in the checked content matched a known scam pattern.',
    pts: 'pts',
    mention: 'Only mentioned — nobody asked you for it',
  },
  az: {
    rules: 'Qaydalar',
    ai: 'AI',
    url_scan: 'Link yoxlaması',
    none: 'Risk göstəricisi yoxdur',
    noneBody: 'Yoxlanılan məzmunda tanınmış fırıldaq nümunəsinə uyğun heç nə tapılmadı.',
    pts: 'xal',
    mention: 'Yalnız adı çəkildi — sizdən istənmədi',
  },
});

const SOURCE_ICON: Record<IndicatorSource, 'git-network-outline' | 'sparkles-outline' | 'globe-outline'> = {
  rules: 'git-network-outline',
  ai: 'sparkles-outline',
  url_scan: 'globe-outline',
};

export function IndicatorList({ indicators }: { indicators: Indicator[] }) {
  const t = useStrings(S);
  const lang = useUiLanguage();

  if (!indicators.length) {
    return <EmptyState icon="checkmark-done-outline" title={t.none} body={t.noneBody} />;
  }

  return (
    <View style={styles.list}>
      {indicators.map((ind) => {
        const meta = INDICATOR_META[ind.type];
        const hl = HIGHLIGHT[ind.category];
        const points = ind.points > 0 ? `+${ind.points}` : String(ind.points);
        return (
          <View key={ind.id} style={styles.row} accessible accessibilityLabel={`${tr(meta.label, lang)}, ${points} ${t.pts}`}>
            <View style={[styles.icon, { backgroundColor: hl.bg }]}>
              <Ionicons name={meta.icon} size={18} color={hl.fg} />
            </View>
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <AppText variant="bodyStrong" style={styles.flex}>
                  {isMention(ind) ? t.mention : tr(meta.label, lang)}
                </AppText>
                <AppText variant="smallStrong" color={ind.points >= 0 ? hl.fg : colors.low}>
                  {points}
                </AppText>
              </View>
              {ind.evidence ? (
                <AppText variant="small" color={colors.textSecondary} numberOfLines={3} style={styles.evidence}>
                  “{ind.evidence}”
                </AppText>
              ) : null}
              {ind.detail ? (
                <AppText variant="small" color={colors.textMuted}>
                  {tr(ind.detail, lang)}
                </AppText>
              ) : null}
              <View style={styles.tags}>
                <Badge
                  label={tr(CATEGORY_LABEL[ind.category], lang)}
                  palette={{ fg: hl.fg, bg: hl.bg, border: 'transparent' }}
                />
                {ind.sources.map((src) => (
                  <Badge key={src} label={t[src]} icon={SOURCE_ICON[src]} />
                ))}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  icon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  evidence: { fontStyle: 'italic' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
});

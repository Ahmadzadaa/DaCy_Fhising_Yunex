import { StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { CATEGORY_LABEL, URL_SEVERITY_POINTS } from '@/constants/indicators';
import { colors, spacing } from '@/constants/theme';
import { tr, useUiLanguage } from '@/i18n';
import type { Indicator, IndicatorCategory, UrlReport } from '@/types/security';

export const HIGHLIGHT: Record<IndicatorCategory, { bg: string; fg: string }> = {
  financial: { bg: '#FDECEA', fg: '#A3231B' },
  psychological: { bg: '#FBF1DD', fg: '#7A5206' },
  technical: { bg: '#EFEFF4', fg: '#3A3A3C' },
  protective: { bg: '#EAF6F0', fg: '#075E3B' },
  child_safety: { bg: '#FCE8F1', fg: '#8E2457' },
};

interface Mark {
  start: number;
  end: number;
  category: IndicatorCategory;
  weight: number;
}

interface Segment {
  text: string;
  category: IndicatorCategory | null;
}

/** Splits text into plain/highlighted segments. Overlaps resolve to the strongest indicator. */
export function buildSegments(text: string, marks: Mark[]): Segment[] {
  if (!text) return [];
  const owner: (Mark | null)[] = new Array<Mark | null>(text.length).fill(null);
  for (const mark of marks) {
    const start = Math.max(0, Math.min(text.length, mark.start));
    const end = Math.max(start, Math.min(text.length, mark.end));
    for (let i = start; i < end; i += 1) {
      const current = owner[i];
      if (!current || Math.abs(mark.weight) > Math.abs(current.weight)) owner[i] = mark;
    }
  }
  const segments: Segment[] = [];
  let buffer = '';
  let currentCat: IndicatorCategory | null = owner[0]?.category ?? null;
  for (let i = 0; i < text.length; i += 1) {
    const cat = owner[i]?.category ?? null;
    if (cat !== currentCat) {
      if (buffer) segments.push({ text: buffer, category: currentCat });
      buffer = '';
      currentCat = cat;
    }
    buffer += text[i];
  }
  if (buffer) segments.push({ text: buffer, category: currentCat });
  return segments;
}

export interface HighlightedTextProps {
  text: string;
  indicators: Indicator[];
  urls?: UrlReport[];
  /** Limit rendering for very long texts. */
  maxChars?: number;
}

/** Shows the analysed text with the exact fragments that triggered indicators highlighted. */
export function HighlightedText({ text, indicators, urls = [], maxChars = 6000 }: HighlightedTextProps) {
  const lang = useUiLanguage();
  const shown = text.length > maxChars ? text.slice(0, maxChars) : text;

  const marks: Mark[] = [];
  for (const ind of indicators) {
    if (ind.span) marks.push({ start: ind.span.start, end: ind.span.end, category: ind.category, weight: ind.points });
  }
  for (const url of urls) {
    if (url.span && url.severity !== 'info') {
      marks.push({ start: url.span.start, end: url.span.end, category: 'technical', weight: URL_SEVERITY_POINTS[url.severity] });
    }
  }
  const segments = buildSegments(shown, marks);
  const usedCategories = Array.from(new Set(marks.map((m) => m.category)));

  return (
    <View style={styles.wrap}>
      <Text style={styles.text} selectable>
        {segments.map((seg, i) =>
          seg.category ? (
            <Text
              key={i}
              style={[styles.mark, { backgroundColor: HIGHLIGHT[seg.category].bg, color: HIGHLIGHT[seg.category].fg }]}>
              {seg.text}
            </Text>
          ) : (
            <Text key={i}>{seg.text}</Text>
          ),
        )}
        {text.length > maxChars ? <Text style={styles.more}>{' …'}</Text> : null}
      </Text>
      {usedCategories.length ? (
        <View style={styles.legend}>
          {usedCategories.map((cat) => (
            <View key={cat} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: HIGHLIGHT[cat].bg, borderColor: HIGHLIGHT[cat].fg }]} />
              <AppText variant="small" color={colors.textMuted}>
                {tr(CATEGORY_LABEL[cat], lang)}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  text: { fontSize: 15, lineHeight: 23, color: colors.text },
  mark: { fontWeight: '600', borderRadius: 4 },
  more: { color: colors.textMuted },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
});

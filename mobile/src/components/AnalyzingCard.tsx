import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ModeBadge } from '@/components/ModeBadge';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import { defineStrings, useStrings } from '@/i18n';
import type { InferenceMode } from '@/types/security';

const S = defineStrings({
  en: {
    title: 'Analysing…',
    body: 'Rules engine, AI indicator extraction and link inspection run in parallel. The final score is calculated on this phone.',
  },
  az: {
    title: 'Analiz edilir…',
    body: 'Qayda mühərriki, AI göstərici analizi və link yoxlaması paralel işləyir. Yekun xal bu telefonda hesablanır.',
  },
});

export function AnalyzingCard({ mode, title }: { mode: InferenceMode; title?: string }) {
  const t = useStrings(S);
  return (
    <Card variant="raised">
      <View style={styles.row}>
        <ActivityIndicator color={colors.primary} />
        <AppText variant="heading" style={styles.flex}>
          {title ?? t.title}
        </AppText>
        <ModeBadge mode={mode} />
      </View>
      <AppText variant="small">{t.body}</AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
});

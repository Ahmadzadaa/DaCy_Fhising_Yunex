/**
 * Grooming stage stepper: trust → isolation → probing → image request → coercion.
 * Reached stages are filled (escalating risk colours), the current one is ringed.
 * Colour is never the only cue: each step also has a label and an icon state.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, spacing } from '@/constants/theme';
import { defineStrings, tr, useStrings, useUiLanguage } from '@/i18n';
import { STAGE_META } from '@/services/security/groomingEngine';
import type { GroomingStage } from '@/types/security';

const STEPS: Exclude<GroomingStage, 'none'>[] = ['trust', 'isolation', 'probing', 'image_request', 'coercion'];

const STEP_COLOR: Record<Exclude<GroomingStage, 'none'>, string> = {
  trust: colors.moderate,
  isolation: colors.moderate,
  probing: colors.high,
  image_request: colors.critical,
  coercion: colors.critical,
};

const S = defineStrings({
  en: { reached: 'reached', current: 'current stage', notReached: 'not reached' },
  az: { reached: 'çatılıb', current: 'cari mərhələ', notReached: 'çatılmayıb' },
});

export function StageStepper({ stage, reached }: { stage: GroomingStage; reached: GroomingStage[] }) {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const currentMeta = STAGE_META[stage];
  const accent = stage === 'none' ? colors.low : STEP_COLOR[stage];

  return (
    <View style={styles.root}>
      <View style={styles.track}>
        {STEPS.map((step, i) => {
          const isReached = reached.includes(step);
          const isCurrent = stage === step;
          const nextReached = i < STEPS.length - 1 && reached.includes(STEPS[i + 1]);
          const color = STEP_COLOR[step];
          const label = tr(STAGE_META[step].label, lang);
          return (
            <View
              key={step}
              style={styles.step}
              accessible
              accessibilityLabel={`${label}, ${isCurrent ? t.current : isReached ? t.reached : t.notReached}`}>
              <View style={styles.nodeRow}>
                <View style={[styles.connector, i === 0 && styles.hidden, isReached && { backgroundColor: color }]} />
                <View
                  style={[styles.node, isReached ? { backgroundColor: color, borderColor: color } : null]}>
                  {isCurrent ? <View style={[styles.ring, { borderColor: color }]} /> : null}
                  {isReached ? (
                    <Ionicons name={isCurrent ? 'alert' : 'checkmark'} size={12} color="#FFFFFF" />
                  ) : (
                    <AppText style={styles.nodeNumber}>{i + 1}</AppText>
                  )}
                </View>
                <View
                  style={[
                    styles.connector,
                    i === STEPS.length - 1 && styles.hidden,
                    isReached && nextReached && { backgroundColor: STEP_COLOR[STEPS[i + 1]] },
                  ]}
                />
              </View>
              <AppText
                variant="small"
                align="center"
                numberOfLines={2}
                color={isReached ? colors.text : colors.textMuted}
                style={[styles.label, isCurrent && styles.labelCurrent]}>
                {label}
              </AppText>
            </View>
          );
        })}
      </View>
      <View style={[styles.current, { borderLeftColor: accent }]}>
        <AppText variant="smallStrong" color={colors.text}>
          {tr(currentMeta.label, lang)}
        </AppText>
        <AppText variant="small">{tr(currentMeta.description, lang)}</AppText>
      </View>
    </View>
  );
}

const NODE = 24;

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  track: { flexDirection: 'row', alignItems: 'flex-start' },
  step: { flex: 1, alignItems: 'center', gap: spacing.xs },
  nodeRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  connector: { flex: 1, height: 2, backgroundColor: colors.track },
  hidden: { opacity: 0 },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderRadius: (NODE + 10) / 2,
    borderWidth: 2,
  },
  nodeNumber: { fontSize: 11, lineHeight: 13, fontWeight: '700', color: colors.textMuted },
  label: { fontSize: 11, lineHeight: 14, paddingHorizontal: 2 },
  labelCurrent: { fontWeight: '700' },
  current: { borderLeftWidth: 3, paddingLeft: spacing.md, gap: 2 },
});

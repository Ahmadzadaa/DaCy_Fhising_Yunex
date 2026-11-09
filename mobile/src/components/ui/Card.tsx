import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, elevation, motion, radius, spacing, type RiskPalette } from '@/constants/theme';

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Tints border and background (e.g. a risk palette). */
  tone?: RiskPalette;
  /** 'raised' uses a slightly lighter surface. */
  variant?: 'default' | 'raised' | 'sunken';
  padding?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Fade/slide in when mounted (default true). */
  animated?: boolean;
}

const entering = FadeInDown.duration(motion.enterDuration).springify().damping(20).stiffness(180);

export function Card({
  children,
  style,
  tone,
  variant = 'default',
  padding = spacing.lg,
  onPress,
  accessibilityLabel,
  animated = false,
}: CardProps) {
  const base: StyleProp<ViewStyle> = [
    styles.card,
    variant !== 'sunken' && !tone ? elevation : null,
    variant === 'raised' && styles.raised,
    variant === 'sunken' && styles.sunken,
    tone ? { borderColor: tone.border, backgroundColor: tone.bg } : null,
    { padding },
    style,
  ];

  if (onPress) {
    return (
      <Animated.View entering={animated ? entering : undefined}>
        <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={base} scaleTo={0.985}>
          {children}
        </PressableScale>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={animated ? entering : undefined} style={base} accessibilityLabel={accessibilityLabel}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Flat card: white, 1 px light-grey border, no shadow.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  raised: { backgroundColor: colors.surface },
  sunken: { backgroundColor: colors.surfaceSunken, borderColor: colors.surfaceSunken },
});

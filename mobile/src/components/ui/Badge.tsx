import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { IconName } from '@/constants/indicators';
import { colors, radius, spacing, type RiskPalette } from '@/constants/theme';

export interface BadgeProps {
  label: string;
  palette?: RiskPalette;
  icon?: IconName;
  size?: 'sm' | 'md';
  /** Uppercase, letter-spaced label (for status badges like "LIVE PROTOTYPE"). */
  caps?: boolean;
  style?: StyleProp<ViewStyle>;
}

const NEUTRAL: RiskPalette = { fg: colors.textSecondary, bg: colors.fill, border: 'transparent' };

export function Badge({ label, palette = NEUTRAL, icon, size = 'sm', caps = false, style }: BadgeProps) {
  const fontSize = size === 'sm' ? 11 : 13;
  return (
    <View
      style={[
        styles.badge,
        size === 'md' && styles.md,
        { backgroundColor: palette.bg, borderColor: palette.border },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}>
      {icon ? <Ionicons name={icon} size={fontSize + 2} color={palette.fg} /> : null}
      <AppText
        variant="smallStrong"
        color={palette.fg}
        numberOfLines={1}
        style={[styles.label, { fontSize, lineHeight: fontSize + 4 }, caps && styles.caps]}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    // Never wider than the parent: long (e.g. Azerbaijani) labels truncate cleanly inside it.
    maxWidth: '100%',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  md: { paddingHorizontal: spacing.md, paddingVertical: 5 },
  label: { flexShrink: 1 },
  caps: { textTransform: 'uppercase', letterSpacing: 0.8 },
});

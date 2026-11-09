import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import type { IconName } from '@/constants/indicators';
import { colors, radius, spacing } from '@/constants/theme';

/**
 * Flat button styles (one accent):
 *  primary   – filled Safety Green, white label (the only filled button)
 *  secondary – white with a 1 px border
 *  ghost     – plain text button
 *  danger – white with a red label (destructive) · success – same as primary
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'lg' | 'sm';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const VARIANT: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.bg, fg: colors.text, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  danger: { bg: colors.bg, fg: colors.critical, border: colors.border },
  success: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
};

const SIZE = {
  sm: { height: 36, paddingH: spacing.md, font: 14, icon: 16, radius: radius.sm },
  md: { height: 48, paddingH: spacing.lg, font: 16, icon: 18, radius: radius.md },
  lg: { height: 56, paddingH: spacing.xl, font: 17, icon: 20, radius: radius.md + 2 },
} as const;

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityHint,
}: ButtonProps) {
  const v = VARIANT[variant];
  const s = SIZE[size];
  const inactive = disabled || loading;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        styles.base,
        { minHeight: s.height, paddingHorizontal: s.paddingH, backgroundColor: v.bg, borderColor: v.border, borderRadius: s.radius },
        fullWidth && styles.fullWidth,
        inactive && styles.inactive,
        style,
      ]}>
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={v.fg} />
        ) : icon ? (
          <Ionicons name={icon} size={s.icon} color={v.fg} />
        ) : null}
        <AppText variant="bodyStrong" color={v.fg} style={{ fontSize: s.font }} numberOfLines={1}>
          {label}
        </AppText>
        {iconRight && !loading ? <Ionicons name={iconRight} size={s.icon} color={v.fg} /> : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fullWidth: { alignSelf: 'stretch' },
  inactive: { opacity: 0.45 },
});

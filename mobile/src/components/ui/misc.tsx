/**
 * Small shared building blocks: section header, empty state, inline notice,
 * icon circle, segmented control, toggle row, key/value row, divider.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Switch, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import type { IconName } from '@/constants/indicators';
import { colors, motion, radius, riskPalette, spacing, type RiskPalette } from '@/constants/theme';

/* ---------------- SectionHeader ---------------- */

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <AppText variant="caption" accessibilityRole="header">
        {title}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <AppText variant="smallStrong" color={colors.primary}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------------- IconCircle ---------------- */

export function IconCircle({
  icon,
  color = colors.primary,
  background,
  size = 40,
}: {
  icon: IconName;
  color?: string;
  background?: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.iconCircle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background ?? `${color}22` },
      ]}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

/* ---------------- EmptyState ---------------- */

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <IconCircle icon={icon} size={56} color={colors.textMuted} background={colors.surfaceRaised} />
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      <AppText variant="small" align="center" style={styles.emptyBody}>
        {body}
      </AppText>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" size="sm" /> : null}
    </View>
  );
}

/* ---------------- InlineNotice ---------------- */

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const NOTICE: Record<NoticeTone, { palette: RiskPalette; icon: IconName }> = {
  info: {
    palette: { fg: colors.primary, bg: colors.primarySoft, border: colors.primarySoft },
    icon: 'information-circle-outline',
  },
  success: {
    palette: riskPalette.low,
    icon: 'checkmark-circle-outline',
  },
  warning: {
    palette: riskPalette.moderate,
    icon: 'alert-circle-outline',
  },
  danger: {
    palette: riskPalette.critical,
    icon: 'warning-outline',
  },
};

export function InlineNotice({
  tone = 'info',
  title,
  children,
  icon,
  style,
}: {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const n = NOTICE[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: n.palette.bg, borderColor: n.palette.border }, style]}
      accessibilityRole="alert">
      <Ionicons name={icon ?? n.icon} size={18} color={n.palette.fg} style={styles.noticeIcon} />
      <View style={styles.noticeBody}>
        {title ? (
          <AppText variant="smallStrong" color={n.palette.fg}>
            {title}
          </AppText>
        ) : null}
        {typeof children === 'string' ? (
          <AppText variant="small" color={colors.textSecondary}>
            {children}
          </AppText>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/* ---------------- SegmentedControl ---------------- */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  disabled?: boolean;
}

/** iOS segmented control with a sliding, spring-animated thumb. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segmentWidth = options.length ? (width - 6) / options.length : 0;
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withSpring(index * segmentWidth, motion.spring);
  }, [index, segmentWidth, offset]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <View
      style={[styles.segment, style]}
      accessibilityRole="tablist"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? <Animated.View style={[styles.segmentThumb, { width: segmentWidth }, thumbStyle]} /> : null}
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (opt.disabled || selected) return;
              if (Platform.OS === 'ios') Haptics.selectionAsync().catch(() => undefined);
              onChange(opt.value);
            }}
            disabled={opt.disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled: opt.disabled }}
            style={[styles.segmentItem, opt.disabled && styles.disabled]}>
            {opt.icon ? <Ionicons name={opt.icon} size={15} color={selected ? colors.text : colors.textMuted} /> : null}
            <AppText variant="smallStrong" color={selected ? colors.text : colors.textSecondary} numberOfLines={1}>
              {opt.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- PulseDot ---------------- */

/** Softly pulsing status dot (live / listening indicators). */
export function PulseDot({ color, size = 10 }: { color: string; size?: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 1.6 }],
  }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, ring]} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

/* ---------------- ToggleRow ---------------- */

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{label}</AppText>
        {description ? <AppText variant="small">{description}</AppText> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.borderStrong, true: colors.primary }}
        thumbColor="#FFFFFF"
        accessibilityLabel={label}
      />
    </View>
  );
}

/* ---------------- KeyValueRow ---------------- */

export function KeyValueRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.kvRow}>
      <AppText variant="small" color={colors.textMuted} style={styles.kvLabel}>
        {label}
      </AppText>
      <AppText variant={mono ? 'mono' : 'smallStrong'} color={colors.textSecondary} style={styles.kvValue} selectable>
        {value}
      </AppText>
    </View>
  );
}

/* ---------------- Divider ---------------- */

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -spacing.xs,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.xs,
  },
  iconCircle: { alignItems: 'center', justifyContent: 'center' },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyBody: { maxWidth: 320, marginBottom: spacing.sm },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  noticeIcon: { marginTop: 1 },
  noticeBody: { flex: 1, gap: 2 },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.track,
    borderRadius: radius.sm + 1,
    padding: 3,
  },
  segmentThumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: radius.sm - 1,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  segmentItem: {
    flex: 1,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  disabled: { opacity: 0.45 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  kvRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  kvLabel: { width: 112 },
  kvValue: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});

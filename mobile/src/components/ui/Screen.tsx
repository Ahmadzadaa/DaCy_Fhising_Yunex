import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useContext, type ReactElement, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { colors, MAX_CONTENT_WIDTH, spacing } from '@/constants/theme';

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  /** Safe-area edges to pad. Tab screens use ['top'] (the tab bar handles the bottom). */
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Rendered below the scroll area, above the keyboard (e.g. a sticky action bar). */
  footer?: ReactNode;
  /** iOS large title shown at the top of the content. */
  title?: string;
  subtitle?: string;
  /** Accessory rendered on the right of the large title (badge, button). */
  titleAccessory?: ReactNode;
}

/**
 * Standard screen container: plain white background, safe area, keyboard
 * avoidance, large title, generous whitespace, and a centred max-width column so
 * tablets and web never stretch the layout. The flat tab bar sits below the
 * content, so no extra bottom inset is needed.
 */
export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  contentStyle,
  refreshControl,
  footer,
  title,
  subtitle,
  titleAccessory,
}: ScreenProps) {
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  // The flat tab bar is laid out below the scene, so it never covers content.
  const bottomPad = { paddingBottom: inTabs ? spacing.xxl : spacing.xxxl };

  const header = title ? (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <AppText variant="display" style={styles.title} accessibilityRole="header">
          {title}
        </AppText>
        {titleAccessory}
      </View>
      {subtitle ? <AppText variant="small">{subtitle}</AppText> : null}
    </View>
  ) : null;

  const column = (
    <View style={[styles.column, !scroll && styles.flex]}>
      {header}
      {children}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, bottomPad, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentInsetAdjustmentBehavior="never"
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}>
      {column}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content, bottomPad, contentStyle]}>{column}</View>
  );

  return (
    <SafeAreaView style={styles.root} edges={edges}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        {body}
        {footer ? <View style={[styles.footer, { paddingBottom: spacing.md }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  column: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    gap: spacing.xl,
  },
  header: { gap: spacing.xs, marginBottom: spacing.xs },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: spacing.xs },
  title: { flexShrink: 1 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
});

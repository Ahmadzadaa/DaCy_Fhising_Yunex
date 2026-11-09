/**
 * Flat bottom tab bar (Apple HIG): white, 1 px top border, grey icons, the
 * active tab in the single accent colour. No blur, no floating, no motion.
 */
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { colors, TAB_BAR } from '@/constants/theme';

export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom, height: TAB_BAR.height + insets.bottom }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const color = focused ? colors.primary : colors.textMuted;
        const label = typeof options.title === 'string' ? options.title : route.name;
        const badge = options.tabBarBadge;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            }}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
            <View>
              {options.tabBarIcon?.({ focused, color, size: 24 }) ?? null}
              {badge !== undefined ? <View style={styles.badge} /> : null}
            </View>
            <AppText variant="smallStrong" color={color} numberOfLines={1} style={styles.label}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  pressed: { opacity: 0.6 },
  label: { fontSize: 10.5, lineHeight: 13, fontWeight: '500' },
  badge: { position: 'absolute', top: -1, right: -3, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.critical, borderWidth: 1.5, borderColor: colors.bg },
});

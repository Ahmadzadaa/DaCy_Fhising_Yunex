/**
 * Small "i" button that reveals a glass tooltip bubble. Used instead of long
 * paragraphs: the explanation is one tap away, not always on screen.
 * The bubble closes on a second tap or after a few seconds.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import type { IconName } from '@/constants/indicators';
import { colors, radius, spacing } from '@/constants/theme';

export interface InfoTipProps {
  text: string;
  /** Icon shown as the trigger (default "information-circle-outline"). */
  icon?: IconName;
  color?: string;
  size?: number;
  /** Which side the bubble opens towards. */
  align?: 'left' | 'right' | 'center';
  style?: StyleProp<ViewStyle>;
}

export function InfoTip({ text, icon = 'information-circle-outline', color = colors.textMuted, size = 18, align = 'right', style }: InfoTipProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setOpen(false), 6000);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <View style={[styles.anchor, style]}>
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
          setOpen((v) => !v);
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityState={{ expanded: open }}>
        <Ionicons name={open ? 'close-circle' : icon} size={size} color={open ? colors.text : color} />
      </Pressable>
      {open ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
          style={[
            styles.bubble,
            align === 'right' ? styles.openRight : align === 'left' ? styles.openLeft : styles.openCenter,
          ]}
          accessibilityLiveRegion="polite">
          <AppText variant="small" color={colors.text}>
            {text}
          </AppText>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'relative', zIndex: 20 },
  bubble: {
    position: 'absolute',
    top: 26,
    width: 250,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSolid,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    zIndex: 30,
  },
  openRight: { left: -8 },
  openLeft: { right: -8 },
  openCenter: { left: -116 },
});

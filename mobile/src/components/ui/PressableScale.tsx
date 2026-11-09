/**
 * iOS-style pressable: springs down slightly while pressed, gives a light
 * haptic tick, and supports all Pressable accessibility props.
 */
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { motion } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed (default 0.97). */
  scaleTo?: number;
  /** Light haptic on press-in (default true). */
  haptic?: boolean;
}

export function PressableScale({ children, style, scaleTo = motion.pressScale, haptic = true, disabled, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, motion.spring);
        if (haptic && !disabled && Platform.OS === 'ios') Haptics.selectionAsync().catch(() => undefined);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, motion.spring);
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}>
      {children}
    </AnimatedPressable>
  );
}

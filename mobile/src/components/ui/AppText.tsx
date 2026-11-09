import { Text, type TextProps, type TextStyle } from 'react-native';

import { typography } from '@/constants/theme';

export type TextVariant = keyof typeof typography;

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
}

/** Text with the DaCy type scale applied. */
export function AppText({ variant = 'body', color, align, weight, style, ...rest }: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        typography[variant],
        color ? { color } : null,
        align ? { textAlign: align } : null,
        weight ? { fontWeight: weight } : null,
        style,
      ]}
    />
  );
}

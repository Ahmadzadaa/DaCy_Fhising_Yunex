/**
 * DaCy design system — "Minimal" (Apple HIG, light only).
 *
 * - Pure white background, flat surfaces, 1 px light-grey borders.
 * - No shadows, no glass, no glow, no decorative motion.
 * - Monochrome greys + ONE accent (Safety Green) for active states and the
 *   primary button. Red / amber appear only as risk *information* (a score or
 *   a warning), never as decoration.
 * The app is light-only (app.json `userInterfaceStyle: "light"`).
 */
import { Platform, type TextStyle } from 'react-native';

import type { InferenceMode, RiskBand, UrlSignalSeverity } from '@/types/security';

export const colors = {
  // Backgrounds
  bg: '#FFFFFF',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#F5F5F7',
  surfaceSolid: '#FFFFFF',
  border: '#E5E5EA',
  borderStrong: '#D1D1D6',
  glassHighlight: '#E5E5EA',
  overlay: 'rgba(0, 0, 0, 0.3)',

  // Labels — high contrast
  text: '#111111',
  textSecondary: '#6E6E73',
  textMuted: '#A1A1A6',
  textInverse: '#FFFFFF',

  // The ONE accent — Safety Green (white text on it passes WCAG AA)
  primary: '#0A8754',
  primaryPressed: '#076E44',
  primarySoft: '#EAF6F0',
  onPrimary: '#FFFFFF',
  // Former secondary accents collapse to neutral grey.
  coral: '#D93025',
  coralSoft: '#FDECEA',
  cyan: '#6E6E73',
  cyanSoft: '#F5F5F7',
  indigo: '#6E6E73',

  // Risk information only
  low: '#0A8754',
  moderate: '#B7791F',
  high: '#C2410C',
  critical: '#D93025',

  success: '#0A8754',
  warning: '#B7791F',
  danger: '#D93025',

  // Fills
  fill: '#F2F2F7',
  track: '#E5E5EA',
  thumb: '#FFFFFF',
} as const;

export interface RiskPalette {
  /** Main accent (gauge arc, badge text). */
  fg: string;
  /** Tinted background for badges/cards. */
  bg: string;
  /** Subtle border. */
  border: string;
}

function tint(hex: string, bgAlpha: number, borderAlpha: number): RiskPalette {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return { fg: hex, bg: `rgba(${r}, ${g}, ${b}, ${bgAlpha})`, border: `rgba(${r}, ${g}, ${b}, ${borderAlpha})` };
}

export const riskPalette: Record<RiskBand, RiskPalette> = {
  low: tint(colors.low, 0.08, 0.25),
  moderate: tint(colors.moderate, 0.08, 0.25),
  high: tint(colors.high, 0.08, 0.25),
  critical: tint(colors.critical, 0.07, 0.25),
};

export const severityPalette: Record<UrlSignalSeverity, RiskPalette> = {
  info: { fg: colors.textSecondary, bg: colors.surfaceSunken, border: colors.border },
  low: tint(colors.cyan, 0.12, 0.28),
  medium: riskPalette.moderate,
  high: riskPalette.critical,
};

export const modePalette: Record<InferenceMode, RiskPalette> = {
  // Modes are information, not decoration: neutral grey pills.
  CLOUD_API: { fg: colors.textSecondary, bg: colors.surfaceSunken, border: colors.border },
  ON_DEVICE: { fg: colors.textSecondary, bg: colors.surfaceSunken, border: colors.border },
  DETERMINISTIC_ENGINE: { fg: colors.textSecondary, bg: colors.surfaceSunken, border: colors.border },
};

/** Score thresholds (inclusive lower bounds). Keep in sync with the risk engine. */
export const RISK_THRESHOLDS = { moderate: 25, high: 50, critical: 75 } as const;

/** 4-pt grid. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** iOS-like continuous corner radii. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

const fontFamily = Platform.select({
  ios: { regular: 'System', mono: 'Menlo' },
  web: {
    regular: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace',
  },
  default: { regular: 'System', mono: 'monospace' },
});

export const fonts = fontFamily;

/** Apple Human Interface type ramp. SF Pro on iOS, Inter / system UI on web. */
export const typography = {
  hero: { fontSize: 48, lineHeight: 54, fontWeight: '600', letterSpacing: -1, color: colors.text },
  display: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.5, color: colors.text },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: 0.35, color: colors.text },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.41, color: colors.text },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400', letterSpacing: -0.3, color: colors.text },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600', letterSpacing: -0.3, color: colors.text },
  small: { fontSize: 14, lineHeight: 19, fontWeight: '400', letterSpacing: -0.15, color: colors.textSecondary },
  smallStrong: { fontSize: 14, lineHeight: 19, fontWeight: '600', letterSpacing: -0.15, color: colors.textSecondary },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500', letterSpacing: 0, color: colors.textSecondary },
  mono: { fontSize: 13, lineHeight: 19, fontFamily: fontFamily.mono, color: colors.textSecondary },
} satisfies Record<string, TextStyle>;

/** Flat design: no shadows anywhere. Kept as an empty style so call sites stay simple. */
export const elevation = {};

/** Flat bottom tab bar (Screen adds this as bottom padding). */
export const TAB_BAR = { height: 56, sideInset: 0, bottomGap: 0 } as const;

/** Max content width on tablets / web so the layout never stretches. */
export const MAX_CONTENT_WIDTH = 760;

/** Minimum touch target. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** Motion is functional only: a quick press response, no decorative loops. */
export const motion = {
  pressScale: 0.98,
  spring: { damping: 22, stiffness: 320, mass: 0.6 },
  enterDuration: 0,
  stagger: 0,
} as const;

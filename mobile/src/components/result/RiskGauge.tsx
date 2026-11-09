import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { BAND_META } from '@/constants/indicators';
import { colors, riskPalette, RISK_THRESHOLDS } from '@/constants/theme';
import { tr, useUiLanguage } from '@/i18n';
import type { RiskBand } from '@/types/security';

export interface RiskGaugeProps {
  score: number;
  band: RiskBand;
  size?: number;
  /** Optional caption under the band label (e.g. "Conversation risk"). */
  caption?: string;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** Animates a number towards `target` with an ease-out curve (cross-platform, JS-driven). */
function useCountUp(target: number, durationMs = 750): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(next);
      fromRef.current = next;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

/** Half-circle 0–100 gauge. The number is the deterministic engine score. */
export function RiskGauge({ score, band, size = 220, caption }: RiskGaugeProps) {
  const lang = useUiLanguage();
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const animated = useCountUp(clamped);
  const shown = Math.round(animated);
  const stroke = Math.round(size * 0.075);
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const height = size / 2 + stroke;

  // Arc from 180° (left) to 360° (right), drawn clockwise over the top.
  const start = polar(cx, cy, r, 180);
  const end = polar(cx, cy, r, 360);
  const arcPath = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
  const length = Math.PI * r;
  const progress = (animated / 100) * length;
  const color = riskPalette[band].fg;

  const ticks = [RISK_THRESHOLDS.moderate, RISK_THRESHOLDS.high, RISK_THRESHOLDS.critical].map((t) => {
    const angle = 180 + (t / 100) * 180;
    return { t, inner: polar(cx, cy, r - stroke * 0.9, angle), outer: polar(cx, cy, r + stroke * 0.9, angle) };
  });
  const knob = polar(cx, cy, r, 180 + (animated / 100) * 180);

  return (
    <View
      style={[styles.wrap, { width: size }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${tr(BAND_META[band].label, lang)}, ${clamped} / 100`}
      accessibilityValue={{ min: 0, max: 100, now: clamped }}>
      <Svg width={size} height={height} viewBox={`0 0 ${size} ${height}`}>
        <Path d={arcPath} stroke={colors.track} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        {animated > 0.5 ? (
          <Path
            d={arcPath}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${progress} ${length}`}
          />
        ) : null}
        {ticks.map(({ t, inner, outer }) => (
          <Path
            key={t}
            d={`M ${inner.x} ${inner.y} L ${outer.x} ${outer.y}`}
            stroke={colors.surface}
            strokeWidth={2}
          />
        ))}
        <Circle cx={knob.x} cy={knob.y} r={stroke * 0.32} fill={colors.text} />
      </Svg>
      <View style={[styles.center, { top: size * 0.2 }]} pointerEvents="none">
        <AppText style={[styles.score, { color, fontSize: size * 0.24, lineHeight: size * 0.28 }]}>{shown}</AppText>
        <AppText variant="caption" color={colors.textMuted}>
          / 100
        </AppText>
      </View>
      <AppText variant="heading" color={color} align="center" style={styles.band}>
        {tr(BAND_META[band].label, lang)}
      </AppText>
      {caption ? (
        <AppText variant="small" align="center">
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', alignSelf: 'center' },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  score: { fontWeight: '800', letterSpacing: -1 },
  band: { marginTop: 2 },
});

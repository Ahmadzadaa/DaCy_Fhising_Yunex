/**
 * Compact timeline of the conversation risk score (cumulative, 0–100) per message.
 * Single series → no legend; recessive grid; dashed band thresholds at 25/50/75
 * labelled in muted ink; 2 px line, 8 px markers with a surface ring; a marker
 * where each guardian alert fired (the first alert and any escalation), the
 * latest one labelled.
 */
import { useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { colors, fonts, riskPalette, RISK_THRESHOLDS, spacing } from '@/constants/theme';
import type { RiskBand } from '@/types/security';

export interface TimelinePoint {
  score: number;
  band: RiskBand;
}

export interface RiskTimelineProps {
  points: TimelinePoint[];
  /** Total number of message slots (fixes the x-axis while messages appear). */
  total: number;
  /** Indices (into points) where guardian alerts fired, in order. */
  alertIndices: number[];
  alertLabel: string;
  startLabel: string;
  endLabel: string;
  emptyLabel: string;
  accessibilityLabel: string;
  height?: number;
}

const PAD = { left: 6, right: 28, top: 20, bottom: 8 };
/** SVG text needs an explicit family on web (it defaults to serif); native uses the system font. */
const SVG_FONT = Platform.OS === 'web' ? fonts.regular : undefined;

const THRESHOLDS: { value: number; band: RiskBand }[] = [
  { value: RISK_THRESHOLDS.moderate, band: 'moderate' },
  { value: RISK_THRESHOLDS.high, band: 'high' },
  { value: RISK_THRESHOLDS.critical, band: 'critical' },
];

export function RiskTimeline({
  points,
  total,
  alertIndices,
  alertLabel,
  startLabel,
  endLabel,
  emptyLabel,
  accessibilityLabel,
  height = 150,
}: RiskTimelineProps) {
  const [width, setWidth] = useState(0);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const slots = Math.max(2, total);
  const x = (i: number) => PAD.left + (Math.min(i, slots - 1) / (slots - 1)) * plotW;
  const y = (score: number) => PAD.top + (1 - Math.max(0, Math.min(100, score)) / 100) * plotH;

  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ');
  const area =
    points.length > 1
      ? `${line} L ${x(points.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`
      : '';
  const markers = alertIndices.filter((i) => i >= 0 && i < points.length);
  const lastMarker = markers.length ? markers[markers.length - 1]! : null;
  const alertX = lastMarker !== null ? x(lastMarker) : 0;
  const alertAnchorEnd = alertX > PAD.left + plotW * 0.7;

  return (
    <View
      style={styles.root}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {/* baseline */}
          <Line x1={PAD.left} x2={PAD.left + plotW} y1={y(0)} y2={y(0)} stroke={colors.borderStrong} strokeWidth={1} />
          {/* band thresholds */}
          {THRESHOLDS.map((th) => (
            <Line
              key={th.value}
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(th.value)}
              y2={y(th.value)}
              stroke={riskPalette[th.band].fg}
              strokeOpacity={0.45}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ))}
          {THRESHOLDS.map((th) => (
            <SvgText key={`l${th.value}`} x={PAD.left + plotW + 6} y={y(th.value) + 3.5} fontSize={10} fontFamily={SVG_FONT} fill={colors.textMuted}>
              {String(th.value)}
            </SvgText>
          ))}
          {/* alert markers (label on the latest) */}
          {markers.map((i) => (
            <Line
              key={`a${i}`}
              x1={x(i)}
              x2={x(i)}
              y1={PAD.top - 6}
              y2={y(0)}
              stroke={colors.critical}
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          ))}
          {markers.map((i) => (
            <Circle key={`d${i}`} cx={x(i)} cy={PAD.top - 9} r={3.5} fill={colors.critical} />
          ))}
          {lastMarker !== null ? (
            <>
              <SvgText
                x={alertAnchorEnd ? alertX - 7 : alertX + 7}
                y={PAD.top - 5.5}
                fontSize={10}
                fontFamily={SVG_FONT}
                fontWeight="600"
                fill={colors.text}
                textAnchor={alertAnchorEnd ? 'end' : 'start'}>
                {alertLabel}
              </SvgText>
            </>
          ) : null}
          {/* series */}
          {area ? <Path d={area} fill={colors.text} fillOpacity={0.05} /> : null}
          {points.length > 1 ? (
            <Path d={line} stroke={colors.text} strokeOpacity={0.75} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
          ) : null}
          {points.map((p, i) => (
            <Circle
              key={i}
              cx={x(i)}
              cy={y(p.score)}
              r={i === points.length - 1 ? 5 : 4}
              fill={riskPalette[p.band].fg}
              stroke={colors.surface}
              strokeWidth={2}
            />
          ))}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      {!points.length ? (
        <View style={[styles.empty, { height }]} pointerEvents="none">
          <AppText variant="small" color={colors.textMuted}>
            {emptyLabel}
          </AppText>
        </View>
      ) : null}
      <View style={[styles.axis, { paddingRight: PAD.right }]}>
        <AppText variant="small" color={colors.textMuted} style={styles.axisText}>
          {startLabel}
        </AppText>
        <AppText variant="small" color={colors.textMuted} style={styles.axisText}>
          {endLabel}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch' },
  empty: { position: 'absolute', left: 0, right: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xxs },
  axisText: { fontSize: 11, lineHeight: 14 },
});

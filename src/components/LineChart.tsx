import { useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { diffDays, formatDayShort, formatMonthDay } from '@/domain/dates';
import type { Point } from '@/domain/trends';
import { colors, space, tabular } from '@/theme';

interface Props {
  points: Point[];
  format: (v: number) => string;
  height?: number;
}

const PAD_Y = 10;
const PAD_X = 6;

/**
 * Single-series line on a time axis (x spacing follows real dates, so gaps show).
 * Touch or drag across the plot to read a point; the latest point is selected by default.
 */
export function LineChart({ points, format, height = 140 }: Props) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(points.length - 1);

  if (points.length === 0) return null;

  const first = points[0].date;
  const span = Math.max(1, diffDays(points[points.length - 1].date, first));
  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= Math.max(1, Math.abs(min) * 0.1);
    max += Math.max(1, Math.abs(max) * 0.1);
  }
  const plotW = Math.max(1, width - PAD_X * 2);
  const plotH = height - PAD_Y * 2;
  const xOf = (p: Point) => (points.length === 1 ? width / 2 : PAD_X + (diffDays(p.date, first) / span) * plotW);
  const yOf = (v: number) => PAD_Y + (1 - (v - min) / (max - min)) * plotH;

  const sel = points[Math.min(selected, points.length - 1)];
  const pick = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(xOf(p) - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setSelected(best);
  };

  const summary = `${points.length} data points from ${formatDayShort(first)}. Latest ${format(points[points.length - 1].value)}, range ${format(Math.min(...values))} to ${format(Math.max(...values))}.`;

  return (
    <View accessible accessibilityLabel={`Line chart. ${summary}`}>
      <View style={styles.readout}>
        <Text style={styles.readTitle}>{formatDayShort(sel.date)}</Text>
        <Text style={[styles.readValue, tabular]}>{format(sel.value)}</Text>
      </View>
      <View
        style={{ height }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderTerminationRequest={() => true}>
        {width > 0 && (
          <Svg width={width} height={height}>
            <Line x1={0} x2={width} y1={yOf(max)} y2={yOf(max)} stroke={colors.border} strokeWidth={StyleSheet.hairlineWidth} />
            <Line x1={0} x2={width} y1={yOf(min)} y2={yOf(min)} stroke={colors.border} strokeWidth={StyleSheet.hairlineWidth} />
            <Line x1={xOf(sel)} x2={xOf(sel)} y1={PAD_Y / 2} y2={height - PAD_Y / 2} stroke={colors.borderStrong} strokeWidth={1} />
            {points.length > 1 && (
              <Polyline
                points={points.map((p) => `${xOf(p)},${yOf(p.value)}`).join(' ')}
                fill="none"
                stroke={colors.primary}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {points.length <= 24 &&
              points.map((p) => (
                <Circle key={p.date} cx={xOf(p)} cy={yOf(p.value)} r={3} fill={colors.surface} stroke={colors.primary} strokeWidth={2} />
              ))}
            <Circle cx={xOf(sel)} cy={yOf(sel.value)} r={5.5} fill={colors.primary} stroke={colors.surface} strokeWidth={2} />
          </Svg>
        )}
      </View>
      <View style={styles.axis}>
        <Text style={styles.tick}>{formatMonthDay(first)}</Text>
        <Text style={[styles.tick, tabular]}>
          {format(Math.min(...values))} – {format(Math.max(...values))}
        </Text>
        <Text style={styles.tick}>{formatMonthDay(points[points.length - 1].date)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.xs },
  readTitle: { fontSize: 13, color: colors.textSecondary },
  readValue: { fontSize: 17, fontWeight: '600', color: colors.text },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tick: { fontSize: 11, color: colors.textTertiary },
});

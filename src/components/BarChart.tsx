import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, space, tabular } from '@/theme';

export interface Bar {
  key: string;
  value: number;
  /** Axis label; empty strings are skipped to keep the axis sparse. */
  label: string;
  /** Tooltip heading, e.g. "Tue, Sep 29". */
  title: string;
}

interface Props {
  bars: Bar[];
  format: (v: number) => string;
  height?: number;
  /** Key selected by default (usually the latest bucket). */
  initialKey?: string;
}

/**
 * Single-series bar chart: thin rounded bars on a shared baseline, recessive grid,
 * tap a bar to read its exact value (touch stand-in for hover).
 */
export function BarChart({ bars, format, height = 150, initialKey }: Props) {
  const [selected, setSelected] = useState<string | undefined>(initialKey ?? bars[bars.length - 1]?.key);
  const max = Math.max(...bars.map((b) => b.value), 0);
  const sel = bars.find((b) => b.key === selected);
  const gap = bars.length > 20 ? 2 : 4;

  const summary = max > 0 ? `Highest ${format(max)}. ${bars.filter((b) => b.value > 0).length} of ${bars.length} with activity.` : 'No activity in this range.';

  return (
    <View accessible accessibilityLabel={`Bar chart. ${summary}`}>
      <View style={styles.readout}>
        <Text style={styles.readTitle}>{sel?.title ?? ''}</Text>
        <Text style={[styles.readValue, tabular]}>{sel ? format(sel.value) : ''}</Text>
      </View>
      <View style={[styles.plot, { height }]}>
        <View style={[styles.grid, { top: 0 }]} />
        <View style={[styles.grid, { top: height / 2 }]} />
        <View style={[styles.bars, { gap }]}>
          {bars.map((b) => {
            const h = max > 0 ? (b.value / max) * (height - 4) : 0;
            const on = b.key === selected;
            return (
              <Pressable
                key={b.key}
                onPress={() => setSelected(b.key)}
                style={styles.slot}
                accessibilityRole="button"
                accessibilityLabel={`${b.title}: ${format(b.value)}`}>
                <View
                  style={[
                    styles.bar,
                    { height: b.value > 0 ? Math.max(h, 3) : 0 },
                    !on && selected !== undefined && styles.barDim,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
        <View style={styles.baseline} />
      </View>
      <View style={[styles.axis, { gap }]}>
        {bars.map((b) => (
          <View key={b.key} style={styles.tickSlot}>
            <Text style={styles.tick} numberOfLines={1}>
              {b.label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.max}>{max > 0 ? `max ${format(max)}` : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.sm, minHeight: 22 },
  readTitle: { fontSize: 13, color: colors.textSecondary },
  readValue: { fontSize: 17, fontWeight: '600', color: colors.text },
  plot: { position: 'relative', justifyContent: 'flex-end' },
  grid: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: '100%' },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', maxWidth: 26, backgroundColor: colors.primary, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barDim: { opacity: 0.55 },
  baseline: { height: 1, backgroundColor: colors.borderStrong },
  axis: { flexDirection: 'row', marginTop: 6 },
  tickSlot: { flex: 1, alignItems: 'center' },
  tick: { width: 56, fontSize: 10.5, color: colors.textTertiary, textAlign: 'center' },
  max: { fontSize: 11, color: colors.textTertiary, textAlign: 'right', marginTop: 2 },
});

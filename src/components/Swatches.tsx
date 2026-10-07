import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { Icon } from './Icon';

export function Swatches<T extends string | null>({
  options,
  value,
  onChange,
  label,
  allowOriginal,
}: {
  options: string[];
  value: T;
  onChange: (c: string | null) => void;
  label: string;
  /** Adds a first swatch that keeps the outfit's original colour (value null). */
  allowOriginal?: boolean;
}) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {allowOriginal && (
        <Pressable
          onPress={() => onChange(null)}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === null }}
          accessibilityLabel={`${label}: original`}
          style={[styles.ring, value === null && styles.ringOn]}>
          <View style={[styles.dot, styles.original]}>
            <Icon name="refresh" size={18} color={colors.textSecondary} />
          </View>
        </Pressable>
      )}
      {options.map((c) => {
        const on = value !== null && c.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${label} ${c}`}
            style={[styles.ring, on && styles.ringOn]}>
            <View style={[styles.dot, { backgroundColor: c }]}>
              {on && <Icon name="check-bold" size={14} color={isLight(c) ? colors.text : '#fff'} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ring: { width: 44, height: 44, borderRadius: 22, padding: 3, borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: colors.primary },
  original: { backgroundColor: colors.surface, borderStyle: 'dashed', borderColor: colors.borderStrong, borderWidth: 1 },
  dot: {
    flex: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
  },
});

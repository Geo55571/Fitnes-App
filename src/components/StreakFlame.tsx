import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { streakStage, type Streak } from '@/domain/streak';
import { colors, space } from '@/theme';

/** A flame (viewBox 0 0 100 120), its inner layer, and its hot core. */
const OUTER = 'M50 4 C58 26 82 38 84 70 C86 98 68 116 50 116 C32 116 14 100 16 72 C17 54 28 44 32 30 C36 44 42 48 44 52 C46 36 46 20 50 4 Z';
const MIDDLE = 'M50 40 C55 56 70 64 70 84 C70 102 60 112 50 112 C40 112 30 102 30 86 C30 72 40 66 42 56 C45 64 48 66 49 68 C50 58 49 50 50 40 Z';
const CORE = 'M50 72 C54 82 60 88 60 98 C60 106 55 110 50 110 C45 110 40 106 40 98 C40 90 46 84 50 72 Z';

interface Props {
  streak: Streak;
  /** Height of the flame. */
  size: number;
}

/**
 * The streak flame. It grows and changes colour as the streak gets longer (see STREAK_STAGES)
 * and flickers. Tapping it opens a see-through circle around it with the details; tapping the
 * flame again closes it.
 */
export function StreakFlame({ streak, size }: Props) {
  const { stage, next } = streakStage(streak.current);
  const [open, setOpen] = useState(false);
  const [flicker] = useState(() => new Animated.Value(0));
  const [reveal] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [flicker]);

  useEffect(() => {
    Animated.spring(reveal, { toValue: open ? 1 : 0, useNativeDriver: true, friction: 8, tension: 60 }).start();
  }, [open, reveal]);

  // Longer streaks, bigger flame (up to the full size).
  const grow = 0.72 + 0.28 * Math.min(1, streak.current / 30);
  const h = size * grow;
  const w = h * (100 / 120);
  const ring = size * 2.15;
  const lit = streak.current > 0;

  const scaleY = flicker.interpolate({ inputRange: [0, 1], outputRange: [1, lit ? 1.06 : 1.01] });
  const scaleX = flicker.interpolate({ inputRange: [0, 1], outputRange: [1, lit ? 0.97 : 1] });
  const glowOpacity = flicker.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.9] });
  const ringScale = reveal.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  const toNext = next ? next.from - streak.current : 0;

  return (
    <View style={[styles.wrap, { width: ring, height: ring }]}>
      {/* The window: a frosted, see-through circle that grows out from the flame. */}
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[
          styles.ring,
          { width: ring, height: ring, borderRadius: ring / 2, borderColor: stage.colors[0], opacity: reveal, transform: [{ scale: ringScale }] },
        ]}>
        <View style={[styles.ringTop, { top: ring * 0.07 }]}>
          <Text style={[styles.big, { color: stage.colors[0] }]}>{streak.current}</Text>
          <Text style={styles.label}>{streak.current === 1 ? 'day in a row' : 'days in a row'}</Text>
        </View>
        <View style={[styles.ringBottom, { bottom: ring * 0.15 }]}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{streak.missed}</Text>
            <Text style={styles.statLabel}>{streak.missed === 1 ? 'day missed' : 'days missed'}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{streak.best}</Text>
            <Text style={styles.statLabel}>best streak</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{streak.activeDays}</Text>
            <Text style={styles.statLabel}>workout days</Text>
          </View>
        </View>
        <Text style={[styles.stageLine, { bottom: ring * 0.07 }]} numberOfLines={1}>
          {stage.name}
          {next ? ` · ${toNext} ${toNext === 1 ? 'day' : 'days'} to ${next.name}` : ' · max level'}
        </Text>
      </Animated.View>

      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`Streak: ${streak.current} ${streak.current === 1 ? 'day' : 'days'} in a row. ${open ? 'Close' : 'Show'} details.`}
        hitSlop={12}
        style={styles.flameHit}>
        <Animated.View style={[styles.glow, { width: w * 1.5, height: w * 1.5, borderRadius: w, backgroundColor: stage.glow, opacity: glowOpacity }]} />
        <Animated.View style={{ transform: [{ scaleX }, { scaleY }], transformOrigin: 'bottom' }}>
          <Svg width={w} height={h} viewBox="0 0 100 120">
            <Defs>
              <RadialGradient id="outer" cx="50%" cy="80%" r="75%">
                <Stop offset="0" stopColor={stage.colors[1]} />
                <Stop offset="1" stopColor={stage.colors[0]} />
              </RadialGradient>
              <RadialGradient id="core" cx="50%" cy="85%" r="60%">
                <Stop offset="0" stopColor="#FFFFFF" />
                <Stop offset="1" stopColor={stage.colors[2]} />
              </RadialGradient>
            </Defs>
            <Path d={OUTER} fill="url(#outer)" />
            <Path d={MIDDLE} fill={stage.colors[1]} opacity={0.95} />
            <Path d={CORE} fill="url(#core)" />
          </Svg>
          <View style={[styles.numberWrap, { top: h * 0.44 }]} pointerEvents="none">
            <Text style={[styles.number, { fontSize: Math.round(h * 0.32) }]}>{streak.current}</Text>
          </View>
        </Animated.View>
      </Pressable>
      {!open && (
        <Text style={styles.caption} numberOfLines={1}>
          {!lit ? 'Work out today to light your streak' : streak.doneToday ? `${stage.name} · tap for details` : 'Work out today to keep it going'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  ringTop: { position: 'absolute', alignItems: 'center' },
  big: { fontSize: 34, fontWeight: '800', lineHeight: 38 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  ringBottom: { position: 'absolute', flexDirection: 'row', gap: space.sm },
  stat: { alignItems: 'center', minWidth: 62 },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textSecondary },
  stageLine: { position: 'absolute', fontSize: 11, fontWeight: '600', color: colors.textTertiary },
  flameHit: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute' },
  numberWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  number: { fontWeight: '900', color: '#fff', textShadowColor: 'rgba(120,40,0,0.55)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  caption: { position: 'absolute', bottom: 0, fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
});

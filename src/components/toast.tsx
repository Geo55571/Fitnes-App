import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, radius } from '@/theme';

const useToastStore = create<{ message: string | null; key: number }>(() => ({ message: null, key: 0 }));

export function showToast(message: string) {
  useToastStore.setState((s) => ({ message, key: s.key + 1 }));
}

/** Transient confirmation shown below the header. */
export function ToastHost() {
  const { message, key } = useToastStore();
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => finished && useToastStore.setState({ message: null }));
  }, [key, message, opacity]);

  if (!message) return null;
  return (
    // Shown at the top so it never covers pinned controls (rest timer, save buttons) or the tab bar.
    <Animated.View style={[styles.wrap, { top: insets.top + 60, opacity }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    pointerEvents: 'none',
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  text: {
    backgroundColor: colors.text,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radius.md,
    overflow: 'hidden',
    maxWidth: 480,
  },
});

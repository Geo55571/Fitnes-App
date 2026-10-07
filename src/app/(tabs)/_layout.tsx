import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/toast';
import { PhotoAccessError } from '@/scan/photo';
import { scanFrom } from '@/scan';
import { useStore } from '@/store/store';
import { colors, MAX_CONTENT_WIDTH } from '@/theme';

type IonName = ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; label: string; icon: IonName; iconOn: IonName }[] = [
  { name: 'index', label: 'Today', icon: 'home-outline', iconOn: 'home' },
  { name: 'log', label: 'Log', icon: 'list-outline', iconOn: 'list' },
  { name: 'plan', label: 'Plan', icon: 'calendar-clear-outline', iconOn: 'calendar-clear' },
  { name: 'groups', label: 'Groups', icon: 'people-outline', iconOn: 'people' },
  { name: 'progress', label: 'Progress', icon: 'stats-chart-outline', iconOn: 'stats-chart' },
];

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void; emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean } };
}

/** Today, Log and Plan sit left of the camera; Groups and Progress right. Equal-width sides keep the camera centred. */
const LEFT = new Set(['index', 'log', 'plan']);

function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const item = (route: { key: string; name: string }, i: number) => {
    const tab = TABS.find((t) => t.name === route.name);
    if (!tab) return null;
    const focused = state.index === i;
    const onPress = () => {
      const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
    };
    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={tab.label}
        style={styles.item}>
        <Ionicons name={focused ? tab.iconOn : tab.icon} size={24} color={focused ? colors.primary : colors.textTertiary} />
        <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
          {tab.label}
        </Text>
      </Pressable>
    );
  };
  const routes = state.routes.map((r, i) => ({ r, i }));
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.inner} accessibilityRole="tablist">
        <View style={styles.side}>{routes.filter(({ r }) => LEFT.has(r.name)).map(({ r, i }) => item(r, i))}</View>
        <CameraButton />
        <View style={styles.side}>{routes.filter(({ r }) => !LEFT.has(r.name)).map(({ r, i }) => item(r, i))}</View>
      </View>
    </View>
  );
}

/** Opens the camera straight away; the photo is read and the workout logged on the Scan screen. */
function CameraButton() {
  // No awaits before scanFrom: browsers only open the camera directly from a tap.
  const open = (source: 'camera' | 'library') =>
    scanFrom(source)
      .then((took) => {
        if (took) router.push('/scan');
      })
      .catch((e) => showToast(e instanceof PhotoAccessError ? e.message : 'Couldn’t open the camera.'));
  return (
    <View style={styles.cameraSlot}>
      <Pressable
        onPress={() => open('camera')}
        onLongPress={() => open('library')}
        accessibilityRole="button"
        accessibilityLabel="Scan a workout photo"
        accessibilityHint="Opens the camera. Long press to choose a screenshot instead."
        style={({ pressed }) => [styles.camera, pressed && styles.cameraPressed]}>
        <Ionicons name="camera" size={26} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const onboarded = useStore((s) => s.profile.onboarded);
  if (!onboarded) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => <TabBar {...(props as unknown as TabBarProps)} />}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    paddingTop: 8,
  },
  inner: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  side: { flex: 1, flexDirection: 'row' },
  cameraSlot: { width: 72, alignItems: 'center' },
  camera: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.surface,
    boxShadow: '0 4px 12px rgba(31,75,57,0.28)',
  },
  cameraPressed: { backgroundColor: colors.primaryPressed, transform: [{ scale: 0.96 }] },
  item: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 },
  label: { fontSize: 12, color: colors.textTertiary, fontWeight: '500' },
  labelOn: { color: colors.text, fontWeight: '700' },
});

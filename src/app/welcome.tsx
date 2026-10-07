import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Button, Field, Screen, Segmented } from '@/components/ui';
import { useToday } from '@/hooks/today';
import type { DistanceUnit, WeightUnit } from '@/domain/types';
import { useStore } from '@/store/store';
import { colors, radius, space, type } from '@/theme';

export default function Welcome() {
  const onboarded = useStore((s) => s.profile.onboarded);
  const complete = useStore((s) => s.completeOnboarding);
  const loadDemo = useStore((s) => s.loadDemo);
  const today = useToday();
  const [name, setName] = useState('');
  const [distanceUnit, setDistance] = useState<DistanceUnit>('km');
  const [weightUnit, setWeight] = useState<WeightUnit>('kg');
  const [demo, setDemo] = useState(false);

  if (onboarded) return <Redirect href="/" />;

  const start = () => {
    complete({ name: name.trim() || 'You', distanceUnit, weightUnit });
    if (demo) loadDemo(today);
    router.replace('/');
  };

  return (
    <Screen footer={<Button label="Start" onPress={start} />}>
      <View style={styles.head}>
        <Text style={type.wordmark}>FORM</Text>
      </View>
      <Text style={type.title}>Set up</Text>
      <Text style={styles.lead}>A few basics. You can change all of this later in Settings.</Text>

      <Field
        label="Your name"
        placeholder="e.g. Sam"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        returnKeyType="done"
        maxLength={40}
        style={styles.block}
      />

      <Text style={styles.label}>Distance</Text>
      <Segmented
        value={distanceUnit}
        onChange={setDistance}
        options={[
          { value: 'km', label: 'Kilometers' },
          { value: 'mi', label: 'Miles' },
        ]}
      />
      <Text style={[styles.label, styles.gap]}>Weight</Text>
      <Segmented
        value={weightUnit}
        onChange={setWeight}
        options={[
          { value: 'kg', label: 'Kilograms' },
          { value: 'lb', label: 'Pounds' },
        ]}
      />

      <Pressable
        onPress={() => setDemo((d) => !d)}
        style={styles.demo}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: demo }}>
        <Icon name={demo ? 'check-circle' : 'circle-outline'} size={24} color={demo ? colors.primary : colors.textTertiary} />
        <View style={styles.flex}>
          <Text style={type.bodyStrong}>Add sample data</Text>
          <Text style={type.small}>
            Four weeks of example history, a sample group and sample friends, all labelled “Sample”. Remove it any time in
            Settings.
          </Text>
        </View>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { height: 56, justifyContent: 'center' },
  lead: { ...type.body, color: colors.textSecondary, marginTop: space.xs, marginBottom: space.xl },
  block: { marginBottom: space.xl },
  label: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 6 },
  gap: { marginTop: space.lg },
  demo: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.xl,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});

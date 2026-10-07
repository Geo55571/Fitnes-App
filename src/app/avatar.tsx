import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { CharacterView, type Reaction } from '@/components/character/CharacterView';
import { AVATAR_MODELS, getAvatarModel } from '@/components/character/models';
import { Swatches } from '@/components/Swatches';
import { Button, Chip, Screen, Segmented, StackHeader } from '@/components/ui';
import type { AvatarConfig } from '@/domain/types';
import { useAthletic } from '@/hooks/athletic';
import { BADGE_COLORS, CLOTHING_COLORS, DEFAULT_AVATAR, HAIR_COLORS, SKIN_TONES } from '@/store/defaults';
import { useStore } from '@/store/store';
import { colors, space, type } from '@/theme';

export default function AvatarScreen() {
  const { avatar, updateAvatar } = useStore(useShallow((s) => ({ avatar: s.avatar, updateAvatar: s.updateAvatar })));
  const { level, activeDays } = useAthletic();
  const { height } = useWindowDimensions();
  const [reaction, setReaction] = useState<{ type: Reaction; key: number } | null>(null);
  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) => updateAvatar({ [k]: v } as Partial<AvatarConfig>);
  const stage = Math.round(Math.min(380, Math.max(260, height * 0.38)));
  const body = getAvatarModel(avatar.model).body;

  const pickBody = (b: 'man' | 'woman') => {
    if (b === body) return;
    set('model', AVATAR_MODELS.find((m) => m.body === b)!.id);
    setReaction({ type: 'wave', key: Date.now() });
  };

  return (
    <Screen header={<StackHeader title="Customize avatar" />} scroll={false}>
      <CharacterView avatar={avatar} height={stage} restAngle={-0.35} athletic={level} reaction={reaction} style={styles.stage} />
      <Text style={styles.hint}>Tap for a move · drag to rotate</Text>
      <View style={styles.flex}>
        <OptionsScroll>
          <Label>Body</Label>
          <Segmented
            value={body}
            onChange={pickBody}
            options={[
              { value: 'man', label: 'Man' },
              { value: 'woman', label: 'Woman' },
            ]}
          />
          <Label>Outfit</Label>
          <View style={styles.wrap}>
            {AVATAR_MODELS.filter((m) => m.body === body).map((m) => (
              <Chip key={m.id} label={m.label} selected={avatar.model === m.id} onPress={() => set('model', m.id)} />
            ))}
          </View>

          <Label>Build</Label>
          <Segmented
            value={avatar.build}
            onChange={(v) => set('build', v)}
            options={[
              { value: 'lean', label: 'Lean' },
              { value: 'regular', label: 'Regular' },
              { value: 'muscular', label: 'Muscular' },
            ]}
          />
          <Text style={[type.caption, styles.note]}>
            Your avatar also gets fitter with consistency: {activeDays} of the last 28 days active
            {level > 0.9 ? ' · peak form' : ''}.
          </Text>

          <Label>Skin tone</Label>
          <Swatches label="Skin tone" options={SKIN_TONES} value={avatar.skin} onChange={(c) => c && set('skin', c)} />
          <Label>Hair colour</Label>
          <Swatches label="Hair colour" options={HAIR_COLORS} value={avatar.hairColor} onChange={(c) => c && set('hairColor', c)} />
          <Label>Top</Label>
          <Swatches label="Top colour" allowOriginal options={CLOTHING_COLORS} value={avatar.topColor} onChange={(c) => set('topColor', c)} />
          <Label>{avatar.model.endsWith('shorts') || avatar.model === 'woman-adventurer' ? 'Shorts' : 'Trousers'}</Label>
          <Swatches label="Bottoms colour" allowOriginal options={CLOTHING_COLORS} value={avatar.bottomColor} onChange={(c) => set('bottomColor', c)} />
          <Label>Shoes</Label>
          <Swatches label="Shoe colour" allowOriginal options={CLOTHING_COLORS} value={avatar.shoeColor} onChange={(c) => set('shoeColor', c)} />
          <Label>Profile badge</Label>
          <Swatches label="Badge colour" options={BADGE_COLORS} value={avatar.badgeColor} onChange={(c) => c && set('badgeColor', c)} />
          <Button label="Reset to default" variant="secondary" compact onPress={() => updateAvatar(DEFAULT_AVATAR)} style={styles.reset} />
        </OptionsScroll>
      </View>
    </Screen>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

/** Options scroll independently below the pinned preview. */
function OptionsScroll({ children }: { children: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={styles.options} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, marginHorizontal: -space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stage: { marginHorizontal: -space.lg },
  hint: { fontSize: 12, color: colors.textTertiary, textAlign: 'center', marginBottom: space.sm },
  options: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: space.xl, marginBottom: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  note: { marginTop: space.sm },
  reset: { marginTop: space.xl, alignSelf: 'flex-start' },
});

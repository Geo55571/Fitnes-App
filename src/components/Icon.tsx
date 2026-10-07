import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import type { IconName } from '@/domain/exercises';
import { colors } from '@/theme';

export function Icon({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

/** Push-ups use the coral flex icon (as in the concept); everything else is charcoal. */
export function exerciseIconColor(exerciseId: string): string {
  return exerciseId === 'pushups' ? colors.coral : colors.text;
}

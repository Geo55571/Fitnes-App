import { useMemo } from 'react';

import { selfPerson } from '@/domain/groups';
import type { Person } from '@/domain/types';
import { useStore } from '@/store/store';

export function useSelf(): Person {
  const name = useStore((s) => s.profile.name);
  const color = useStore((s) => s.avatar.badgeColor);
  const settings = useStore((s) => s.settings);
  return useMemo(() => selfPerson(name, color, settings), [name, color, settings]);
}

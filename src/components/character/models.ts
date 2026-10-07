/**
 * Avatar models — CC0 characters by Quaternius (see assets/models/CREDITS.md).
 * Each ships with untextured, named materials, so skin/hair/clothing can be recoloured.
 */
import type { AvatarModelId } from '@/domain/types';

import manCasual from '../../../assets/models/man-casual.glb';
import manHoodie from '../../../assets/models/man-hoodie.glb';
import manShorts from '../../../assets/models/man-shorts.glb';
import womanAdventurer from '../../../assets/models/woman-adventurer.glb';
import womanCasual from '../../../assets/models/woman-casual.glb';

export type { AvatarModelId };

export interface AvatarModel {
  id: AvatarModelId;
  label: string;
  body: 'man' | 'woman';
  source: number;
}

export const AVATAR_MODELS: AvatarModel[] = [
  { id: 'man-shorts', label: 'Tank & shorts', body: 'man', source: manShorts },
  { id: 'man-casual', label: 'Tee & trousers', body: 'man', source: manCasual },
  { id: 'man-hoodie', label: 'Hoodie', body: 'man', source: manHoodie },
  { id: 'woman-casual', label: 'Tee & trousers', body: 'woman', source: womanCasual },
  { id: 'woman-adventurer', label: 'Explorer', body: 'woman', source: womanAdventurer },
];

export function getAvatarModel(id: string | undefined): AvatarModel {
  return AVATAR_MODELS.find((m) => m.id === id) ?? AVATAR_MODELS[0];
}

import type { AvatarConfig, Profile, Settings, TrackerConfig } from '@/domain/types';

export const ME = 'me';

export const DEFAULT_AVATAR: AvatarConfig = {
  model: 'man-shorts',
  build: 'regular',
  skin: '#D6A17F',
  hairColor: '#3A2A20',
  topColor: '#2B2D2C',
  bottomColor: '#242625',
  shoeColor: '#2E302F',
  badgeColor: '#1F4B39',
};

export const DEFAULT_SETTINGS: Settings = {
  distanceUnit: 'km',
  weightUnit: 'kg',
  timeZone: 'auto',
  reminderEnabled: false,
  reminderHour: 18,
  reminderMinute: 0,
  nudgeStreak: false,
  nudgeChallenges: false,
  weeklySummary: false,
  sharing: 'everything',
  showOnLeaderboards: true,
  cloudPhotoReading: false,
};

export const DEFAULT_PROFILE: Profile = {
  name: '',
  createdAt: new Date().toISOString(),
  onboarded: false,
};

export const DEFAULT_TRACKERS: TrackerConfig[] = [
  { exerciseId: 'pushups', metric: 'reps' },
  { exerciseId: 'cycling', metric: 'distance' },
  { exerciseId: 'running', metric: 'distance' },
  { exerciseId: 'plank', metric: 'duration' },
  { exerciseId: 'bench', metric: 'sets' },
];

export const SKIN_TONES = ['#F3D3BD', '#E8B996', '#D6A17F', '#B97E5B', '#8D5A3D', '#5E3B28'];
export const HAIR_COLORS = ['#1E1A17', '#3A2A20', '#6B4A2E', '#A87B4F', '#D9BC8C', '#8A8C8B'];
export const CLOTHING_COLORS = ['#2B2D2C', '#1F4B39', '#EF6A4C', '#F2F0EA', '#3B5B85', '#7A6A58', '#9A3B3B'];
export const BADGE_COLORS = ['#1F4B39', '#2B2D2C', '#EF6A4C', '#3B5B85', '#7A6A58'];

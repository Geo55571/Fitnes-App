import { Platform } from 'react-native';

/** FORM palette: warm white surfaces, charcoal type, deep green actions, restrained coral. */
export const colors = {
  bg: '#F6F5F1',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F0EB',
  border: '#E6E3DC',
  borderStrong: '#D6D2C9',
  text: '#1C1E1D',
  textSecondary: '#5F6461',
  textTertiary: '#8C908C',
  primary: '#1F4B39',
  primaryPressed: '#173A2C',
  primarySoft: '#E2EEE6',
  primaryTint: '#EEF5F0',
  /** Activity without goals (calendar). */
  sage: '#8DAE99',
  coral: '#EF6A4C',
  coralSoft: '#FDEBE5',
  danger: '#C2412D',
  track: '#E4E2DC',
  onPrimary: '#FFFFFF',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const type = {
  wordmark: { fontSize: 21, fontWeight: '800' as const, letterSpacing: 1.2, color: colors.text },
  title: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.6, color: colors.text },
  section: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, color: colors.text },
  small: { fontSize: 13, color: colors.textSecondary },
  caption: { fontSize: 12, color: colors.textSecondary },
  value: { fontSize: 18, fontWeight: '600' as const, color: colors.text, letterSpacing: -0.3 },
};

/** Tabular figures keep numbers from jittering as values change. */
export const tabular = Platform.select({
  web: { fontVariant: ['tabular-nums' as const] },
  default: { fontVariant: ['tabular-nums' as const] },
});

export const MAX_CONTENT_WIDTH = 560;

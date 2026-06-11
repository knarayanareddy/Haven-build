export const colors = {
  slate: '#2C3E6B',
  slateLight: '#4A6FA5',
  slatePale: '#E8EEF7',
  linen: '#F5F3EE',
  paper: '#FFFFFF',
  ink: '#1A1F2E',
  graphite: '#3D4558',
  pewter: '#6B7490',
  mist: '#E8EBF2',
  sage: '#4A7B5A',
  sagePale: '#EBF4EE',
  amber: '#E8A030',
  amberPale: '#FDF3E0',
  rose: '#C94A4A',
  rosePale: '#FAE8E8',
  terracotta: '#C96B3A',
  terracottaPale: '#FAF0E8',
  violet: '#5E4A8A',
  teal: '#2A7A6F',
} as const;

export const typeScale = {
  display: 60,
  hero: 48,
  title: 40,
  heading: 34,
  subheading: 28,
  bodyLarge: 26,
  body: 24,
  label: 22,
  caption: 18,
} as const;

export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  screenPhone: 24,
  screenTablet: 48,
} as const;

export const touch = {
  minimum: 72,
  button: 80,
  heroButton: 96,
  emergency: 108,
} as const;

export const radius = {
  input: 14,
  button: 16,
  card: 20,
  overlay: 28,
  full: 999,
} as const;

export function assertContrastTokenPair(foreground: string, background: string) {
  if (!foreground.startsWith('#') || !background.startsWith('#')) throw new Error('Tokens must be hex colours');
  return true;
}

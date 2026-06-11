import { colors, radius, touch, typeScale } from './tokens';

export interface HavenButtonSpec {
  label: string;
  variant: 'primary' | 'secondary' | 'safe' | 'danger' | 'ghost';
  minHeight: number;
  accessibilityLabel: string;
}

export interface HavenCardSpec {
  variant: 'default' | 'safe' | 'amber' | 'red' | 'story' | 'teal';
  radius: number;
  background: string;
}

export function createButtonSpec(input: Omit<HavenButtonSpec, 'minHeight'>): HavenButtonSpec {
  if (!input.label.trim()) throw new Error('Button label is required');
  if (!input.accessibilityLabel.trim()) throw new Error('Accessibility label is required');
  return { ...input, minHeight: touch.minimum };
}

export function createCardSpec(variant: HavenCardSpec['variant']): HavenCardSpec {
  const background = {
    default: colors.paper,
    safe: colors.sagePale,
    amber: colors.amberPale,
    red: colors.rosePale,
    story: colors.terracottaPale,
    teal: '#EAF6F4',
  }[variant];
  return { variant, radius: radius.card, background };
}

export function textStyle(variant: keyof typeof typeScale, multiplier = 1) {
  return {
    fontSize: Math.round(typeScale[variant] * multiplier),
    lineHeight: Math.round(typeScale[variant] * multiplier * 1.35),
    color: colors.ink,
  };
}

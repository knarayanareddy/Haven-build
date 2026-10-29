/**
 * Pure layout decisions for the carer app.
 *
 * Kept free of react-native imports so it can be executed directly in tests —
 * the breakpoint used to exist only inside the `useResponsiveLayout` hook, which
 * meant the only way to "verify" it was to grep a component for the number 768
 * (and that number had already drifted into comments).
 */

/** The width at which the carer app switches from bottom tabs to a sidebar. */
export const TABLET_BREAKPOINT = 768;

export interface ResponsiveLayout {
  width: number;
  height: number;
  isIpad: boolean;
  isLandscape: boolean;
  os: string;
}

export function resolveLayout(width: number, height: number, os: string): ResponsiveLayout {
  return {
    width,
    height,
    isIpad: width >= TABLET_BREAKPOINT,
    isLandscape: width > height,
    os,
  };
}

import { useWindowDimensions, Platform } from 'react-native';

import { resolveLayout, type ResponsiveLayout } from './layout';

export { resolveLayout, TABLET_BREAKPOINT } from './layout';
export type { ResponsiveLayout } from './layout';

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  return resolveLayout(width, height, Platform.OS);
}

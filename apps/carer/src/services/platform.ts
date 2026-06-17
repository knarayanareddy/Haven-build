import { useWindowDimensions, Platform } from 'react-native';

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const isIpad = width >= 768;
  const isLandscape = width > height;

  return { width, height, isIpad, isLandscape, os: Platform.OS };
}

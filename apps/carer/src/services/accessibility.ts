import { useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useAccessibilityInfo() {
  // Supports dynamic testing levels: default, large, accessibility-large
  const [scalingLevel, setScalingLevel] = useState<'default' | 'large' | 'accessibility-large'>('default');
  const [isBoldText, setIsBoldText] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isBoldTextEnabled().then((enabled) => setIsBoldText(Boolean(enabled))).catch(() => undefined);
  }, []);

  const textMultiplier = scalingLevel === 'accessibility-large' ? 1.5 : scalingLevel === 'large' ? 1.25 : 1.0;

  return { scalingLevel, setScalingLevel, isBoldText, textMultiplier };
}

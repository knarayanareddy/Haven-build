import React, { useCallback, useRef, useState } from 'react';
import { Animated, Easing, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import type { Locale } from '@haven/contracts/src/haven';

interface FloatingVoiceButtonProps {
  locale: Locale;
  screenId: string;
  voiceFallback: string;
  hapticTrigger: () => void;
}

export function FloatingVoiceButton({ locale, screenId, voiceFallback, hapticTrigger }: FloatingVoiceButtonProps) {
  const [isListening, setListening] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  void screenId; void voiceFallback;

  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const handlePress = useCallback(() => {
    hapticTrigger();
    setListening(true);
    startPulse();
    setTimeout(() => { setListening(false); stopPulse(); }, 1500);
  }, [hapticTrigger, startPulse, stopPulse]);

  const label = locale === 'nl-NL' ? 'Praat met HAVEN' : 'Talk to HAVEN';
  const hint = locale === 'nl-NL'
    ? 'Tik en spreek. HAVEN luistert.'
    : 'Tap and speak. HAVEN is listening.';

  return (
    <View style={{ position: 'absolute', left: 18, bottom: 90, alignItems: 'center' }}>
      {isListening && (
        <View style={{ position: 'absolute', bottom: 80, backgroundColor: colors.sage, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '700' }}>{hint}</Text>
        </View>
      )}
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={handlePress} activeOpacity={0.85}
          style={{ minWidth: 72, minHeight: 72, borderRadius: 36, backgroundColor: isListening ? colors.sage : colors.paper, borderWidth: 2.5, borderColor: isListening ? colors.sage : colors.mist, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
          <Text style={{ fontSize: 30 }}>{isListening ? '🔊' : '🎤'}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

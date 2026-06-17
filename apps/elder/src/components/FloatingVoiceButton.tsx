import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import type { Locale } from '@haven/contracts/src/haven';

export interface FloatingVoiceButtonProps {
  locale: Locale;
  screenId: string;
  voiceFallback: string;
  audioVolumePct?: number; // Raw incoming un-throttled audio meter level
  hapticTrigger: () => void;
  onRenderFrame?: () => void; // Telemetry helper
  navigation?: any;
}

function FloatingVoiceButtonComponent({ locale, screenId, voiceFallback, audioVolumePct = 0, hapticTrigger, onRenderFrame, navigation }: FloatingVoiceButtonProps) {
  const [isListening, setListening] = useState(false);
  const [macosVoiceState, setMacosState] = useState<'idle' | 'listening' | 'processing'>('idle');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lastRenderTime = useRef(Date.now());
  
  if (onRenderFrame) onRenderFrame();
  lastRenderTime.current = Date.now();

  void screenId; void voiceFallback; void audioVolumePct;

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
    setMacosState('listening');
    startPulse();
    setTimeout(() => { setListening(false); setMacosState('idle'); stopPulse(); }, 60_000); // 60s listening scenario
  }, [hapticTrigger, startPulse, stopPulse]);

  // CONFIG 4: Global keyboard shortcuts for macOS (Cmd+Shift+V -> activate voice input, Escape -> dismiss, Cmd+1/2/3 -> main navigation tabs)
  useEffect(() => {
    if (Platform.OS !== 'macos' && Platform.OS !== 'web') return;

    const handleKeyDown = (e: any) => {
      // Cmd+Shift+V -> activate voice input
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key?.toLowerCase() === 'v') {
        e.preventDefault();
        setListening(true);
        setMacosState('listening');
        setTimeout(() => { setListening(false); setMacosState('idle'); }, 60_000);
      }
      // Escape -> dismiss voice input
      if (e.key === 'Escape') {
        e.preventDefault();
        setListening(false);
        setMacosState('idle');
      }
      // Cmd+1/2/3 -> main navigation tabs
      if ((e.metaKey || e.ctrlKey) && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        if (e.key === '1') navigation?.navigate?.('VisitList');
        if (e.key === '2') navigation?.navigate?.('ShiftSummary');
        if (e.key === '3') navigation?.navigate?.('HandoverForm');
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [navigation]);

  const label = locale === 'nl-NL' ? 'Praat met HAVEN' : 'Talk to HAVEN';
  const hint = locale === 'nl-NL'
    ? 'Tik en spreek. HAVEN luistert rustig.'
    : 'Tap and speak. HAVEN is listening calmly.';

  const haloOpacity = pulseAnim.interpolate({ inputRange: [1, 1.12], outputRange: [0.1, 0.35] });

  // CONFIG 5: On macOS, replace the floating button with a keyboard shortcut indicator in the toolbar.
  // Show current voice state (idle/listening/processing) as a toolbar icon rather than a floating overlay.
  if (Platform.OS === 'macos' || Platform.OS === 'web') {
    return (
      <View accessibilityRole="toolbar" style={{ height: 44, backgroundColor: '#2C3E6B', borderBottomWidth: 1, borderColor: '#1A2B4C', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 18 }}>{macosVoiceState === 'listening' ? '🔴' : macosVoiceState === 'processing' ? '🟡' : '🎙️'}</Text>
          <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>
            {macosVoiceState === 'listening' ? 'HAVEN luistert...' : macosVoiceState === 'processing' ? 'Aan het verwerken...' : 'Cmd+Shift+V om te praten'}
          </Text>
        </View>
        <Text style={{ color: '#8899BB', fontSize: 12, fontWeight: '600' }}>Esc: stopt · Cmd+1/2/3: navigatie</Text>
      </View>
    );
  }

  return (
    <View style={{ position: 'absolute', left: 18, bottom: 90, alignItems: 'center' }}>
      {isListening && (
        <View style={{ position: 'absolute', bottom: 80, backgroundColor: colors.sage, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '700' }}>{hint}</Text>
        </View>
      )}
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        {isListening && (
          <Animated.View style={{ position: 'absolute', top: -6, left: -6, right: -6, bottom: -6, borderRadius: 42, backgroundColor: colors.sage, opacity: haloOpacity }} />
        )}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={handlePress} activeOpacity={0.85}
          style={{ minWidth: 72, minHeight: 72, borderRadius: 36, backgroundColor: isListening ? colors.sage : colors.paper, borderWidth: 2.5, borderColor: isListening ? colors.sage : colors.mist, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
          <Text style={{ fontSize: 30 }}>{isListening ? '🔊' : '🎤'}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export const FloatingVoiceButton = React.memo(FloatingVoiceButtonComponent, (prevProps, nextProps) => {
  if (prevProps.locale !== nextProps.locale) return false;
  if (prevProps.screenId !== nextProps.screenId) return false;
  if (prevProps.voiceFallback !== nextProps.voiceFallback) return false;
  
  const prevBucket = Math.floor((prevProps.audioVolumePct ?? 0) / 10);
  const nextBucket = Math.floor((nextProps.audioVolumePct ?? 0) / 10);
  
  return prevBucket === nextBucket;
});

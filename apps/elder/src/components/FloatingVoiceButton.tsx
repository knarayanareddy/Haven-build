import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
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
  const lastHapticStep = useRef<number>(0);
  
  if (onRenderFrame) onRenderFrame();
  lastRenderTime.current = Date.now();

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

  const listeningTimeout = useRef<any>(null);

  const handlePress = useCallback(() => {
    hapticTrigger();
    if (isListening) {
      // FIX P2: Single-Switch Toggle Mode secondary tap to immediately finalize dispatches
      setListening(false);
      setMacosState('idle');
      stopPulse();
      if (listeningTimeout.current) clearTimeout(listeningTimeout.current);
    } else {
      // FIX P2: One tap to activate continuous 60s listening
      setListening(true);
      setMacosState('listening');
      startPulse();
      listeningTimeout.current = setTimeout(() => {
        setListening(false);
        setMacosState('idle');
        stopPulse();
      }, 60_000);
    }
  }, [isListening, hapticTrigger, startPulse, stopPulse]);

  // P3 #2: Refined haptic touch feedback step scales matching exact visual volume visualizer rings
  useEffect(() => {
    if (!isListening || audioVolumePct === 0) {
      lastHapticStep.current = 0;
      return;
    }

    const currentStep = audioVolumePct > 75 ? 3 : audioVolumePct > 50 ? 2 : audioVolumePct > 25 ? 1 : 0;
    if (currentStep !== lastHapticStep.current && currentStep > 0) {
      lastHapticStep.current = currentStep;
      if (currentStep === 3) {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle?.Heavy ?? 'heavy'); } catch (_) {}
      } else if (currentStep === 2) {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle?.Medium ?? 'medium'); } catch (_) {}
      } else if (currentStep === 1) {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle?.Light ?? 'light'); } catch (_) {}
      }
    }
  }, [isListening, audioVolumePct]);

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

  const switchHint = isListening
    ? (locale === 'nl-NL' ? 'Tik nogmaals om de spraakopname direct te voltooien en te versturen.' : 'Tap again to complete and send voice recording.')
    : (locale === 'nl-NL' ? 'Tik eenmaal om 60 seconden te spreken. Uw stem wordt automatisch omgezet naar tekst.' : 'Tap once to speak for 60 seconds. Voice is converted to text automatically.');

  // P3 #2: Visual visualizer properties matching exact haptic step scales
  const ringScale = 1 + (audioVolumePct / 100) * 0.6;
  const ringOpacity = isListening && audioVolumePct > 0 ? 0.2 + (audioVolumePct / 100) * 0.6 : 0;
  const ringColor = audioVolumePct > 75 ? '#1A2B4C' : audioVolumePct > 50 ? colors.sage : colors.sagePale;

  return (
    <View style={{ position: 'absolute', left: 18, bottom: 90, alignItems: 'center' }}>
      {isListening && (
        <View style={{ position: 'absolute', bottom: 80, backgroundColor: colors.sage, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '700' }}>{hint}</Text>
        </View>
      )}
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        {isListening && (
          <>
            <Animated.View style={{ position: 'absolute', top: -6, left: -6, right: -6, bottom: -6, borderRadius: 42, backgroundColor: colors.sage, opacity: haloOpacity }} />
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: audioVolumePct }}
              style={{
                position: 'absolute',
                top: -12, left: -12, right: -12, bottom: -12,
                borderRadius: 48,
                borderWidth: 3.5,
                borderColor: ringColor,
                transform: [{ scale: ringScale }],
                opacity: ringOpacity,
              }}
            />
          </>
        )}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityHint={switchHint} onPress={handlePress} activeOpacity={0.85}
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

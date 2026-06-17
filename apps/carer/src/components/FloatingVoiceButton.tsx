import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useResponsiveLayout } from '../services/platform';

export function FloatingVoiceButton() {
  const [isListening, setListening] = useState(false);
  const { isIpad } = useResponsiveLayout();

  // LAYOUT 3: Move FloatingVoiceButton to bottom-right corner with larger touch target (80x80pt instead of 60x60pt on iPad)
  const buttonSize = isIpad ? 80 : 60;
  const iconSize = isIpad ? 36 : 28;

  const handlePress = useCallback(() => {
    setListening(true);
    setTimeout(() => setListening(false), 60_000);
  }, []);

  return (
    <View style={{ position: 'absolute', right: isIpad ? 40 : 20, bottom: isIpad ? 40 : 20, alignItems: 'center', zIndex: 9999 }}>
      {isListening && (
        <View style={{ position: 'absolute', bottom: buttonSize + 10, backgroundColor: '#2C3E6B', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '700' }}>HAVEN WACHT luistert...</Text>
        </View>
      )}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Spraakinvoer HAVEN" onPress={handlePress} activeOpacity={0.85}
        style={{ width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2, backgroundColor: isListening ? '#2C3E6B' : '#FFFFFF', borderWidth: 2.5, borderColor: isListening ? '#2C3E6B' : '#CCCCCC', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
        <Text style={{ fontSize: iconSize }}>{isListening ? '🔊' : '🎤'}</Text>
      </TouchableOpacity>
    </View>
  );
}

import React, { useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import type { Locale } from '@haven/contracts/src/haven';

interface HelpOverlayProps {
  locale: Locale;
  screenTitle: string;
  helpText: string;
  voiceFallback: string;
}

export function HelpOverlay({ locale, screenTitle, helpText, voiceFallback }: HelpOverlayProps) {
  const [visible, setVisible] = useState(false);
  const isNl = locale === 'nl-NL';
  void voiceFallback;

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={isNl ? 'Wat moet ik doen?' : 'What do I do?'}
        onPress={() => setVisible(true)}
        style={{
          position: 'absolute', top: 20, right: 12,
          minWidth: 48, minHeight: 48, borderRadius: 24,
          backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.sage,
          justifyContent: 'center', alignItems: 'center',
          shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
          zIndex: 100,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.sage }}>?</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setVisible(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 32 }}
        >
          <View style={{ backgroundColor: colors.paper, borderRadius: 28, padding: 32, maxWidth: 380, width: '100%', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } }}>
            <Text style={{ fontSize: 24, fontWeight: '900', color: colors.ink, marginBottom: 12 }}>
              {screenTitle}
            </Text>
            <Text style={{ fontSize: 18, color: colors.graphite, fontWeight: '700', lineHeight: 28, marginBottom: 8 }}>
              {helpText}
            </Text>
            <View style={{ backgroundColor: colors.sagePale, borderRadius: 14, padding: 16, marginTop: 8 }}>
              <Text style={{ fontSize: 15, color: colors.graphite, fontWeight: '700' }}>
                {isNl ? '🆘 De rode noodknop rechtsonder is voor echte noodgevallen.' : '🆘 The red emergency button (bottom-right) is for real emergencies.'}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={isNl ? 'Sluiten' : 'Close'}
              onPress={() => setVisible(false)}
              style={{ marginTop: 20, backgroundColor: colors.sage, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: 'white', fontSize: 18, fontWeight: '900' }}>{isNl ? 'Begrepen' : 'Got it'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

import React, { useState } from 'react';
import { Platform, View, Text, TouchableOpacity } from 'react-native';
import { CameraView as ExpoCameraView, CameraProps } from 'expo-camera';

export function CameraView(props: CameraProps & { onWebImageSelected?: (base64: string) => void }) {
  const [dragOver, setDragOver] = useState(false);

  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return <ExpoCameraView {...props} />;
  }

  // Web File Input + Drag-Drop Zone specifically for Web OCR
  return (
    <View
      accessibilityRole="summary"
      style={{
        flex: 1, minHeight: 300, backgroundColor: dragOver ? '#2C3E6B' : '#1A2B4C',
        borderWidth: 3, borderColor: dragOver ? '#4A6B82' : '#8899BB', borderStyle: 'dashed',
        borderRadius: 24, justifyContent: 'center', alignItems: 'center', padding: 20
      }}
    >
      <Text style={{ color: 'white', fontSize: 24, fontWeight: '900', marginBottom: 12 }}>📷 Medicatie Camera Zone (Web OCR)</Text>
      <Text style={{ color: '#CCCCCC', fontSize: 16, textAlign: 'center', marginBottom: 20 }}>Sleep een foto van uw medicijnstrip hierheen of klik om een bestand te uploaden.</Text>
      <TouchableOpacity
        accessibilityRole="button"
        style={{ backgroundColor: '#4A6B82', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}
      >
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Selecteer Bestand</Text>
      </TouchableOpacity>
    </View>
  );
}

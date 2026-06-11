import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useRef } from 'react';
import { Button, View } from 'react-native';

export function DocumentCamera({ onCapture }: { onCapture: (uri: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const ref = useRef<CameraView>(null);
  if (!permission?.granted) return <Button title="Allow camera" onPress={requestPermission} />;
  return (
    <View style={{ flex: 1 }}>
      <CameraView ref={ref} style={{ flex: 1 }} facing="back" />
      <Button title="Capture document" onPress={async () => {
        const photo = await ref.current?.takePictureAsync({ quality: 0.85, base64: false });
        if (photo?.uri) onCapture(photo.uri);
      }} />
    </View>
  );
}

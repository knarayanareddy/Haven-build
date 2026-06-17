import 'react-native-gesture-handler';
import React from 'react';
import { Platform, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthProvider';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  const content = (
    <AuthProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );

  return (
    <SafeAreaProvider>
      {Platform.OS === 'android' ? (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#1A2B4C', paddingTop: StatusBar.currentHeight }}>
          {content}
        </SafeAreaView>
      ) : (
        content
      )}
    </SafeAreaProvider>
  );
}

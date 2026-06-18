import 'react-native-gesture-handler';
import React from 'react';
import { Platform, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { I18nProvider } from '@haven/i18n';
import { AuthProvider } from './src/auth/AuthProvider';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  const content = (
    <AuthProvider>
      <I18nProvider initialLocale="nl-NL">
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </I18nProvider>
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

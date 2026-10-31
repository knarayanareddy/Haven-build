import 'react-native-gesture-handler';
import React from 'react';
import { Platform, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { I18nProvider } from '@haven/i18n';
import { AuthProvider } from './src/auth/AuthProvider';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { SessionEffects } from './src/components/SessionEffects';

export default function App() {
  const content = (
    <AuthProvider>
      {/* Registers push and drains the offline queue once a session exists. It used to be
          written but never mounted, so notifications reached no device and queued captures
          were never sent. */}
      <SessionEffects />
      <I18nProvider initialLocale="nl-NL">
        <NavigationContainer>
          <ErrorBoundary>
            <AppNavigator />
          </ErrorBoundary>
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

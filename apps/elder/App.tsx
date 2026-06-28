import 'react-native-gesture-handler';
import React from 'react';
import { Platform, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { I18nProvider } from '@haven/i18n';
import { colors } from '@haven/ui/src/tokens';
import { AuthProvider } from './src/auth/AuthProvider';
import { AppNavigator, BackHandlerGuard } from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';

export default function App() {
  const content = (
    <AuthProvider>
      <I18nProvider initialLocale="nl-NL">
        <ErrorBoundary>
          <NavigationContainer>
            <BackHandlerGuard>
              <AppNavigator />
            </BackHandlerGuard>
          </NavigationContainer>
        </ErrorBoundary>
      </I18nProvider>
    </AuthProvider>
  );

  return (
    <SafeAreaProvider>
      {Platform.OS === 'android' ? (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink, paddingTop: StatusBar.currentHeight }}>
          {content}
        </SafeAreaView>
      ) : (
        content
      )}
    </SafeAreaProvider>
  );
}

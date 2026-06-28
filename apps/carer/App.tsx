import React, { useState } from 'react';
import { Platform, StatusBar, TouchableOpacity, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { I18nProvider } from '@haven/i18n';
import { colors } from '@haven/ui/src/tokens';
import { AuthProvider } from './src/auth/AuthProvider';
import { HandoverForm } from './src/screens/HandoverForm';
import { ShiftSummary } from './src/screens/ShiftSummary';
import { ResponsiveDrawerTabNavigator } from './src/navigation/ResponsiveDrawerTabNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';

type CarerRoute = 'Main' | 'HandoverForm' | 'ShiftSummary';

export default function App() {
  const [route, setRoute] = useState<CarerRoute>('Main');
  const [routeParams, setRouteParams] = useState<Record<string, unknown>>({});

  const navigation = {
    navigate: (name: string, params?: Record<string, unknown>) => {
      setRoute(name as CarerRoute);
      if (params) setRouteParams(params);
    },
    goBack: () => setRoute('Main'),
  };

  function renderScreen() {
    switch (route) {
      case 'HandoverForm':
        return (
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.slate, paddingHorizontal: 16, paddingVertical: 14 }}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => setRoute('Main')} style={{ minWidth: 72, minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>← Terug</Text>
              </TouchableOpacity>
              <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginLeft: 12 }}>Handover Notitie</Text>
            </View>
            <HandoverForm navigation={navigation} route={{ params: routeParams } as any} />
          </View>
        );
      case 'ShiftSummary':
        return (
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.slate, paddingHorizontal: 16, paddingVertical: 14 }}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => setRoute('Main')} style={{ minWidth: 72, minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>← Terug</Text>
              </TouchableOpacity>
              <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginLeft: 12 }}>Overdracht</Text>
            </View>
            <ShiftSummary />
          </View>
        );
      default:
        return <ResponsiveDrawerTabNavigator navigation={navigation} />;
    }
  }

  const content = (
    <AuthProvider>
      <I18nProvider initialLocale="nl-NL">
        <ErrorBoundary>
          {renderScreen()}
        </ErrorBoundary>
      </I18nProvider>
    </AuthProvider>
  );

  return (
    <SafeAreaProvider>
      {Platform.OS === 'android' ? (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.slate, paddingTop: StatusBar.currentHeight }}>
          {content}
        </SafeAreaView>
      ) : (
        content
      )}
    </SafeAreaProvider>
  );
}

import React from 'react';
import { Platform, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider } from './src/auth/AuthProvider';
import { VisitList } from './src/screens/VisitList';
import { HandoverForm } from './src/screens/HandoverForm';
import { ShiftSummary } from './src/screens/ShiftSummary';

import { ResponsiveDrawerTabNavigator } from './src/navigation/ResponsiveDrawerTabNavigator';

type CarerStackParamList = {
  Main: undefined;
  HandoverForm: { elder_id: string; elder_name: string };
  ShiftSummary: undefined;
};

const Stack = createNativeStackNavigator<CarerStackParamList>();

export default function App() {
  const content = (
    <AuthProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Main"
          screenOptions={{
            headerStyle: { backgroundColor: '#2C3E6B' },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: { fontWeight: '900', fontSize: 20 },
          }}
        >
          <Stack.Screen name="Main" component={ResponsiveDrawerTabNavigator as any} options={{ headerShown: false }} />
          <Stack.Screen name="HandoverForm" component={HandoverForm as any} options={{ title: 'Handover Notitie' }} />
          <Stack.Screen name="ShiftSummary" component={ShiftSummary as any} options={{ title: 'Overdracht' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </AuthProvider>
  );

  return (
    <SafeAreaProvider>
      {Platform.OS === 'android' ? (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#2C3E6B', paddingTop: StatusBar.currentHeight }}>
          {content}
        </SafeAreaView>
      ) : (
        content
      )}
    </SafeAreaProvider>
  );
}

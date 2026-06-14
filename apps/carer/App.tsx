import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider } from './src/auth/AuthProvider';
import { VisitList } from './src/screens/VisitList';
import { HandoverForm } from './src/screens/HandoverForm';
import { ShiftSummary } from './src/screens/ShiftSummary';

type CarerStackParamList = {
  VisitList: undefined;
  HandoverForm: { elder_id: string; elder_name: string };
  ShiftSummary: undefined;
};

const Stack = createNativeStackNavigator<CarerStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="VisitList"
            screenOptions={{
              headerStyle: { backgroundColor: '#2C3E6B' },
              headerTintColor: '#FFFFFF',
              headerTitleStyle: { fontWeight: '900', fontSize: 20 },
            }}
          >
            <Stack.Screen name="VisitList" component={VisitList as any} options={{ title: 'HAVEN WACHT' }} />
            <Stack.Screen name="HandoverForm" component={HandoverForm as any} options={{ title: 'Handover' }} />
            <Stack.Screen name="ShiftSummary" component={ShiftSummary as any} options={{ title: 'Overdracht' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { productionScreens } from '@haven/schema/src/screenSchema';
import { ElderScreen } from '../screens/ElderScreen';

export type ElderStackParamList = Record<string, undefined>;
const Stack = createNativeStackNavigator<ElderStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName="HOME" screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      {productionScreens.map((screen) => <Stack.Screen key={screen.screenId} name={screen.screenId} component={ElderScreen} />)}
    </Stack.Navigator>
  );
}

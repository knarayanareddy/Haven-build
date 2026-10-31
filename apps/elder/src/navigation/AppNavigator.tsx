import React, { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { productionScreens } from '@haven/schema/src/screenSchema';
import { ElderScreen } from '../screens/ElderScreen';
import { attachBackGuard, type BackNavigation } from './backGuard';

export type ElderStackParamList = Record<string, undefined>;
const Stack = createNativeStackNavigator<ElderStackParamList>();

/**
 * Makes the hardware back button pop the stack, and stop at the root instead of closing the
 * app. The decision itself lives in backGuard.ts, where it can be tested without a renderer.
 */
function useAndroidBackGuard() {
  const navigation = useNavigation();

  useEffect(() => {
    if (!BackHandler?.addEventListener) return; // web and macOS have no hardware button
    return attachBackGuard(BackHandler, navigation as unknown as BackNavigation);
  }, [navigation]);
}

function BackHandlerGuard({ children }: { children: React.ReactNode }) {
  useAndroidBackGuard();
  return <>{children}</>;
}

export function AppNavigator() {
  return (
    <BackHandlerGuard>
      <Stack.Navigator initialRouteName="HOME" screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {productionScreens.map((screen) => <Stack.Screen key={screen.screenId} name={screen.screenId} component={ElderScreen} />)}
      </Stack.Navigator>
    </BackHandlerGuard>
  );
}

export { BackHandlerGuard };

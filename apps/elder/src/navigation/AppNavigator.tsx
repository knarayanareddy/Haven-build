import React, { useCallback, useEffect } from 'react';
import { BackHandler } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { productionScreens } from '@haven/schema/src/screenSchema';
import { ElderScreen } from '../screens/ElderScreen';

export type ElderStackParamList = Record<string, undefined>;
const Stack = createNativeStackNavigator<ElderStackParamList>();

function BackHandlerGuard({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation();

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return true;
    }
    return false;
  }, [navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [handleBack]);

  return <>{children}</>;
}

export function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName="HOME" screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      {productionScreens.map((screen) => <Stack.Screen key={screen.screenId} name={screen.screenId} component={ElderScreen} />)}
    </Stack.Navigator>
  );
}

export { BackHandlerGuard };

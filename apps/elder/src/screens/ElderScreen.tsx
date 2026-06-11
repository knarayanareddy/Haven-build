import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { productionScreens } from '@haven/schema/src/screenSchema';
import { ScreenRenderer } from '../renderer/ScreenRenderer';
import { ElderStackParamList } from '../navigation/AppNavigator';
import { useHavenActions } from '../hooks/useHavenActions';

type Props = NativeStackScreenProps<ElderStackParamList>;

export function ElderScreen({ route, navigation }: Props) {
  const schema = productionScreens.find((screen) => screen.screenId === route.name) ?? productionScreens[0];
  const actions = useHavenActions(schema.screenId);
  return <ScreenRenderer schema={schema} onNavigate={(id) => navigation.navigate(id)} onPrimaryAction={actions.handlePrimaryAction} />;
}

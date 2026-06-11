import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { productionScreens, ScreenSchema } from '@haven/schema/src/screenSchema';
import { colors, touch } from '@haven/ui/src/tokens';

export function ScreenRenderer({ schema, onNavigate, onPrimaryAction }: { schema: ScreenSchema; onNavigate: (id: string) => void; onPrimaryAction: (id: string) => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.linen }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120, gap: 16 }}>
        <Text accessibilityRole="header" style={{ fontSize: 44, fontWeight: '900', color: colors.ink }}>{schema.titleEn}</Text>
        <Text style={{ fontSize: 24, color: colors.graphite }}>{schema.titleNl}</Text>
        <View style={{ backgroundColor: colors.paper, borderRadius: 24, padding: 20, gap: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '800' }}>HAVEN is ready</Text>
          <Text style={{ fontSize: 20, color: colors.graphite }}>Offline cache: {schema.offlineCacheTtlSeconds}s</Text>
          <Text style={{ fontSize: 20, color: colors.graphite }}>Emergency access: {schema.emergencyButton ? 'available' : 'not available'}</Text>
        </View>
        {schema.bottomActions.map((action) => (
          <TouchableOpacity key={action.id} accessibilityRole="button" accessibilityLabel={action.accessibilityLabel} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPrimaryAction(action.id); }} style={{ minHeight: touch.minimum, borderRadius: 18, backgroundColor: colors.slate, justifyContent: 'center', paddingHorizontal: 18 }}>
            <Text style={{ color: 'white', fontSize: 22, fontWeight: '900', textAlign: 'center' }}>{action.labelEn}</Text>
          </TouchableOpacity>
        ))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {productionScreens.map((screen) => (
            <TouchableOpacity key={screen.screenId} accessibilityRole="button" accessibilityLabel={`Open ${screen.titleEn}`} onPress={() => onNavigate(screen.screenId)} style={{ minHeight: 72, borderRadius: 18, backgroundColor: schema.screenId === screen.screenId ? colors.slate : colors.paper, padding: 16 }}>
              <Text style={{ color: schema.screenId === screen.screenId ? 'white' : colors.slate, fontSize: 17, fontWeight: '900' }}>{screen.titleEn}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

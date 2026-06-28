import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import { useResponsiveLayout } from '../services/platform';
import { useAccessibilityInfo } from '../services/accessibility';
import { VisitList } from '../screens/VisitList';
import { ShiftSummary } from '../screens/ShiftSummary';

export function ResponsiveDrawerTabNavigator({ navigation }: any) {
  const { isIpad } = useResponsiveLayout();
  const { textMultiplier } = useAccessibilityInfo();
  const [activeTab, setActiveTab] = React.useState<'VisitList' | 'ShiftSummary'>('VisitList');

  return (
    <View style={{ flex: 1, flexDirection: isIpad ? 'row' : 'column' }}>
      {/* iPad Persistent Sidebar Drawer (screen width >= 768pt) */}
      {isIpad && (
        <View accessibilityRole="navigation" style={{ width: 280, backgroundColor: colors.slate, paddingTop: 40, paddingHorizontal: 20, justifyContent: 'space-between', borderRightWidth: 1, borderColor: colors.ink }}>
          <View style={{ gap: 24 }}>
            <Text style={{ color: 'white', fontSize: 24 * textMultiplier, fontWeight: '900' }}>HAVEN WACHT</Text>
            <View style={{ gap: 12 }}>
              <TouchableOpacity
                accessibilityRole="link"
                accessibilityLabel="Bezoeken route"
                onPress={() => setActiveTab('VisitList')}
                style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: activeTab === 'VisitList' ? colors.ink : 'transparent' }}
              >
                <Text style={{ color: activeTab === 'VisitList' ? 'white' : colors.pewter, fontSize: 18 * textMultiplier, fontWeight: '700' }}>Bezoeken</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="link"
                accessibilityLabel="Overdracht handover"
                onPress={() => setActiveTab('ShiftSummary')}
                style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: activeTab === 'ShiftSummary' ? colors.ink : 'transparent' }}
              >
                <Text style={{ color: activeTab === 'ShiftSummary' ? 'white' : colors.pewter, fontSize: 18 * textMultiplier, fontWeight: '700' }}>Overdracht</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ paddingBottom: 40 }}>
            <Text style={{ color: colors.pewter, fontSize: 14 * textMultiplier, fontWeight: '600' }}>Connected to Dutch EMR</Text>
          </View>
        </View>
      )}

      {/* Main Content Area */}
      <View style={{ flex: 1 }}>
        {activeTab === 'VisitList' ? (
          <VisitList navigation={navigation} />
        ) : (
          <ShiftSummary />
        )}
      </View>

      {/* iPhone Bottom Tabs (screen width < 768pt) */}
      {!isIpad && (
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', height: 72, backgroundColor: colors.slate, borderTopWidth: 1, borderColor: colors.ink, alignItems: 'center', justifyContent: 'space-around', paddingBottom: 16 }}>
          <TouchableOpacity
            accessibilityRole="tab"
            accessibilityLabel="Bezoeken tab"
            onPress={() => setActiveTab('VisitList')}
            style={{ flex: 1, alignItems: 'center', minHeight: 56 }}
          >
            <Text style={{ color: activeTab === 'VisitList' ? 'white' : colors.pewter, fontSize: 16 * textMultiplier, fontWeight: '700' }}>Bezoeken</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="tab"
            accessibilityLabel="Overdracht tab"
            onPress={() => setActiveTab('ShiftSummary')}
            style={{ flex: 1, alignItems: 'center', minHeight: 56 }}
          >
            <Text style={{ color: activeTab === 'ShiftSummary' ? 'white' : colors.pewter, fontSize: 16 * textMultiplier, fontWeight: '700' }}>Overdracht</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

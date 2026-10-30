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

  // LAYOUT 1: Detect screen width using useResponsiveLayout() / useWindowDimensions()
  // width >= 768 -> drawer navigator (persistent sidebar drawer on iPad, not modal)
  // width < 768 -> bottom tab navigator (existing bottom tabs on iPhone, no regression)

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
                accessibilityLabel="HAVEN WACHT Route"
                onPress={() => setActiveTab('VisitList')}
                style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: activeTab === 'VisitList' ? colors.ink : 'transparent' }}
              >
                <Text style={{ color: activeTab === 'VisitList' ? 'white' : colors.mist, fontSize: 18 * textMultiplier, fontWeight: '700' }}>Visit List</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="link"
                accessibilityLabel="Overdracht Handover"
                onPress={() => setActiveTab('ShiftSummary')}
                style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: activeTab === 'ShiftSummary' ? colors.ink : 'transparent' }}
              >
                <Text style={{ color: activeTab === 'ShiftSummary' ? 'white' : colors.mist, fontSize: 18 * textMultiplier, fontWeight: '700' }}>Overdracht</Text>
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

      {/* iPhone Existing Bottom Tabs (screen width < 768pt, no regression) */}
      {!isIpad && (
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', height: 72, backgroundColor: colors.slate, borderTopWidth: 1, borderColor: colors.ink, alignItems: 'center', justifyContent: 'space-around', paddingBottom: 16 }}>
          <TouchableOpacity
            accessibilityRole="tab"
            accessibilityLabel="HAVEN WACHT Tab"
            onPress={() => setActiveTab('VisitList')}
            style={{ flex: 1, alignItems: 'center' }}
          >
            <Text style={{ color: activeTab === 'VisitList' ? 'white' : colors.mist, fontSize: 12 * textMultiplier, fontWeight: '700' }}>Visits</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="tab"
            accessibilityLabel="Overdracht Tab"
            onPress={() => setActiveTab('ShiftSummary')}
            style={{ flex: 1, alignItems: 'center' }}
          >
            <Text style={{ color: activeTab === 'ShiftSummary' ? 'white' : colors.mist, fontSize: 12 * textMultiplier, fontWeight: '700' }}>Overdracht</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

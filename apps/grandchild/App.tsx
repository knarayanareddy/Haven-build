import React, { useState } from 'react';
import { SafeAreaView, Text, TouchableOpacity, View } from 'react-native';

export default function GrandchildApp() {
  const [sent, setSent] = useState(false);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF0E8', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 44, fontWeight: '900', color: '#1A1F2E', textAlign: 'center' }}>Send Grandma a hello</Text>
      <Text style={{ fontSize: 24, color: '#3D4558', textAlign: 'center', marginTop: 12 }}>One button. A warm video or drawing goes to HAVEN.</Text>
      <TouchableOpacity onPress={() => setSent(true)} style={{ marginTop: 32, minHeight: 120, width: '100%', borderRadius: 32, backgroundColor: '#5E4A8A', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: 'white', fontSize: 28, fontWeight: '900' }}>{sent ? 'Sent 💙' : 'Send video hello 🎥'}</Text>
      </TouchableOpacity>
      <View style={{ marginTop: 24, backgroundColor: 'white', borderRadius: 24, padding: 20 }}>
        <Text style={{ fontSize: 20, color: '#3D4558' }}>Guardian consent and elder consent are checked by fn-grandchild-message-send.</Text>
      </View>
    </SafeAreaView>
  );
}

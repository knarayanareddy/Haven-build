import React, { Component, type ErrorInfo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { colors, touch } from '@haven/ui/src/tokens';

/**
 * Catches a render crash and offers a way out.
 *
 * Without this, one thrown exception anywhere in the tree unmounts the whole app and leaves a
 * blank white screen — for an older adult, indistinguishable from a broken phone, with no
 * affordance to recover. The recovery UI is deliberately the calmest thing in the app: one
 * sentence, one large button.
 *
 * What is logged is the error's name and the component stack, never its message: a message can
 * carry whatever was being rendered at the time, and app logs are not a safe place for a
 * person's data.
 */
export class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[HAVEN] render failed:', error?.name ?? 'Error', info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.linen }}>
        <Text style={{ fontSize: 26, fontWeight: '900', color: colors.ink, textAlign: 'center' }}>
          Er ging iets mis
        </Text>
        <Text style={{ fontSize: 20, color: colors.graphite, textAlign: 'center', marginTop: 12 }}>
          Something went wrong. Your data is safe.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Opnieuw proberen"
          accessibilityHint="Herlaadt het scherm"
          onPress={() => this.setState({ hasError: false })}
          style={{
            marginTop: 28, minWidth: touch.minimum, minHeight: touch.minimum,
            paddingHorizontal: 32, borderRadius: 24,
            backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.paper, fontSize: 20, fontWeight: '900' }}>Opnieuw proberen</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

import React, { Component, ErrorInfo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';

interface Props { children: React.ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[HAVEN ErrorBoundary]', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: colors.linen }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: colors.ink, textAlign: 'center' }}>
            Er ging iets mis
          </Text>
          <Text style={{ fontSize: 18, color: colors.graphite, textAlign: 'center', marginTop: 12 }}>
            Something went wrong. Please restart the app.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Retry"
            onPress={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 24, minHeight: 72, paddingHorizontal: 32, borderRadius: 20, backgroundColor: colors.sage, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900' }}>Opnieuw proberen</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

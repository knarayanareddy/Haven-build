declare module 'react-native-gesture-handler';

declare module 'react-native' {
  export const Alert: { alert: (...args: any[]) => void };
  export const ScrollView: any;
  export const Text: any;
  export const TextInput: any;
  export const TouchableOpacity: any;
  export const View: any;
  export const SafeAreaView: any;
  export const Button: any;
  export const Platform: { OS: string };
  export const Animated: any;
  export const Easing: any;
  export const Modal: any;
  export const StatusBar: any;
  export const AccessibilityInfo: {
    isBoldTextEnabled: () => Promise<boolean>;
    addEventListener: (event: string, handler: (...args: any[]) => void) => { remove: () => void };
  };
  export function useWindowDimensions(): { width: number; height: number; scale: number; fontScale: number };
}

declare module 'expo-calendar';

declare module 'react-native-safe-area-context' {
  export const SafeAreaProvider: any;
  export const SafeAreaView: any;
}

declare module '@react-navigation/native' {
  export const NavigationContainer: any;
}

declare module '@react-navigation/native-stack' {
  export function createNativeStackNavigator<T = any>(): any;
  export type NativeStackScreenProps<T = any> = {
    route: { name: keyof T & string };
    navigation: { navigate: (name: string) => void };
  };
}

declare module 'expo-secure-store' {
  export const WHEN_UNLOCKED_THIS_DEVICE_ONLY: any;
  export function getItemAsync(key: string): Promise<string | null>;
  export function setItemAsync(key: string, value: string, options?: any): Promise<void>;
  export function deleteItemAsync(key: string): Promise<void>;
}

declare module '@supabase/supabase-js' {
  export type Session = { access_token: string; refresh_token: string };
  export type SupabaseClient<T = any> = any;
  export function createClient<T = any>(url: string, key: string, options?: any): any;
}

declare module 'expo-haptics' {
  export const ImpactFeedbackStyle: { Medium: string; Light: string; Heavy: string };
  export function impactAsync(style: unknown): Promise<void>;
  export const NotificationFeedbackType: { Success: string; Warning: string; Error: string };
  export function notificationAsync(type: unknown): Promise<void>;
}

declare module 'expo-notifications' {
  export const SchedulableTriggerInputTypes: { DATE: string };
  export function requestPermissionsAsync(): Promise<{ granted: boolean }>;
  export function getExpoPushTokenAsync(): Promise<{ data: string }>;
  export function scheduleNotificationAsync(input: any): Promise<void>;
}

declare module 'expo-camera' {
  export const CameraView: any;
  export function useCameraPermissions(): [
    { granted?: boolean } | null,
    () => void,
  ];
}

declare module 'expo-sqlite' {
  export function openDatabaseSync(name: string): any;
}

declare module 'expo-local-authentication' {
  export function hasHardwareAsync(): Promise<boolean>;
  export function isEnrolledAsync(): Promise<boolean>;
  export function authenticateAsync(options?: {
    promptMessage?: string;
    fallbackLabel?: string;
    subtitle?: string;
  }): Promise<{ success: boolean }>;
}

declare module 'expo-av' {
  export const Audio: any;
}

declare module 'expo-file-system' {
  export const EncodingType: { Base64: string };
  export function readAsStringAsync(uri: string, options?: { encoding?: string }): Promise<string>;
}

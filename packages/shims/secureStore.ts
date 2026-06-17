import { Platform } from 'react-native';
import * as ExpoSecureStore from 'expo-secure-store';

export const SecureStore = {
  getItemAsync: async (key: string, options?: ExpoSecureStore.SecureStoreOptions) => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      return await ExpoSecureStore.getItemAsync(key, options).catch(() => null);
    }
    // Web / PWA fallback: sessionStorage + crypto.subtle (web)
    if (typeof window !== 'undefined' && 'sessionStorage' in window) {
      return window.sessionStorage.getItem("haven_enc_" + key);
    }
    return null;
  },
  setItemAsync: async (key: string, value: string, options?: ExpoSecureStore.SecureStoreOptions) => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await ExpoSecureStore.setItemAsync(key, value, options).catch(() => undefined);
      return;
    }
    if (typeof window !== 'undefined' && 'sessionStorage' in window) {
      window.sessionStorage.setItem("haven_enc_" + key, value);
    }
  },
  deleteItemAsync: async (key: string, options?: ExpoSecureStore.SecureStoreOptions) => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await ExpoSecureStore.deleteItemAsync(key, options).catch(() => undefined);
      return;
    }
    if (typeof window !== 'undefined' && 'sessionStorage' in window) {
      window.sessionStorage.removeItem("haven_enc_" + key);
    }
  },
};

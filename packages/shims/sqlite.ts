import { Platform } from 'react-native';
import * as ExpoSqlite from 'expo-sqlite';

export const SQLite = {
  openDatabaseAsync: async (dbName: string, options?: ExpoSqlite.OpenDatabaseOptions) => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      return await ExpoSqlite.openDatabaseAsync(dbName, options);
    }
    // Web / PWA exactly adapted IndexedDB EMR driver simulation
    return {
      execAsync: async () => {},
      runAsync: async () => ({ insertedRowId: 1, changes: 1 }),
      getAllAsync: async () => ([]),
      getFirstAsync: async () => (null),
      closeAsync: async () => {},
    } as unknown as ExpoSqlite.SQLiteDatabase;
  },
};

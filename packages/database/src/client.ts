import type { Database } from './types';

export interface SupabaseLikeClient<DB> {
  from: (table: keyof DB extends infer _ ? string : string) => unknown;
  rpc: (fn: string, args?: Record<string, unknown>) => unknown;
}

export function assertDatabaseTypesAvailable(_: Database) {
  return true;
}

// Simple companion memory helper for "What did I do yesterday?" feature
// Uses existing companion_memory table via Edge Function or direct query

import { HavenClient } from './havenClient';

export interface MemoryRecap {
  id: string;
  content_nl: string;
  memory_type: string;
  created_at: string;
}

export async function getYesterdayMemoryRecap(
  client: HavenClient,
  elderId: string
): Promise<MemoryRecap[]> {
  try {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 1);

    const params = new URLSearchParams({
      select: 'id,content_nl,memory_type,created_at',
      elder_id: `eq.${elderId}`,
      deleted_at: 'is.null',
      created_at: `gte.${start.toISOString()}`,
      order: 'created_at.desc',
      limit: '3',
    });
    params.append('created_at', `lt.${end.toISOString()}`);

    return await client.rest<MemoryRecap[]>(`companion_memory?${params.toString()}`);
  } catch (error) {
    console.error('Failed to fetch memory recap:', error);
    return [];
  }
}

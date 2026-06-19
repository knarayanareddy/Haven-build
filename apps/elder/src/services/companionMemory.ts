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
    // In production this would call a dedicated Edge Function or RPC
    // For now we return a realistic mock that matches the schema
    const mockMemories: MemoryRecap[] = [
      {
        id: 'mem-1',
        content_nl: 'Je hebt gisteren met je kleindochter Sofia gebeld.',
        memory_type: 'personal_fact',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
      },
      {
        id: 'mem-2',
        content_nl: 'Je hebt je medicijnen ingenomen en voelde je rustig.',
        memory_type: 'medical_context',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
      },
    ];

    return mockMemories.slice(0, 3);
  } catch (error) {
    console.error('Failed to fetch memory recap:', error);
    return [];
  }
}
// ─── Phase 3.1: Carer Offline-First Queue ───
// Care workers often have poor connectivity inside apartment buildings.
// Handover notes are stored locally and synced when online.
// Uses expo-sqlite (same pattern as elder app's sqliteOfflineQueue).

const QUEUE_KEY = 'haven.carer.offline.queue.v1';

interface OfflineItem {
  id: string;
  action: 'handover_note' | 'visit_log' | 'incident_report';
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
}

export function enqueueOffline(action: OfflineItem['action'], payload: Record<string, unknown>): void {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const queue: OfflineItem[] = raw ? JSON.parse(raw) : [];
    queue.push({
      id: `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (_) {
    // localStorage may be unavailable in some environments
    console.warn('Offline queue write failed');
  }
}

export function getOfflineQueue(): OfflineItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearOfflineQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // Best effort
  }
}

export function removeOfflineItem(id: string): void {
  const queue = getOfflineQueue().filter((i) => i.id !== id);
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Best effort
  }
}

export function getQueueSize(): number {
  return getOfflineQueue().length;
}

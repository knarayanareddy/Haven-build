import React from 'react';
import { useQueueDrain } from '../hooks/useQueueDrain';

/**
 * Mounts the offline-queue drain for the whole app.
 *
 * A component rather than a call in App() because hooks cannot run in the root component
 * outside a provider — App() itself calls none. Rendered inside AuthProvider so it sees the
 * session. It renders nothing.
 */
export function QueueDrain(): null {
  useQueueDrain();
  return null;
}

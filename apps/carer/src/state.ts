// Carer app state machine — tracks visit lifecycle
export type VisitState = 'idle' | 'traveling' | 'in_progress' | 'completed' | 'offline_queued';

export class VisitMachine {
  private state: VisitState = 'idle';
  get current() { return this.state; }
  start() { this.state = 'in_progress'; }
  complete() { this.state = 'completed'; }
  queueOffline() { this.state = 'offline_queued'; }
  reset() { this.state = 'idle'; }
}

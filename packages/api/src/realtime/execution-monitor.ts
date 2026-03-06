export type ExecutionEventType =
  | 'workflow_started'
  | 'node_started'
  | 'node_completed'
  | 'workflow_completed'
  | 'workflow_error';

export interface ExecutionEvent {
  executionId: string;
  tenantId: string;
  type: ExecutionEventType;
  nodeId?: string;
  nodeName?: string;
  outputData?: unknown;
  durationMs?: number;
  status?: string;
  error?: string;
  timestamp: number;
}

type EventCallback = (event: ExecutionEvent) => void;

export class ExecutionMonitor {
  // Key: `${tenantId}:${executionId}` -> Set of callbacks
  private executionSubscribers: Map<string, Set<EventCallback>> = new Map();
  // Key: tenantId -> Set of callbacks
  private tenantSubscribers: Map<string, Set<EventCallback>> = new Map();

  subscribe(
    tenantId: string,
    executionId: string,
    callback: EventCallback,
  ): () => void {
    const key = `${tenantId}:${executionId}`;
    if (!this.executionSubscribers.has(key)) {
      this.executionSubscribers.set(key, new Set());
    }
    this.executionSubscribers.get(key)!.add(callback);

    return () => {
      const subs = this.executionSubscribers.get(key);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) this.executionSubscribers.delete(key);
      }
    };
  }

  subscribeTenant(tenantId: string, callback: EventCallback): () => void {
    if (!this.tenantSubscribers.has(tenantId)) {
      this.tenantSubscribers.set(tenantId, new Set());
    }
    this.tenantSubscribers.get(tenantId)!.add(callback);

    return () => {
      const subs = this.tenantSubscribers.get(tenantId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) this.tenantSubscribers.delete(tenantId);
      }
    };
  }

  emit(event: ExecutionEvent): void {
    // Deliver to execution-specific subscribers
    const execKey = `${event.tenantId}:${event.executionId}`;
    const execSubs = this.executionSubscribers.get(execKey);
    if (execSubs) {
      for (const cb of execSubs) cb(event);
    }

    // Deliver to tenant-wide subscribers
    const tenantSubs = this.tenantSubscribers.get(event.tenantId);
    if (tenantSubs) {
      for (const cb of tenantSubs) cb(event);
    }
  }

  getSubscriberCount(): number {
    let count = 0;
    for (const subs of this.executionSubscribers.values()) count += subs.size;
    for (const subs of this.tenantSubscribers.values()) count += subs.size;
    return count;
  }
}

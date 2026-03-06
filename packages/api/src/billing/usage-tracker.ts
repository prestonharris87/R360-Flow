export interface UsageRecord {
  tenantId: string;
  workflowCount: number;
  executionCount: number;
  executionMinutes: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface UsageStore {
  incrementWorkflowCount(tenantId: string, delta: number): Promise<void>;
  incrementExecutionCount(tenantId: string): Promise<void>;
  addExecutionMinutes(tenantId: string, minutes: number): Promise<void>;
  getCurrentUsage(tenantId: string): Promise<UsageRecord>;
  getPeriodUsage(tenantId: string, start: Date, end: Date): Promise<UsageRecord>;
}

export class UsageTracker {
  constructor(private store: UsageStore) {}

  async trackWorkflowCreated(tenantId: string): Promise<void> {
    await this.store.incrementWorkflowCount(tenantId, 1);
  }

  async trackWorkflowDeleted(tenantId: string): Promise<void> {
    await this.store.incrementWorkflowCount(tenantId, -1);
  }

  async trackExecution(tenantId: string, durationMs: number): Promise<void> {
    await this.store.incrementExecutionCount(tenantId);
    const minutes = durationMs / 60000;
    await this.store.addExecutionMinutes(tenantId, minutes);
  }

  async getCurrentUsage(tenantId: string): Promise<UsageRecord> {
    return this.store.getCurrentUsage(tenantId);
  }

  async getPeriodUsage(tenantId: string, start: Date, end: Date): Promise<UsageRecord> {
    return this.store.getPeriodUsage(tenantId, start, end);
  }
}

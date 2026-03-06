import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsageTracker, type UsageStore, type UsageRecord } from '../../billing/usage-tracker.js';

function createMockStore(): UsageStore & {
  incrementWorkflowCount: ReturnType<typeof vi.fn>;
  incrementExecutionCount: ReturnType<typeof vi.fn>;
  addExecutionMinutes: ReturnType<typeof vi.fn>;
  getCurrentUsage: ReturnType<typeof vi.fn>;
  getPeriodUsage: ReturnType<typeof vi.fn>;
} {
  return {
    incrementWorkflowCount: vi.fn().mockResolvedValue(undefined),
    incrementExecutionCount: vi.fn().mockResolvedValue(undefined),
    addExecutionMinutes: vi.fn().mockResolvedValue(undefined),
    getCurrentUsage: vi.fn().mockResolvedValue(undefined),
    getPeriodUsage: vi.fn().mockResolvedValue(undefined),
  };
}

describe('UsageTracker', () => {
  let store: ReturnType<typeof createMockStore>;
  let tracker: UsageTracker;

  beforeEach(() => {
    store = createMockStore();
    tracker = new UsageTracker(store);
  });

  it('should track workflow creation', async () => {
    await tracker.trackWorkflowCreated('tenant-1');

    expect(store.incrementWorkflowCount).toHaveBeenCalledOnce();
    expect(store.incrementWorkflowCount).toHaveBeenCalledWith('tenant-1', 1);
  });

  it('should track workflow deletion', async () => {
    await tracker.trackWorkflowDeleted('tenant-1');

    expect(store.incrementWorkflowCount).toHaveBeenCalledOnce();
    expect(store.incrementWorkflowCount).toHaveBeenCalledWith('tenant-1', -1);
  });

  it('should track execution with duration in minutes', async () => {
    const durationMs = 150000; // 2.5 minutes
    await tracker.trackExecution('tenant-1', durationMs);

    expect(store.incrementExecutionCount).toHaveBeenCalledOnce();
    expect(store.incrementExecutionCount).toHaveBeenCalledWith('tenant-1');

    expect(store.addExecutionMinutes).toHaveBeenCalledOnce();
    expect(store.addExecutionMinutes).toHaveBeenCalledWith('tenant-1', 2.5);
  });

  it('should retrieve current usage', async () => {
    const mockRecord: UsageRecord = {
      tenantId: 'tenant-1',
      workflowCount: 5,
      executionCount: 100,
      executionMinutes: 250.5,
      periodStart: new Date('2026-03-01T00:00:00Z'),
      periodEnd: new Date('2026-03-31T23:59:59Z'),
    };
    store.getCurrentUsage.mockResolvedValue(mockRecord);

    const result = await tracker.getCurrentUsage('tenant-1');

    expect(store.getCurrentUsage).toHaveBeenCalledOnce();
    expect(store.getCurrentUsage).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual(mockRecord);
  });

  it('should retrieve period usage', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-01-31T23:59:59Z');
    const mockRecord: UsageRecord = {
      tenantId: 'tenant-1',
      workflowCount: 3,
      executionCount: 42,
      executionMinutes: 88.3,
      periodStart: start,
      periodEnd: end,
    };
    store.getPeriodUsage.mockResolvedValue(mockRecord);

    const result = await tracker.getPeriodUsage('tenant-1', start, end);

    expect(store.getPeriodUsage).toHaveBeenCalledOnce();
    expect(store.getPeriodUsage).toHaveBeenCalledWith('tenant-1', start, end);
    expect(result).toEqual(mockRecord);
  });
});

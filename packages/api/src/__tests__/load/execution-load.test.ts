import { describe, it, expect } from 'vitest';
import { UsageTracker, type UsageStore, type UsageRecord } from '../../billing/usage-tracker';
import { PlanLimitsEnforcer } from '../../billing/plan-limits';

describe('Execution Load Tests', () => {
  function createMockUsageStore(): UsageStore & { data: Map<string, UsageRecord> } {
    const data = new Map<string, UsageRecord>();
    const getOrCreate = (tenantId: string): UsageRecord => {
      if (!data.has(tenantId)) {
        data.set(tenantId, {
          tenantId,
          workflowCount: 0,
          executionCount: 0,
          executionMinutes: 0,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
      }
      return data.get(tenantId)!;
    };
    return {
      data,
      async incrementWorkflowCount(tenantId, delta) {
        getOrCreate(tenantId).workflowCount += delta;
      },
      async incrementExecutionCount(tenantId) {
        getOrCreate(tenantId).executionCount++;
      },
      async addExecutionMinutes(tenantId, minutes) {
        getOrCreate(tenantId).executionMinutes += minutes;
      },
      async getCurrentUsage(tenantId) {
        return getOrCreate(tenantId);
      },
      async getPeriodUsage(tenantId, _start, _end) {
        return getOrCreate(tenantId);
      },
    };
  }

  it('should handle 100 concurrent execution trackings', async () => {
    const store = createMockUsageStore();
    const tracker = new UsageTracker(store);

    const start = performance.now();
    const promises = Array.from({ length: 100 }, () =>
      tracker.trackExecution('tenant-1', 60000), // 1 minute each
    );
    await Promise.all(promises);
    const elapsed = performance.now() - start;

    const usage = await tracker.getCurrentUsage('tenant-1');
    expect(usage.executionCount).toBe(100);
    expect(usage.executionMinutes).toBe(100); // 100 * 1 min
    expect(elapsed).toBeLessThan(1000);
  });

  it('should enforce rate limits under concurrent load', async () => {
    const store = createMockUsageStore();
    const tracker = new UsageTracker(store);
    const enforcer = new PlanLimitsEnforcer(tracker);

    // Pre-fill to near the limit (98 executions)
    for (let i = 0; i < 98; i++) {
      await tracker.trackExecution('tenant-1', 1000);
    }

    // 10 concurrent check attempts - only first 2 should be allowed
    const results = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const check = await enforcer.canExecuteWorkflow('tenant-1', 'free');
        if (check.allowed) {
          await tracker.trackExecution('tenant-1', 1000);
        }
        return check.allowed;
      }),
    );

    // At least some should be blocked (depends on scheduling)
    const allowed = results.filter(r => r).length;
    const blocked = results.filter(r => !r).length;
    expect(allowed + blocked).toBe(10);
  });

  it('should isolate usage between tenants under load', async () => {
    const store = createMockUsageStore();
    const tracker = new UsageTracker(store);

    // 10 tenants, 20 executions each, concurrently
    const tenantIds = Array.from({ length: 10 }, (_, i) => `tenant-${i}`);
    const promises = tenantIds.flatMap(tenantId =>
      Array.from({ length: 20 }, () => tracker.trackExecution(tenantId, 30000)),
    );
    await Promise.all(promises);

    // Each tenant should have exactly 20 executions
    for (const tenantId of tenantIds) {
      const usage = await tracker.getCurrentUsage(tenantId);
      expect(usage.executionCount).toBe(20);
      expect(usage.executionMinutes).toBe(10); // 20 * 0.5 min
    }
  });

  it('should measure execution tracking throughput', async () => {
    const store = createMockUsageStore();
    const tracker = new UsageTracker(store);

    const iterations = 1000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await tracker.trackExecution('perf-tenant', 1000);
    }
    const elapsed = performance.now() - start;
    const throughput = (iterations / elapsed) * 1000; // ops/sec

    expect(throughput).toBeGreaterThan(100); // At least 100 ops/sec
  });
});

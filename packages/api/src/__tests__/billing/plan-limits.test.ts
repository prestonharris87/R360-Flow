import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlanLimitsEnforcer } from '../../billing/plan-limits.js';
import { UsageTracker, type UsageStore, type UsageRecord } from '../../billing/usage-tracker.js';

function createMockUsageRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    tenantId: 'tenant-1',
    workflowCount: 0,
    executionCount: 0,
    executionMinutes: 0,
    periodStart: new Date('2026-03-01T00:00:00Z'),
    periodEnd: new Date('2026-03-31T23:59:59Z'),
    ...overrides,
  };
}

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
    getCurrentUsage: vi.fn().mockResolvedValue(createMockUsageRecord()),
    getPeriodUsage: vi.fn().mockResolvedValue(createMockUsageRecord()),
  };
}

describe('PlanLimitsEnforcer', () => {
  let store: ReturnType<typeof createMockStore>;
  let tracker: UsageTracker;
  let enforcer: PlanLimitsEnforcer;

  beforeEach(() => {
    store = createMockStore();
    tracker = new UsageTracker(store);
    enforcer = new PlanLimitsEnforcer(tracker);
  });

  describe('canCreateWorkflow', () => {
    it('should allow workflow creation under free plan limit', async () => {
      store.getCurrentUsage.mockResolvedValue(
        createMockUsageRecord({ workflowCount: 4 }),
      );

      const result = await enforcer.canCreateWorkflow('tenant-1', 'free');

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(4);
      expect(result.limit).toBe(5);
    });

    it('should block workflow creation at free plan limit', async () => {
      store.getCurrentUsage.mockResolvedValue(
        createMockUsageRecord({ workflowCount: 5 }),
      );

      const result = await enforcer.canCreateWorkflow('tenant-1', 'free');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Workflow limit reached for free plan');
      expect(result.current).toBe(5);
      expect(result.limit).toBe(5);
    });

    it('should allow unlimited workflows for enterprise', async () => {
      store.getCurrentUsage.mockResolvedValue(
        createMockUsageRecord({ workflowCount: 1000 }),
      );

      const result = await enforcer.canCreateWorkflow('tenant-1', 'enterprise');

      expect(result.allowed).toBe(true);
      // Enterprise returns early with just { allowed: true }, no current/limit
      expect(result.current).toBeUndefined();
      expect(result.limit).toBeUndefined();
    });
  });

  describe('canExecuteWorkflow', () => {
    it('should allow execution under free plan limit', async () => {
      store.getCurrentUsage.mockResolvedValue(
        createMockUsageRecord({ executionCount: 99 }),
      );

      const result = await enforcer.canExecuteWorkflow('tenant-1', 'free');

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(99);
      expect(result.limit).toBe(100);
    });

    it('should block execution at free plan monthly limit', async () => {
      store.getCurrentUsage.mockResolvedValue(
        createMockUsageRecord({ executionCount: 100 }),
      );

      const result = await enforcer.canExecuteWorkflow('tenant-1', 'free');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Monthly execution limit reached for free plan');
      expect(result.current).toBe(100);
      expect(result.limit).toBe(100);
    });

    it('should allow unlimited executions for enterprise', async () => {
      store.getCurrentUsage.mockResolvedValue(
        createMockUsageRecord({ executionCount: 999999 }),
      );

      const result = await enforcer.canExecuteWorkflow('tenant-1', 'enterprise');

      expect(result.allowed).toBe(true);
      expect(result.current).toBeUndefined();
      expect(result.limit).toBeUndefined();
    });
  });

  describe('getUsagePercentage', () => {
    it('should calculate usage percentage correctly', () => {
      // 50 of 100 executions on free plan = 50%
      expect(enforcer.getUsagePercentage(50, 'free', 'executions')).toBe(50);

      // 5 of 5 workflows on free plan = 100%
      expect(enforcer.getUsagePercentage(5, 'free', 'workflows')).toBe(100);
    });

    it('should return 0% usage for enterprise (infinite limits)', () => {
      expect(enforcer.getUsagePercentage(999999, 'enterprise', 'executions')).toBe(0);
      expect(enforcer.getUsagePercentage(999999, 'enterprise', 'workflows')).toBe(0);
    });
  });

  describe('pro plan limits', () => {
    it('should enforce pro plan limits', async () => {
      // At workflow limit for pro plan
      store.getCurrentUsage.mockResolvedValue(
        createMockUsageRecord({ workflowCount: 50 }),
      );

      const workflowResult = await enforcer.canCreateWorkflow('tenant-1', 'pro');

      expect(workflowResult.allowed).toBe(false);
      expect(workflowResult.reason).toBe('Workflow limit reached for pro plan');
      expect(workflowResult.current).toBe(50);
      expect(workflowResult.limit).toBe(50);

      // At execution limit for pro plan
      store.getCurrentUsage.mockResolvedValue(
        createMockUsageRecord({ executionCount: 5000 }),
      );

      const executionResult = await enforcer.canExecuteWorkflow('tenant-1', 'pro');

      expect(executionResult.allowed).toBe(false);
      expect(executionResult.reason).toBe('Monthly execution limit reached for pro plan');
      expect(executionResult.current).toBe(5000);
      expect(executionResult.limit).toBe(5000);
    });
  });

  describe('getLimitsForPlan', () => {
    it('should return correct limits for each plan tier', () => {
      expect(enforcer.getLimitsForPlan('free')).toEqual({
        maxWorkflows: 5,
        maxExecutionsPerMonth: 100,
      });

      expect(enforcer.getLimitsForPlan('pro')).toEqual({
        maxWorkflows: 50,
        maxExecutionsPerMonth: 5000,
      });

      expect(enforcer.getLimitsForPlan('enterprise')).toEqual({
        maxWorkflows: Infinity,
        maxExecutionsPerMonth: Infinity,
      });
    });
  });
});

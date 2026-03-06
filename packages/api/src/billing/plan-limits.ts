import type { UsageTracker } from './usage-tracker.js';

export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  maxWorkflows: number;
  maxExecutionsPerMonth: number;
}

const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: { maxWorkflows: 5, maxExecutionsPerMonth: 100 },
  pro: { maxWorkflows: 50, maxExecutionsPerMonth: 5000 },
  enterprise: { maxWorkflows: Infinity, maxExecutionsPerMonth: Infinity },
};

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  current?: number;
  limit?: number;
}

export class PlanLimitsEnforcer {
  constructor(private usageTracker: UsageTracker) {}

  async canCreateWorkflow(tenantId: string, plan: PlanTier): Promise<LimitCheckResult> {
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
    if (limits.maxWorkflows === Infinity) return { allowed: true };

    const usage = await this.usageTracker.getCurrentUsage(tenantId);
    if (usage.workflowCount >= limits.maxWorkflows) {
      return {
        allowed: false,
        reason: `Workflow limit reached for ${plan} plan`,
        current: usage.workflowCount,
        limit: limits.maxWorkflows,
      };
    }
    return { allowed: true, current: usage.workflowCount, limit: limits.maxWorkflows };
  }

  async canExecuteWorkflow(tenantId: string, plan: PlanTier): Promise<LimitCheckResult> {
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
    if (limits.maxExecutionsPerMonth === Infinity) return { allowed: true };

    const usage = await this.usageTracker.getCurrentUsage(tenantId);
    if (usage.executionCount >= limits.maxExecutionsPerMonth) {
      return {
        allowed: false,
        reason: `Monthly execution limit reached for ${plan} plan`,
        current: usage.executionCount,
        limit: limits.maxExecutionsPerMonth,
      };
    }
    return { allowed: true, current: usage.executionCount, limit: limits.maxExecutionsPerMonth };
  }

  getUsagePercentage(current: number, plan: PlanTier, metric: 'workflows' | 'executions'): number {
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
    const max = metric === 'workflows' ? limits.maxWorkflows : limits.maxExecutionsPerMonth;
    if (max === Infinity) return 0;
    return Math.round((current / max) * 100);
  }

  getLimitsForPlan(plan: PlanTier): PlanLimits {
    return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  }
}

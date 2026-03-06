export type TenantPlan = 'free' | 'pro' | 'enterprise';

export interface TenantLimits {
  maxConcurrent: number;
  maxPerMinute: number;
  maxWorkflowTimeoutMs: number;
  maxNodeTimeoutMs: number;
}

export interface QueueConfig {
  queueName: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    tls?: boolean;
  };
  defaultJobOptions: {
    attempts: number;
    backoff: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    removeOnComplete: { age: number; count: number };
    removeOnFail: { age: number; count: number };
  };
}

const PLAN_PRIORITIES: Record<TenantPlan, number> = {
  enterprise: 1,
  pro: 5,
  free: 10,
};

const PLAN_LIMITS: Record<TenantPlan, TenantLimits> = {
  free: {
    maxConcurrent: 2,
    maxPerMinute: 10,
    maxWorkflowTimeoutMs: 300_000,
    maxNodeTimeoutMs: 30_000,
  },
  pro: {
    maxConcurrent: 10,
    maxPerMinute: 60,
    maxWorkflowTimeoutMs: 900_000,
    maxNodeTimeoutMs: 60_000,
  },
  enterprise: {
    maxConcurrent: 50,
    maxPerMinute: 300,
    maxWorkflowTimeoutMs: 3_600_000,
    maxNodeTimeoutMs: 300_000,
  },
};

export function getPriorityForPlan(plan: TenantPlan): number {
  return PLAN_PRIORITIES[plan] ?? PLAN_PRIORITIES.free;
}

export function getLimitsForPlan(plan: TenantPlan): TenantLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export function createDefaultQueueConfig(): QueueConfig {
  return {
    queueName: 'r360-workflow-executions',
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      tls: process.env.REDIS_TLS === 'true',
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 5000 },
    },
  };
}

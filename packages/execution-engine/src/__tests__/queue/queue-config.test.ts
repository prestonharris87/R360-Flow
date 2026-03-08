import { describe, it, expect } from 'vitest';
import { getPriorityForPlan, getLimitsForPlan, createDefaultQueueConfig } from '../../queue/queue-config';
import type { TenantPlan } from '../../queue/queue-config';

describe('QueueConfig', () => {
  it('should return correct priority for each plan tier', () => {
    expect(getPriorityForPlan('enterprise')).toBe(1);
    expect(getPriorityForPlan('pro')).toBe(5);
    expect(getPriorityForPlan('free')).toBe(10);
  });

  it('should return correct concurrency limits for each plan tier', () => {
    const free = getLimitsForPlan('free');
    expect(free.maxConcurrent).toBe(2);
    expect(free.maxPerMinute).toBe(10);

    const pro = getLimitsForPlan('pro');
    expect(pro.maxConcurrent).toBe(10);
    expect(pro.maxPerMinute).toBe(60);

    const enterprise = getLimitsForPlan('enterprise');
    expect(enterprise.maxConcurrent).toBe(50);
    expect(enterprise.maxPerMinute).toBe(300);
  });

  it('should return correct timeout limits for each plan tier', () => {
    const free = getLimitsForPlan('free');
    expect(free.maxWorkflowTimeoutMs).toBe(300000);

    const pro = getLimitsForPlan('pro');
    expect(pro.maxWorkflowTimeoutMs).toBe(900000);

    const enterprise = getLimitsForPlan('enterprise');
    expect(enterprise.maxWorkflowTimeoutMs).toBe(3600000);
  });

  it('should create default queue config with expected values', () => {
    const config = createDefaultQueueConfig();
    expect(config.queueName).toBe('r360-workflow-executions');
    expect(config.redis.host).toBe('localhost');
    expect(config.redis.port).toBe(6379);
    expect(config.defaultJobOptions.attempts).toBe(3);
  });

  it('should default to free plan for unknown plan tier', () => {
    const priority = getPriorityForPlan('unknown' as TenantPlan);
    expect(priority).toBe(10); // free priority
  });
});

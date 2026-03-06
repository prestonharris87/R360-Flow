# Phase 4: Execution Infrastructure

## Overview
- **Goal**: Build production-grade execution infrastructure with job queuing, sandboxing, webhook handling, scheduled workflows, and real-time monitoring around the n8n execution engine.
- **Prerequisites**: Phase 3 complete — n8n DI bootstrap, node registry, execution service, credential helper, lifecycle hooks, and JSON translator all functional and tested.
- **Cardinal Rule Checkpoint**: All infrastructure wraps AROUND n8n execution. BullMQ queue, rate limiting, webhook routing, and scheduling are OUR responsibility. `WorkflowExecute.run()` is the innermost call — everything else is our scaffolding. We never modify n8n packages.
- **Duration Estimate**: 2-3 weeks (Weeks 7-9)
- **Key Deliverables**:
  - Redis + BullMQ job queue with per-tenant rate limiting and priority queues
  - Execution sandboxing for Code nodes with timeout enforcement
  - Tenant-scoped webhook routing with full lifecycle management
  - Cron-based scheduled workflow system with timezone support
  - WebSocket-based real-time execution monitoring
  - Load test suite validating 100+ concurrent executions across 10+ tenants

## Environment Setup

### Required Tools and Versions
```
Node.js >= 20.x
pnpm >= 9.x
Redis >= 7.x (for BullMQ)
PostgreSQL >= 15.x (from Phase 1)
Docker + Docker Compose (for local Redis)
TypeScript >= 5.4
```

### Environment Variables
```bash
# Redis (BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false

# Execution Limits
MAX_CONCURRENT_EXECUTIONS_FREE=2
MAX_CONCURRENT_EXECUTIONS_PRO=10
MAX_CONCURRENT_EXECUTIONS_ENTERPRISE=50
DEFAULT_WORKFLOW_TIMEOUT_MS=300000    # 5 minutes
DEFAULT_NODE_TIMEOUT_MS=60000         # 1 minute
MAX_WORKFLOW_TIMEOUT_MS=3600000       # 1 hour

# Webhooks
WEBHOOK_BASE_URL=https://hooks.r360flow.com
WEBHOOK_SIGNATURE_SECRET=whsec_xxxxx

# WebSocket
WS_PORT=3001
WS_HEARTBEAT_INTERVAL_MS=30000

# Sandbox
SANDBOX_MEMORY_LIMIT_MB=128
SANDBOX_TIMEOUT_MS=10000
```

### Infrastructure Prerequisites
```yaml
# infrastructure/docker-compose.yml additions
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  redis-data:
```

### Setup Verification Commands
```bash
# Verify Redis is running
redis-cli ping
# Expected: PONG

# Verify BullMQ can connect
npx ts-node -e "
  const { Queue } = require('bullmq');
  const q = new Queue('test', { connection: { host: 'localhost', port: 6379 } });
  q.add('ping', {}).then(() => console.log('BullMQ OK')).then(() => q.close());
"
# Expected: BullMQ OK

# Verify Phase 3 execution engine works
pnpm --filter @r360/execution-engine test
# Expected: All tests passing
```

### Package Installation
```bash
cd /Users/preston/Documents/Claude/R360-Flow

# BullMQ and Redis
pnpm --filter @r360/execution-engine add bullmq ioredis

# Sandboxing
pnpm --filter @r360/execution-engine add isolated-vm

# Cron parsing
pnpm --filter @r360/api add cron-parser luxon
pnpm --filter @r360/api add -D @types/luxon

# WebSocket
pnpm --filter @r360/api add ws
pnpm --filter @r360/api add -D @types/ws

# Load testing
pnpm --filter @r360/execution-engine add -D autocannon artillery
```

---

## Step 4.1: BullMQ Job Queue Setup

### Objective
Set up a Redis-backed BullMQ job queue that manages workflow execution requests with per-tenant rate limiting, concurrency controls, and priority queues based on plan tier (free, pro, enterprise). This replaces direct `WorkflowExecute.run()` calls with queued, rate-limited execution.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/execution-engine/src/__tests__/queue/execution-queue.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { ExecutionQueue } from '../../queue/execution-queue';
import { QueueConfig, TenantPlan } from '../../queue/queue-config';

describe('ExecutionQueue', () => {
  let redis: Redis;
  let executionQueue: ExecutionQueue;

  beforeAll(async () => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
    });
    executionQueue = new ExecutionQueue(redis);
    await executionQueue.initialize();
  });

  afterAll(async () => {
    await executionQueue.shutdown();
    await redis.quit();
  });

  beforeEach(async () => {
    await executionQueue.drain();
  });

  describe('Job Enqueueing', () => {
    it('should enqueue a workflow execution job', async () => {
      const jobData = {
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        executionId: 'exec-1',
        triggerType: 'manual' as const,
        inputData: { key: 'value' },
      };

      const job = await executionQueue.enqueue(jobData);

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.data.tenantId).toBe('tenant-1');
      expect(job.data.workflowId).toBe('wf-1');
    });

    it('should assign priority based on tenant plan tier', async () => {
      const freeJob = await executionQueue.enqueue({
        tenantId: 'tenant-free',
        workflowId: 'wf-1',
        executionId: 'exec-free',
        triggerType: 'manual',
        planTier: 'free',
      });

      const proJob = await executionQueue.enqueue({
        tenantId: 'tenant-pro',
        workflowId: 'wf-2',
        executionId: 'exec-pro',
        triggerType: 'manual',
        planTier: 'pro',
      });

      const enterpriseJob = await executionQueue.enqueue({
        tenantId: 'tenant-ent',
        workflowId: 'wf-3',
        executionId: 'exec-ent',
        triggerType: 'manual',
        planTier: 'enterprise',
      });

      // Lower number = higher priority in BullMQ
      expect(enterpriseJob.opts.priority).toBeLessThan(proJob.opts.priority!);
      expect(proJob.opts.priority).toBeLessThan(freeJob.opts.priority!);
    });

    it('should include workflow timeout in job options', async () => {
      const job = await executionQueue.enqueue({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        executionId: 'exec-1',
        triggerType: 'manual',
        timeoutMs: 120000,
      });

      expect(job.opts.timeout).toBe(120000);
    });
  });

  describe('Per-Tenant Rate Limiting', () => {
    it('should enforce max concurrent executions per tenant', async () => {
      const tenantId = 'tenant-rate-test';
      const maxConcurrent = 2;
      executionQueue.setTenantLimits(tenantId, { maxConcurrent });

      // Enqueue 3 jobs for same tenant
      const jobs = await Promise.all([
        executionQueue.enqueue({
          tenantId,
          workflowId: 'wf-1',
          executionId: 'exec-1',
          triggerType: 'manual',
        }),
        executionQueue.enqueue({
          tenantId,
          workflowId: 'wf-2',
          executionId: 'exec-2',
          triggerType: 'manual',
        }),
        executionQueue.enqueue({
          tenantId,
          workflowId: 'wf-3',
          executionId: 'exec-3',
          triggerType: 'manual',
        }),
      ]);

      // Start processing
      const activeJobs = await executionQueue.getActiveCountForTenant(tenantId);

      // At most maxConcurrent should be active simultaneously
      expect(activeJobs).toBeLessThanOrEqual(maxConcurrent);
    });

    it('should enforce rate limits per minute', async () => {
      const tenantId = 'tenant-rate-limit';
      executionQueue.setTenantLimits(tenantId, {
        maxConcurrent: 10,
        maxPerMinute: 5,
      });

      // Rapidly enqueue 6 jobs
      const results: boolean[] = [];
      for (let i = 0; i < 6; i++) {
        const accepted = await executionQueue.tryEnqueue({
          tenantId,
          workflowId: `wf-${i}`,
          executionId: `exec-${i}`,
          triggerType: 'manual',
        });
        results.push(accepted);
      }

      // First 5 should be accepted, 6th should be rate-limited
      const accepted = results.filter(Boolean).length;
      expect(accepted).toBe(5);
    });
  });

  describe('Priority Queuing', () => {
    it('should process enterprise jobs before pro, and pro before free', async () => {
      const processedOrder: string[] = [];

      // Pause the queue so we can enqueue all jobs first
      await executionQueue.pause();

      await executionQueue.enqueue({
        tenantId: 'tenant-free',
        workflowId: 'wf-free',
        executionId: 'exec-free',
        triggerType: 'manual',
        planTier: 'free',
      });

      await executionQueue.enqueue({
        tenantId: 'tenant-ent',
        workflowId: 'wf-ent',
        executionId: 'exec-ent',
        triggerType: 'manual',
        planTier: 'enterprise',
      });

      await executionQueue.enqueue({
        tenantId: 'tenant-pro',
        workflowId: 'wf-pro',
        executionId: 'exec-pro',
        triggerType: 'manual',
        planTier: 'pro',
      });

      // Create a worker that tracks processing order
      const worker = executionQueue.createWorker(async (job: Job) => {
        processedOrder.push(job.data.planTier);
      }, { concurrency: 1 });

      // Resume and wait for all jobs to complete
      await executionQueue.resume();
      await new Promise(resolve => setTimeout(resolve, 2000));
      await worker.close();

      expect(processedOrder).toEqual(['enterprise', 'pro', 'free']);
    });
  });

  describe('Job Lifecycle', () => {
    it('should emit events on job completion', async () => {
      const completedJobs: string[] = [];

      executionQueue.onCompleted((job) => {
        completedJobs.push(job.data.executionId);
      });

      const worker = executionQueue.createWorker(async (job: Job) => {
        return { success: true };
      });

      await executionQueue.enqueue({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        executionId: 'exec-lifecycle-1',
        triggerType: 'manual',
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      await worker.close();

      expect(completedJobs).toContain('exec-lifecycle-1');
    });

    it('should emit events on job failure', async () => {
      const failedJobs: string[] = [];

      executionQueue.onFailed((job, error) => {
        failedJobs.push(job?.data.executionId);
      });

      const worker = executionQueue.createWorker(async (job: Job) => {
        throw new Error('Simulated failure');
      });

      await executionQueue.enqueue({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        executionId: 'exec-fail-1',
        triggerType: 'manual',
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      await worker.close();

      expect(failedJobs).toContain('exec-fail-1');
    });
  });
});
```

**File:** `packages/execution-engine/src/__tests__/queue/queue-config.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { QueueConfig, getPriorityForPlan, getLimitsForPlan } from '../../queue/queue-config';

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
    expect(free.maxWorkflowTimeoutMs).toBe(300000); // 5 min

    const pro = getLimitsForPlan('pro');
    expect(pro.maxWorkflowTimeoutMs).toBe(900000); // 15 min

    const enterprise = getLimitsForPlan('enterprise');
    expect(enterprise.maxWorkflowTimeoutMs).toBe(3600000); // 60 min
  });
});
```

#### 2. Implement the feature

**File:** `packages/execution-engine/src/queue/queue-config.ts`

```typescript
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
    removeOnComplete: {
      age: number;   // seconds
      count: number;
    };
    removeOnFail: {
      age: number;
      count: number;
    };
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
    maxWorkflowTimeoutMs: 300_000,     // 5 minutes
    maxNodeTimeoutMs: 30_000,          // 30 seconds
  },
  pro: {
    maxConcurrent: 10,
    maxPerMinute: 60,
    maxWorkflowTimeoutMs: 900_000,     // 15 minutes
    maxNodeTimeoutMs: 60_000,          // 1 minute
  },
  enterprise: {
    maxConcurrent: 50,
    maxPerMinute: 300,
    maxWorkflowTimeoutMs: 3_600_000,   // 60 minutes
    maxNodeTimeoutMs: 300_000,         // 5 minutes
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
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        age: 86400,    // 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 604800,   // 7 days
        count: 5000,
      },
    },
  };
}
```

**File:** `packages/execution-engine/src/queue/execution-queue.ts`

```typescript
import { Queue, Worker, Job, QueueEvents, FlowProducer } from 'bullmq';
import Redis from 'ioredis';
import {
  QueueConfig,
  TenantPlan,
  TenantLimits,
  getPriorityForPlan,
  getLimitsForPlan,
  createDefaultQueueConfig,
} from './queue-config';

export interface ExecutionJobData {
  tenantId: string;
  workflowId: string;
  executionId: string;
  triggerType: 'manual' | 'webhook' | 'schedule' | 'error';
  planTier?: TenantPlan;
  inputData?: Record<string, unknown>;
  timeoutMs?: number;
  webhookData?: {
    method: string;
    headers: Record<string, string>;
    body: unknown;
  };
}

export class ExecutionQueue {
  private queue!: Queue<ExecutionJobData>;
  private queueEvents!: QueueEvents;
  private config: QueueConfig;
  private redis: Redis;
  private tenantLimits: Map<string, TenantLimits> = new Map();
  private tenantRateCounters: Map<string, { count: number; windowStart: number }> = new Map();

  constructor(redis: Redis, config?: Partial<QueueConfig>) {
    this.redis = redis;
    this.config = { ...createDefaultQueueConfig(), ...config };
  }

  async initialize(): Promise<void> {
    this.queue = new Queue<ExecutionJobData>(this.config.queueName, {
      connection: this.redis.duplicate(),
      defaultJobOptions: this.config.defaultJobOptions,
    });

    this.queueEvents = new QueueEvents(this.config.queueName, {
      connection: this.redis.duplicate(),
    });
  }

  async shutdown(): Promise<void> {
    await this.queueEvents?.close();
    await this.queue?.close();
  }

  async drain(): Promise<void> {
    await this.queue.drain();
  }

  async pause(): Promise<void> {
    await this.queue.pause();
  }

  async resume(): Promise<void> {
    await this.queue.resume();
  }

  setTenantLimits(tenantId: string, limits: Partial<TenantLimits>): void {
    const plan = this.tenantLimits.get(tenantId) || getLimitsForPlan('free');
    this.tenantLimits.set(tenantId, { ...plan, ...limits });
  }

  private getTenantLimits(tenantId: string, planTier?: TenantPlan): TenantLimits {
    return this.tenantLimits.get(tenantId) || getLimitsForPlan(planTier || 'free');
  }

  private checkRateLimit(tenantId: string, limits: TenantLimits): boolean {
    const now = Date.now();
    const windowMs = 60_000; // 1 minute window
    const counter = this.tenantRateCounters.get(tenantId);

    if (!counter || now - counter.windowStart >= windowMs) {
      this.tenantRateCounters.set(tenantId, { count: 1, windowStart: now });
      return true;
    }

    if (counter.count >= limits.maxPerMinute) {
      return false;
    }

    counter.count++;
    return true;
  }

  async getActiveCountForTenant(tenantId: string): Promise<number> {
    const jobs = await this.queue.getActive();
    return jobs.filter(j => j.data.tenantId === tenantId).length;
  }

  async tryEnqueue(data: ExecutionJobData): Promise<boolean> {
    const limits = this.getTenantLimits(data.tenantId, data.planTier);

    // Check rate limit
    if (!this.checkRateLimit(data.tenantId, limits)) {
      return false;
    }

    // Check concurrency
    const activeCount = await this.getActiveCountForTenant(data.tenantId);
    if (activeCount >= limits.maxConcurrent) {
      return false;
    }

    await this.enqueue(data);
    return true;
  }

  async enqueue(data: ExecutionJobData): Promise<Job<ExecutionJobData>> {
    const priority = getPriorityForPlan(data.planTier || 'free');
    const limits = this.getTenantLimits(data.tenantId, data.planTier);
    const timeout = data.timeoutMs
      ? Math.min(data.timeoutMs, limits.maxWorkflowTimeoutMs)
      : limits.maxWorkflowTimeoutMs;

    const job = await this.queue.add(
      `execute:${data.tenantId}:${data.workflowId}`,
      data,
      {
        priority,
        timeout,
        jobId: data.executionId,
        group: {
          id: data.tenantId,
          maxSize: limits.maxConcurrent,
        },
      },
    );

    return job;
  }

  createWorker(
    processor: (job: Job<ExecutionJobData>) => Promise<unknown>,
    options?: { concurrency?: number },
  ): Worker<ExecutionJobData> {
    const worker = new Worker<ExecutionJobData>(
      this.config.queueName,
      processor,
      {
        connection: this.redis.duplicate(),
        concurrency: options?.concurrency || 5,
        limiter: {
          max: 100,
          duration: 60_000,
        },
      },
    );

    return worker;
  }

  onCompleted(handler: (job: Job<ExecutionJobData>) => void): void {
    this.queueEvents.on('completed', async ({ jobId }) => {
      const job = await Job.fromId<ExecutionJobData>(this.queue, jobId);
      if (job) handler(job);
    });
  }

  onFailed(handler: (job: Job<ExecutionJobData> | undefined, error: Error) => void): void {
    this.queueEvents.on('failed', async ({ jobId, failedReason }) => {
      const job = jobId
        ? await Job.fromId<ExecutionJobData>(this.queue, jobId)
        : undefined;
      handler(job ?? undefined, new Error(failedReason));
    });
  }
}
```

**File:** `packages/execution-engine/src/queue/execution-worker.ts`

```typescript
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { ExecutionJobData } from './execution-queue';
import { ExecutionService } from '../execution-service';

export interface ExecutionWorkerOptions {
  concurrency: number;
  redis: Redis;
  queueName: string;
  executionService: ExecutionService;
}

export class ExecutionWorker {
  private worker: Worker<ExecutionJobData>;
  private executionService: ExecutionService;

  constructor(options: ExecutionWorkerOptions) {
    this.executionService = options.executionService;

    this.worker = new Worker<ExecutionJobData>(
      options.queueName,
      (job) => this.processJob(job),
      {
        connection: options.redis.duplicate(),
        concurrency: options.concurrency,
      },
    );

    this.worker.on('error', (err) => {
      console.error('[ExecutionWorker] Worker error:', err);
    });
  }

  private async processJob(job: Job<ExecutionJobData>): Promise<unknown> {
    const { tenantId, workflowId, executionId, inputData } = job.data;

    // Update job progress
    await job.updateProgress(0);

    try {
      // Execute the workflow via our execution service
      const result = await this.executionService.execute({
        tenantId,
        workflowId,
        executionId,
        inputData,
        onProgress: async (percent: number) => {
          await job.updateProgress(percent);
        },
      });

      await job.updateProgress(100);
      return result;
    } catch (error) {
      // Log and re-throw so BullMQ can handle retries
      console.error(
        `[ExecutionWorker] Execution failed: tenant=${tenantId} workflow=${workflowId} execution=${executionId}`,
        error,
      );
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    await this.worker.close();
  }
}
```

#### 3. Run tests and verify

```bash
cd /Users/preston/Documents/Claude/R360-Flow
pnpm --filter @r360/execution-engine test -- --grep "ExecutionQueue"
pnpm --filter @r360/execution-engine test -- --grep "QueueConfig"
```

Expected output:
```
 PASS  src/__tests__/queue/queue-config.test.ts
 PASS  src/__tests__/queue/execution-queue.test.ts
  ExecutionQueue
    Job Enqueueing
      ✓ should enqueue a workflow execution job
      ✓ should assign priority based on tenant plan tier
      ✓ should include workflow timeout in job options
    Per-Tenant Rate Limiting
      ✓ should enforce max concurrent executions per tenant
      ✓ should enforce rate limits per minute
    Priority Queuing
      ✓ should process enterprise jobs before pro, and pro before free
    Job Lifecycle
      ✓ should emit events on job completion
      ✓ should emit events on job failure
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `Redis connection refused` | Ensure Redis is running: `docker compose up -d redis` or `redis-server --daemonize yes` |
| `Cannot find module 'bullmq'` | Run `pnpm --filter @r360/execution-engine add bullmq ioredis` |
| `maxRetriesPerRequest must be null` | Ensure Redis connection has `maxRetriesPerRequest: null` — BullMQ requires this |
| `Priority ordering wrong` | BullMQ uses lower number = higher priority. Verify `PLAN_PRIORITIES` has enterprise=1, pro=5, free=10 |
| `Rate limit test flaky` | Increase timeout, ensure `drain()` clears between tests, use deterministic window tracking |

#### 5. Refactor if needed
- Extract Redis connection factory to shared utility
- Add connection health check with automatic reconnection
- Consider using BullMQ Pro's group-based rate limiting for production

### Success Criteria
- [ ] Jobs enqueue with correct data payload
- [ ] Priority ordering: enterprise > pro > free
- [ ] Per-tenant concurrency limits enforced
- [ ] Per-tenant rate limits (per minute) enforced
- [ ] Job completion/failure events emitted correctly
- [ ] Worker processes jobs via ExecutionService
- [ ] Queue drains cleanly on shutdown

### Verification Commands
```bash
# Run queue tests
pnpm --filter @r360/execution-engine test -- --grep "Queue"
# Expected: All queue-related tests pass

# Verify Redis connectivity
redis-cli info clients
# Expected: connected_clients:X (at least 1)

# Verify queue metrics
npx ts-node -e "
  const { Queue } = require('bullmq');
  const q = new Queue('r360-workflow-executions', { connection: { host: 'localhost', port: 6379 } });
  q.getJobCounts().then(c => { console.log('Queue counts:', c); return q.close(); });
"
# Expected: Queue counts: { waiting: 0, active: 0, completed: N, failed: N, ... }
```

---

## Step 4.2: Execution Sandboxing

### Objective
Isolate user-provided code execution (n8n Code nodes running arbitrary JavaScript) using `isolated-vm` to prevent malicious code from accessing the host process, file system, or network. Enforce per-node and per-workflow timeouts to prevent runaway executions.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/execution-engine/src/__tests__/sandbox/code-sandbox.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { CodeSandbox, SandboxConfig } from '../../sandbox/code-sandbox';

describe('CodeSandbox', () => {
  let sandbox: CodeSandbox;

  beforeEach(() => {
    sandbox = new CodeSandbox({
      memoryLimitMb: 128,
      timeoutMs: 5000,
      allowedModules: [],
    });
  });

  describe('Safe Code Execution', () => {
    it('should execute simple JavaScript and return result', async () => {
      const result = await sandbox.execute(`
        const x = 1 + 2;
        return { sum: x };
      `, {});

      expect(result).toEqual({ sum: 3 });
    });

    it('should pass input data to the sandbox', async () => {
      const result = await sandbox.execute(`
        const name = $input.name;
        return { greeting: 'Hello, ' + name };
      `, { name: 'R360' });

      expect(result).toEqual({ greeting: 'Hello, R360' });
    });

    it('should handle JSON manipulation', async () => {
      const result = await sandbox.execute(`
        const items = $input.items.map(i => ({ ...i, processed: true }));
        return { items };
      `, { items: [{ id: 1 }, { id: 2 }] });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].processed).toBe(true);
    });
  });

  describe('Malicious Code Containment', () => {
    it('should prevent access to process object', async () => {
      await expect(
        sandbox.execute(`return process.env`, {}),
      ).rejects.toThrow(/process is not defined|not allowed/);
    });

    it('should prevent access to require', async () => {
      await expect(
        sandbox.execute(`const fs = require('fs'); return fs.readFileSync('/etc/passwd')`, {}),
      ).rejects.toThrow(/require is not defined|not allowed/);
    });

    it('should prevent access to global fetch/http', async () => {
      await expect(
        sandbox.execute(`return await fetch('https://evil.com')`, {}),
      ).rejects.toThrow(/fetch is not defined|not allowed/);
    });

    it('should prevent access to file system via import', async () => {
      await expect(
        sandbox.execute(`
          const fs = await import('fs');
          return fs.readFileSync('/etc/passwd', 'utf8');
        `, {}),
      ).rejects.toThrow(/import is not defined|not allowed/);
    });

    it('should prevent prototype pollution', async () => {
      const result = await sandbox.execute(`
        try {
          ({}).__proto__.polluted = true;
        } catch(e) {}
        return { polluted: ({}).polluted };
      `, {});

      expect(result.polluted).toBeUndefined();
    });
  });

  describe('Timeout Enforcement', () => {
    it('should terminate execution that exceeds timeout', async () => {
      const shortTimeoutSandbox = new CodeSandbox({
        memoryLimitMb: 128,
        timeoutMs: 100,
        allowedModules: [],
      });

      await expect(
        shortTimeoutSandbox.execute(`
          while(true) {} // infinite loop
          return {};
        `, {}),
      ).rejects.toThrow(/timeout|timed out|exceeded/i);
    });

    it('should terminate CPU-intensive operations', async () => {
      const shortTimeoutSandbox = new CodeSandbox({
        memoryLimitMb: 128,
        timeoutMs: 500,
        allowedModules: [],
      });

      await expect(
        shortTimeoutSandbox.execute(`
          let x = 0;
          for (let i = 0; i < 1e15; i++) { x += i; }
          return { x };
        `, {}),
      ).rejects.toThrow(/timeout|timed out|exceeded/i);
    });
  });

  describe('Memory Limits', () => {
    it('should terminate execution that exceeds memory limit', async () => {
      const lowMemSandbox = new CodeSandbox({
        memoryLimitMb: 8,
        timeoutMs: 5000,
        allowedModules: [],
      });

      await expect(
        lowMemSandbox.execute(`
          const arr = [];
          while(true) { arr.push(new Array(1000000).fill('x')); }
          return {};
        `, {}),
      ).rejects.toThrow(/memory|heap|allocation/i);
    });
  });
});
```

**File:** `packages/execution-engine/src/__tests__/sandbox/timeout-manager.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimeoutManager, TimeoutConfig } from '../../sandbox/timeout-manager';

describe('TimeoutManager', () => {
  let manager: TimeoutManager;

  beforeEach(() => {
    manager = new TimeoutManager();
  });

  afterEach(() => {
    manager.clearAll();
  });

  it('should enforce per-node timeout', async () => {
    const config: TimeoutConfig = {
      nodeTimeoutMs: 100,
      workflowTimeoutMs: 10000,
    };

    const operation = new Promise<string>((resolve) => {
      setTimeout(() => resolve('completed'), 500);
    });

    await expect(
      manager.withNodeTimeout('node-1', config, () => operation),
    ).rejects.toThrow(/timeout/i);
  });

  it('should not timeout operations within limit', async () => {
    const config: TimeoutConfig = {
      nodeTimeoutMs: 1000,
      workflowTimeoutMs: 10000,
    };

    const result = await manager.withNodeTimeout(
      'node-1',
      config,
      async () => {
        await new Promise(r => setTimeout(r, 50));
        return 'done';
      },
    );

    expect(result).toBe('done');
  });

  it('should enforce per-workflow timeout across all nodes', async () => {
    const config: TimeoutConfig = {
      nodeTimeoutMs: 5000,
      workflowTimeoutMs: 200,
    };

    const executionId = 'exec-1';
    manager.startWorkflowTimer(executionId, config);

    // Simulate multiple nodes that together exceed workflow timeout
    await new Promise(r => setTimeout(r, 250));

    expect(
      manager.isWorkflowTimedOut(executionId),
    ).toBe(true);
  });

  it('should track active timeouts', () => {
    const config: TimeoutConfig = {
      nodeTimeoutMs: 5000,
      workflowTimeoutMs: 10000,
    };

    manager.startWorkflowTimer('exec-1', config);
    manager.startWorkflowTimer('exec-2', config);

    expect(manager.activeTimerCount()).toBe(2);

    manager.clearWorkflowTimer('exec-1');
    expect(manager.activeTimerCount()).toBe(1);
  });
});
```

#### 2. Implement the feature

**File:** `packages/execution-engine/src/sandbox/code-sandbox.ts`

```typescript
import ivm from 'isolated-vm';

export interface SandboxConfig {
  memoryLimitMb: number;
  timeoutMs: number;
  allowedModules: string[];
}

export class CodeSandbox {
  private config: SandboxConfig;

  constructor(config: SandboxConfig) {
    this.config = config;
  }

  async execute(
    code: string,
    inputData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const isolate = new ivm.Isolate({
      memoryLimit: this.config.memoryLimitMb,
    });

    try {
      const context = await isolate.createContext();
      const jail = context.global;

      // Set up a minimal global environment
      await jail.set('global', jail.derefInto());

      // Inject input data as a frozen copy
      const inputRef = new ivm.ExternalCopy(inputData).copyInto();
      await jail.set('$input', inputRef);

      // Wrap user code in a function that returns a result
      const wrappedCode = `
        (function() {
          'use strict';
          ${code}
        })();
      `;

      const script = await isolate.compileScript(wrappedCode);
      const result = await script.run(context, {
        timeout: this.config.timeoutMs,
        copy: true,
      });

      if (result === undefined || result === null) {
        return {};
      }

      if (typeof result === 'object') {
        return result as Record<string, unknown>;
      }

      return { result };
    } finally {
      isolate.dispose();
    }
  }
}
```

**File:** `packages/execution-engine/src/sandbox/timeout-manager.ts`

```typescript
export interface TimeoutConfig {
  nodeTimeoutMs: number;
  workflowTimeoutMs: number;
}

interface WorkflowTimer {
  startTime: number;
  timeoutMs: number;
  timer: NodeJS.Timeout;
  timedOut: boolean;
}

export class TimeoutManager {
  private workflowTimers: Map<string, WorkflowTimer> = new Map();

  startWorkflowTimer(executionId: string, config: TimeoutConfig): void {
    const startTime = Date.now();
    const timer = setTimeout(() => {
      const entry = this.workflowTimers.get(executionId);
      if (entry) {
        entry.timedOut = true;
      }
    }, config.workflowTimeoutMs);

    this.workflowTimers.set(executionId, {
      startTime,
      timeoutMs: config.workflowTimeoutMs,
      timer,
      timedOut: false,
    });
  }

  isWorkflowTimedOut(executionId: string): boolean {
    const entry = this.workflowTimers.get(executionId);
    if (!entry) return false;

    if (entry.timedOut) return true;

    // Also check elapsed time directly
    return Date.now() - entry.startTime >= entry.timeoutMs;
  }

  clearWorkflowTimer(executionId: string): void {
    const entry = this.workflowTimers.get(executionId);
    if (entry) {
      clearTimeout(entry.timer);
      this.workflowTimers.delete(executionId);
    }
  }

  async withNodeTimeout<T>(
    nodeId: string,
    config: TimeoutConfig,
    operation: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Node ${nodeId} execution timeout after ${config.nodeTimeoutMs}ms`));
      }, config.nodeTimeoutMs);

      operation()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  activeTimerCount(): number {
    return this.workflowTimers.size;
  }

  clearAll(): void {
    for (const [id] of this.workflowTimers) {
      this.clearWorkflowTimer(id);
    }
  }
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/execution-engine test -- --grep "CodeSandbox"
pnpm --filter @r360/execution-engine test -- --grep "TimeoutManager"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `Cannot find module 'isolated-vm'` | Run `pnpm --filter @r360/execution-engine add isolated-vm`. It has native dependencies — ensure `node-gyp`, Python 3, and a C++ compiler are installed |
| `isolated-vm build fails on macOS` | Run `xcode-select --install` to install build tools. If on ARM, ensure correct arch: `arch -arm64 pnpm add isolated-vm` |
| `Timeout test passes unexpectedly` | The infinite loop may not trigger `isolated-vm`'s timeout if `copy: true` is not set. Verify `script.run()` receives `{ timeout: ms }` |
| `Memory test does not throw` | Increase array size in the test; `isolated-vm` checks memory periodically, not on every allocation |
| `Prototype pollution test fails` | In `isolated-vm`, prototype operations may behave differently. Verify with `context.evalSync` rather than compiled script |

#### 5. Refactor if needed
- Pool isolate instances for performance (create/dispose is expensive)
- Add structured logging for sandbox events
- Consider worker_threads as fallback if isolated-vm is unavailable

### Success Criteria
- [ ] Simple JavaScript executes correctly in sandbox
- [ ] Input data passes to sandbox via `$input`
- [ ] `process`, `require`, `fetch`, `import` are all blocked
- [ ] Infinite loops terminated by timeout
- [ ] Memory-intensive operations terminated by memory limit
- [ ] Per-node timeout enforced
- [ ] Per-workflow timeout enforced across all nodes
- [ ] Timeout manager tracks active timers correctly

### Verification Commands
```bash
pnpm --filter @r360/execution-engine test -- --grep "Sandbox|Timeout"
# Expected: All sandbox and timeout tests pass

# Verify isolated-vm is installed correctly
node -e "const ivm = require('isolated-vm'); console.log('isolated-vm version:', ivm.version || 'OK')"
# Expected: isolated-vm version: OK (or version number)
```

---

## Step 4.3: Webhook Handling

### Objective
Implement tenant-scoped webhook routes (`POST /webhook/{tenantId}/{webhookPath}`) with full lifecycle management: registration when workflows with webhook triggers are activated, deregistration on deactivation, request routing to the correct workflow execution, and signature verification.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/api/src/__tests__/webhooks/webhook-router.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebhookRouter } from '../../webhooks/webhook-router';
import { WebhookRegistry } from '../../webhooks/webhook-registry';

describe('WebhookRouter', () => {
  let router: WebhookRouter;
  let registry: WebhookRegistry;
  let mockExecutionQueue: any;

  beforeEach(() => {
    mockExecutionQueue = {
      enqueue: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };
    registry = new WebhookRegistry();
    router = new WebhookRouter(registry, mockExecutionQueue);
  });

  describe('Webhook Registration', () => {
    it('should register a webhook for a workflow', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: 'incoming/orders',
        method: 'POST',
      });

      const webhook = await registry.lookup('tenant-1', 'incoming/orders', 'POST');
      expect(webhook).toBeDefined();
      expect(webhook!.workflowId).toBe('wf-1');
    });

    it('should prevent duplicate webhook paths per tenant', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: 'incoming/orders',
        method: 'POST',
      });

      await expect(
        registry.register({
          tenantId: 'tenant-1',
          workflowId: 'wf-2',
          webhookPath: 'incoming/orders',
          method: 'POST',
        }),
      ).rejects.toThrow(/already registered/i);
    });

    it('should allow same webhook path for different tenants', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: 'incoming/orders',
        method: 'POST',
      });

      await registry.register({
        tenantId: 'tenant-2',
        workflowId: 'wf-2',
        webhookPath: 'incoming/orders',
        method: 'POST',
      });

      const wh1 = await registry.lookup('tenant-1', 'incoming/orders', 'POST');
      const wh2 = await registry.lookup('tenant-2', 'incoming/orders', 'POST');

      expect(wh1!.workflowId).toBe('wf-1');
      expect(wh2!.workflowId).toBe('wf-2');
    });
  });

  describe('Webhook Deregistration', () => {
    it('should deregister a webhook', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: 'incoming/orders',
        method: 'POST',
      });

      await registry.deregister('tenant-1', 'incoming/orders', 'POST');

      const webhook = await registry.lookup('tenant-1', 'incoming/orders', 'POST');
      expect(webhook).toBeUndefined();
    });

    it('should deregister all webhooks for a workflow', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: 'path-a',
        method: 'POST',
      });

      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: 'path-b',
        method: 'GET',
      });

      await registry.deregisterWorkflow('tenant-1', 'wf-1');

      const a = await registry.lookup('tenant-1', 'path-a', 'POST');
      const b = await registry.lookup('tenant-1', 'path-b', 'GET');
      expect(a).toBeUndefined();
      expect(b).toBeUndefined();
    });
  });

  describe('Webhook Routing', () => {
    it('should trigger workflow execution on webhook hit', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: 'incoming/orders',
        method: 'POST',
      });

      const request = {
        tenantId: 'tenant-1',
        path: 'incoming/orders',
        method: 'POST' as const,
        headers: { 'content-type': 'application/json' },
        body: { orderId: 123 },
      };

      const result = await router.handleWebhook(request);

      expect(result.status).toBe('accepted');
      expect(mockExecutionQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          workflowId: 'wf-1',
          triggerType: 'webhook',
          webhookData: expect.objectContaining({
            body: { orderId: 123 },
          }),
        }),
      );
    });

    it('should return 404 for unregistered webhook', async () => {
      const request = {
        tenantId: 'tenant-1',
        path: 'nonexistent',
        method: 'POST' as const,
        headers: {},
        body: {},
      };

      const result = await router.handleWebhook(request);
      expect(result.status).toBe('not_found');
    });

    it('should isolate webhooks between tenants', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: 'shared-path',
        method: 'POST',
      });

      // Tenant 2 trying to hit tenant 1's webhook path
      const result = await router.handleWebhook({
        tenantId: 'tenant-2',
        path: 'shared-path',
        method: 'POST',
        headers: {},
        body: {},
      });

      expect(result.status).toBe('not_found');
    });
  });

  describe('Signature Verification', () => {
    it('should verify webhook signature when secret is configured', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: 'signed-hook',
        method: 'POST',
        signatureSecret: 'whsec_test123',
      });

      const body = JSON.stringify({ data: 'test' });
      const validSignature = WebhookRouter.computeSignature(body, 'whsec_test123');

      const result = await router.handleWebhook({
        tenantId: 'tenant-1',
        path: 'signed-hook',
        method: 'POST',
        headers: {
          'x-webhook-signature': validSignature,
          'content-type': 'application/json',
        },
        body: { data: 'test' },
        rawBody: body,
      });

      expect(result.status).toBe('accepted');
    });

    it('should reject webhook with invalid signature', async () => {
      await registry.register({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        webhookPath: 'signed-hook',
        method: 'POST',
        signatureSecret: 'whsec_test123',
      });

      const result = await router.handleWebhook({
        tenantId: 'tenant-1',
        path: 'signed-hook',
        method: 'POST',
        headers: {
          'x-webhook-signature': 'invalid-signature',
          'content-type': 'application/json',
        },
        body: { data: 'test' },
        rawBody: JSON.stringify({ data: 'test' }),
      });

      expect(result.status).toBe('unauthorized');
    });
  });
});
```

#### 2. Implement the feature

**File:** `packages/api/src/webhooks/webhook-registry.ts`

```typescript
export interface WebhookRegistration {
  tenantId: string;
  workflowId: string;
  webhookPath: string;
  method: string;
  signatureSecret?: string;
  createdAt?: Date;
}

export class WebhookRegistry {
  // In production, this is backed by the `webhooks` DB table
  // For now, use an in-memory map keyed by `{tenantId}:{method}:{path}`
  private registrations: Map<string, WebhookRegistration> = new Map();

  private makeKey(tenantId: string, path: string, method: string): string {
    return `${tenantId}:${method.toUpperCase()}:${path}`;
  }

  async register(registration: WebhookRegistration): Promise<void> {
    const key = this.makeKey(
      registration.tenantId,
      registration.webhookPath,
      registration.method,
    );

    if (this.registrations.has(key)) {
      throw new Error(
        `Webhook path '${registration.webhookPath}' (${registration.method}) is already registered for tenant '${registration.tenantId}'`,
      );
    }

    this.registrations.set(key, {
      ...registration,
      createdAt: new Date(),
    });
  }

  async deregister(tenantId: string, path: string, method: string): Promise<void> {
    const key = this.makeKey(tenantId, path, method);
    this.registrations.delete(key);
  }

  async deregisterWorkflow(tenantId: string, workflowId: string): Promise<void> {
    for (const [key, reg] of this.registrations) {
      if (reg.tenantId === tenantId && reg.workflowId === workflowId) {
        this.registrations.delete(key);
      }
    }
  }

  async lookup(
    tenantId: string,
    path: string,
    method: string,
  ): Promise<WebhookRegistration | undefined> {
    const key = this.makeKey(tenantId, path, method);
    return this.registrations.get(key);
  }

  async listForTenant(tenantId: string): Promise<WebhookRegistration[]> {
    const results: WebhookRegistration[] = [];
    for (const reg of this.registrations.values()) {
      if (reg.tenantId === tenantId) {
        results.push(reg);
      }
    }
    return results;
  }
}
```

**File:** `packages/api/src/webhooks/webhook-router.ts`

```typescript
import crypto from 'node:crypto';
import { WebhookRegistry, WebhookRegistration } from './webhook-registry';

export interface WebhookRequest {
  tenantId: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Record<string, string>;
  body: unknown;
  rawBody?: string;
  query?: Record<string, string>;
}

export interface WebhookResponse {
  status: 'accepted' | 'not_found' | 'unauthorized' | 'error';
  executionId?: string;
  message?: string;
}

export interface ExecutionQueueInterface {
  enqueue(data: {
    tenantId: string;
    workflowId: string;
    executionId: string;
    triggerType: 'webhook';
    webhookData: {
      method: string;
      headers: Record<string, string>;
      body: unknown;
      query?: Record<string, string>;
    };
  }): Promise<{ id: string }>;
}

export class WebhookRouter {
  private registry: WebhookRegistry;
  private executionQueue: ExecutionQueueInterface;

  constructor(registry: WebhookRegistry, executionQueue: ExecutionQueueInterface) {
    this.registry = registry;
    this.executionQueue = executionQueue;
  }

  static computeSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  async handleWebhook(request: WebhookRequest): Promise<WebhookResponse> {
    // Look up the webhook registration
    const registration = await this.registry.lookup(
      request.tenantId,
      request.path,
      request.method,
    );

    if (!registration) {
      return { status: 'not_found', message: 'Webhook not found' };
    }

    // Verify signature if a secret is configured
    if (registration.signatureSecret) {
      const providedSignature = request.headers['x-webhook-signature'];
      const rawBody = request.rawBody || JSON.stringify(request.body);
      const expectedSignature = WebhookRouter.computeSignature(
        rawBody,
        registration.signatureSecret,
      );

      if (!providedSignature || !crypto.timingSafeEqual(
        Buffer.from(providedSignature),
        Buffer.from(expectedSignature),
      )) {
        return { status: 'unauthorized', message: 'Invalid webhook signature' };
      }
    }

    // Generate execution ID
    const executionId = `exec-wh-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Enqueue the execution
    try {
      await this.executionQueue.enqueue({
        tenantId: request.tenantId,
        workflowId: registration.workflowId,
        executionId,
        triggerType: 'webhook',
        webhookData: {
          method: request.method,
          headers: request.headers,
          body: request.body,
          query: request.query,
        },
      });

      return { status: 'accepted', executionId };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to enqueue webhook execution',
      };
    }
  }
}
```

**File:** `packages/api/src/webhooks/webhook-lifecycle.ts`

```typescript
import { WebhookRegistry, WebhookRegistration } from './webhook-registry';

/**
 * Manages the full lifecycle of webhooks:
 * - When a workflow with a webhook trigger is activated, register the webhook
 * - When it is deactivated, deregister the webhook
 * - When a workflow is updated, re-register if the webhook path changed
 */
export class WebhookLifecycleManager {
  private registry: WebhookRegistry;

  constructor(registry: WebhookRegistry) {
    this.registry = registry;
  }

  /**
   * Called when a workflow is activated.
   * Scans the workflow definition for webhook trigger nodes and registers each.
   */
  async onWorkflowActivate(
    tenantId: string,
    workflowId: string,
    workflowDefinition: {
      nodes: Array<{
        type: string;
        parameters?: Record<string, unknown>;
      }>;
    },
  ): Promise<WebhookRegistration[]> {
    const registrations: WebhookRegistration[] = [];

    for (const node of workflowDefinition.nodes) {
      if (this.isWebhookTrigger(node.type)) {
        const webhookPath = this.extractWebhookPath(node);
        const method = this.extractWebhookMethod(node);

        const registration: WebhookRegistration = {
          tenantId,
          workflowId,
          webhookPath,
          method,
        };

        await this.registry.register(registration);
        registrations.push(registration);
      }
    }

    return registrations;
  }

  /**
   * Called when a workflow is deactivated.
   * Removes all webhook registrations for this workflow.
   */
  async onWorkflowDeactivate(tenantId: string, workflowId: string): Promise<void> {
    await this.registry.deregisterWorkflow(tenantId, workflowId);
  }

  /**
   * Called when a workflow is updated.
   * Deregisters old webhooks and registers new ones.
   */
  async onWorkflowUpdate(
    tenantId: string,
    workflowId: string,
    workflowDefinition: {
      nodes: Array<{
        type: string;
        parameters?: Record<string, unknown>;
      }>;
    },
  ): Promise<WebhookRegistration[]> {
    await this.onWorkflowDeactivate(tenantId, workflowId);
    return this.onWorkflowActivate(tenantId, workflowId, workflowDefinition);
  }

  private isWebhookTrigger(nodeType: string): boolean {
    return [
      'n8n-nodes-base.webhook',
      'r360.webhookTrigger',
    ].includes(nodeType);
  }

  private extractWebhookPath(node: { parameters?: Record<string, unknown> }): string {
    return (node.parameters?.path as string) || crypto.randomUUID();
  }

  private extractWebhookMethod(node: { parameters?: Record<string, unknown> }): string {
    return ((node.parameters?.httpMethod as string) || 'POST').toUpperCase();
  }
}
```

**File:** `packages/api/src/routes/webhook-routes.ts`

```typescript
import { Router, Request, Response } from 'express';
import { WebhookRouter } from '../webhooks/webhook-router';

export function createWebhookRoutes(webhookRouter: WebhookRouter): Router {
  const router = Router();

  // POST /webhook/:tenantId/:webhookPath(*)
  router.all('/webhook/:tenantId/*', async (req: Request, res: Response) => {
    const tenantId = req.params.tenantId;
    const webhookPath = req.params[0]; // Everything after /webhook/:tenantId/

    const result = await webhookRouter.handleWebhook({
      tenantId,
      path: webhookPath,
      method: req.method as any,
      headers: req.headers as Record<string, string>,
      body: req.body,
      rawBody: (req as any).rawBody,
      query: req.query as Record<string, string>,
    });

    switch (result.status) {
      case 'accepted':
        res.status(202).json({
          status: 'accepted',
          executionId: result.executionId,
        });
        break;
      case 'not_found':
        res.status(404).json({ error: 'Webhook not found' });
        break;
      case 'unauthorized':
        res.status(401).json({ error: 'Invalid signature' });
        break;
      case 'error':
        res.status(500).json({ error: result.message });
        break;
    }
  });

  return router;
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/api test -- --grep "WebhookRouter"
pnpm --filter @r360/api test -- --grep "WebhookRegistry"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `timingSafeEqual throws on different lengths` | Pad or hash both values to same length before comparing |
| `Duplicate registration check misses case sensitivity` | Normalize method to uppercase in `makeKey()` |
| `Wildcard route not capturing full path` | Use Express `*` wildcard or `req.params[0]` for full sub-path capture |
| `rawBody is undefined` | Add Express middleware `app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString(); } }))` |
| `crypto not imported` | Add `import crypto from 'node:crypto'` to webhook-lifecycle.ts |

### Success Criteria
- [ ] Webhooks register with tenant + path + method
- [ ] Duplicate path per tenant rejected
- [ ] Same path for different tenants allowed
- [ ] Deregistration by path works
- [ ] Deregistration by workflow removes all that workflow's webhooks
- [ ] Webhook hit triggers execution queue enqueue
- [ ] Unknown webhook returns 404
- [ ] Cross-tenant webhook access returns 404
- [ ] Signature verification passes for valid signatures
- [ ] Signature verification rejects invalid signatures
- [ ] Full lifecycle: activate registers, deactivate deregisters

### Verification Commands
```bash
pnpm --filter @r360/api test -- --grep "Webhook"
# Expected: All webhook tests pass

# Integration test via curl (after server running)
curl -X POST http://localhost:3000/webhook/tenant-1/test-path \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# Expected: 202 Accepted or 404 Not Found (depending on registration state)
```

---

## Step 4.4: Scheduled Workflows

### Objective
Build a cron-based scheduled workflow trigger system with timezone awareness. A scheduler service periodically checks for due workflows and enqueues them via BullMQ. This supports cron expressions (e.g., `0 9 * * MON-FRI` for weekday 9am) with per-tenant timezone configuration.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/api/src/__tests__/scheduler/cron-evaluator.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CronEvaluator } from '../../scheduler/cron-evaluator';

describe('CronEvaluator', () => {
  describe('Cron Expression Parsing', () => {
    it('should parse a standard cron expression', () => {
      const evaluator = new CronEvaluator();
      const isValid = evaluator.isValidExpression('0 9 * * MON-FRI');
      expect(isValid).toBe(true);
    });

    it('should reject invalid cron expressions', () => {
      const evaluator = new CronEvaluator();
      expect(evaluator.isValidExpression('invalid')).toBe(false);
      expect(evaluator.isValidExpression('60 25 * * *')).toBe(false);
    });

    it('should calculate next run time from a cron expression', () => {
      const evaluator = new CronEvaluator();
      const now = new Date('2026-03-05T08:00:00Z');
      const nextRun = evaluator.getNextRunTime('0 9 * * *', 'UTC', now);

      expect(nextRun).toBeDefined();
      expect(nextRun!.getUTCHours()).toBe(9);
      expect(nextRun!.getUTCMinutes()).toBe(0);
    });

    it('should handle timezone-aware scheduling', () => {
      const evaluator = new CronEvaluator();
      // Schedule for 9 AM in US Eastern (UTC-5 in winter / UTC-4 in summer)
      const now = new Date('2026-03-05T12:00:00Z'); // 7 AM Eastern
      const nextRun = evaluator.getNextRunTime('0 9 * * *', 'America/New_York', now);

      expect(nextRun).toBeDefined();
      // 9 AM Eastern = 14:00 UTC (March = EDT, UTC-4)
      expect(nextRun!.getUTCHours()).toBe(13); // EST is UTC-5 in March before DST
    });

    it('should calculate next run time for every-5-minutes cron', () => {
      const evaluator = new CronEvaluator();
      const now = new Date('2026-03-05T08:03:00Z');
      const nextRun = evaluator.getNextRunTime('*/5 * * * *', 'UTC', now);

      expect(nextRun!.getUTCMinutes()).toBe(5);
    });
  });

  describe('Due Workflow Check', () => {
    it('should identify workflows that are due to run', () => {
      const evaluator = new CronEvaluator();
      const now = new Date('2026-03-05T09:00:00Z');

      const isDue = evaluator.isDue(
        '0 9 * * *',
        'UTC',
        new Date('2026-03-04T09:00:00Z'), // last ran yesterday
        now,
      );

      expect(isDue).toBe(true);
    });

    it('should NOT mark a workflow as due if it already ran in this window', () => {
      const evaluator = new CronEvaluator();
      const now = new Date('2026-03-05T09:00:30Z');

      const isDue = evaluator.isDue(
        '0 9 * * *',
        'UTC',
        new Date('2026-03-05T09:00:00Z'), // already ran this minute
        now,
      );

      expect(isDue).toBe(false);
    });
  });
});
```

**File:** `packages/api/src/__tests__/scheduler/scheduler-service.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchedulerService } from '../../scheduler/scheduler-service';

describe('SchedulerService', () => {
  let scheduler: SchedulerService;
  let mockDb: any;
  let mockExecutionQueue: any;

  beforeEach(() => {
    mockDb = {
      getActiveScheduledWorkflows: vi.fn().mockResolvedValue([
        {
          id: 'wf-1',
          tenantId: 'tenant-1',
          cronExpression: '0 9 * * *',
          timezone: 'UTC',
          lastRunAt: new Date('2026-03-04T09:00:00Z'),
        },
        {
          id: 'wf-2',
          tenantId: 'tenant-2',
          cronExpression: '*/5 * * * *',
          timezone: 'America/New_York',
          lastRunAt: new Date('2026-03-05T08:55:00Z'),
        },
      ]),
      updateLastRunAt: vi.fn().mockResolvedValue(undefined),
    };

    mockExecutionQueue = {
      enqueue: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };

    scheduler = new SchedulerService(mockDb, mockExecutionQueue);
  });

  it('should check for due workflows and enqueue them', async () => {
    const now = new Date('2026-03-05T09:00:00Z');
    await scheduler.checkAndEnqueue(now);

    // wf-1 should be due (0 9 * * * at 9:00 UTC, last ran yesterday)
    expect(mockExecutionQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        triggerType: 'schedule',
      }),
    );
  });

  it('should update lastRunAt after enqueueing', async () => {
    const now = new Date('2026-03-05T09:00:00Z');
    await scheduler.checkAndEnqueue(now);

    expect(mockDb.updateLastRunAt).toHaveBeenCalled();
  });

  it('should not enqueue workflows that are not due', async () => {
    const now = new Date('2026-03-05T08:30:00Z'); // 8:30 UTC, wf-1 is at 9:00

    mockDb.getActiveScheduledWorkflows.mockResolvedValue([
      {
        id: 'wf-1',
        tenantId: 'tenant-1',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        lastRunAt: new Date('2026-03-04T09:00:00Z'),
      },
    ]);

    await scheduler.checkAndEnqueue(now);

    expect(mockExecutionQueue.enqueue).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully without stopping the scheduler', async () => {
    mockExecutionQueue.enqueue.mockRejectedValueOnce(new Error('Queue full'));

    const now = new Date('2026-03-05T09:00:00Z');

    // Should not throw
    await expect(scheduler.checkAndEnqueue(now)).resolves.not.toThrow();
  });

  it('should start and stop the polling loop', async () => {
    const pollSpy = vi.spyOn(scheduler, 'checkAndEnqueue').mockResolvedValue();

    scheduler.start(1000); // Poll every 1 second
    await new Promise(r => setTimeout(r, 2500));
    scheduler.stop();

    expect(pollSpy).toHaveBeenCalledTimes(2); // ~2 calls in 2.5 seconds
  });
});
```

#### 2. Implement the feature

**File:** `packages/api/src/scheduler/cron-evaluator.ts`

```typescript
import parser from 'cron-parser';
import { DateTime } from 'luxon';

export class CronEvaluator {
  isValidExpression(expression: string): boolean {
    try {
      parser.parseExpression(expression);
      return true;
    } catch {
      return false;
    }
  }

  getNextRunTime(
    expression: string,
    timezone: string,
    from: Date = new Date(),
  ): Date | undefined {
    try {
      const interval = parser.parseExpression(expression, {
        currentDate: from,
        tz: timezone,
      });
      return interval.next().toDate();
    } catch {
      return undefined;
    }
  }

  getPreviousRunTime(
    expression: string,
    timezone: string,
    from: Date = new Date(),
  ): Date | undefined {
    try {
      const interval = parser.parseExpression(expression, {
        currentDate: from,
        tz: timezone,
      });
      return interval.prev().toDate();
    } catch {
      return undefined;
    }
  }

  isDue(
    expression: string,
    timezone: string,
    lastRunAt: Date | null,
    now: Date = new Date(),
  ): boolean {
    try {
      const prev = this.getPreviousRunTime(expression, timezone, now);
      if (!prev) return false;

      // The most recent scheduled time is in the past or now
      // AND it's after the last time we ran
      if (lastRunAt === null) return true;

      return prev.getTime() > lastRunAt.getTime();
    } catch {
      return false;
    }
  }
}
```

**File:** `packages/api/src/scheduler/scheduler-service.ts`

```typescript
import crypto from 'node:crypto';
import { CronEvaluator } from './cron-evaluator';

export interface ScheduledWorkflow {
  id: string;
  tenantId: string;
  cronExpression: string;
  timezone: string;
  lastRunAt: Date | null;
}

export interface SchedulerDb {
  getActiveScheduledWorkflows(): Promise<ScheduledWorkflow[]>;
  updateLastRunAt(workflowId: string, runAt: Date): Promise<void>;
}

export interface SchedulerExecutionQueue {
  enqueue(data: {
    tenantId: string;
    workflowId: string;
    executionId: string;
    triggerType: 'schedule';
  }): Promise<{ id: string }>;
}

export class SchedulerService {
  private db: SchedulerDb;
  private executionQueue: SchedulerExecutionQueue;
  private cronEvaluator: CronEvaluator;
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(db: SchedulerDb, executionQueue: SchedulerExecutionQueue) {
    this.db = db;
    this.executionQueue = executionQueue;
    this.cronEvaluator = new CronEvaluator();
  }

  async checkAndEnqueue(now: Date = new Date()): Promise<void> {
    const workflows = await this.db.getActiveScheduledWorkflows();

    for (const workflow of workflows) {
      try {
        const isDue = this.cronEvaluator.isDue(
          workflow.cronExpression,
          workflow.timezone,
          workflow.lastRunAt,
          now,
        );

        if (isDue) {
          const executionId = `exec-sched-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

          await this.executionQueue.enqueue({
            tenantId: workflow.tenantId,
            workflowId: workflow.id,
            executionId,
            triggerType: 'schedule',
          });

          await this.db.updateLastRunAt(workflow.id, now);

          console.log(
            `[Scheduler] Enqueued scheduled execution: tenant=${workflow.tenantId} workflow=${workflow.id} execution=${executionId}`,
          );
        }
      } catch (error) {
        console.error(
          `[Scheduler] Error processing workflow ${workflow.id}:`,
          error,
        );
        // Continue processing other workflows
      }
    }
  }

  start(pollIntervalMs: number = 30_000): void {
    if (this.intervalHandle) {
      throw new Error('Scheduler is already running');
    }

    console.log(`[Scheduler] Starting with poll interval ${pollIntervalMs}ms`);

    this.intervalHandle = setInterval(() => {
      this.checkAndEnqueue().catch((err) => {
        console.error('[Scheduler] Poll cycle error:', err);
      });
    }, pollIntervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      console.log('[Scheduler] Stopped');
    }
  }

  isRunning(): boolean {
    return this.intervalHandle !== null;
  }
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/api test -- --grep "CronEvaluator"
pnpm --filter @r360/api test -- --grep "SchedulerService"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `Cannot find module 'cron-parser'` | Run `pnpm --filter @r360/api add cron-parser luxon && pnpm --filter @r360/api add -D @types/luxon` |
| `Timezone test off by one hour` | Check DST boundaries. Use `luxon` to verify: `DateTime.fromJSDate(date).setZone(tz).hour` |
| `isDue returns false when expected true` | Verify `prev` calculation. `cron-parser` `prev()` returns the most recent matching time BEFORE `currentDate`. Ensure `lastRunAt` comparison uses `>` not `>=` |
| `Polling test flaky` | Use `vi.useFakeTimers()` instead of real `setTimeout` for deterministic timing |
| `Scheduler does not stop` | Ensure `clearInterval` is called. Check that `intervalHandle` is correctly assigned |

### Success Criteria
- [ ] Valid cron expressions parsed correctly
- [ ] Invalid cron expressions rejected
- [ ] Next run time calculated correctly
- [ ] Timezone-aware scheduling works (Eastern, Pacific, UTC, etc.)
- [ ] Due workflows detected correctly based on lastRunAt
- [ ] Already-run workflows not re-enqueued
- [ ] Scheduler polls at configured interval
- [ ] Scheduler starts and stops cleanly
- [ ] Errors in one workflow don't stop processing of others

### Verification Commands
```bash
pnpm --filter @r360/api test -- --grep "Cron|Scheduler"
# Expected: All cron and scheduler tests pass

# Verify cron-parser works
node -e "
  const parser = require('cron-parser');
  const interval = parser.parseExpression('*/5 * * * *');
  console.log('Next 3 runs:');
  for (let i = 0; i < 3; i++) console.log(interval.next().toString());
"
# Expected: Three upcoming 5-minute marks
```

---

## Step 4.5: Real-Time Execution Monitoring

### Objective
Implement WebSocket-based real-time execution monitoring so the Workflow Builder UI can show live execution status, step-by-step progress, and streaming execution logs as workflows run.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/api/src/__tests__/realtime/execution-monitor.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionMonitor, ExecutionEvent } from '../../realtime/execution-monitor';

describe('ExecutionMonitor', () => {
  let monitor: ExecutionMonitor;

  beforeEach(() => {
    monitor = new ExecutionMonitor();
  });

  describe('Subscription Management', () => {
    it('should allow subscribing to execution updates', () => {
      const callback = vi.fn();
      const unsubscribe = monitor.subscribe('tenant-1', 'exec-1', callback);

      expect(unsubscribe).toBeInstanceOf(Function);
    });

    it('should deliver events to subscribed listeners', () => {
      const callback = vi.fn();
      monitor.subscribe('tenant-1', 'exec-1', callback);

      const event: ExecutionEvent = {
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        type: 'node_started',
        nodeId: 'node-1',
        nodeName: 'HTTP Request',
        timestamp: Date.now(),
      };

      monitor.emit(event);

      expect(callback).toHaveBeenCalledWith(event);
    });

    it('should not deliver events after unsubscribe', () => {
      const callback = vi.fn();
      const unsubscribe = monitor.subscribe('tenant-1', 'exec-1', callback);

      unsubscribe();

      monitor.emit({
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        type: 'node_started',
        nodeId: 'node-1',
        nodeName: 'Test',
        timestamp: Date.now(),
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should isolate events between tenants', () => {
      const tenant1Callback = vi.fn();
      const tenant2Callback = vi.fn();

      monitor.subscribe('tenant-1', 'exec-1', tenant1Callback);
      monitor.subscribe('tenant-2', 'exec-2', tenant2Callback);

      monitor.emit({
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        type: 'workflow_started',
        timestamp: Date.now(),
      });

      expect(tenant1Callback).toHaveBeenCalledTimes(1);
      expect(tenant2Callback).not.toHaveBeenCalled();
    });

    it('should isolate events between executions of same tenant', () => {
      const exec1Callback = vi.fn();
      const exec2Callback = vi.fn();

      monitor.subscribe('tenant-1', 'exec-1', exec1Callback);
      monitor.subscribe('tenant-1', 'exec-2', exec2Callback);

      monitor.emit({
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        type: 'workflow_started',
        timestamp: Date.now(),
      });

      expect(exec1Callback).toHaveBeenCalledTimes(1);
      expect(exec2Callback).not.toHaveBeenCalled();
    });
  });

  describe('Tenant-Wide Subscriptions', () => {
    it('should allow subscribing to all executions for a tenant', () => {
      const callback = vi.fn();
      monitor.subscribeTenant('tenant-1', callback);

      monitor.emit({
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        type: 'workflow_started',
        timestamp: Date.now(),
      });

      monitor.emit({
        executionId: 'exec-2',
        tenantId: 'tenant-1',
        type: 'workflow_started',
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('Event Types', () => {
    it('should handle workflow_started events', () => {
      const callback = vi.fn();
      monitor.subscribe('tenant-1', 'exec-1', callback);

      monitor.emit({
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        type: 'workflow_started',
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'workflow_started' }),
      );
    });

    it('should handle node_started events with node details', () => {
      const callback = vi.fn();
      monitor.subscribe('tenant-1', 'exec-1', callback);

      monitor.emit({
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        type: 'node_started',
        nodeId: 'node-1',
        nodeName: 'HTTP Request',
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node_started',
          nodeId: 'node-1',
          nodeName: 'HTTP Request',
        }),
      );
    });

    it('should handle node_completed events with output data', () => {
      const callback = vi.fn();
      monitor.subscribe('tenant-1', 'exec-1', callback);

      monitor.emit({
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        type: 'node_completed',
        nodeId: 'node-1',
        nodeName: 'HTTP Request',
        outputData: { statusCode: 200 },
        durationMs: 150,
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node_completed',
          outputData: { statusCode: 200 },
          durationMs: 150,
        }),
      );
    });

    it('should handle workflow_completed events', () => {
      const callback = vi.fn();
      monitor.subscribe('tenant-1', 'exec-1', callback);

      monitor.emit({
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        type: 'workflow_completed',
        status: 'success',
        durationMs: 3500,
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'workflow_completed',
          status: 'success',
        }),
      );
    });

    it('should handle workflow_error events', () => {
      const callback = vi.fn();
      monitor.subscribe('tenant-1', 'exec-1', callback);

      monitor.emit({
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        type: 'workflow_error',
        error: 'Connection timeout',
        nodeId: 'node-3',
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'workflow_error',
          error: 'Connection timeout',
        }),
      );
    });
  });
});
```

**File:** `packages/api/src/__tests__/realtime/ws-server.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import { createExecutionWSServer } from '../../realtime/ws-server';
import { ExecutionMonitor } from '../../realtime/execution-monitor';
import http from 'node:http';

describe('WebSocket Server', () => {
  let server: http.Server;
  let monitor: ExecutionMonitor;
  let port: number;

  beforeEach(async () => {
    monitor = new ExecutionMonitor();
    server = http.createServer();

    createExecutionWSServer(server, monitor, {
      authenticateToken: async (token: string) => {
        if (token === 'valid-token-tenant-1') return { tenantId: 'tenant-1', userId: 'user-1' };
        if (token === 'valid-token-tenant-2') return { tenantId: 'tenant-2', userId: 'user-2' };
        return null;
      },
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should accept authenticated WebSocket connections', async () => {
    const ws = new WebSocket(
      `ws://localhost:${port}?token=valid-token-tenant-1`,
    );

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('should reject unauthenticated connections', async () => {
    const ws = new WebSocket(`ws://localhost:${port}?token=invalid`);

    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });

    expect(closeCode).toBe(4001); // Custom close code for auth failure
  });

  it('should deliver execution events to subscribed client', async () => {
    const ws = new WebSocket(
      `ws://localhost:${port}?token=valid-token-tenant-1`,
    );

    await new Promise<void>((resolve) => ws.on('open', resolve));

    // Subscribe to an execution
    ws.send(JSON.stringify({
      action: 'subscribe',
      executionId: 'exec-1',
    }));

    // Wait for subscription to register
    await new Promise(r => setTimeout(r, 100));

    // Emit an event
    const receivedMessage = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });

    monitor.emit({
      executionId: 'exec-1',
      tenantId: 'tenant-1',
      type: 'workflow_started',
      timestamp: Date.now(),
    });

    const message = await receivedMessage;
    expect(message.type).toBe('workflow_started');
    expect(message.executionId).toBe('exec-1');

    ws.close();
  });

  it('should not deliver events from other tenants', async () => {
    const ws = new WebSocket(
      `ws://localhost:${port}?token=valid-token-tenant-1`,
    );

    await new Promise<void>((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({
      action: 'subscribe',
      executionId: 'exec-1',
    }));

    await new Promise(r => setTimeout(r, 100));

    const messages: any[] = [];
    ws.on('message', (data) => {
      messages.push(JSON.parse(data.toString()));
    });

    // Emit event for tenant-2 (should NOT be delivered)
    monitor.emit({
      executionId: 'exec-1',
      tenantId: 'tenant-2',
      type: 'workflow_started',
      timestamp: Date.now(),
    });

    await new Promise(r => setTimeout(r, 200));

    expect(messages.length).toBe(0);

    ws.close();
  });
});
```

#### 2. Implement the feature

**File:** `packages/api/src/realtime/execution-monitor.ts`

```typescript
export type ExecutionEventType =
  | 'workflow_started'
  | 'workflow_completed'
  | 'workflow_error'
  | 'node_started'
  | 'node_completed'
  | 'node_error'
  | 'log';

export interface ExecutionEvent {
  executionId: string;
  tenantId: string;
  type: ExecutionEventType;
  nodeId?: string;
  nodeName?: string;
  outputData?: unknown;
  error?: string;
  status?: 'success' | 'error' | 'cancelled';
  durationMs?: number;
  progress?: number;
  logMessage?: string;
  logLevel?: 'info' | 'warn' | 'error' | 'debug';
  timestamp: number;
}

type EventCallback = (event: ExecutionEvent) => void;

export class ExecutionMonitor {
  // Key: `${tenantId}:${executionId}` -> callbacks
  private executionSubscribers: Map<string, Set<EventCallback>> = new Map();
  // Key: tenantId -> callbacks (tenant-wide subscriptions)
  private tenantSubscribers: Map<string, Set<EventCallback>> = new Map();

  private makeKey(tenantId: string, executionId: string): string {
    return `${tenantId}:${executionId}`;
  }

  subscribe(
    tenantId: string,
    executionId: string,
    callback: EventCallback,
  ): () => void {
    const key = this.makeKey(tenantId, executionId);
    if (!this.executionSubscribers.has(key)) {
      this.executionSubscribers.set(key, new Set());
    }
    this.executionSubscribers.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      const subs = this.executionSubscribers.get(key);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.executionSubscribers.delete(key);
        }
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
        if (subs.size === 0) {
          this.tenantSubscribers.delete(tenantId);
        }
      }
    };
  }

  emit(event: ExecutionEvent): void {
    // Deliver to execution-specific subscribers
    const key = this.makeKey(event.tenantId, event.executionId);
    const executionSubs = this.executionSubscribers.get(key);
    if (executionSubs) {
      for (const callback of executionSubs) {
        try {
          callback(event);
        } catch (err) {
          console.error('[ExecutionMonitor] Subscriber error:', err);
        }
      }
    }

    // Deliver to tenant-wide subscribers
    const tenantSubs = this.tenantSubscribers.get(event.tenantId);
    if (tenantSubs) {
      for (const callback of tenantSubs) {
        try {
          callback(event);
        } catch (err) {
          console.error('[ExecutionMonitor] Tenant subscriber error:', err);
        }
      }
    }
  }

  getSubscriberCount(tenantId: string, executionId: string): number {
    const key = this.makeKey(tenantId, executionId);
    return this.executionSubscribers.get(key)?.size || 0;
  }
}
```

**File:** `packages/api/src/realtime/ws-server.ts`

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import { ExecutionMonitor, ExecutionEvent } from './execution-monitor';

interface AuthResult {
  tenantId: string;
  userId: string;
}

interface WSServerOptions {
  authenticateToken: (token: string) => Promise<AuthResult | null>;
  heartbeatIntervalMs?: number;
}

interface ClientState {
  tenantId: string;
  userId: string;
  subscriptions: Map<string, () => void>; // executionId -> unsubscribe
  tenantUnsubscribe?: () => void;
  isAlive: boolean;
}

export function createExecutionWSServer(
  server: http.Server,
  monitor: ExecutionMonitor,
  options: WSServerOptions,
): WebSocketServer {
  const wss = new WebSocketServer({ server });
  const clients: Map<WebSocket, ClientState> = new Map();

  // Heartbeat interval
  const heartbeatInterval = setInterval(() => {
    for (const [ws, state] of clients) {
      if (!state.isAlive) {
        cleanupClient(ws);
        ws.terminate();
        continue;
      }
      state.isAlive = false;
      ws.ping();
    }
  }, options.heartbeatIntervalMs || 30_000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
    // Extract token from query string
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Authentication required');
      return;
    }

    const auth = await options.authenticateToken(token);
    if (!auth) {
      ws.close(4001, 'Authentication failed');
      return;
    }

    const clientState: ClientState = {
      tenantId: auth.tenantId,
      userId: auth.userId,
      subscriptions: new Map(),
      isAlive: true,
    };

    clients.set(ws, clientState);

    ws.on('pong', () => {
      clientState.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(ws, clientState, message);
      } catch (err) {
        ws.send(JSON.stringify({ error: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      cleanupClient(ws);
    });

    ws.on('error', () => {
      cleanupClient(ws);
    });
  });

  function handleClientMessage(
    ws: WebSocket,
    state: ClientState,
    message: { action: string; executionId?: string },
  ): void {
    switch (message.action) {
      case 'subscribe':
        if (message.executionId) {
          // Unsubscribe from previous if exists
          const existing = state.subscriptions.get(message.executionId);
          if (existing) existing();

          const unsubscribe = monitor.subscribe(
            state.tenantId,
            message.executionId,
            (event: ExecutionEvent) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(event));
              }
            },
          );
          state.subscriptions.set(message.executionId, unsubscribe);
        }
        break;

      case 'unsubscribe':
        if (message.executionId) {
          const unsub = state.subscriptions.get(message.executionId);
          if (unsub) {
            unsub();
            state.subscriptions.delete(message.executionId);
          }
        }
        break;

      case 'subscribe_tenant':
        if (state.tenantUnsubscribe) state.tenantUnsubscribe();
        state.tenantUnsubscribe = monitor.subscribeTenant(
          state.tenantId,
          (event: ExecutionEvent) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(event));
            }
          },
        );
        break;

      case 'unsubscribe_tenant':
        if (state.tenantUnsubscribe) {
          state.tenantUnsubscribe();
          state.tenantUnsubscribe = undefined;
        }
        break;

      default:
        ws.send(JSON.stringify({ error: `Unknown action: ${message.action}` }));
    }
  }

  function cleanupClient(ws: WebSocket): void {
    const state = clients.get(ws);
    if (state) {
      for (const unsub of state.subscriptions.values()) {
        unsub();
      }
      if (state.tenantUnsubscribe) state.tenantUnsubscribe();
      clients.delete(ws);
    }
  }

  return wss;
}
```

**File:** `packages/api/src/realtime/execution-hooks-integration.ts`

```typescript
import { ExecutionMonitor, ExecutionEvent } from './execution-monitor';

/**
 * Integrates the ExecutionMonitor with the lifecycle hooks from
 * packages/execution-engine/src/lifecycle-hooks.ts.
 *
 * This bridges the execution engine's hooks to the real-time monitoring system
 * so that WebSocket clients receive live updates during workflow execution.
 */
export function createMonitoringHooks(monitor: ExecutionMonitor) {
  return {
    workflowExecuteBefore(tenantId: string, executionId: string): void {
      monitor.emit({
        executionId,
        tenantId,
        type: 'workflow_started',
        timestamp: Date.now(),
      });
    },

    nodeExecuteBefore(
      tenantId: string,
      executionId: string,
      nodeId: string,
      nodeName: string,
    ): void {
      monitor.emit({
        executionId,
        tenantId,
        type: 'node_started',
        nodeId,
        nodeName,
        timestamp: Date.now(),
      });
    },

    nodeExecuteAfter(
      tenantId: string,
      executionId: string,
      nodeId: string,
      nodeName: string,
      outputData: unknown,
      durationMs: number,
      error?: string,
    ): void {
      if (error) {
        monitor.emit({
          executionId,
          tenantId,
          type: 'node_error',
          nodeId,
          nodeName,
          error,
          durationMs,
          timestamp: Date.now(),
        });
      } else {
        monitor.emit({
          executionId,
          tenantId,
          type: 'node_completed',
          nodeId,
          nodeName,
          outputData,
          durationMs,
          timestamp: Date.now(),
        });
      }
    },

    workflowExecuteAfter(
      tenantId: string,
      executionId: string,
      status: 'success' | 'error' | 'cancelled',
      durationMs: number,
      error?: string,
    ): void {
      if (status === 'error') {
        monitor.emit({
          executionId,
          tenantId,
          type: 'workflow_error',
          status,
          error,
          durationMs,
          timestamp: Date.now(),
        });
      } else {
        monitor.emit({
          executionId,
          tenantId,
          type: 'workflow_completed',
          status,
          durationMs,
          timestamp: Date.now(),
        });
      }
    },
  };
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/api test -- --grep "ExecutionMonitor"
pnpm --filter @r360/api test -- --grep "WebSocket"
```

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `Cannot find module 'ws'` | Run `pnpm --filter @r360/api add ws && pnpm --filter @r360/api add -D @types/ws` |
| `WebSocket connection refused` | Ensure test server is started before creating WebSocket clients. Use `await` on server.listen |
| `WebSocket close code wrong` | Check that `ws.close(4001, ...)` sends the custom close code. Verify client receives it via `ws.on('close', (code) => ...)` |
| `Events delivered after unsubscribe` | Ensure the unsubscribe function properly removes the callback from the Set |
| `Test timeout` | Increase vitest timeout for WebSocket tests: `it('...', async () => { ... }, 10000)` |

### Success Criteria
- [ ] ExecutionMonitor delivers events to correct subscribers only
- [ ] Unsubscribe stops event delivery
- [ ] Tenant isolation: events for tenant A never reach tenant B subscribers
- [ ] Execution isolation: events for exec-1 never reach exec-2 subscribers
- [ ] Tenant-wide subscriptions receive all events for that tenant
- [ ] WebSocket server authenticates connections
- [ ] WebSocket server rejects invalid tokens
- [ ] WebSocket clients receive real-time execution events
- [ ] Cross-tenant WebSocket isolation works
- [ ] Heartbeat keeps connections alive
- [ ] Client cleanup on disconnect

### Verification Commands
```bash
pnpm --filter @r360/api test -- --grep "ExecutionMonitor|WebSocket"
# Expected: All realtime tests pass

# Manual WebSocket test (with server running)
npx wscat -c "ws://localhost:3001?token=valid-token" -x '{"action":"subscribe_tenant"}'
# Expected: Connection opens, receives events when executions run
```

---

## Step 4.6: Phase 4 Load Testing

### Objective
Validate the execution infrastructure under realistic multi-tenant load. Verify that BullMQ handles 100+ concurrent executions across 10+ tenants without degradation, rate limiting works under pressure, and the system maintains acceptable latency.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/execution-engine/src/__tests__/load/load-test.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { ExecutionQueue, ExecutionJobData } from '../../queue/execution-queue';
import { TenantPlan } from '../../queue/queue-config';

describe('Load Tests', () => {
  let redis: Redis;
  let executionQueue: ExecutionQueue;

  beforeAll(async () => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
    });
    executionQueue = new ExecutionQueue(redis);
    await executionQueue.initialize();
  });

  afterAll(async () => {
    await executionQueue.shutdown();
    await redis.quit();
  });

  it('should handle 100+ concurrent executions across 10+ tenants', async () => {
    const TENANT_COUNT = 12;
    const EXECUTIONS_PER_TENANT = 10;
    const TOTAL_EXECUTIONS = TENANT_COUNT * EXECUTIONS_PER_TENANT;
    const completedJobs: string[] = [];
    const startTime = Date.now();

    // Create a worker that simulates execution (50ms per job)
    const worker = executionQueue.createWorker(
      async (job) => {
        await new Promise(r => setTimeout(r, 50));
        completedJobs.push(job.data.executionId);
        return { success: true };
      },
      { concurrency: 20 },
    );

    // Enqueue all jobs
    const enqueuePromises: Promise<any>[] = [];
    for (let t = 0; t < TENANT_COUNT; t++) {
      const planTier: TenantPlan = t < 4 ? 'free' : t < 8 ? 'pro' : 'enterprise';
      for (let e = 0; e < EXECUTIONS_PER_TENANT; e++) {
        enqueuePromises.push(
          executionQueue.enqueue({
            tenantId: `tenant-load-${t}`,
            workflowId: `wf-${e}`,
            executionId: `exec-load-${t}-${e}`,
            triggerType: 'manual',
            planTier,
          }),
        );
      }
    }

    await Promise.all(enqueuePromises);
    const enqueueTime = Date.now() - startTime;

    // Wait for all jobs to complete (timeout after 30 seconds)
    const deadline = Date.now() + 30_000;
    while (completedJobs.length < TOTAL_EXECUTIONS && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    const totalTime = Date.now() - startTime;
    await worker.close();

    console.log(`Load Test Results:`);
    console.log(`  Total executions: ${TOTAL_EXECUTIONS}`);
    console.log(`  Completed: ${completedJobs.length}`);
    console.log(`  Enqueue time: ${enqueueTime}ms`);
    console.log(`  Total time: ${totalTime}ms`);
    console.log(`  Throughput: ${(completedJobs.length / (totalTime / 1000)).toFixed(1)} executions/sec`);

    expect(completedJobs.length).toBe(TOTAL_EXECUTIONS);
    expect(enqueueTime).toBeLessThan(5000); // Enqueueing should take <5s
    expect(totalTime).toBeLessThan(30_000); // Total should complete <30s
  }, 60_000);

  it('should maintain P95 execution start latency under 500ms', async () => {
    const latencies: number[] = [];
    const JOB_COUNT = 50;

    const worker = executionQueue.createWorker(
      async (job) => {
        const enqueuedAt = job.data.inputData?.enqueuedAt as number;
        const startedAt = Date.now();
        latencies.push(startedAt - enqueuedAt);
        return { success: true };
      },
      { concurrency: 10 },
    );

    for (let i = 0; i < JOB_COUNT; i++) {
      await executionQueue.enqueue({
        tenantId: `tenant-latency-${i % 5}`,
        workflowId: `wf-${i}`,
        executionId: `exec-latency-${i}`,
        triggerType: 'manual',
        planTier: 'pro',
        inputData: { enqueuedAt: Date.now() },
      });
    }

    // Wait for completion
    const deadline = Date.now() + 15_000;
    while (latencies.length < JOB_COUNT && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    await worker.close();

    // Calculate P95
    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95Latency = latencies[p95Index];

    console.log(`Latency Results:`);
    console.log(`  Min: ${latencies[0]}ms`);
    console.log(`  Median: ${latencies[Math.floor(latencies.length / 2)]}ms`);
    console.log(`  P95: ${p95Latency}ms`);
    console.log(`  Max: ${latencies[latencies.length - 1]}ms`);

    expect(p95Latency).toBeLessThan(500);
  }, 30_000);

  it('should enforce rate limits under concurrent load', async () => {
    const tenantId = 'tenant-rate-load';
    executionQueue.setTenantLimits(tenantId, {
      maxConcurrent: 3,
      maxPerMinute: 20,
      maxWorkflowTimeoutMs: 300_000,
      maxNodeTimeoutMs: 60_000,
    });

    const worker = executionQueue.createWorker(
      async (job) => {
        await new Promise(r => setTimeout(r, 200)); // Simulate work
        return { success: true };
      },
      { concurrency: 10 },
    );

    // Try to enqueue 30 jobs rapidly
    let accepted = 0;
    let rejected = 0;
    for (let i = 0; i < 30; i++) {
      const ok = await executionQueue.tryEnqueue({
        tenantId,
        workflowId: `wf-${i}`,
        executionId: `exec-rate-load-${i}`,
        triggerType: 'manual',
      });
      if (ok) accepted++;
      else rejected++;
    }

    await worker.close();

    console.log(`Rate Limit Under Load:`);
    console.log(`  Accepted: ${accepted}`);
    console.log(`  Rejected: ${rejected}`);

    // At least some should be rejected due to rate limits
    expect(rejected).toBeGreaterThan(0);
    expect(accepted).toBeLessThanOrEqual(20); // maxPerMinute
  }, 30_000);

  it('should prioritize enterprise executions over free under saturation', async () => {
    const processedOrder: string[] = [];

    // Pause to batch enqueue
    await executionQueue.pause();

    // Enqueue: 10 free, 10 enterprise
    for (let i = 0; i < 10; i++) {
      await executionQueue.enqueue({
        tenantId: `tenant-free-${i}`,
        workflowId: `wf-${i}`,
        executionId: `exec-prio-free-${i}`,
        triggerType: 'manual',
        planTier: 'free',
      });
    }
    for (let i = 0; i < 10; i++) {
      await executionQueue.enqueue({
        tenantId: `tenant-ent-${i}`,
        workflowId: `wf-${i}`,
        executionId: `exec-prio-ent-${i}`,
        triggerType: 'manual',
        planTier: 'enterprise',
      });
    }

    const worker = executionQueue.createWorker(
      async (job) => {
        processedOrder.push(job.data.planTier || 'free');
        return { success: true };
      },
      { concurrency: 1 }, // Process one at a time to observe ordering
    );

    await executionQueue.resume();

    // Wait for all 20 to complete
    const deadline = Date.now() + 15_000;
    while (processedOrder.length < 20 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    await worker.close();

    // First 10 should be enterprise (higher priority)
    const first10 = processedOrder.slice(0, 10);
    const enterpriseInFirst10 = first10.filter(p => p === 'enterprise').length;

    console.log(`Priority Test: First 10 processed: ${first10.join(', ')}`);
    console.log(`Enterprise in first 10: ${enterpriseInFirst10}/10`);

    // At least 8/10 of the first batch should be enterprise
    expect(enterpriseInFirst10).toBeGreaterThanOrEqual(8);
  }, 30_000);
});
```

#### 2. Run tests and verify

```bash
# Ensure Redis is running
docker compose up -d redis

# Run load tests (longer timeout)
pnpm --filter @r360/execution-engine test -- --grep "Load Tests" --timeout 120000
```

#### 3. Performance Benchmarks

| Metric | Target | Acceptable |
|--------|--------|------------|
| Max concurrent executions per tenant (enterprise) | 50 | 30+ |
| P95 execution start latency | <500ms | <1000ms |
| Enqueue throughput | >1000 jobs/sec | >500 jobs/sec |
| Total throughput (120 executions) | <30s | <60s |
| Rate limiting accuracy | 100% | 95%+ |
| Priority ordering accuracy | 80%+ first-batch enterprise | 70%+ |

#### 4. If tests fail:

| Failure | Fix |
|---------|-----|
| `Load test timeout` | Increase worker concurrency, reduce simulated work time, check Redis connection pooling |
| `P95 latency too high` | Tune BullMQ worker options: increase `concurrency`, reduce `lockDuration`, use `drainDelay: 0` |
| `Rate limits not enforced` | The in-memory rate counter may reset between test runs. Use Redis-based rate limiting with `MULTI`/`EXEC` |
| `Priority ordering wrong` | BullMQ processes priorities correctly only when jobs are waiting. Ensure queue is paused before enqueue |
| `Redis OOM` | Increase Redis `maxmemory` or reduce `removeOnComplete.count`. Ensure jobs are cleaned up |

### Success Criteria
- [ ] 100+ concurrent executions complete across 10+ tenants
- [ ] P95 execution start latency < 500ms
- [ ] Enqueue time < 5s for 120 jobs
- [ ] Rate limits enforced under concurrent load
- [ ] Enterprise jobs processed before free jobs under saturation
- [ ] No Redis errors or connection drops under load
- [ ] System recovers after load spike

### Verification Commands
```bash
pnpm --filter @r360/execution-engine test -- --grep "Load" --timeout 120000
# Expected: All load tests pass with printed metrics

# Check Redis memory usage after load test
redis-cli info memory | grep used_memory_human
# Expected: Reasonable memory usage (< 100MB for test data)

# Check for stuck jobs
redis-cli eval "return redis.call('LLEN', KEYS[1])" 1 "bull:r360-workflow-executions:wait"
# Expected: 0 (no waiting jobs after tests complete)
```

---

## Phase Completion Checklist

- [ ] **Step 4.1**: BullMQ job queue with per-tenant rate limiting and priority queues
- [ ] **Step 4.2**: Execution sandboxing with isolated-vm, timeout enforcement
- [ ] **Step 4.3**: Tenant-scoped webhook routing with full lifecycle
- [ ] **Step 4.4**: Cron-based scheduled workflows with timezone support
- [ ] **Step 4.5**: WebSocket real-time execution monitoring
- [ ] **Step 4.6**: Load tests passing with 100+ concurrent executions
- [ ] All tests pass: `pnpm test` from repo root
- [ ] No direct n8n package modifications (Cardinal Rule)
- [ ] Redis connection handles reconnection gracefully
- [ ] Execution queue drains cleanly on shutdown
- [ ] WebSocket server cleans up on client disconnect
- [ ] Scheduler stops cleanly on SIGTERM
- [ ] All new code has TypeScript types (no `any` in production code)

## Rollback Procedure

If Phase 4 introduces instability:

1. **Queue issues**: Drain the BullMQ queue and restart workers:
   ```bash
   redis-cli del bull:r360-workflow-executions:wait
   redis-cli del bull:r360-workflow-executions:active
   # Restart worker processes
   ```

2. **Sandbox issues**: Disable isolated-vm and fall back to direct execution (less secure but functional):
   ```typescript
   // In execution config
   export const SANDBOX_ENABLED = process.env.SANDBOX_ENABLED !== 'false';
   ```

3. **Webhook issues**: Clear webhook registrations and re-register:
   ```sql
   -- Clear all webhook registrations
   DELETE FROM webhooks WHERE is_active = true;
   -- Re-activate workflows to re-register webhooks
   ```

4. **Scheduler issues**: Stop the scheduler service without affecting manual executions:
   ```bash
   # Set environment variable to disable scheduler
   SCHEDULER_ENABLED=false
   ```

5. **WebSocket issues**: WebSocket is non-critical for execution. Disable by not starting WS server:
   ```bash
   WS_ENABLED=false
   ```

6. **Full rollback**: Revert to Phase 3 (direct execution without queuing):
   ```typescript
   // Bypass queue, call execution service directly
   await executionService.execute({
     tenantId,
     workflowId,
     executionId,
     inputData,
   });
   ```

---

## Cross-Phase Integration Notes

### From Phase 3
- `ExecutionService.execute()` is called by `ExecutionWorker.processJob()`
- `TenantCredentialsHelper` is used unchanged
- Lifecycle hooks are extended with monitoring hooks from Step 4.5
- `R360NodeTypes` and DI bootstrap are unchanged

### For Phase 5
- BullMQ queue configuration feeds into billing/metering (execution count tracking)
- Webhook registry will be backed by the `webhooks` DB table (currently in-memory)
- Rate limits will be configured based on Stripe subscription plan tier
- Security tests will verify cross-tenant queue isolation
- Admin dashboard will show queue metrics and active executions

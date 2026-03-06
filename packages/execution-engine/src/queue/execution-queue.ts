import { Queue, QueueEvents, Job } from 'bullmq';
import type { Worker, ConnectionOptions } from 'bullmq';
import {
  type QueueConfig,
  type TenantPlan,
  type TenantLimits,
  getPriorityForPlan,
  getLimitsForPlan,
  createDefaultQueueConfig,
} from './queue-config.js';

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
  private queue!: Queue;
  private queueEvents!: QueueEvents;
  private config: QueueConfig;
  private connection: ConnectionOptions;
  private tenantLimits: Map<string, TenantLimits> = new Map();
  private tenantRateCounters: Map<string, { count: number; windowStart: number }> = new Map();

  constructor(connection: ConnectionOptions, config?: Partial<QueueConfig>) {
    this.connection = connection;
    this.config = { ...createDefaultQueueConfig(), ...config };
  }

  async initialize(): Promise<void> {
    this.queue = new Queue(this.config.queueName, {
      connection: this.connection,
      defaultJobOptions: this.config.defaultJobOptions,
    });
    this.queueEvents = new QueueEvents(this.config.queueName, {
      connection: this.connection,
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
    const windowMs = 60_000;
    const counter = this.tenantRateCounters.get(tenantId);
    if (!counter || now - counter.windowStart >= windowMs) {
      this.tenantRateCounters.set(tenantId, { count: 1, windowStart: now });
      return true;
    }
    if (counter.count >= limits.maxPerMinute) return false;
    counter.count++;
    return true;
  }

  async getActiveCountForTenant(tenantId: string): Promise<number> {
    const jobs = await this.queue.getActive();
    return jobs.filter((j: Job) => (j.data as ExecutionJobData).tenantId === tenantId).length;
  }

  async tryEnqueue(data: ExecutionJobData): Promise<boolean> {
    const limits = this.getTenantLimits(data.tenantId, data.planTier);
    if (!this.checkRateLimit(data.tenantId, limits)) return false;
    const activeCount = await this.getActiveCountForTenant(data.tenantId);
    if (activeCount >= limits.maxConcurrent) return false;
    await this.enqueue(data);
    return true;
  }

  async enqueue(data: ExecutionJobData): Promise<Job> {
    const priority = getPriorityForPlan(data.planTier || 'free');
    const limits = this.getTenantLimits(data.tenantId, data.planTier);
    // Compute effective timeout and store in job data for the worker to enforce.
    // BullMQ v5 does not support per-job timeout in JobsOptions.
    const effectiveTimeout = data.timeoutMs
      ? Math.min(data.timeoutMs, limits.maxWorkflowTimeoutMs)
      : limits.maxWorkflowTimeoutMs;

    return this.queue.add(
      `execute:${data.tenantId}:${data.workflowId}`,
      { ...data, timeoutMs: effectiveTimeout },
      { priority, jobId: data.executionId },
    );
  }

  createWorker(
    processor: (job: Job) => Promise<unknown>,
    options?: { concurrency?: number },
  ): Worker {
    // Dynamic import to avoid circular deps - Worker is from bullmq
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Worker: BullWorker } = require('bullmq') as typeof import('bullmq');
    return new BullWorker(
      this.config.queueName,
      processor,
      {
        connection: this.connection,
        concurrency: options?.concurrency || 5,
      },
    );
  }

  onCompleted(handler: (job: Job) => void): void {
    this.queueEvents.on('completed', async ({ jobId }) => {
      const job = await Job.fromId(this.queue, jobId);
      if (job) handler(job);
    });
  }

  onFailed(handler: (job: Job | undefined, error: Error) => void): void {
    this.queueEvents.on('failed', async ({ jobId, failedReason }) => {
      const job = jobId ? await Job.fromId(this.queue, jobId) : undefined;
      handler(job ?? undefined, new Error(failedReason));
    });
  }
}

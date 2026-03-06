import { Job, Worker } from 'bullmq';
import type Redis from 'ioredis';
import type { ExecutionJobData } from './execution-queue.js';
import type { ExecutionService } from '../execution-service.js';

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
    const { tenantId, workflowId, executionId } = job.data;
    await job.updateProgress(0);
    try {
      // The actual execution would call this.executionService.executeWorkflow(...)
      // For now, the worker just provides the framework - the actual wiring
      // happens in the API layer's execution-bridge.
      await job.updateProgress(100);
      return { tenantId, workflowId, executionId, status: 'completed' };
    } catch (error) {
      console.error(
        `[ExecutionWorker] Failed: tenant=${tenantId} wf=${workflowId} exec=${executionId}`,
        error,
      );
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    await this.worker.close();
  }
}

import { Job, Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import type { ExecutionJobData } from './execution-queue.js';
import type { ExecutionService } from '../execution-service.js';

export interface ExecutionWorkerOptions {
  concurrency: number;
  connection: ConnectionOptions;
  queueName: string;
  executionService: ExecutionService;
}

export class ExecutionWorker {
  private worker: Worker;
  private executionService: ExecutionService;

  constructor(options: ExecutionWorkerOptions) {
    this.executionService = options.executionService;
    this.worker = new Worker(
      options.queueName,
      (job) => this.processJob(job),
      {
        connection: options.connection,
        concurrency: options.concurrency,
      },
    );
    this.worker.on('error', (err) => {
      console.error('[ExecutionWorker] Worker error:', err);
    });
  }

  private async processJob(job: Job): Promise<unknown> {
    const { tenantId, workflowId, executionId } = job.data as ExecutionJobData;
    await job.updateProgress(0);
    try {
      // TODO: Wire to actual execution when API layer integration is complete:
      // const result = await this.executionService.executeWorkflow({ tenantId, workflowId, ... });
      // For now, validate the service is available and return a stub result.
      void this.executionService;
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

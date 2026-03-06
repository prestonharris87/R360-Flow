import crypto from 'node:crypto';
import { CronEvaluator } from './cron-evaluator.js';

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
        }
      } catch (error) {
        console.error(`[Scheduler] Error processing workflow ${workflow.id}:`, error);
      }
    }
  }

  start(pollIntervalMs: number = 30_000): void {
    if (this.intervalHandle) throw new Error('Scheduler is already running');
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
    }
  }

  isRunning(): boolean {
    return this.intervalHandle !== null;
  }
}

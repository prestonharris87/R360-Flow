import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SchedulerService } from '../../scheduler/scheduler-service.js';
import type {
  SchedulerDb,
  SchedulerExecutionQueue,
  ScheduledWorkflow,
} from '../../scheduler/scheduler-service.js';

function createMockDb(workflows: ScheduledWorkflow[] = []): SchedulerDb {
  return {
    getActiveScheduledWorkflows: vi.fn().mockResolvedValue(workflows),
    updateLastRunAt: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockQueue(): SchedulerExecutionQueue {
  return {
    enqueue: vi.fn().mockResolvedValue({ id: 'job-1' }),
  };
}

describe('SchedulerService', () => {
  let db: SchedulerDb;
  let queue: SchedulerExecutionQueue;
  let scheduler: SchedulerService;

  beforeEach(() => {
    db = createMockDb();
    queue = createMockQueue();
    scheduler = new SchedulerService(db, queue);
  });

  afterEach(() => {
    scheduler.stop();
    vi.restoreAllMocks();
  });

  describe('checkAndEnqueue', () => {
    it('enqueues due workflows', async () => {
      const now = new Date('2025-06-15T12:06:00.000Z');
      // "*/5 * * * *" at 12:06 -> prev is 12:05, lastRunAt is 12:00 -> due
      const workflow: ScheduledWorkflow = {
        id: 'wf-1',
        tenantId: 'tenant-1',
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        lastRunAt: new Date('2025-06-15T12:00:00.000Z'),
      };

      db = createMockDb([workflow]);
      queue = createMockQueue();
      scheduler = new SchedulerService(db, queue);

      await scheduler.checkAndEnqueue(now);

      expect(queue.enqueue).toHaveBeenCalledTimes(1);
      const call = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.tenantId).toBe('tenant-1');
      expect(call.workflowId).toBe('wf-1');
      expect(call.triggerType).toBe('schedule');
      expect(call.executionId).toMatch(/^exec-sched-/);
    });

    it('updates lastRunAt after enqueueing', async () => {
      const now = new Date('2025-06-15T12:06:00.000Z');
      const workflow: ScheduledWorkflow = {
        id: 'wf-1',
        tenantId: 'tenant-1',
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        lastRunAt: null,
      };

      db = createMockDb([workflow]);
      queue = createMockQueue();
      scheduler = new SchedulerService(db, queue);

      await scheduler.checkAndEnqueue(now);

      expect(db.updateLastRunAt).toHaveBeenCalledTimes(1);
      expect(db.updateLastRunAt).toHaveBeenCalledWith('wf-1', now);
    });

    it('skips workflows that are not due', async () => {
      const now = new Date('2025-06-15T12:06:00.000Z');
      // "*/5 * * * *" at 12:06 -> prev is 12:05, lastRunAt is 12:05 -> NOT due
      const workflow: ScheduledWorkflow = {
        id: 'wf-1',
        tenantId: 'tenant-1',
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        lastRunAt: new Date('2025-06-15T12:05:00.000Z'),
      };

      db = createMockDb([workflow]);
      queue = createMockQueue();
      scheduler = new SchedulerService(db, queue);

      await scheduler.checkAndEnqueue(now);

      expect(queue.enqueue).not.toHaveBeenCalled();
      expect(db.updateLastRunAt).not.toHaveBeenCalled();
    });

    it('continues processing remaining workflows when one throws', async () => {
      const now = new Date('2025-06-15T12:06:00.000Z');
      const workflow1: ScheduledWorkflow = {
        id: 'wf-fail',
        tenantId: 'tenant-1',
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        lastRunAt: new Date('2025-06-15T12:00:00.000Z'),
      };
      const workflow2: ScheduledWorkflow = {
        id: 'wf-ok',
        tenantId: 'tenant-2',
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        lastRunAt: new Date('2025-06-15T12:00:00.000Z'),
      };

      db = createMockDb([workflow1, workflow2]);
      queue = createMockQueue();
      // First call to enqueue throws, second succeeds
      (queue.enqueue as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Queue failure'))
        .mockResolvedValueOnce({ id: 'job-2' });
      scheduler = new SchedulerService(db, queue);

      // Suppress console.error output during the test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await scheduler.checkAndEnqueue(now);

      // First workflow failed, but second was still enqueued
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      const secondCall = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls[1]![0];
      expect(secondCall.workflowId).toBe('wf-ok');
      expect(secondCall.tenantId).toBe('tenant-2');

      // updateLastRunAt should have been called for the second workflow only
      // (the first threw before reaching updateLastRunAt)
      expect(db.updateLastRunAt).toHaveBeenCalledTimes(1);
      expect(db.updateLastRunAt).toHaveBeenCalledWith('wf-ok', now);

      consoleSpy.mockRestore();
    });
  });

  describe('start/stop', () => {
    it('polls on the configured interval using fake timers', async () => {
      vi.useFakeTimers();

      const now = new Date('2025-06-15T12:06:00.000Z');
      vi.setSystemTime(now);

      const workflow: ScheduledWorkflow = {
        id: 'wf-1',
        tenantId: 'tenant-1',
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        lastRunAt: new Date('2025-06-15T12:00:00.000Z'),
      };

      db = createMockDb([workflow]);
      queue = createMockQueue();
      scheduler = new SchedulerService(db, queue);

      scheduler.start(1000);

      // No calls yet (setInterval fires after first interval)
      expect(queue.enqueue).not.toHaveBeenCalled();

      // Advance by 1 second to trigger first poll
      await vi.advanceTimersByTimeAsync(1000);
      expect(queue.enqueue).toHaveBeenCalledTimes(1);

      // Advance by another second to trigger second poll
      await vi.advanceTimersByTimeAsync(1000);
      expect(queue.enqueue).toHaveBeenCalledTimes(2);

      scheduler.stop();

      // Advance again -- should NOT trigger another poll
      await vi.advanceTimersByTimeAsync(1000);
      expect(queue.enqueue).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('throws if start is called while already running', () => {
      scheduler.start(5000);

      expect(() => scheduler.start(5000)).toThrow('Scheduler is already running');
    });
  });

  describe('isRunning', () => {
    it('returns false before start', () => {
      expect(scheduler.isRunning()).toBe(false);
    });

    it('returns true after start', () => {
      scheduler.start(5000);
      expect(scheduler.isRunning()).toBe(true);
    });

    it('returns false after stop', () => {
      scheduler.start(5000);
      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });
  });
});

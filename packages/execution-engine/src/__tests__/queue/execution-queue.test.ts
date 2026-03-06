import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionJobData } from '../../queue/execution-queue.js';

// ----- BullMQ mocks -----
const mockAdd = vi.fn();
const mockGetActive = vi.fn();
const mockDrain = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockQueueClose = vi.fn();
const mockQueueEventsClose = vi.fn();
const mockQueueEventsOn = vi.fn();
const mockFromId = vi.fn();

vi.mock('bullmq', () => {
  const QueueMock = vi.fn().mockImplementation(() => ({
    add: mockAdd,
    getActive: mockGetActive,
    drain: mockDrain,
    pause: mockPause,
    resume: mockResume,
    close: mockQueueClose,
  }));

  const QueueEventsMock = vi.fn().mockImplementation(() => ({
    on: mockQueueEventsOn,
    close: mockQueueEventsClose,
  }));

  const JobMock = {
    fromId: mockFromId,
  };

  const WorkerMock = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  }));

  return { Queue: QueueMock, QueueEvents: QueueEventsMock, Job: JobMock, Worker: WorkerMock };
});

// Mock Redis
const mockDuplicate = vi.fn().mockReturnValue({});
const mockRedis = { duplicate: mockDuplicate } as never;

// Dynamic import after mocks are set up
const { ExecutionQueue } = await import('../../queue/execution-queue.js');

function createJobData(overrides: Partial<ExecutionJobData> = {}): ExecutionJobData {
  return {
    tenantId: 'tenant-1',
    workflowId: 'wf-1',
    executionId: 'exec-1',
    triggerType: 'manual',
    ...overrides,
  };
}

describe('ExecutionQueue', () => {
  let queue: InstanceType<typeof ExecutionQueue>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetActive.mockResolvedValue([]);
    mockAdd.mockResolvedValue({ id: 'exec-1', data: createJobData() });

    queue = new ExecutionQueue(mockRedis);
    await queue.initialize();
  });

  describe('enqueue', () => {
    it('should enqueue a job with correct data and return it', async () => {
      const data = createJobData();
      const fakeJob = { id: data.executionId, data };
      mockAdd.mockResolvedValueOnce(fakeJob);

      const job = await queue.enqueue(data);

      expect(job).toBe(fakeJob);
      expect(mockAdd).toHaveBeenCalledWith(
        `execute:${data.tenantId}:${data.workflowId}`,
        data,
        expect.objectContaining({
          priority: 10, // free plan default
          jobId: data.executionId,
        }),
      );
    });

    it('should assign priority 1 for enterprise plan', async () => {
      const data = createJobData({ planTier: 'enterprise' });
      await queue.enqueue(data);

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        data,
        expect.objectContaining({ priority: 1 }),
      );
    });

    it('should assign priority 5 for pro plan', async () => {
      const data = createJobData({ planTier: 'pro' });
      await queue.enqueue(data);

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        data,
        expect.objectContaining({ priority: 5 }),
      );
    });

    it('should assign priority 10 for free plan', async () => {
      const data = createJobData({ planTier: 'free' });
      await queue.enqueue(data);

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        data,
        expect.objectContaining({ priority: 10 }),
      );
    });

    it('should cap timeout to plan max when custom timeout exceeds limit', async () => {
      const data = createJobData({
        planTier: 'free',
        timeoutMs: 999_999_999, // Way over the 300_000 free limit
      });
      await queue.enqueue(data);

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        data,
        expect.objectContaining({ timeout: 300_000 }),
      );
    });

    it('should use custom timeout when under plan limit', async () => {
      const data = createJobData({
        planTier: 'free',
        timeoutMs: 60_000, // Under the 300_000 free limit
      });
      await queue.enqueue(data);

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        data,
        expect.objectContaining({ timeout: 60_000 }),
      );
    });

    it('should use plan max timeout when no custom timeout provided', async () => {
      const data = createJobData({ planTier: 'pro' });
      await queue.enqueue(data);

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        data,
        expect.objectContaining({ timeout: 900_000 }),
      );
    });
  });

  describe('tryEnqueue', () => {
    it('should enqueue successfully when under all limits', async () => {
      mockGetActive.mockResolvedValueOnce([]);
      const data = createJobData();

      const result = await queue.tryEnqueue(data);

      expect(result).toBe(true);
      expect(mockAdd).toHaveBeenCalled();
    });

    it('should reject when rate limit is exceeded', async () => {
      const data = createJobData({ planTier: 'free' });
      // Free plan: maxPerMinute = 10
      // Enqueue 10 times to fill up rate window
      for (let i = 0; i < 10; i++) {
        mockGetActive.mockResolvedValueOnce([]);
        await queue.tryEnqueue({ ...data, executionId: `exec-${i}` });
      }

      // 11th should be rejected
      const result = await queue.tryEnqueue({ ...data, executionId: 'exec-overflow' });
      expect(result).toBe(false);
    });

    it('should reject when concurrency limit is reached', async () => {
      const data = createJobData({ planTier: 'free' });
      // Free plan: maxConcurrent = 2
      // Simulate 2 active jobs for this tenant
      mockGetActive.mockResolvedValueOnce([
        { data: { tenantId: 'tenant-1' } },
        { data: { tenantId: 'tenant-1' } },
      ]);

      const result = await queue.tryEnqueue(data);

      expect(result).toBe(false);
    });

    it('should allow enqueue when other tenant has active jobs', async () => {
      const data = createJobData({ planTier: 'free', tenantId: 'tenant-1' });
      // Active jobs belong to a DIFFERENT tenant
      mockGetActive.mockResolvedValueOnce([
        { data: { tenantId: 'tenant-OTHER' } },
        { data: { tenantId: 'tenant-OTHER' } },
      ]);

      const result = await queue.tryEnqueue(data);

      expect(result).toBe(true);
    });
  });

  describe('setTenantLimits', () => {
    it('should override default limits for a tenant', async () => {
      queue.setTenantLimits('tenant-custom', {
        maxConcurrent: 100,
        maxPerMinute: 500,
      });

      const data = createJobData({ tenantId: 'tenant-custom', planTier: 'free' });

      // With custom limits allowing 100 concurrent, even 2 active should pass
      mockGetActive.mockResolvedValueOnce([
        { data: { tenantId: 'tenant-custom' } },
        { data: { tenantId: 'tenant-custom' } },
      ]);

      const result = await queue.tryEnqueue(data);
      expect(result).toBe(true);
    });

    it('should merge partial limits with defaults', async () => {
      queue.setTenantLimits('tenant-partial', { maxConcurrent: 999 });

      // The merged limits should have maxConcurrent=999 but keep free defaults for rest
      // Verify by attempting enqueue - the timeout should still cap at free default
      const data = createJobData({
        tenantId: 'tenant-partial',
        planTier: 'free',
        timeoutMs: 999_999,
      });
      mockGetActive.mockResolvedValueOnce([]);
      await queue.tryEnqueue(data);

      // Timeout should be capped at the free plan default (300_000)
      // because setTenantLimits merges with free defaults for maxWorkflowTimeoutMs
      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        data,
        expect.objectContaining({ timeout: 300_000 }),
      );
    });
  });

  describe('getActiveCountForTenant', () => {
    it('should count only jobs for the specified tenant', async () => {
      mockGetActive.mockResolvedValueOnce([
        { data: { tenantId: 'tenant-1' } },
        { data: { tenantId: 'tenant-2' } },
        { data: { tenantId: 'tenant-1' } },
        { data: { tenantId: 'tenant-3' } },
      ]);

      const count = await queue.getActiveCountForTenant('tenant-1');
      expect(count).toBe(2);
    });

    it('should return 0 when no active jobs for tenant', async () => {
      mockGetActive.mockResolvedValueOnce([
        { data: { tenantId: 'tenant-other' } },
      ]);

      const count = await queue.getActiveCountForTenant('tenant-1');
      expect(count).toBe(0);
    });
  });

  describe('lifecycle', () => {
    it('should shutdown queue and events', async () => {
      await queue.shutdown();

      expect(mockQueueEventsClose).toHaveBeenCalled();
      expect(mockQueueClose).toHaveBeenCalled();
    });

    it('should drain the queue', async () => {
      await queue.drain();
      expect(mockDrain).toHaveBeenCalled();
    });

    it('should pause and resume the queue', async () => {
      await queue.pause();
      expect(mockPause).toHaveBeenCalled();

      await queue.resume();
      expect(mockResume).toHaveBeenCalled();
    });
  });

  describe('event handlers', () => {
    it('should register completed handler via queueEvents', () => {
      const handler = vi.fn();
      queue.onCompleted(handler);

      expect(mockQueueEventsOn).toHaveBeenCalledWith('completed', expect.any(Function));
    });

    it('should register failed handler via queueEvents', () => {
      const handler = vi.fn();
      queue.onFailed(handler);

      expect(mockQueueEventsOn).toHaveBeenCalledWith('failed', expect.any(Function));
    });
  });
});

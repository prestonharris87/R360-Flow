import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IRun, IDataObject, IRunExecutionData, ITaskData } from 'n8n-workflow';
import { ExecutionLifecycleHooks } from 'n8n-core';
import type { IWorkflowBase, Workflow } from 'n8n-workflow';

// Mock DB stores
const mockExecutionStore = {
  create: vi.fn(),
  update: vi.fn(),
};
const mockStepStore = {
  create: vi.fn(),
};

vi.mock('@r360/db', () => ({
  executionStore: mockExecutionStore,
  executionStepStore: mockStepStore,
}));

describe('createTenantLifecycleHooks', () => {
  const tenantId = 'tenant-hook-test';
  const executionId = 'exec-001';
  const workflowData: IWorkflowBase = {
    id: 'wf-001',
    name: 'Test WF',
    nodes: [],
    connections: {},
    active: false,
    settings: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates hooks with all required handler types', async () => {
    const { createTenantLifecycleHooks } = await import('../lifecycle-hooks');

    const hooks = createTenantLifecycleHooks({
      tenantId,
      executionId,
      workflowData,
      mode: 'manual',
    });

    expect(hooks).toBeInstanceOf(ExecutionLifecycleHooks);
    expect(hooks.handlers.workflowExecuteBefore.length).toBeGreaterThan(0);
    expect(hooks.handlers.workflowExecuteAfter.length).toBeGreaterThan(0);
    expect(hooks.handlers.nodeExecuteBefore.length).toBeGreaterThan(0);
    expect(hooks.handlers.nodeExecuteAfter.length).toBeGreaterThan(0);
  });

  it('workflowExecuteBefore handler writes execution start to DB', async () => {
    const { createTenantLifecycleHooks } = await import('../lifecycle-hooks');

    const hooks = createTenantLifecycleHooks({
      tenantId,
      executionId,
      workflowData,
      mode: 'manual',
    });

    const mockWorkflow = { id: 'wf-001' } as Workflow;
    await hooks.runHook('workflowExecuteBefore', [mockWorkflow]);

    expect(mockExecutionStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: executionId,
        tenant_id: tenantId,
        workflow_id: 'wf-001',
        status: 'running',
      })
    );
  });

  it('workflowExecuteAfter handler writes completion to DB', async () => {
    const { createTenantLifecycleHooks } = await import('../lifecycle-hooks');

    const hooks = createTenantLifecycleHooks({
      tenantId,
      executionId,
      workflowData,
      mode: 'manual',
    });

    const mockRunData: IRun = {
      finished: true,
      status: 'success',
      mode: 'manual',
      startedAt: new Date(),
      data: { resultData: { runData: {}, lastNodeExecuted: 'Set Data' } },
    } as IRun;

    await hooks.runHook('workflowExecuteAfter', [mockRunData, {}]);

    expect(mockExecutionStore.update).toHaveBeenCalledWith(
      executionId,
      expect.objectContaining({
        status: 'success',
        tenant_id: tenantId,
      })
    );
  });

  it('nodeExecuteAfter handler writes step data to DB', async () => {
    const { createTenantLifecycleHooks } = await import('../lifecycle-hooks');

    const hooks = createTenantLifecycleHooks({
      tenantId,
      executionId,
      workflowData,
      mode: 'manual',
    });

    const mockTaskData = {
      executionStatus: 'success',
      startTime: Date.now(),
      data: { main: [[{ json: { result: 'ok' } }]] },
    } as unknown as ITaskData;

    await hooks.runHook('nodeExecuteAfter', [
      'Set Data',
      mockTaskData,
      {} as IRunExecutionData,
    ]);

    expect(mockStepStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        execution_id: executionId,
        tenant_id: tenantId,
        node_id: 'Set Data',
      })
    );
  });

  it('all hooks include tenant_id in DB writes', async () => {
    const { createTenantLifecycleHooks } = await import('../lifecycle-hooks');

    const hooks = createTenantLifecycleHooks({
      tenantId: 'tenant-isolation-check',
      executionId,
      workflowData,
      mode: 'manual',
    });

    await hooks.runHook('workflowExecuteBefore', [{ id: 'wf-1' } as Workflow]);

    const createCall = mockExecutionStore.create.mock.calls[0][0];
    expect(createCall.tenant_id).toBe('tenant-isolation-check');
  });

  it('workflowExecuteAfter marks failed executions as error', async () => {
    const { createTenantLifecycleHooks } = await import('../lifecycle-hooks');

    const hooks = createTenantLifecycleHooks({
      tenantId,
      executionId,
      workflowData,
      mode: 'manual',
    });

    const mockRunData: IRun = {
      finished: false,
      status: 'error',
      mode: 'manual',
      startedAt: new Date(),
      data: {
        resultData: {
          runData: {},
          lastNodeExecuted: 'Set Data',
          error: { message: 'Something went wrong' } as unknown as Error,
        },
      },
    } as IRun;

    await hooks.runHook('workflowExecuteAfter', [mockRunData, {}]);

    expect(mockExecutionStore.update).toHaveBeenCalledWith(
      executionId,
      expect.objectContaining({
        status: 'error',
        tenant_id: tenantId,
        error: 'Something went wrong',
      })
    );
  });

  it('nodeExecuteBefore handler creates step record with running status', async () => {
    const { createTenantLifecycleHooks } = await import('../lifecycle-hooks');

    const hooks = createTenantLifecycleHooks({
      tenantId,
      executionId,
      workflowData,
      mode: 'manual',
    });

    await hooks.runHook('nodeExecuteBefore', [
      'ManualTrigger',
      {} as any,
    ]);

    expect(mockStepStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        execution_id: executionId,
        tenant_id: tenantId,
        node_id: 'ManualTrigger',
        status: 'running',
      })
    );
  });
});

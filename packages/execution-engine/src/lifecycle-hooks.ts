import type {
  IRun,
  IDataObject,
  ITaskData,
  IRunExecutionData,
  IWorkflowBase,
  WorkflowExecuteMode,
  ITaskStartedData,
} from 'n8n-workflow';
import type { Workflow } from 'n8n-workflow';
import { ExecutionLifecycleHooks } from 'n8n-core';

import { executionStore, executionStepStore } from '@r360/db';

export interface CreateHooksParams {
  tenantId: string;
  executionId: string;
  workflowData: IWorkflowBase;
  mode: WorkflowExecuteMode;
}

/**
 * Create tenant-scoped lifecycle hooks for a workflow execution.
 *
 * Every hook handler writes to tenant-scoped database rows,
 * ensuring execution data is never mixed between tenants.
 *
 * Hook execution order during a normal run:
 *   1. workflowExecuteBefore  (once, at start)
 *   2. nodeExecuteBefore      (per node, before execution)
 *   3. nodeExecuteAfter       (per node, after execution)
 *   4. ... repeat 2-3 for each node ...
 *   5. workflowExecuteAfter   (once, at end)
 */
export function createTenantLifecycleHooks(
  params: CreateHooksParams
): ExecutionLifecycleHooks {
  const { tenantId, executionId, workflowData, mode } = params;

  const hooks = new ExecutionLifecycleHooks(mode, executionId, workflowData);

  // --- workflowExecuteBefore ---
  // Record execution start in the executions table
  hooks.addHandler('workflowExecuteBefore', async function (workflow: Workflow) {
    await executionStore.create({
      id: executionId,
      tenant_id: tenantId,
      workflow_id: workflow.id,
      status: 'running',
      started_at: new Date(),
      context_json: null,
      error: null,
    });
  });

  // --- nodeExecuteBefore ---
  // Record that a node has started executing
  hooks.addHandler(
    'nodeExecuteBefore',
    async function (nodeName: string, _data: ITaskStartedData) {
      await executionStepStore.create({
        execution_id: executionId,
        tenant_id: tenantId,
        node_id: nodeName,
        status: 'running',
        started_at: new Date(),
        input_json: null,
        output_json: null,
      });
    }
  );

  // --- nodeExecuteAfter ---
  // Record node execution result with output data
  hooks.addHandler(
    'nodeExecuteAfter',
    async function (
      nodeName: string,
      taskData: ITaskData,
      _executionData: IRunExecutionData
    ) {
      await executionStepStore.create({
        execution_id: executionId,
        tenant_id: tenantId,
        node_id: nodeName,
        status: taskData.executionStatus || 'success',
        input_json: JSON.stringify(taskData.data),
        output_json: JSON.stringify(taskData.data),
        started_at: taskData.startTime
          ? new Date(taskData.startTime)
          : new Date(),
        finished_at: new Date(),
      });
    }
  );

  // --- workflowExecuteAfter ---
  // Record final execution status and full result data
  hooks.addHandler(
    'workflowExecuteAfter',
    async function (fullRunData: IRun, _newStaticData: IDataObject) {
      await executionStore.update(executionId, {
        tenant_id: tenantId,
        status: fullRunData.status || (fullRunData.finished ? 'success' : 'error'),
        finished_at: new Date(),
        context_json: JSON.stringify(fullRunData.data),
        error: fullRunData.data.resultData.error?.message || null,
      });
    }
  );

  return hooks;
}

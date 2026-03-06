import { randomUUID } from 'node:crypto';
import {
  Workflow,
  ApplicationError,
  type INode,
  type IConnections,
  type IRun,
  type IWorkflowExecuteAdditionalData,
  type IWorkflowSettings,
  type IDataObject,
  type WorkflowExecuteMode,
  type IRunExecutionData,
  type IWorkflowBase,
  type ExecuteWorkflowOptions,
  type IExecuteWorkflowInfo,
  type AiEvent,
} from 'n8n-workflow';
import { WorkflowExecute, ExecutionLifecycleHooks } from 'n8n-core';

import type { R360NodeTypes } from './node-types.js';
import { TenantCredentialsHelper } from './credentials-helper.js';

export interface ExecuteWorkflowParams {
  tenantId: string;
  workflowJson: {
    id?: string;
    name?: string;
    nodes: INode[];
    connections: IConnections;
    active: boolean;
    settings?: IWorkflowSettings;
  };
  mode: WorkflowExecuteMode;
  /** Optional callback for lifecycle hook events (useful for testing/monitoring) */
  onHookEvent?: (event: string, data?: unknown) => void;
}

/**
 * ExecutionService orchestrates workflow execution with tenant isolation.
 *
 * For each execution it:
 * 1. Validates tenant context
 * 2. Constructs a Workflow object from translated JSON
 * 3. Creates a tenant-scoped TenantCredentialsHelper
 * 4. Builds IWorkflowExecuteAdditionalData with all required fields
 * 5. Sets up ExecutionLifecycleHooks for result persistence
 * 6. Calls WorkflowExecute.run() and returns the result
 *
 * IMPORTANT: The execution engine (n8n packages) is tenant-UNAWARE.
 * All tenant context is injected via additionalData at call time.
 */
export class ExecutionService {
  constructor(private readonly nodeTypes: R360NodeTypes) {}

  /**
   * Execute a workflow with full tenant isolation.
   *
   * @param params - Execution parameters including tenant ID and workflow JSON
   * @returns The complete execution result (IRun)
   */
  async executeWorkflow(params: ExecuteWorkflowParams): Promise<IRun> {
    const { tenantId, workflowJson, mode, onHookEvent } = params;

    // 1. Validate tenant context
    if (!tenantId || tenantId.trim() === '') {
      throw new ApplicationError(
        'Tenant ID is required for workflow execution',
        { extra: { tenantId } },
      );
    }

    // 2. Generate execution ID
    const executionId = randomUUID();

    // 3. Construct the Workflow object
    const workflow = new Workflow({
      id: workflowJson.id || randomUUID(),
      name: workflowJson.name || 'Untitled Workflow',
      nodes: workflowJson.nodes,
      connections: workflowJson.connections,
      active: workflowJson.active,
      nodeTypes: this.nodeTypes,
      staticData: {},
      settings: workflowJson.settings || { executionOrder: 'v1' },
    });

    // 4. Create tenant-scoped credentials helper
    const masterKey =
      process.env.MASTER_ENCRYPTION_KEY || 'default-dev-key-change-in-prod';
    const credentialsHelper = new TenantCredentialsHelper(tenantId, masterKey);

    // 5. Build lifecycle hooks
    const workflowData: IWorkflowBase = {
      id: workflow.id,
      name: workflow.name || 'Untitled',
      nodes: workflowJson.nodes,
      connections: workflowJson.connections,
      active: workflowJson.active,
      settings: workflowJson.settings || {},
    };

    const hooks = new ExecutionLifecycleHooks(mode, executionId, workflowData);

    // Register lifecycle hook handlers
    hooks.addHandler('workflowExecuteBefore', async function (_wf) {
      onHookEvent?.('workflowExecuteBefore', { workflowId: workflow.id });
      // TODO: Write execution start to DB once @r360/db stores are wired up
      // await executionStore.create({
      //   id: executionId,
      //   tenant_id: tenantId,
      //   workflow_id: workflow.id,
      //   status: 'running',
      //   started_at: new Date(),
      // });
    });

    hooks.addHandler('nodeExecuteBefore', async function (nodeName, _data) {
      onHookEvent?.('nodeExecuteBefore', { nodeName });
      // TODO: Write step start to DB
    });

    hooks.addHandler(
      'nodeExecuteAfter',
      async function (nodeName, taskData, _executionData) {
        onHookEvent?.('nodeExecuteAfter', { nodeName, taskData });
        // TODO: Write step result to DB
        // await executionStepStore.create({
        //   execution_id: executionId,
        //   tenant_id: tenantId,
        //   node_id: nodeName,
        //   status: taskData.executionStatus || 'success',
        //   input_json: JSON.stringify(taskData.data),
        //   output_json: JSON.stringify(taskData.data),
        //   started_at: taskData.startTime ? new Date(taskData.startTime) : new Date(),
        //   finished_at: new Date(),
        // });
      },
    );

    hooks.addHandler('workflowExecuteAfter', async function (fullRunData, _newStaticData) {
      onHookEvent?.('workflowExecuteAfter', {
        status: fullRunData.status,
        finished: fullRunData.finished,
      });
      // TODO: Write execution completion to DB
      // await executionStore.update(executionId, {
      //   tenant_id: tenantId,
      //   status: fullRunData.status || (fullRunData.finished ? 'success' : 'error'),
      //   finished_at: new Date(),
      //   context_json: JSON.stringify(fullRunData.data),
      //   error: fullRunData.data.resultData.error?.message || null,
      // });
    });

    // 6. Build IWorkflowExecuteAdditionalData
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const webhookBaseUrl =
      process.env.WEBHOOK_BASE_URL || 'http://localhost:3000/webhook';

    const additionalData: IWorkflowExecuteAdditionalData = {
      // Tenant-scoped credentials helper
      credentialsHelper,

      // Sub-workflow execution (for Execute Workflow nodes)
      executeWorkflow: async (
        _workflowInfo: IExecuteWorkflowInfo,
        _additionalData: IWorkflowExecuteAdditionalData,
        _options: ExecuteWorkflowOptions,
      ) => {
        // TODO: Implement sub-workflow execution with same tenant context
        throw new ApplicationError('Sub-workflow execution not yet implemented');
      },

      // Execution data retrieval (for wait/resume)
      getRunExecutionData: async (_execId: string): Promise<IRunExecutionData | undefined> => {
        // TODO: Retrieve from DB
        return undefined;
      },

      // Execution identity
      executionId,
      currentNodeExecutionIndex: 0,

      // URL configuration (tenant-prefixed)
      restApiUrl: `${baseUrl}/api`,
      instanceBaseUrl: baseUrl,
      formWaitingBaseUrl: `${baseUrl}/form-waiting/${tenantId}`,
      webhookBaseUrl: `${webhookBaseUrl}/${tenantId}`,
      webhookWaitingBaseUrl: `${webhookBaseUrl}/waiting/${tenantId}`,
      webhookTestBaseUrl: `${webhookBaseUrl}/test/${tenantId}`,

      // Tenant-specific variables
      variables: {},

      // AI event logging
      logAiEvent: (_eventName: AiEvent, _payload: { msg: string; workflowName: string; executionId: string; nodeName: string; workflowId?: string; nodeType?: string }) => {
        // TODO: Implement AI event logging
      },

      // Lifecycle hooks
      hooks,

      // Execution status updates
      setExecutionStatus: (status) => {
        onHookEvent?.('executionStatus', { status });
      },

      // UI data push (for real-time updates)
      sendDataToUI: (type, data) => {
        onHookEvent?.('sendDataToUI', { type, data });
      },

      // Runner task support (for code execution nodes)
      startRunnerTask: async () => {
        throw new ApplicationError('Runner tasks not yet implemented');
      },

      // User context
      userId: tenantId, // Map tenant to user context
    };

    // 7. Execute the workflow
    const workflowExecute = new WorkflowExecute(additionalData, mode);

    const startNode = workflow.getStartNode();
    if (!startNode) {
      throw new ApplicationError(
        'Workflow has no start node (trigger or manual trigger required)',
        { extra: { workflowId: workflow.id } },
      );
    }

    const executionPromise = workflowExecute.run({ workflow, startNode });

    // 8. Await and return the result
    const result: IRun = await executionPromise;
    return result;
  }
}

/**
 * Execution Bridge
 *
 * Bridges the API layer and the execution engine.
 *
 * Responsibilities:
 * - Manages a singleton ExecutionService (with its R360NodeTypes)
 * - Translates workflow definitions from DiagramModel or n8n format
 * - Orchestrates workflow execution with tenant-scoped DB persistence
 * - Provides lifecycle callbacks that write to the executions / execution_steps tables
 */
import {
  ExecutionService,
  R360NodeTypes,
  bootstrapN8nContainer,
  isBootstrapped,
} from '@r360/execution-engine';
import type { CredentialLookupFn } from '@r360/execution-engine';
import { translateWBToN8n } from '@r360/json-translator';
import type { WorkflowParameters } from '@r360/json-translator';
import { getDb } from '@r360/db';
import { executions, executionSteps, credentials } from '@r360/db';
import { eq, and } from 'drizzle-orm';
import type { IRun } from 'n8n-workflow';

let executionService: ExecutionService | null = null;
let nodeTypes: R360NodeTypes | null = null;

/**
 * Ensure the n8n DI container is bootstrapped.
 * Idempotent -- safe to call multiple times.
 */
export async function ensureBootstrapped(): Promise<void> {
  if (isBootstrapped()) return;

  await bootstrapN8nContainer({
    encryptionKey:
      process.env.N8N_ENCRYPTION_KEY ||
      process.env.MASTER_ENCRYPTION_KEY ||
      'default-dev-key-change-in-prod',
    userFolder: process.env.N8N_USER_FOLDER || '/tmp/r360-flow-n8n',
  });
}

/**
 * Credential lookup function that queries the DB by tenant_id and credential id.
 *
 * The Drizzle schema uses camelCase JS property names (tenantId, encryptedData)
 * but TenantCredentialsHelper expects snake_case (tenant_id, encrypted_data),
 * so we map the result accordingly.
 */
const credentialLookupFn: CredentialLookupFn = async (tenantId, credentialId) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(credentials)
    .where(
      and(
        eq(credentials.tenantId, tenantId),
        eq(credentials.id, credentialId)
      )
    );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    type: row.type,
    encrypted_data: row.encryptedData,
  };
};

/**
 * Get or create the singleton ExecutionService.
 * Initializes R360NodeTypes and DI bootstrap on first call.
 */
export async function getExecutionService(): Promise<ExecutionService> {
  if (executionService) return executionService;

  // Ensure DI container is ready
  await ensureBootstrapped();

  // Initialize node types (shared across all tenants, loaded once)
  nodeTypes = new R360NodeTypes();
  await nodeTypes.init();

  executionService = new ExecutionService(nodeTypes, credentialLookupFn);
  return executionService;
}

/**
 * Detect whether a workflow definition is already in n8n format
 * (has `nodes` array at top level) or is a DiagramModel
 * that needs translation.
 *
 * Heuristic:
 * - If the definition has a top-level `nodes` array, treat it as n8n format
 *   (defaulting `connections` to `{}` if absent).
 * - If it has a `diagram` property (DiagramModel envelope), translate via
 *   translateWBToN8n.
 * - Otherwise, attempt translation as a DiagramModel (will throw if invalid).
 *
 * Returns n8n WorkflowParameters in all cases.
 */
export function translateIfNeeded(
  definitionJson: Record<string, unknown>
): WorkflowParameters {
  // n8n format: top-level `nodes` array (connections may or may not be present)
  if (Array.isArray(definitionJson.nodes)) {
    return {
      name: (definitionJson.name as string) ?? 'Untitled',
      nodes: definitionJson.nodes as WorkflowParameters['nodes'],
      connections: (definitionJson.connections ?? {}) as WorkflowParameters['connections'],
      active: (definitionJson.active as boolean) ?? false,
      settings: (definitionJson.settings as WorkflowParameters['settings']) ?? {
        executionOrder: 'v1',
      },
    };
  }

  // DiagramModel format: has `diagram` key with `nodes` and `edges`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return translateWBToN8n(definitionJson as any);
}

/**
 * Execute a workflow asynchronously for a given tenant.
 *
 * This function:
 * 1. Updates the execution record to "running" with a startedAt timestamp
 * 2. Calls ExecutionService.executeWorkflow() with lifecycle hooks
 * 3. On success: updates execution to "success" with result data
 * 4. On failure: updates execution to "error" with error message
 * 5. Writes execution_steps for each node start/end
 *
 * All DB writes include tenant_id for isolation.
 *
 * @param tenantId - The tenant performing the execution
 * @param executionId - The pre-created execution record ID
 * @param workflowId - The source workflow ID
 * @param workflowName - The workflow name
 * @param workflowData - n8n WorkflowParameters (already translated)
 */
export async function executeWorkflowForTenant(
  tenantId: string,
  executionId: string,
  workflowId: string,
  workflowName: string,
  workflowData: WorkflowParameters
): Promise<void> {
  const db = getDb();
  const service = await getExecutionService();

  // Mark execution as running
  await db
    .update(executions)
    .set({
      status: 'running',
      startedAt: new Date(),
    })
    .where(
      and(eq(executions.id, executionId), eq(executions.tenantId, tenantId))
    );

  try {
    const result: IRun = await service.executeWorkflow({
      tenantId,
      workflowJson: {
        id: workflowId,
        name: workflowName,
        nodes: workflowData.nodes as any,
        connections: workflowData.connections as any,
        active: workflowData.active ?? false,
        settings: workflowData.settings as any,
      },
      mode: 'manual',
      onHookEvent: async (event: string, data?: unknown) => {
        // Write lifecycle events to DB
        await handleHookEvent(tenantId, executionId, event, data);
      },
    });

    // Determine final status from result
    const finalStatus =
      result.status === 'error' || !result.finished ? 'error' : 'success';

    const errorMessage =
      result.data?.resultData?.error?.message ?? null;

    // Update execution record with final status
    await db
      .update(executions)
      .set({
        status: finalStatus,
        finishedAt: new Date(),
        contextJson: result.data ? JSON.parse(JSON.stringify(result.data)) : {},
        error: errorMessage,
      })
      .where(
        and(eq(executions.id, executionId), eq(executions.tenantId, tenantId))
      );
  } catch (err: unknown) {
    // Execution threw an unhandled error -- mark as failed
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown execution error';

    await db
      .update(executions)
      .set({
        status: 'error',
        finishedAt: new Date(),
        error: errorMessage,
      })
      .where(
        and(eq(executions.id, executionId), eq(executions.tenantId, tenantId))
      );
  }
}

/**
 * Handle lifecycle hook events by writing to the execution_steps table.
 *
 * Events:
 * - nodeExecuteBefore -> insert a "running" step
 * - nodeExecuteAfter -> update the "running" step to "success"/"error" with output data
 * - workflowExecuteBefore / workflowExecuteAfter -> logged but not written as steps
 *   (workflow-level status is handled in the parent function)
 */
async function handleHookEvent(
  _tenantId: string,
  executionId: string,
  event: string,
  data?: unknown
): Promise<void> {
  const db = getDb();
  const payload = (data as Record<string, unknown>) ?? {};

  switch (event) {
    case 'nodeExecuteBefore': {
      const nodeName = (payload.nodeName as string) ?? 'unknown';
      const nodeType = (payload.nodeType as string) ?? null;
      await db.insert(executionSteps).values({
        executionId,
        nodeId: nodeName,
        nodeName,
        nodeType,
        status: 'running',
        startedAt: new Date(),
      });
      break;
    }

    case 'nodeExecuteAfter': {
      const nodeName = (payload.nodeName as string) ?? 'unknown';
      const taskData = payload.taskData as Record<string, unknown> | undefined;
      const stepStatus =
        (taskData?.executionStatus as string) === 'error' ? 'error' : 'success';

      // Extract error details if present
      let errorJson: Record<string, unknown> | null = null;
      if (taskData?.error) {
        const err = taskData.error as Record<string, unknown>;
        errorJson = {
          message: err.message ?? 'Unknown error',
          description: err.description ?? null,
          code: err.code ?? null,
          httpCode: err.httpCode ?? null,
          type: err.constructor?.name ?? err.name ?? 'Error',
          context: err.context ?? null,
        };
      }

      // Extract output data (flatten main connection output for readability)
      let outputJson: unknown = null;
      if (taskData?.data) {
        const connections = taskData.data as Record<string, unknown>;
        const mainOutput = connections.main as Array<unknown[] | null> | undefined;
        if (mainOutput?.[0]) {
          // Extract just the json data from INodeExecutionData items
          const items = mainOutput[0] as Array<{ json?: unknown }>;
          outputJson = items.length === 1
            ? items[0]?.json ?? items[0]
            : items.map(item => item?.json ?? item);
        } else {
          outputJson = connections;
        }
      }

      // Extract input data (resolved from previous node's output by the hook)
      const inputData = payload.inputData as unknown;
      const inputJson = inputData ? JSON.parse(JSON.stringify(inputData)) : null;

      // Update the existing "running" step to its final status
      await db
        .update(executionSteps)
        .set({
          status: stepStatus,
          inputJson,
          outputJson: outputJson ? JSON.parse(JSON.stringify(outputJson)) : null,
          error: errorJson,
          finishedAt: new Date(),
        })
        .where(
          and(
            eq(executionSteps.executionId, executionId),
            eq(executionSteps.nodeId, nodeName),
            eq(executionSteps.status, 'running')
          )
        );
      break;
    }

    // Workflow-level events are handled by the caller (executeWorkflowForTenant)
    // so we just log them here for debugging
    case 'workflowExecuteBefore':
    case 'workflowExecuteAfter':
    case 'executionStatus':
    case 'sendDataToUI':
      // No-op: handled at the workflow execution level
      break;

    default:
      // Unknown event type -- ignore silently
      break;
  }
}

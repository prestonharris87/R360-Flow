import type { FastifyInstance } from 'fastify';
import { eq, and, count, desc } from 'drizzle-orm';
import { executions, executionSteps, workflows } from '@r360/db';
import { getDb } from '@r360/db';
import {
  PaginationSchema,
  UuidParamSchema,
  TriggerExecutionSchema,
} from '@r360/types';
import { requireRole } from '../middleware/auth';
import { z } from 'zod';
import {
  translateIfNeeded,
  executeWorkflowForTenant,
} from '../services/execution-bridge';

// ---------------------------------------------------------------------------
// Response transformation helpers
// Map Drizzle camelCase output -> camelCase REST contract the frontend expects
// ---------------------------------------------------------------------------

const EXEC_STATUS_MAP: Record<string, string> = {
  pending: 'waiting',
  running: 'running',
  success: 'success',
  error: 'failed',
  cancelled: 'cancelled',
  timeout: 'failed',
};

const STEP_STATUS_MAP: Record<string, string> = {
  pending: 'running',
  running: 'running',
  success: 'success',
  error: 'failed',
  skipped: 'skipped',
};

function extractErrorMessage(error: unknown): string | null {
  if (error == null) return null;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function toExecutionSummary(row: Record<string, unknown>, workflowName?: string) {
  const startedAt = row.startedAt as string | null;
  const finishedAt = row.finishedAt as string | null;
  let durationMs: number | null = null;
  if (startedAt && finishedAt) {
    durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  }
  return {
    id: row.id,
    workflowId: row.workflowId,
    workflowName: workflowName ?? (row as Record<string, unknown>).workflowName ?? '',
    status: EXEC_STATUS_MAP[row.status as string] ?? row.status,
    startedAt: startedAt,
    finishedAt: finishedAt,
    durationMs: durationMs,
    errorMessage: extractErrorMessage(row.error),
    createdAt: row.createdAt,
  };
}

function toExecutionStep(step: Record<string, unknown>) {
  const error = step.error as Record<string, unknown> | null;
  return {
    id: step.id,
    nodeName: step.nodeName,
    nodeType: step.nodeType,
    status: STEP_STATUS_MAP[step.status as string] ?? step.status,
    startedAt: step.startedAt,
    finishedAt: step.finishedAt,
    inputData: step.inputJson ?? null,
    outputData: step.outputJson ?? null,
    errorMessage: extractErrorMessage(step.error),
    errorDetail: error ? {
      message: error.message ?? null,
      description: error.description ?? null,
      httpCode: error.httpCode ?? null,
      type: error.type ?? null,
      context: error.context ?? null,
    } : null,
  };
}

const ExecutionQuerySchema = PaginationSchema.extend({
  workflowId: z.string().uuid().optional(),
  status: z
    .enum(['pending', 'running', 'success', 'error', 'cancelled', 'timeout'])
    .optional(),
});

export async function executionRoutes(app: FastifyInstance): Promise<void> {
  // TRIGGER EXECUTION -- creates pending record then runs workflow asynchronously
  app.post(
    '/api/workflows/:id/execute',
    { preHandler: [requireRole('member')] },
    async (request, reply) => {
      const params = UuidParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid workflow ID',
          statusCode: 400,
        });
      }

      const parsed = TriggerExecutionSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid request body',
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }

      const { tenantId } = request.tenantContext;
      const db = getDb();

      // Verify workflow exists and belongs to tenant
      const [workflow] = await db
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.id, params.data.id),
            eq(workflows.tenantId, tenantId)
          )
        );

      if (!workflow) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Workflow not found',
          statusCode: 404,
        });
      }

      // Validate the workflow has a definition
      const definitionJson = workflow.definitionJson as Record<string, unknown>;
      if (
        !definitionJson ||
        (typeof definitionJson === 'object' &&
          Object.keys(definitionJson).length === 0)
      ) {
        return reply.status(422).send({
          error: 'Unprocessable Entity',
          message:
            'Workflow has no definition. Save a workflow definition before executing.',
          statusCode: 422,
        });
      }

      // Translate workflow definition to n8n format if needed
      let workflowData;
      try {
        workflowData = translateIfNeeded(definitionJson);
      } catch (translateErr: unknown) {
        const msg =
          translateErr instanceof Error
            ? translateErr.message
            : 'Unknown translation error';
        return reply.status(422).send({
          error: 'Unprocessable Entity',
          message: `Failed to translate workflow definition: ${msg}`,
          statusCode: 422,
        });
      }

      // Create pending execution record
      const rows = await db
        .insert(executions)
        .values({
          tenantId,
          workflowId: params.data.id,
          status: 'pending',
          mode: 'manual',
          contextJson: parsed.data.inputData ?? {},
        })
        .returning();

      const execution = rows[0]!;

      // Fire-and-forget: run execution asynchronously in the background.
      // The client gets an immediate 202 response with the execution ID,
      // and can poll GET /api/executions/:id for status updates.
      executeWorkflowForTenant(
        tenantId,
        execution.id,
        workflow.id,
        workflow.name,
        workflowData
      ).catch((err: unknown) => {
        // This catch handles truly unexpected errors that escape the
        // try/catch inside executeWorkflowForTenant. The execution
        // record may already be marked as "error" by the bridge.
        const msg =
          err instanceof Error ? err.message : 'Unknown background error';
        request.log.error(
          { executionId: execution.id, tenantId, error: msg },
          'Background workflow execution failed unexpectedly'
        );
      });

      // Return 202 Accepted -- execution runs in the background
      return reply.status(202).send(execution);
    }
  );

  // LIST EXECUTIONS (paginated, filterable)
  app.get('/api/executions', async (request, reply) => {
    const queryParsed = ExecutionQuerySchema.safeParse(request.query);
    if (!queryParsed.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid query parameters',
        statusCode: 400,
        details: queryParsed.error.flatten(),
      });
    }

    const query = queryParsed.data;
    const { tenantId } = request.tenantContext;
    const db = getDb();
    const offset = (query.page - 1) * query.limit;

    // Build WHERE conditions -- always include tenant_id
    const conditions = [eq(executions.tenantId, tenantId)];
    if (query.workflowId) {
      conditions.push(eq(executions.workflowId, query.workflowId));
    }
    if (query.status) {
      conditions.push(eq(executions.status, query.status));
    }

    const whereClause = and(...conditions);

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: executions.id,
          tenantId: executions.tenantId,
          workflowId: executions.workflowId,
          status: executions.status,
          mode: executions.mode,
          error: executions.error,
          startedAt: executions.startedAt,
          finishedAt: executions.finishedAt,
          createdAt: executions.createdAt,
          workflowName: workflows.name,
        })
        .from(executions)
        .leftJoin(workflows, eq(executions.workflowId, workflows.id))
        .where(whereClause)
        .orderBy(desc(executions.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(executions)
        .where(whereClause),
    ]);

    const total = countResult[0]?.total ?? 0;

    return reply.send({
      data: rows.map((r) => toExecutionSummary(r as Record<string, unknown>, r.workflowName ?? '')),
      total,
      page: query.page,
      pageSize: query.limit,
    });
  });

  // GET EXECUTION DETAIL (with steps)
  app.get('/api/executions/:id', async (request, reply) => {
    const params = UuidParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid execution ID',
        statusCode: 400,
      });
    }

    const { tenantId } = request.tenantContext;
    const db = getDb();

    // Tenant-scoped execution lookup
    const [execution] = await db
      .select()
      .from(executions)
      .where(
        and(
          eq(executions.id, params.data.id),
          eq(executions.tenantId, tenantId)
        )
      );

    if (!execution) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Execution not found',
        statusCode: 404,
      });
    }

    // Look up workflow name
    const [wf] = await db
      .select({ name: workflows.name })
      .from(workflows)
      .where(eq(workflows.id, execution.workflowId));

    // Fetch associated steps
    const steps = await db
      .select()
      .from(executionSteps)
      .where(eq(executionSteps.executionId, execution.id))
      .orderBy(executionSteps.startedAt);

    const summary = toExecutionSummary(execution as Record<string, unknown>, wf?.name ?? '');

    return reply.send({
      ...summary,
      steps: steps.map((s) => toExecutionStep(s as Record<string, unknown>)),
    });
  });
}

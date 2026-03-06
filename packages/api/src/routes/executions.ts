import type { FastifyInstance } from 'fastify';
import { eq, and, count, desc } from 'drizzle-orm';
import { executions, executionSteps, workflows } from '@r360/db';
import { getDb } from '@r360/db';
import {
  PaginationSchema,
  UuidParamSchema,
  TriggerExecutionSchema,
} from '@r360/types';
import { requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import {
  translateIfNeeded,
  executeWorkflowForTenant,
} from '../services/execution-bridge.js';

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

    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(executions)
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
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
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

    // Fetch associated steps
    const steps = await db
      .select()
      .from(executionSteps)
      .where(eq(executionSteps.executionId, execution.id))
      .orderBy(executionSteps.startedAt);

    return reply.send({
      ...execution,
      steps,
    });
  });
}

import type { FastifyInstance } from 'fastify';
import { eq, and, count, desc, asc } from 'drizzle-orm';
import { workflows } from '@r360/db';
import { getDb } from '@r360/db';
import {
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  PaginationSchema,
  UuidParamSchema,
} from '@r360/types';
import { requireRole } from '../middleware/auth';
import { translateN8nToWB } from '@r360/json-translator';
import { autoMapCredentials } from '../services/credential-mapper';

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  // IMPORT n8n workflow
  app.post(
    '/api/workflows/import',
    { preHandler: [requireRole('member')] },
    async (request, reply) => {
      const body = request.body as { name?: string; n8nWorkflow?: unknown };

      // Validate input
      if (!body || !body.n8nWorkflow || typeof body.n8nWorkflow !== 'object') {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Request body must include n8nWorkflow object',
          statusCode: 400,
        });
      }

      const n8nWorkflow = body.n8nWorkflow as Record<string, unknown>;

      // Verify it has nodes array (basic n8n format check)
      if (!Array.isArray(n8nWorkflow.nodes)) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'n8nWorkflow must have a nodes array',
          statusCode: 400,
        });
      }

      // Translate n8n format to DiagramModel (Workflow Builder format)
      const diagramModel = translateN8nToWB(n8nWorkflow as any);

      // Auto-map credentials to tenant's credentials
      const { tenantId, userId } = request.tenantContext;
      const { nodes: mappedNodes, credentialMapping } = await autoMapCredentials(
        diagramModel.diagram.nodes as any,
        tenantId,
      );

      // Build the definitionJson in DiagramModel format
      const definitionJson = {
        name: diagramModel.name,
        layoutDirection: diagramModel.layoutDirection,
        nodes: mappedNodes,
        edges: diagramModel.diagram.edges,
      };

      // Use provided name or fall back to n8n workflow name
      const workflowName = body.name || (n8nWorkflow.name as string) || 'Imported Workflow';

      const db = getDb();
      const [workflow] = await db
        .insert(workflows)
        .values({
          tenantId,
          name: workflowName,
          definitionJson,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      return reply.status(201).send({
        workflow,
        credentialMapping,
      });
    }
  );

  // CREATE
  app.post(
    '/api/workflows',
    { preHandler: [requireRole('member')] },
    async (request, reply) => {
      const parsed = CreateWorkflowSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid request body',
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }

      const { tenantId, userId } = request.tenantContext;
      const db = getDb();

      const [workflow] = await db
        .insert(workflows)
        .values({
          tenantId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          definitionJson: parsed.data.definitionJson,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      return reply.status(201).send(workflow);
    }
  );

  // LIST (paginated)
  app.get('/api/workflows', async (request, reply) => {
    const queryParsed = PaginationSchema.safeParse(request.query);
    if (!queryParsed.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid query parameters',
        statusCode: 400,
        details: queryParsed.error.flatten(),
      });
    }

    const pagination = queryParsed.data;
    const { tenantId } = request.tenantContext;
    const db = getDb();

    const offset = (pagination.page - 1) * pagination.limit;

    const orderDirection = pagination.sortOrder === 'asc' ? asc : desc;
    const orderColumn =
      pagination.sortBy === 'name' ? workflows.name : workflows.updatedAt;

    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(workflows)
        .where(and(eq(workflows.tenantId, tenantId)))
        .orderBy(orderDirection(orderColumn))
        .limit(pagination.limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(workflows)
        .where(and(eq(workflows.tenantId, tenantId))),
    ]);

    const total = countResult[0]?.total ?? 0;

    return reply.send({
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    });
  });

  // GET by ID
  app.get('/api/workflows/:id', async (request, reply) => {
    const params = UuidParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid workflow ID',
        statusCode: 400,
      });
    }

    const { tenantId } = request.tenantContext;
    const db = getDb();

    const [workflow] = await db
      .select()
      .from(workflows)
      .where(
        and(eq(workflows.id, params.data.id), eq(workflows.tenantId, tenantId))
      );

    if (!workflow) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Workflow not found',
        statusCode: 404,
      });
    }

    return reply.send(workflow);
  });

  // UPDATE
  app.put(
    '/api/workflows/:id',
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

      const parsed = UpdateWorkflowSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid request body',
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }

      const { tenantId, userId } = request.tenantContext;
      const db = getDb();

      const [workflow] = await db
        .update(workflows)
        .set({
          ...parsed.data,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflows.id, params.data.id),
            eq(workflows.tenantId, tenantId)
          )
        )
        .returning();

      if (!workflow) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Workflow not found',
          statusCode: 404,
        });
      }

      return reply.send(workflow);
    }
  );

  // DELETE (soft delete -> archive)
  app.delete(
    '/api/workflows/:id',
    { preHandler: [requireRole('admin')] },
    async (request, reply) => {
      const params = UuidParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid workflow ID',
          statusCode: 400,
        });
      }

      const { tenantId } = request.tenantContext;
      const db = getDb();

      const [workflow] = await db
        .update(workflows)
        .set({
          status: 'archived',
          isActive: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflows.id, params.data.id),
            eq(workflows.tenantId, tenantId)
          )
        )
        .returning();

      if (!workflow) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Workflow not found',
          statusCode: 404,
        });
      }

      return reply.send({ message: 'Workflow archived', workflow });
    }
  );
}

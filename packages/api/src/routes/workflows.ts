import { FastifyInstance } from 'fastify';
import { eq, and, count, desc, asc } from 'drizzle-orm';
import { workflows } from '@r360/db';
import { getDb } from '@r360/db';
import {
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  PaginationSchema,
  UuidParamSchema,
} from '@r360/types';
import { requireRole } from '../middleware/auth.js';

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
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

    const [data, [{ total }]] = await Promise.all([
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

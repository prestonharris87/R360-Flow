import type { FastifyInstance } from 'fastify';
import { eq, and, count } from 'drizzle-orm';
import { credentials } from '@r360/db';
import { getDb } from '@r360/db';
import {
  CreateCredentialSchema,
  UpdateCredentialSchema,
  PaginationSchema,
  UuidParamSchema,
} from '@r360/types';
import { requireRole } from '../middleware/auth.js';
import { encryptCredentialData } from '../services/encryption.js';

type CredentialRow = typeof credentials.$inferSelect;

/**
 * Strips the encryptedData field from a credential row before sending to clients.
 * The encrypted data must NEVER be exposed via the API.
 */
function sanitizeCredential(cred: CredentialRow) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { encryptedData: _encryptedData, ...safe } = cred;
  return safe;
}

export async function credentialRoutes(app: FastifyInstance): Promise<void> {
  // CREATE
  app.post(
    '/api/credentials',
    { preHandler: [requireRole('admin')] },
    async (request, reply) => {
      const parsed = CreateCredentialSchema.safeParse(request.body);
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

      const encrypted = encryptCredentialData(parsed.data.data, tenantId);

      const [credential] = await db
        .insert(credentials)
        .values({
          tenantId,
          name: parsed.data.name,
          type: parsed.data.type,
          encryptedData: encrypted,
          createdBy: userId,
        })
        .returning();

      return reply.status(201).send(sanitizeCredential(credential));
    }
  );

  // LIST (paginated, tenant-scoped)
  app.get('/api/credentials', async (request, reply) => {
    const pagination = PaginationSchema.parse(request.query);
    const { tenantId } = request.tenantContext;
    const db = getDb();
    const offset = (pagination.page - 1) * pagination.limit;

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(credentials)
        .where(eq(credentials.tenantId, tenantId))
        .limit(pagination.limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(credentials)
        .where(eq(credentials.tenantId, tenantId)),
    ]);

    return reply.send({
      data: data.map(sanitizeCredential),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    });
  });

  // GET by ID (metadata only, no decryption)
  app.get('/api/credentials/:id', async (request, reply) => {
    const params = UuidParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid credential ID',
        statusCode: 400,
      });
    }

    const { tenantId } = request.tenantContext;
    const db = getDb();

    const [credential] = await db
      .select()
      .from(credentials)
      .where(
        and(
          eq(credentials.id, params.data.id),
          eq(credentials.tenantId, tenantId)
        )
      );

    if (!credential) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Credential not found',
        statusCode: 404,
      });
    }

    return reply.send(sanitizeCredential(credential));
  });

  // UPDATE
  app.put(
    '/api/credentials/:id',
    { preHandler: [requireRole('admin')] },
    async (request, reply) => {
      const params = UuidParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid credential ID',
          statusCode: 400,
        });
      }

      const parsed = UpdateCredentialSchema.safeParse(request.body);
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
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (parsed.data.name) updates.name = parsed.data.name;
      if (parsed.data.data) {
        updates.encryptedData = encryptCredentialData(parsed.data.data, tenantId);
      }

      const [credential] = await db
        .update(credentials)
        .set(updates)
        .where(
          and(
            eq(credentials.id, params.data.id),
            eq(credentials.tenantId, tenantId)
          )
        )
        .returning();

      if (!credential) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Credential not found',
          statusCode: 404,
        });
      }

      return reply.send(sanitizeCredential(credential));
    }
  );

  // DELETE (hard delete -- credentials should be fully removed)
  app.delete(
    '/api/credentials/:id',
    { preHandler: [requireRole('admin')] },
    async (request, reply) => {
      const params = UuidParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid credential ID',
          statusCode: 400,
        });
      }

      const { tenantId } = request.tenantContext;
      const db = getDb();

      const [deleted] = await db
        .delete(credentials)
        .where(
          and(
            eq(credentials.id, params.data.id),
            eq(credentials.tenantId, tenantId)
          )
        )
        .returning();

      if (!deleted) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Credential not found',
          statusCode: 404,
        });
      }

      return reply.send({ message: 'Credential deleted' });
    }
  );
}

import type { FastifyInstance } from 'fastify';
import { eq, and, count, inArray } from 'drizzle-orm';
import { credentials } from '@r360/db';
import { getDb } from '@r360/db';
import {
  CreateCredentialSchema,
  UpdateCredentialSchema,
  CredentialListQuerySchema,
  UuidParamSchema,
} from '@r360/types';
import { requireRole } from '../middleware/auth';
import { encryptCredentialData, decryptCredentialData } from '../services/encryption';
import {
  getCredentialTypeRegistry,
  isBootstrapped,
} from '@r360/execution-engine';
import type { CredentialTypeRegistry } from '@r360/execution-engine';

type CredentialRow = typeof credentials.$inferSelect;

/**
 * Strips the encryptedData field from a credential row before sending to clients.
 * The encrypted data must NEVER be exposed via the API.
 */
function sanitizeCredential(cred: CredentialRow) {
  const { encryptedData: _encryptedData, ...safe } = cred;
  return safe;
}

/**
 * Safely get the credential type registry, or null if not yet initialized.
 * Returns null when bootstrap has not completed.
 */
function getRegistrySafe(): CredentialTypeRegistry | null {
  if (!isBootstrapped()) return null;
  try {
    return getCredentialTypeRegistry();
  } catch {
    return null;
  }
}

/**
 * Resolve n8n credential expression placeholders in test request objects.
 *
 * Replaces `={{$credentials.fieldName}}` patterns with actual credential values.
 * Recursively handles strings, arrays, and nested objects.
 */
function resolveExpressions(obj: unknown, creds: Record<string, unknown>): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\{\{\s*\$credentials\.(\w+)\s*\}\}/g, (_, key: string) => {
      return creds[key] != null ? String(creds[key]) : '';
    });
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => resolveExpressions(item, creds));
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveExpressions(value, creds);
    }
    return result;
  }
  return obj;
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

      // Validate credential type against registry if available
      const registry = getRegistrySafe();
      if (registry && !registry.recognizes(parsed.data.type)) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: `Unknown credential type: ${parsed.data.type}`,
          statusCode: 400,
        });
      }

      const { tenantId, userId } = request.tenantContext;
      const db = getDb();

      // Validate required fields before proceeding
      if (!parsed.data.name || parsed.data.name.trim().length === 0) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Credential name is required and cannot be empty',
          statusCode: 400,
        });
      }

      if (!parsed.data.type || parsed.data.type.trim().length === 0) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Credential type is required and cannot be empty',
          statusCode: 400,
        });
      }

      if (!parsed.data.data || typeof parsed.data.data !== 'object') {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Credential data is required and must be an object',
          statusCode: 400,
        });
      }

      // Encrypt credential data with proper error handling
      let encrypted: string;
      try {
        encrypted = encryptCredentialData(parsed.data.data, tenantId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown encryption error';
        return reply.status(500).send({
          error: 'Encryption Error',
          message: `Failed to encrypt credential data: ${message}`,
          statusCode: 500,
        });
      }

      try {
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

        return reply.status(201).send(sanitizeCredential(credential!));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown database error';
        return reply.status(500).send({
          error: 'Internal Error',
          message: `Failed to create credential: ${message}`,
          statusCode: 500,
        });
      }
    }
  );

  // LIST (paginated, tenant-scoped, with optional type/nodeType filters)
  app.get('/api/credentials', async (request, reply) => {
    const queryResult = CredentialListQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid query parameters',
        statusCode: 400,
        details: queryResult.error.flatten(),
      });
    }

    const { page, limit, type, nodeType } = queryResult.data;
    const { tenantId } = request.tenantContext;
    const db = getDb();
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(credentials.tenantId, tenantId)];

    // Determine which credential types to filter by
    let typeFilter: string[] | null = null;

    if (type) {
      // Direct type filter
      typeFilter = [type];
    } else if (nodeType) {
      // Lookup credential types compatible with the given node type from registry
      const registry = getRegistrySafe();
      if (registry) {
        const allTypes = registry.getAll();
        const compatibleTypes: string[] = [];
        for (const credType of allTypes) {
          const supportedNodes = registry.getSupportedNodes(credType.name);
          if (supportedNodes.includes(nodeType)) {
            compatibleTypes.push(credType.name);
          }
        }
        if (compatibleTypes.length === 0) {
          // No compatible types found - return empty result
          return reply.send({
            data: [],
            pagination: {
              page,
              limit,
              total: 0,
              totalPages: 0,
            },
          });
        }
        typeFilter = compatibleTypes;
      }
      // If registry is not available, skip the nodeType filter silently
    }

    if (typeFilter && typeFilter.length === 1) {
      conditions.push(eq(credentials.type, typeFilter[0]!));
    } else if (typeFilter && typeFilter.length > 1) {
      conditions.push(inArray(credentials.type, typeFilter));
    }

    const whereClause = and(...conditions);

    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(credentials)
        .where(whereClause)
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(credentials)
        .where(whereClause),
    ]);

    const total = countResult[0]?.total ?? 0;

    // Enrich response with credential type displayName from registry
    const registry = getRegistrySafe();
    const enrichedData = data.map((cred) => {
      const sanitized = sanitizeCredential(cred);
      let typeDisplayName: string | undefined;
      if (registry) {
        try {
          const credType = registry.getByName(cred.type);
          typeDisplayName = credType.displayName;
        } catch {
          // Type not found in registry -- omit displayName
        }
      }
      return {
        ...sanitized,
        ...(typeDisplayName ? { typeDisplayName } : {}),
      };
    });

    return reply.send({
      data: enrichedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
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

    // Enrich with type displayName
    const sanitized = sanitizeCredential(credential);
    const registry = getRegistrySafe();
    let typeDisplayName: string | undefined;
    if (registry) {
      try {
        const credType = registry.getByName(credential.type);
        typeDisplayName = credType.displayName;
      } catch {
        // Type not found in registry
      }
    }

    return reply.send({
      ...sanitized,
      ...(typeDisplayName ? { typeDisplayName } : {}),
    });
  });

  // TEST credential connection
  app.post(
    '/api/credentials/:id/test',
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

      // 1. Load credential from DB (tenant-scoped)
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

      // 2. Get credential type registry
      const registry = getRegistrySafe();
      if (!registry) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: 'Credential type registry is not initialized. Server may still be starting up.',
          statusCode: 503,
        });
      }

      // 3. Decrypt credential data
      let decryptedData: Record<string, unknown>;
      try {
        decryptedData = decryptCredentialData(credential.encryptedData, tenantId);
      } catch (err) {
        return reply.status(500).send({
          error: 'Internal Error',
          message: 'Failed to decrypt credential data',
          statusCode: 500,
        });
      }

      // 4. Load credential type from registry
      if (!registry.recognizes(credential.type)) {
        return reply.send({
          status: 'OK',
          message: 'No test available for this credential type',
        });
      }

      let credentialType;
      try {
        credentialType = registry.getByName(credential.type);
      } catch {
        return reply.send({
          status: 'OK',
          message: 'No test available for this credential type',
        });
      }

      // 5. Check if credential type has a test definition
      const testDef = credentialType.test;
      if (!testDef) {
        return reply.send({
          status: 'OK',
          message: 'No test available for this credential type',
        });
      }

      // 6. Handle test.request-based testing
      const testRequest = (testDef as { request?: Record<string, unknown> }).request;
      if (!testRequest) {
        return reply.send({
          status: 'OK',
          message: 'No test available for this credential type',
        });
      }

      try {
        // Resolve credential expressions in the test request config
        const resolvedRequest = resolveExpressions(testRequest, decryptedData) as Record<string, unknown>;

        // Build request URL
        let url = (resolvedRequest.url as string) || '';
        const baseURL = (resolvedRequest.baseURL as string) || '';
        if (baseURL && url && !url.startsWith('http')) {
          url = baseURL.replace(/\/$/, '') + '/' + url.replace(/^\//, '');
        } else if (baseURL && !url) {
          url = baseURL;
        }

        if (!url) {
          return reply.send({
            status: 'Error',
            message: 'Test request has no URL configured',
          });
        }

        // Build request options
        const method = ((resolvedRequest.method as string) || 'GET').toUpperCase();
        const headers: Record<string, string> = {
          ...(resolvedRequest.headers as Record<string, string> || {}),
        };

        // Build URL with query string parameters
        const urlObj = new URL(url);
        const qs = resolvedRequest.qs as Record<string, string> | undefined;
        if (qs) {
          for (const [key, value] of Object.entries(qs)) {
            urlObj.searchParams.set(key, value);
          }
        }

        // Apply authentication from credential type's authenticate config
        if (credentialType.authenticate) {
          const auth = credentialType.authenticate;
          if (typeof auth !== 'function') {
            // Generic (declarative) authentication
            const generic = auth as {
              type: string;
              properties: {
                headers?: Record<string, unknown>;
                qs?: Record<string, unknown>;
                body?: Record<string, unknown>;
                auth?: Record<string, unknown>;
              };
            };
            const props = generic.properties;

            if (props.headers) {
              for (const [key, value] of Object.entries(props.headers)) {
                const resolved = resolveExpressions(value, decryptedData);
                headers[key] = String(resolved);
              }
            }

            if (props.qs) {
              for (const [key, value] of Object.entries(props.qs)) {
                const resolved = resolveExpressions(value, decryptedData);
                urlObj.searchParams.set(key, String(resolved));
              }
            }

            if (props.auth) {
              // Basic auth support
              const username = props.auth.username
                ? String(resolveExpressions(props.auth.username, decryptedData))
                : undefined;
              const password = props.auth.password
                ? String(resolveExpressions(props.auth.password, decryptedData))
                : undefined;
              if (username !== undefined) {
                const encoded = Buffer.from(`${username}:${password || ''}`).toString('base64');
                headers['Authorization'] = `Basic ${encoded}`;
              }
            }
          }
        }

        // Build fetch options
        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: AbortSignal.timeout(10_000), // 10 second timeout
        };

        // Add body for non-GET requests
        if (method !== 'GET' && method !== 'HEAD' && resolvedRequest.body) {
          fetchOptions.body = JSON.stringify(resolvedRequest.body);
          if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
          }
        }

        const response = await fetch(urlObj.toString(), fetchOptions);

        if (response.ok) {
          return reply.send({
            status: 'OK',
            message: 'Connection successful',
          });
        } else {
          return reply.send({
            status: 'Error',
            message: `Connection failed: HTTP ${response.status}`,
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error during credential test';
        return reply.send({
          status: 'Error',
          message,
        });
      }
    }
  );

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

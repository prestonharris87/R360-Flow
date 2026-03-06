import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

export interface SecurityConfig {
  maxBodySize?: number; // bytes, default 1MB
  allowedOrigins?: string[];
  enforceContentType?: boolean;
}

const DEFAULT_MAX_BODY_SIZE = 1_048_576; // 1MB

/**
 * Strip HTML tags from string values in an object (recursive).
 */
export function sanitizeInput(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/<[^>]*>/g, '');
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeInput);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitizeInput(v);
    }
    return result;
  }
  return value;
}

/**
 * Validate Content-Type header for state-changing requests.
 * Returns the reply if validation fails (to short-circuit), or null if OK.
 */
function validateContentType(request: FastifyRequest, reply: FastifyReply): FastifyReply | null {
  const method = request.method.toUpperCase();
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const contentType = request.headers['content-type'];
    if (!contentType) {
      return reply.status(415).send({ error: 'Content-Type header is required for this request' });
    }
    // Allow application/json and multipart/form-data and application/x-www-form-urlencoded
    const allowed = ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded'];
    const isAllowed = allowed.some(type => contentType.toLowerCase().includes(type));
    if (!isAllowed) {
      return reply.status(415).send({ error: `Unsupported Content-Type: ${contentType}` });
    }
  }
  return null;
}

/**
 * Check request body size.
 * Returns the reply if validation fails (to short-circuit), or null if OK.
 */
function validateBodySize(request: FastifyRequest, reply: FastifyReply, maxSize: number): FastifyReply | null {
  const contentLength = parseInt(request.headers['content-length'] ?? '0', 10);
  if (contentLength > maxSize) {
    return reply.status(413).send({ error: 'Request body too large' });
  }
  return null;
}

/**
 * Simple origin check for CSRF protection.
 * Returns the reply if validation fails (to short-circuit), or null if OK.
 */
function checkOrigin(request: FastifyRequest, reply: FastifyReply, allowedOrigins?: string[]): FastifyReply | null {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;

  if (!allowedOrigins || allowedOrigins.length === 0) return null;

  const origin = request.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    return reply.status(403).send({ error: 'Origin not allowed' });
  }
  return null;
}

/**
 * Security middleware plugin implementation.
 */
async function securityPlugin(
  fastify: FastifyInstance,
  opts: SecurityConfig,
): Promise<void> {
  const maxBodySize = opts.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Body size check
    const sizeResult = validateBodySize(request, reply, maxBodySize);
    if (sizeResult) return sizeResult;

    // 2. Content-Type enforcement
    if (opts.enforceContentType !== false) {
      const ctResult = validateContentType(request, reply);
      if (ctResult) return ctResult;
    }

    // 3. Origin check (CSRF)
    const originResult = checkOrigin(request, reply, opts.allowedOrigins);
    if (originResult) return originResult;
  });

  // Sanitize request body after parsing
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    if (request.body && typeof request.body === 'object') {
      (request as any).body = sanitizeInput(request.body);
    }
  });
}

/**
 * Register security middleware as a Fastify plugin.
 * Wrapped with fastify-plugin to break encapsulation so hooks apply globally.
 */
export const securityMiddleware = fp(securityPlugin, {
  name: 'r360-security-middleware',
});

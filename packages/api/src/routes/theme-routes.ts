import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ThemeService } from '../services/theme-service.js';

export interface ThemeRoutesConfig {
  themeService: ThemeService;
}

export async function themeRoutes(
  fastify: FastifyInstance,
  opts: ThemeRoutesConfig,
): Promise<void> {
  // GET /api/theme - get tenant theme
  fastify.get(
    '/api/theme',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantContext?.tenantId
        ?? (request as any).tenantId;

      if (!tenantId) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Missing tenant context',
          statusCode: 401,
        });
      }

      const theme = await opts.themeService.getTheme(tenantId);
      return reply.send(theme);
    },
  );

  // PUT /api/theme - update tenant theme
  fastify.put(
    '/api/theme',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantContext?.tenantId
        ?? (request as any).tenantId;

      if (!tenantId) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Missing tenant context',
          statusCode: 401,
        });
      }

      const body = request.body as Record<string, unknown> | null;
      if (!body || typeof body !== 'object') {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Request body must be a JSON object',
          statusCode: 400,
        });
      }

      const theme = await opts.themeService.updateTheme(tenantId, body as any);
      return reply.send(theme);
    },
  );

  // DELETE /api/theme - reset to default
  fastify.delete(
    '/api/theme',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantContext?.tenantId
        ?? (request as any).tenantId;

      if (!tenantId) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Missing tenant context',
          statusCode: 401,
        });
      }

      const theme = await opts.themeService.resetToDefault(tenantId);
      return reply.send(theme);
    },
  );
}

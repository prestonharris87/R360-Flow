import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TemplateService } from '../services/template-service';

export interface TemplateRoutesConfig {
  templateService: TemplateService;
}

export async function templateRoutes(
  fastify: FastifyInstance,
  opts: TemplateRoutesConfig,
): Promise<void> {
  const { templateService } = opts;

  // GET /api/templates - list global + tenant templates
  fastify.get(
    '/api/templates',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = request.tenantContext;
      const templates = await templateService.list(tenantId);
      return reply.send({ data: templates });
    },
  );

  // GET /api/templates/:id - get template by ID
  fastify.get(
    '/api/templates/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const template = await templateService.get(id);
      if (!template) {
        return reply
          .status(404)
          .send({ error: 'Not Found', message: 'Template not found', statusCode: 404 });
      }
      return reply.send(template);
    },
  );

  // POST /api/templates - create template
  fastify.post(
    '/api/templates',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = request.tenantContext;
      const body = request.body as {
        name?: string;
        description?: string;
        category?: string;
        workflowData?: Record<string, unknown>;
        isGlobal?: boolean;
        tags?: string[];
      } | null;

      if (!body?.name || !body.description || !body.category || !body.workflowData) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'name, description, category, and workflowData are required',
          statusCode: 400,
        });
      }

      const template = await templateService.create({
        name: body.name,
        description: body.description,
        category: body.category,
        workflowData: body.workflowData,
        isGlobal: body.isGlobal,
        tenantId,
        tags: body.tags,
      });

      return reply.status(201).send(template);
    },
  );

  // PUT /api/templates/:id - update template
  fastify.put(
    '/api/templates/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = request.tenantContext;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        description?: string;
        category?: string;
        workflowData?: Record<string, unknown>;
        tags?: string[];
      } | null;

      if (!body) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Request body is required',
          statusCode: 400,
        });
      }

      const template = await templateService.update(id, tenantId, body);
      if (!template) {
        return reply
          .status(404)
          .send({ error: 'Not Found', message: 'Template not found or access denied', statusCode: 404 });
      }

      return reply.send(template);
    },
  );

  // DELETE /api/templates/:id - delete template
  fastify.delete(
    '/api/templates/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = request.tenantContext;
      const { id } = request.params as { id: string };

      const deleted = await templateService.delete(id, tenantId);
      if (!deleted) {
        return reply
          .status(404)
          .send({ error: 'Not Found', message: 'Template not found or access denied', statusCode: 404 });
      }

      return reply.send({ message: 'Template deleted' });
    },
  );

  // POST /api/templates/:id/fork - fork template to workflow data
  fastify.post(
    '/api/templates/:id/fork',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = request.tenantContext;
      const { id } = request.params as { id: string };

      const workflowData = await templateService.forkToWorkflow(id, tenantId);
      if (!workflowData) {
        return reply
          .status(404)
          .send({ error: 'Not Found', message: 'Template not found', statusCode: 404 });
      }

      return reply.send(workflowData);
    },
  );
}

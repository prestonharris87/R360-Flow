import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TenantService } from '../services/tenant-service';

export interface AdminRoutesConfig {
  adminApiKey: string;
  tenantService: TenantService;
}

export async function adminRoutes(
  fastify: FastifyInstance,
  opts: AdminRoutesConfig,
): Promise<void> {
  // Admin API key authentication hook
  fastify.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const apiKey = request.headers['x-admin-api-key'];
      if (apiKey !== opts.adminApiKey) {
        return reply
          .status(401)
          .send({ error: 'Invalid or missing admin API key' });
      }
    },
  );

  // POST /api/admin/tenants - create tenant
  fastify.post(
    '/api/admin/tenants',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { name: string; plan?: string } | null;
      if (!body?.name) {
        return reply.status(400).send({ error: 'name is required' });
      }
      const tenant = await opts.tenantService.createTenant(body);
      return reply.status(201).send(tenant);
    },
  );

  // GET /api/admin/tenants/:id - get tenant
  fastify.get(
    '/api/admin/tenants/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const tenant = await opts.tenantService.getTenant(id);
      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }
      return reply.send(tenant);
    },
  );

  // PUT /api/admin/tenants/:id/plan - update plan
  fastify.put(
    '/api/admin/tenants/:id/plan',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { plan: string } | null;
      if (!body?.plan) {
        return reply.status(400).send({ error: 'plan is required' });
      }
      const tenant = await opts.tenantService.updatePlan(id, body.plan);
      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }
      return reply.send(tenant);
    },
  );

  // DELETE /api/admin/tenants/:id - deactivate
  fastify.delete(
    '/api/admin/tenants/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const tenant = await opts.tenantService.deactivate(id);
      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }
      return reply.send({ deactivated: true, tenant });
    },
  );
}

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { templateRoutes } from '../../routes/template-routes.js';
import { TemplateService } from '../../services/template-service.js';
import type {
  TemplateStore,
  TemplateRecord,
} from '../../services/template-service.js';

// ---------------------------------------------------------------------------
// In-memory TemplateStore for route-level testing
// ---------------------------------------------------------------------------

class InMemoryTemplateStore implements TemplateStore {
  private templates = new Map<string, TemplateRecord>();

  async create(template: TemplateRecord): Promise<TemplateRecord> {
    this.templates.set(template.id, template);
    return template;
  }

  async getById(id: string): Promise<TemplateRecord | null> {
    return this.templates.get(id) ?? null;
  }

  async listGlobal(): Promise<TemplateRecord[]> {
    return [...this.templates.values()].filter((t) => t.isGlobal);
  }

  async listByTenant(tenantId: string): Promise<TemplateRecord[]> {
    return [...this.templates.values()].filter(
      (t) => !t.isGlobal && t.tenantId === tenantId,
    );
  }

  async update(
    id: string,
    data: Partial<Omit<TemplateRecord, 'id' | 'createdAt'>>,
  ): Promise<TemplateRecord | null> {
    const existing = this.templates.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data } as TemplateRecord;
    this.templates.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.templates.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Build a minimal Fastify app with mock auth and template routes
// ---------------------------------------------------------------------------

const TEST_TENANT_ID = 'tenant-tpl-test';
const TEST_TENANT_B_ID = 'tenant-tpl-other';

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Simulate auth middleware: set tenantContext from custom header
  app.addHook('onRequest', async (request, _reply) => {
    const tenantId =
      (request.headers['x-test-tenant-id'] as string) ?? TEST_TENANT_ID;
    // Decorate with tenantContext matching the real auth middleware shape
    (request as any).tenantContext = {
      tenantId,
      userId: 'user-1',
      role: 'admin',
    };
  });

  const store = new InMemoryTemplateStore();
  const templateService = new TemplateService(store);

  await app.register(templateRoutes, { templateService });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Template Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/templates', () => {
    it('creates a template and returns 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {
          name: 'Email Automation',
          description: 'Automates email campaigns',
          category: 'marketing',
          workflowData: { nodes: [{ type: 'email' }], connections: {} },
          tags: ['email', 'marketing'],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Email Automation');
      expect(body.description).toBe('Automates email campaigns');
      expect(body.category).toBe('marketing');
      expect(body.tenantId).toBe(TEST_TENANT_ID);
      expect(body.tags).toEqual(['email', 'marketing']);
      expect(body.version).toBe(1);
    });

    it('returns 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/templates',
        payload: { name: 'Incomplete' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe('Validation Error');
    });
  });

  describe('GET /api/templates', () => {
    it('lists templates for the tenant', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/templates',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/templates/:id', () => {
    it('returns a template by id', async () => {
      // Create one first
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {
          name: 'Get Test',
          description: 'For get test',
          category: 'testing',
          workflowData: { nodes: [] },
        },
      });
      const templateId = createRes.json().id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/templates/${templateId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(templateId);
      expect(body.name).toBe('Get Test');
    });

    it('returns 404 for non-existent template', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/templates/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/templates/:id', () => {
    it('updates own tenant template', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {
          name: 'Before Update',
          description: 'Original',
          category: 'general',
          workflowData: { nodes: [] },
        },
      });
      const templateId = createRes.json().id;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/templates/${templateId}`,
        payload: { name: 'After Update', description: 'Modified' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe('After Update');
      expect(body.description).toBe('Modified');
    });

    it('returns 404 when updating another tenant\'s template', async () => {
      // Create as tenant A
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {
          name: 'Tenant A Template',
          description: 'Owned by A',
          category: 'general',
          workflowData: { nodes: [] },
        },
      });
      const templateId = createRes.json().id;

      // Attempt update as tenant B
      const response = await app.inject({
        method: 'PUT',
        url: `/api/templates/${templateId}`,
        headers: { 'x-test-tenant-id': TEST_TENANT_B_ID },
        payload: { name: 'Hacked' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/templates/:id', () => {
    it('deletes own template', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {
          name: 'To Delete',
          description: 'Will be deleted',
          category: 'general',
          workflowData: { nodes: [] },
        },
      });
      const templateId = createRes.json().id;

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/templates/${templateId}`,
      });

      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json().message).toBe('Template deleted');

      // Verify it is gone
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/templates/${templateId}`,
      });
      expect(getRes.statusCode).toBe(404);
    });

    it('returns 404 when deleting another tenant\'s template', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {
          name: 'Protected Template',
          description: 'Not yours',
          category: 'general',
          workflowData: { nodes: [] },
        },
      });
      const templateId = createRes.json().id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/templates/${templateId}`,
        headers: { 'x-test-tenant-id': TEST_TENANT_B_ID },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/templates/:id/fork', () => {
    it('forks a template to workflow data', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {
          name: 'CRM Automation',
          description: 'CRM workflow',
          category: 'sales',
          workflowData: {
            nodes: [{ type: 'crm-trigger' }],
            connections: { a: 'b' },
          },
        },
      });
      const templateId = createRes.json().id;

      const response = await app.inject({
        method: 'POST',
        url: `/api/templates/${templateId}/fork`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe('CRM Automation (from template)');
      expect(body.forkedFromTemplate).toBe(templateId);
      expect(body.nodes).toEqual([{ type: 'crm-trigger' }]);
      expect(body.connections).toEqual({ a: 'b' });
    });

    it('returns 404 when forking non-existent template', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/templates/non-existent-id/fork',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});

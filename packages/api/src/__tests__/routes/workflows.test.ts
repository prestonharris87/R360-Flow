import { describe, it, expect, beforeAll } from 'vitest';
import { createTestServer } from '../helpers/test-server';
import { signTestToken } from '../helpers/test-auth';

describe('Workflow CRUD API', () => {
  let app: Awaited<ReturnType<typeof createTestServer>>;
  let tenantAToken: string;
  let tenantBToken: string;

  beforeAll(async () => {
    app = await createTestServer();
    tenantAToken = await signTestToken({
      tenantId: 'tenant-a',
      userId: 'user-1',
      role: 'admin',
    });
    tenantBToken = await signTestToken({
      tenantId: 'tenant-b',
      userId: 'user-2',
      role: 'admin',
    });
  });

  describe('POST /api/workflows', () => {
    it('creates a workflow for the authenticated tenant', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: {
          name: 'My First Workflow',
          description: 'A test workflow',
          definitionJson: { nodes: [], edges: [] },
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe('My First Workflow');
      expect(body.tenantId).toBe('tenant-a');
      expect(body.status).toBe('draft');
    });

    it('rejects invalid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { definitionJson: {} }, // missing name
      });
      expect(response.statusCode).toBe(400);
    });

    it('rejects viewer role', async () => {
      const viewerToken = await signTestToken({
        tenantId: 'tenant-a',
        userId: 'user-viewer',
        role: 'viewer',
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${viewerToken}` },
        payload: { name: 'Should Fail', definitionJson: {} },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/workflows', () => {
    it('returns only workflows for the authenticated tenant', async () => {
      // Create workflow for tenant A
      await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'Tenant A Workflow', definitionJson: {} },
      });

      // List as tenant B -- should NOT see tenant A's workflow
      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantBToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      const names = body.data.map((w: any) => w.name);
      expect(names).not.toContain('Tenant A Workflow');
    });

    it('supports pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows?page=1&limit=5',
        headers: { authorization: `Bearer ${tenantAToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(5);
      expect(body.pagination.total).toBeDefined();
      expect(body.pagination.totalPages).toBeDefined();
    });

    it('returns pagination with default values when no query params', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(20);
    });
  });

  describe('GET /api/workflows/:id', () => {
    it('returns a workflow for the authenticated tenant', async () => {
      // Create as tenant A
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'Fetchable Workflow', definitionJson: {} },
      });
      const workflowId = createRes.json().id;

      // Fetch as tenant A
      const response = await app.inject({
        method: 'GET',
        url: `/api/workflows/${workflowId}`,
        headers: { authorization: `Bearer ${tenantAToken}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('Fetchable Workflow');
    });

    it('returns 404 for workflow belonging to different tenant', async () => {
      // Create as tenant A
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'Private Workflow', definitionJson: {} },
      });
      const workflowId = createRes.json().id;

      // Fetch as tenant B
      const response = await app.inject({
        method: 'GET',
        url: `/api/workflows/${workflowId}`,
        headers: { authorization: `Bearer ${tenantBToken}` },
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows/not-a-uuid',
        headers: { authorization: `Bearer ${tenantAToken}` },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /api/workflows/:id', () => {
    it('updates workflow name and description', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'Original Name', definitionJson: {} },
      });
      const workflowId = createRes.json().id;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/workflows/${workflowId}`,
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'Updated Name', description: 'Now with desc' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('Updated Name');
      expect(response.json().description).toBe('Now with desc');
    });

    it('returns 404 for other tenant workflow', async () => {
      // Create as tenant A
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'Tenant A Only', definitionJson: {} },
      });
      const workflowId = createRes.json().id;

      // Try to update as tenant B
      const response = await app.inject({
        method: 'PUT',
        url: `/api/workflows/${workflowId}`,
        headers: { authorization: `Bearer ${tenantBToken}` },
        payload: { name: 'Hacked Name' },
      });
      expect(response.statusCode).toBe(404);
    });

    it('rejects viewer role', async () => {
      const viewerToken = await signTestToken({
        tenantId: 'tenant-a',
        userId: 'user-viewer',
        role: 'viewer',
      });
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'No Update', definitionJson: {} },
      });
      const workflowId = createRes.json().id;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/workflows/${workflowId}`,
        headers: { authorization: `Bearer ${viewerToken}` },
        payload: { name: 'Should Fail' },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/workflows/:id', () => {
    it('soft-deletes by setting status to archived', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'To Delete', definitionJson: {} },
      });
      const workflowId = createRes.json().id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workflows/${workflowId}`,
        headers: { authorization: `Bearer ${tenantAToken}` },
      });
      expect(response.statusCode).toBe(200);

      // Verify it's archived
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/workflows/${workflowId}`,
        headers: { authorization: `Bearer ${tenantAToken}` },
      });
      expect(getRes.json().status).toBe('archived');
      expect(getRes.json().isActive).toBe(false);
    });

    it('returns 404 for other tenant workflow', async () => {
      // Create as tenant A
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'Cannot Delete Cross-Tenant', definitionJson: {} },
      });
      const workflowId = createRes.json().id;

      // Try to delete as tenant B
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workflows/${workflowId}`,
        headers: { authorization: `Bearer ${tenantBToken}` },
      });
      expect(response.statusCode).toBe(404);
    });

    it('requires admin role', async () => {
      const memberToken = await signTestToken({
        tenantId: 'tenant-a',
        userId: 'user-member',
        role: 'member',
      });
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { name: 'No Delete For Members', definitionJson: {} },
      });
      const workflowId = createRes.json().id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workflows/${workflowId}`,
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(response.statusCode).toBe(403);
    });
  });
});

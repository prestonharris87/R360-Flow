import { describe, it, expect, beforeAll } from 'vitest';
import { createTestServer } from '../helpers/test-server.js';
import { signTestToken } from '../helpers/test-auth.js';

describe('Execution History API', () => {
  let app: Awaited<ReturnType<typeof createTestServer>>;
  let token: string;
  let workflowId: string;

  beforeAll(async () => {
    app = await createTestServer();
    token = await signTestToken({
      tenantId: 'tenant-exec',
      userId: 'user-1',
      role: 'admin',
    });

    // Create a workflow to execute against
    const res = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Test Workflow', definitionJson: { nodes: [], edges: [] } },
    });
    workflowId = res.json().id;
  });

  describe('POST /api/workflows/:id/execute', () => {
    it('creates a pending execution record', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workflows/${workflowId}/execute`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(response.statusCode).toBe(202); // Accepted
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.status).toBe('pending');
      expect(body.workflowId).toBe(workflowId);
      expect(body.tenantId).toBeDefined();
    });

    it('returns 404 for nonexistent workflow', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000099';
      const response = await app.inject({
        method: 'POST',
        url: `/api/workflows/${fakeId}/execute`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for other tenant workflow', async () => {
      // Create a workflow under a different tenant
      const otherToken = await signTestToken({
        tenantId: 'tenant-other-exec',
        userId: 'user-other',
        role: 'admin',
      });
      const wfRes = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { name: 'Other Tenant Workflow', definitionJson: {} },
      });
      const otherWorkflowId = wfRes.json().id;

      // Try to execute it with the original tenant's token
      const response = await app.inject({
        method: 'POST',
        url: `/api/workflows/${otherWorkflowId}/execute`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/executions', () => {
    it('lists executions for the tenant with pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/executions',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toBeInstanceOf(Array);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBeDefined();
      expect(body.pagination.total).toBeGreaterThanOrEqual(1);
      expect(body.pagination.totalPages).toBeGreaterThanOrEqual(1);
    });

    it('filters by workflowId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/executions?workflowId=${workflowId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      for (const exec of body.data) {
        expect(exec.workflowId).toBe(workflowId);
      }
    });

    it('filters by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/executions?status=pending',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      for (const exec of body.data) {
        expect(exec.status).toBe('pending');
      }
    });
  });

  describe('GET /api/executions/:id', () => {
    it('returns execution detail with steps array', async () => {
      // Trigger an execution first
      const execRes = await app.inject({
        method: 'POST',
        url: `/api/workflows/${workflowId}/execute`,
        headers: { authorization: `Bearer ${token}` },
      });
      const executionId = execRes.json().id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/executions/${executionId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(executionId);
      expect(body.steps).toBeInstanceOf(Array);
    });

    it('returns 404 for execution from different tenant', async () => {
      // Create an execution under the main tenant
      const execRes = await app.inject({
        method: 'POST',
        url: `/api/workflows/${workflowId}/execute`,
        headers: { authorization: `Bearer ${token}` },
      });
      const executionId = execRes.json().id;

      // Try to access it with a different tenant's token
      const otherToken = await signTestToken({
        tenantId: 'tenant-cross-exec',
        userId: 'user-cross',
        role: 'admin',
      });
      const response = await app.inject({
        method: 'GET',
        url: `/api/executions/${executionId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(response.statusCode).toBe(404);
    });
  });
});

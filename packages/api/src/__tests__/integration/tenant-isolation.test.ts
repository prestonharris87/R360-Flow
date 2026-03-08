import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer } from '../helpers/test-server';
import { signTestToken } from '../helpers/test-auth';
import { truncateAllTables, seedTenant } from '../setup';
import type { FastifyInstance } from 'fastify';

/**
 * Tenant Isolation Integration Tests
 *
 * These tests verify that multi-tenant isolation is correctly enforced across
 * the full API surface. Each test creates data as one tenant and then attempts
 * to access or mutate that data as a different tenant.
 *
 * Requirements:
 * - Real PostgreSQL database (configured via DATABASE_URL)
 * - Database schema migrated (tables must exist)
 */

// Fixed UUIDs for deterministic, repeatable tests
const TENANT_A_ID = '00000000-0000-4000-a000-000000000001';
const TENANT_B_ID = '00000000-0000-4000-a000-000000000002';
const USER_A_ID = '00000000-0000-4000-b000-000000000001';
const USER_B_ID = '00000000-0000-4000-b000-000000000002';

describe('Tenant Isolation (Integration)', () => {
  let app: FastifyInstance;
  let tenantAToken: string;
  let tenantBToken: string;

  beforeAll(async () => {
    // Clean database state
    await truncateAllTables();

    // Seed tenant records (required for FK constraints)
    await seedTenant(TENANT_A_ID, 'Tenant A', 'tenant-a');
    await seedTenant(TENANT_B_ID, 'Tenant B', 'tenant-b');

    // Build test server
    app = await createTestServer();

    // Generate auth tokens for each tenant
    tenantAToken = await signTestToken({
      tenantId: TENANT_A_ID,
      userId: USER_A_ID,
      role: 'admin',
    });
    tenantBToken = await signTestToken({
      tenantId: TENANT_B_ID,
      userId: USER_B_ID,
      role: 'admin',
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ---- Workflow Isolation ----

  it('Tenant A cannot see Tenant B workflows via GET /api/workflows', async () => {
    // Tenant B creates a workflow
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${tenantBToken}` },
      payload: {
        name: 'Secret B Workflow',
        definitionJson: { nodes: [], edges: [] },
      },
    });
    expect(createRes.statusCode).toBe(201);

    // Tenant A lists all workflows -- should NOT contain Tenant B's workflow
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${tenantAToken}` },
    });
    expect(listRes.statusCode).toBe(200);

    const body = listRes.json();
    const names = body.data.map((w: { name: string }) => w.name);
    expect(names).not.toContain('Secret B Workflow');

    // Also verify none of the returned workflows belong to Tenant B
    const tenantIds = body.data.map((w: { tenantId: string }) => w.tenantId);
    for (const tid of tenantIds) {
      expect(tid).not.toBe(TENANT_B_ID);
    }
  });

  it('Tenant A cannot see Tenant B credentials via GET /api/credentials', async () => {
    // Tenant B creates a credential
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/credentials',
      headers: { authorization: `Bearer ${tenantBToken}` },
      payload: {
        name: 'B Secret API Key',
        type: 'apiKey',
        data: { key: 'sk-super-secret-b' },
      },
    });
    expect(createRes.statusCode).toBe(201);

    // Tenant A lists all credentials -- should NOT contain Tenant B's credential
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/credentials',
      headers: { authorization: `Bearer ${tenantAToken}` },
    });
    expect(listRes.statusCode).toBe(200);

    const body = listRes.json();
    const names = body.data.map((c: { name: string }) => c.name);
    expect(names).not.toContain('B Secret API Key');
  });

  it('Tenant A cannot see Tenant B executions via GET /api/executions', async () => {
    // Tenant B creates a workflow and triggers an execution
    const wfRes = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${tenantBToken}` },
      payload: {
        name: 'B Execution Workflow',
        definitionJson: { nodes: [], edges: [] },
      },
    });
    expect(wfRes.statusCode).toBe(201);
    const workflowId = wfRes.json().id;

    const execRes = await app.inject({
      method: 'POST',
      url: `/api/workflows/${workflowId}/execute`,
      headers: { authorization: `Bearer ${tenantBToken}` },
    });
    expect(execRes.statusCode).toBe(202);

    // Tenant A lists all executions -- should NOT contain Tenant B's execution
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/executions',
      headers: { authorization: `Bearer ${tenantAToken}` },
    });
    expect(listRes.statusCode).toBe(200);

    const body = listRes.json();
    const workflowIds = body.data.map((e: { workflowId: string }) => e.workflowId);
    expect(workflowIds).not.toContain(workflowId);

    // Also verify none of the returned executions belong to Tenant B
    const tenantIds = body.data.map((e: { tenantId: string }) => e.tenantId);
    for (const tid of tenantIds) {
      expect(tid).not.toBe(TENANT_B_ID);
    }
  });

  // ---- Mutation Isolation ----

  it('Tenant A cannot update Tenant B workflow (PUT returns 404)', async () => {
    // Tenant B creates a workflow
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${tenantBToken}` },
      payload: {
        name: 'B Protected Workflow',
        definitionJson: { nodes: [], edges: [] },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const workflowId = createRes.json().id;

    // Tenant A tries to update it
    const updateRes = await app.inject({
      method: 'PUT',
      url: `/api/workflows/${workflowId}`,
      headers: { authorization: `Bearer ${tenantAToken}` },
      payload: { name: 'Hijacked!' },
    });
    expect(updateRes.statusCode).toBe(404);

    // Verify the original name is unchanged
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/workflows/${workflowId}`,
      headers: { authorization: `Bearer ${tenantBToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe('B Protected Workflow');
  });

  it('Tenant A cannot delete Tenant B workflow (DELETE returns 404)', async () => {
    // Tenant B creates a workflow
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${tenantBToken}` },
      payload: {
        name: 'B Undeletable Workflow',
        definitionJson: { nodes: [], edges: [] },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const workflowId = createRes.json().id;

    // Tenant A tries to delete it
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/workflows/${workflowId}`,
      headers: { authorization: `Bearer ${tenantAToken}` },
    });
    expect(deleteRes.statusCode).toBe(404);

    // Verify the workflow still exists for Tenant B
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/workflows/${workflowId}`,
      headers: { authorization: `Bearer ${tenantBToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe('B Undeletable Workflow');
    expect(getRes.json().status).not.toBe('archived');
  });

  it('Tenant A cannot trigger execution on Tenant B workflow (POST returns 404)', async () => {
    // Tenant B creates a workflow
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { authorization: `Bearer ${tenantBToken}` },
      payload: {
        name: 'B No Execute For A',
        definitionJson: { nodes: [], edges: [] },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const workflowId = createRes.json().id;

    // Tenant A tries to trigger an execution on it
    const execRes = await app.inject({
      method: 'POST',
      url: `/api/workflows/${workflowId}/execute`,
      headers: { authorization: `Bearer ${tenantAToken}` },
    });
    expect(execRes.statusCode).toBe(404);
  });

  it('Tenant A cannot access Tenant B credential by ID (GET returns 404)', async () => {
    // Tenant B creates a credential
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/credentials',
      headers: { authorization: `Bearer ${tenantBToken}` },
      payload: {
        name: 'B Private Credential',
        type: 'oauth2',
        data: { clientId: 'xxx', clientSecret: 'yyy' },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const credentialId = createRes.json().id;

    // Tenant A tries to fetch it by ID
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/credentials/${credentialId}`,
      headers: { authorization: `Bearer ${tenantAToken}` },
    });
    expect(getRes.statusCode).toBe(404);
  });
});

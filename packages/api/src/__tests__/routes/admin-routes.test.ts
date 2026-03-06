import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { adminRoutes } from '../../routes/admin-routes.js';
import { TenantService } from '../../services/tenant-service.js';
import type { TenantDb, TenantRecord } from '../../services/tenant-service.js';

const TEST_API_KEY = 'test-admin-api-key-secret';

function makeTenantRecord(
  overrides: Partial<TenantRecord> = {},
): TenantRecord {
  return {
    id: overrides.id ?? 'tenant-001',
    name: overrides.name ?? 'Test Tenant',
    plan: overrides.plan ?? 'free',
    active: overrides.active ?? true,
    createdAt: overrides.createdAt ?? new Date('2025-01-01'),
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01'),
    ...(overrides.stripeCustomerId !== undefined
      ? { stripeCustomerId: overrides.stripeCustomerId }
      : {}),
  };
}

function createMockDb(): TenantDb & {
  create: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  getByStripeCustomerId: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
} {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    getByStripeCustomerId: vi.fn(),
    update: vi.fn(),
  };
}

describe('Admin Routes', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createMockDb>;
  let tenantService: TenantService;

  beforeAll(async () => {
    db = createMockDb();
    tenantService = new TenantService(db);

    app = Fastify({ logger: false });
    await app.register(adminRoutes, {
      adminApiKey: TEST_API_KEY,
      tenantService,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject requests without API key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/tenants/some-id',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'Invalid or missing admin API key',
    });
  });

  it('should reject requests with invalid API key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/tenants/some-id',
      headers: { 'x-admin-api-key': 'wrong-key' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'Invalid or missing admin API key',
    });
  });

  it('should create a tenant with valid API key', async () => {
    const created = makeTenantRecord({ name: 'New Org', plan: 'pro' });
    db.create.mockResolvedValue(created);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: { 'x-admin-api-key': TEST_API_KEY },
      payload: { name: 'New Org', plan: 'pro' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe('New Org');
    expect(body.plan).toBe('pro');
  });

  it('should return 400 when name is missing on create', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: { 'x-admin-api-key': TEST_API_KEY },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'name is required' });
  });

  it('should get a tenant', async () => {
    const tenant = makeTenantRecord({ id: 'tenant-get', name: 'Get Me' });
    db.getById.mockResolvedValue(tenant);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/tenants/tenant-get',
      headers: { 'x-admin-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.name).toBe('Get Me');
  });

  it('should update tenant plan', async () => {
    const updated = makeTenantRecord({
      id: 'tenant-plan',
      plan: 'enterprise',
    });
    db.update.mockResolvedValue(updated);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/admin/tenants/tenant-plan/plan',
      headers: { 'x-admin-api-key': TEST_API_KEY },
      payload: { plan: 'enterprise' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.plan).toBe('enterprise');
  });

  it('should deactivate a tenant', async () => {
    const deactivated = makeTenantRecord({
      id: 'tenant-deact',
      active: false,
    });
    db.update.mockResolvedValue(deactivated);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/tenants/tenant-deact',
      headers: { 'x-admin-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.deactivated).toBe(true);
    expect(body.tenant.active).toBe(false);
  });

  it('should return 404 for non-existent tenant on GET', async () => {
    db.getById.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/tenants/does-not-exist',
      headers: { 'x-admin-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Tenant not found' });
  });

  it('should return 404 for non-existent tenant on plan update', async () => {
    db.update.mockResolvedValue(null);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/admin/tenants/does-not-exist/plan',
      headers: { 'x-admin-api-key': TEST_API_KEY },
      payload: { plan: 'pro' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Tenant not found' });
  });

  it('should return 404 for non-existent tenant on deactivate', async () => {
    db.update.mockResolvedValue(null);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/tenants/does-not-exist',
      headers: { 'x-admin-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Tenant not found' });
  });
});

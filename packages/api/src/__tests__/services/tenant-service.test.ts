import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TenantService } from '../../services/tenant-service.js';
import type { TenantDb, TenantRecord } from '../../services/tenant-service.js';

function makeTenantRecord(
  overrides: Partial<TenantRecord> = {},
): TenantRecord {
  return {
    id: overrides.id ?? 'test-id',
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

describe('TenantService', () => {
  let db: ReturnType<typeof createMockDb>;
  let service: TenantService;

  beforeEach(() => {
    db = createMockDb();
    service = new TenantService(db);
  });

  it('should create a tenant with default free plan', async () => {
    const expected = makeTenantRecord({ name: 'Acme Corp', plan: 'free' });
    db.create.mockResolvedValue(expected);

    const result = await service.createTenant({ name: 'Acme Corp' });

    expect(result).toEqual(expected);
    expect(db.create).toHaveBeenCalledOnce();
    const callArg = db.create.mock.calls[0]![0] as {
      id: string;
      name: string;
      plan: string;
      active: boolean;
    };
    expect(callArg.name).toBe('Acme Corp');
    expect(callArg.plan).toBe('free');
    expect(callArg.active).toBe(true);
    expect(callArg.id).toBeDefined();
  });

  it('should create a tenant with specified plan', async () => {
    const expected = makeTenantRecord({ name: 'Pro Co', plan: 'pro' });
    db.create.mockResolvedValue(expected);

    const result = await service.createTenant({
      name: 'Pro Co',
      plan: 'pro',
    });

    expect(result).toEqual(expected);
    const callArg = db.create.mock.calls[0]![0] as {
      id: string;
      name: string;
      plan: string;
      active: boolean;
    };
    expect(callArg.plan).toBe('pro');
  });

  it('should get tenant by id', async () => {
    const expected = makeTenantRecord({ id: 'tenant-123' });
    db.getById.mockResolvedValue(expected);

    const result = await service.getTenant('tenant-123');

    expect(result).toEqual(expected);
    expect(db.getById).toHaveBeenCalledWith('tenant-123');
  });

  it('should return null for non-existent tenant', async () => {
    db.getById.mockResolvedValue(null);

    const result = await service.getTenant('non-existent');

    expect(result).toBeNull();
    expect(db.getById).toHaveBeenCalledWith('non-existent');
  });

  it('should update tenant plan', async () => {
    const expected = makeTenantRecord({ id: 'tenant-123', plan: 'enterprise' });
    db.update.mockResolvedValue(expected);

    const result = await service.updatePlan('tenant-123', 'enterprise');

    expect(result).toEqual(expected);
    expect(db.update).toHaveBeenCalledWith('tenant-123', {
      plan: 'enterprise',
    });
  });

  it('should deactivate tenant', async () => {
    const expected = makeTenantRecord({ id: 'tenant-123', active: false });
    db.update.mockResolvedValue(expected);

    const result = await service.deactivate('tenant-123');

    expect(result).toEqual(expected);
    expect(db.update).toHaveBeenCalledWith('tenant-123', { active: false });
  });

  it('should set stripe customer id', async () => {
    const expected = makeTenantRecord({
      id: 'tenant-123',
      stripeCustomerId: 'cus_abc123',
    });
    db.update.mockResolvedValue(expected);

    const result = await service.setStripeCustomerId(
      'tenant-123',
      'cus_abc123',
    );

    expect(result).toEqual(expected);
    expect(db.update).toHaveBeenCalledWith('tenant-123', {
      stripeCustomerId: 'cus_abc123',
    });
  });

  it('should get tenant by stripe customer id', async () => {
    const expected = makeTenantRecord({
      id: 'tenant-123',
      stripeCustomerId: 'cus_xyz',
    });
    db.getByStripeCustomerId.mockResolvedValue(expected);

    const result = await service.getByStripeCustomerId('cus_xyz');

    expect(result).toEqual(expected);
    expect(db.getByStripeCustomerId).toHaveBeenCalledWith('cus_xyz');
  });
});

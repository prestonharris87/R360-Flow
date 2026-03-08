import { describe, it, expect } from 'vitest';
import { TenantService, type TenantDb, type TenantRecord } from '../../services/tenant-service';

describe('Multi-Tenant Load Tests', () => {
  function createInMemoryTenantDb(): TenantDb {
    const tenants = new Map<string, TenantRecord>();
    return {
      async create(tenant) {
        const record: TenantRecord = {
          ...tenant,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        tenants.set(tenant.id, record);
        return record;
      },
      async getById(id) {
        return tenants.get(id) ?? null;
      },
      async getByStripeCustomerId(customerId) {
        for (const t of tenants.values()) {
          if (t.stripeCustomerId === customerId) return t;
        }
        return null;
      },
      async update(id, data) {
        const t = tenants.get(id);
        if (!t) return null;
        const updated: TenantRecord = { ...t, ...data, updatedAt: new Date() };
        tenants.set(id, updated);
        return updated;
      },
    };
  }

  it('should handle 50 concurrent tenant creations', async () => {
    const db = createInMemoryTenantDb();
    const service = new TenantService(db);

    const start = performance.now();
    const promises = Array.from({ length: 50 }, (_, i) =>
      service.createTenant({ name: `Tenant ${i}` }),
    );
    const results = await Promise.all(promises);
    const elapsed = performance.now() - start;

    expect(results).toHaveLength(50);
    // All unique IDs
    const ids = new Set(results.map(r => r.id));
    expect(ids.size).toBe(50);
    // Should complete quickly (< 1000ms for in-memory)
    expect(elapsed).toBeLessThan(1000);
  });

  it('should maintain tenant isolation under concurrent access', async () => {
    const db = createInMemoryTenantDb();
    const service = new TenantService(db);

    // Create 20 tenants
    const tenants = await Promise.all(
      Array.from({ length: 20 }, (_, i) => service.createTenant({ name: `Tenant ${i}` })),
    );

    // Concurrent reads - each tenant should only see itself
    const readPromises = tenants.map(t => service.getTenant(t.id));
    const readResults = await Promise.all(readPromises);

    readResults.forEach((result, i) => {
      expect(result).not.toBeNull();
      expect(result!.id).toBe(tenants[i]!.id);
      expect(result!.name).toBe(`Tenant ${i}`);
    });
  });

  it('should handle concurrent plan updates without interference', async () => {
    const db = createInMemoryTenantDb();
    const service = new TenantService(db);

    const tenants = await Promise.all(
      Array.from({ length: 10 }, (_, i) => service.createTenant({ name: `Tenant ${i}` })),
    );

    // Update each tenant's plan concurrently
    const plans = ['free', 'pro', 'enterprise', 'pro', 'free', 'enterprise', 'pro', 'free', 'enterprise', 'pro'];
    await Promise.all(
      tenants.map((t, i) => service.updatePlan(t.id, plans[i]!)),
    );

    // Verify each got the right plan
    const results = await Promise.all(tenants.map(t => service.getTenant(t.id)));
    results.forEach((r, i) => {
      expect(r!.plan).toBe(plans[i]);
    });
  });

  it('should calculate operation latency metrics', async () => {
    const db = createInMemoryTenantDb();
    const service = new TenantService(db);

    const latencies: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await service.createTenant({ name: `Tenant ${i}` });
      latencies.push(performance.now() - start);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)]!;
    const p95 = latencies[Math.floor(latencies.length * 0.95)]!;
    const p99 = latencies[Math.floor(latencies.length * 0.99)]!;

    expect(p50).toBeLessThan(50); // Should be fast in-memory
    expect(p95).toBeLessThan(100);
    expect(p99).toBeLessThan(200);
  });
});

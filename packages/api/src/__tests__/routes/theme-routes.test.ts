import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { themeRoutes } from '../../routes/theme-routes';
import { ThemeService } from '../../services/theme-service';
import type { ThemeStore, ThemeConfig } from '../../services/theme-service';

function createMockStore(): ThemeStore & {
  get: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
}

/**
 * Creates a Fastify test app with a mock auth hook that sets tenantContext
 * based on the x-tenant-id header, then registers the theme routes.
 */
async function buildTestApp(themeService: ThemeService): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Mock auth: extract tenantId from x-tenant-id header
  app.addHook('onRequest', async (request) => {
    const tenantId = request.headers['x-tenant-id'] as string | undefined;
    if (tenantId) {
      (request as any).tenantContext = {
        tenantId,
        userId: 'test-user',
        role: 'admin',
      };
    }
  });

  await app.register(themeRoutes, { themeService });
  await app.ready();
  return app;
}

describe('Theme Routes', () => {
  let app: FastifyInstance;
  let store: ReturnType<typeof createMockStore>;
  let themeService: ThemeService;

  beforeAll(async () => {
    store = createMockStore();
    themeService = new ThemeService(store);
    app = await buildTestApp(themeService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/theme', () => {
    it('should return default theme when none configured', async () => {
      store.get.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/theme',
        headers: { 'x-tenant-id': 'tenant-1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tenantId).toBe('tenant-1');
      expect(body.primaryColor).toBe('#3B82F6');
      expect(body.appName).toBe('R360 Flow');
    });

    it('should return saved theme for tenant', async () => {
      const saved: ThemeConfig = {
        tenantId: 'tenant-2',
        primaryColor: '#FF0000',
        secondaryColor: '#00FF00',
        accentColor: '#0000FF',
        fontFamily: 'Roboto, sans-serif',
        appName: 'Custom App',
        logoUrl: 'https://example.com/logo.png',
      };
      store.get.mockResolvedValue(saved);

      const response = await app.inject({
        method: 'GET',
        url: '/api/theme',
        headers: { 'x-tenant-id': 'tenant-2' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tenantId).toBe('tenant-2');
      expect(body.primaryColor).toBe('#FF0000');
      expect(body.appName).toBe('Custom App');
      expect(body.logoUrl).toBe('https://example.com/logo.png');
    });

    it('should return 401 when tenant context is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/theme',
        // No x-tenant-id header
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe('Unauthorized');
    });
  });

  describe('PUT /api/theme', () => {
    it('should update theme for tenant', async () => {
      store.get.mockResolvedValue(null);
      const updated: ThemeConfig = {
        tenantId: 'tenant-1',
        primaryColor: '#FF0000',
        secondaryColor: '#1E293B',
        accentColor: '#10B981',
        fontFamily: 'Inter, system-ui, sans-serif',
        appName: 'Updated App',
      };
      store.save.mockResolvedValue(updated);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/theme',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: {
          primaryColor: '#FF0000',
          appName: 'Updated App',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.primaryColor).toBe('#FF0000');
      expect(body.appName).toBe('Updated App');
    });

    it('should return 401 when tenant context is missing', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/theme',
        payload: { primaryColor: '#FF0000' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe('Unauthorized');
    });
  });

  describe('DELETE /api/theme', () => {
    it('should reset theme to default', async () => {
      store.delete.mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/theme',
        headers: { 'x-tenant-id': 'tenant-1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tenantId).toBe('tenant-1');
      expect(body.primaryColor).toBe('#3B82F6');
      expect(body.appName).toBe('R360 Flow');
      expect(store.delete).toHaveBeenCalledWith('tenant-1');
    });

    it('should return 401 when tenant context is missing', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/theme',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe('Unauthorized');
    });
  });

  describe('Tenant isolation', () => {
    it('should return different themes for different tenants', async () => {
      store.get.mockImplementation(async (tenantId: string) => {
        if (tenantId === 'tenant-a') {
          return {
            tenantId: 'tenant-a',
            primaryColor: '#AA0000',
            secondaryColor: '#1E293B',
            accentColor: '#10B981',
            fontFamily: 'Inter, system-ui, sans-serif',
            appName: 'Tenant A',
          };
        }
        return null;
      });

      const responseA = await app.inject({
        method: 'GET',
        url: '/api/theme',
        headers: { 'x-tenant-id': 'tenant-a' },
      });

      const responseB = await app.inject({
        method: 'GET',
        url: '/api/theme',
        headers: { 'x-tenant-id': 'tenant-b' },
      });

      expect(responseA.statusCode).toBe(200);
      expect(responseB.statusCode).toBe(200);

      const bodyA = responseA.json();
      const bodyB = responseB.json();

      expect(bodyA.tenantId).toBe('tenant-a');
      expect(bodyA.primaryColor).toBe('#AA0000');
      expect(bodyA.appName).toBe('Tenant A');

      expect(bodyB.tenantId).toBe('tenant-b');
      expect(bodyB.primaryColor).toBe('#3B82F6'); // default
      expect(bodyB.appName).toBe('R360 Flow'); // default
    });
  });
});

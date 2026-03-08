import { describe, it, expect, beforeAll } from 'vitest';
import { createTestServer } from '../helpers/test-server';

describe('API Documentation Routes', () => {
  let app: Awaited<ReturnType<typeof createTestServer>>;

  beforeAll(async () => {
    app = await createTestServer();
  });

  describe('GET /api/docs', () => {
    it('should return OpenAPI spec as JSON', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/docs',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');

      const body = response.json();
      expect(body).toBeDefined();
      expect(body.openapi).toBeDefined();
      expect(body.info).toBeDefined();
      expect(body.paths).toBeDefined();
    });

    it('should have valid OpenAPI 3.0 structure', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/docs',
      });

      const spec = response.json();
      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info.title).toBe('R360 Flow API');
      expect(spec.info.version).toBe('1.0.0');
      expect(spec.info.description).toBe('Multi-tenant workflow automation platform API');
      expect(spec.servers).toBeInstanceOf(Array);
      expect(spec.servers.length).toBeGreaterThan(0);
      expect(spec.components).toBeDefined();
      expect(spec.security).toBeInstanceOf(Array);
    });

    it('should include all route groups', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/docs',
      });

      const spec = response.json();
      const paths = Object.keys(spec.paths);

      // Workflows
      expect(paths).toContain('/api/workflows');
      expect(paths).toContain('/api/workflows/{id}');

      // Executions
      expect(paths).toContain('/api/executions');
      expect(paths).toContain('/api/workflows/{id}/execute');

      // Credentials
      expect(paths).toContain('/api/credentials');

      // Templates
      expect(paths).toContain('/api/templates');
      expect(paths).toContain('/api/templates/{id}');
      expect(paths).toContain('/api/templates/{id}/fork');

      // Admin
      expect(paths).toContain('/api/admin/tenants');
      expect(paths).toContain('/api/admin/tenants/{id}');
      expect(paths).toContain('/api/admin/tenants/{id}/plan');

      // Billing
      expect(paths).toContain('/api/billing/webhook');

      // Theme
      expect(paths).toContain('/api/theme');

      // Health
      expect(paths).toContain('/api/health');
      expect(paths).toContain('/api/health/ready');
      expect(paths).toContain('/api/health/live');
      expect(paths).toContain('/api/metrics');
    });

    it('should include security schemes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/docs',
      });

      const spec = response.json();
      const { securitySchemes } = spec.components;

      expect(securitySchemes).toBeDefined();
      expect(securitySchemes.bearerAuth).toBeDefined();
      expect(securitySchemes.bearerAuth.type).toBe('http');
      expect(securitySchemes.bearerAuth.scheme).toBe('bearer');
      expect(securitySchemes.bearerAuth.bearerFormat).toBe('JWT');

      expect(securitySchemes.apiKeyAuth).toBeDefined();
      expect(securitySchemes.apiKeyAuth.type).toBe('apiKey');
      expect(securitySchemes.apiKeyAuth.in).toBe('header');
      expect(securitySchemes.apiKeyAuth.name).toBe('x-admin-api-key');
    });
  });

  describe('GET /api/docs/ui', () => {
    it('should return Swagger UI HTML page', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/docs/ui',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');

      const html = response.body;
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('swagger-ui');
      expect(html).toContain('SwaggerUIBundle');
      expect(html).toContain('R360 Flow API - API Documentation');
      expect(html).toContain('/api/docs');
    });
  });
});

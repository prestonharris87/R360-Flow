import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer } from '../helpers/test-server';
import { signTestToken } from '../helpers/test-auth';
import type { FastifyInstance } from 'fastify';

describe('Credential Type Routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await createTestServer();
    token = await signTestToken({
      tenantId: 'tenant-credtype',
      userId: 'user-1',
      role: 'admin',
    });
  }, 60000); // Allow time for n8n bootstrap

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------
  // GET /api/credential-types
  // -------------------------------------------------------

  describe('GET /api/credential-types', () => {
    it('returns 200 with a list of credential types', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    it('each item has name and displayName', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = response.json();
      expect(body.length).toBeGreaterThan(0);

      // Check first 5 items for shape
      for (const item of body.slice(0, 5)) {
        expect(item.name).toBeDefined();
        expect(typeof item.name).toBe('string');
        expect(item.name.length).toBeGreaterThan(0);
        expect(item.displayName).toBeDefined();
        expect(typeof item.displayName).toBe('string');
        expect(item.displayName.length).toBeGreaterThan(0);
      }
    });

    it('each item has properties array', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = response.json();
      for (const item of body.slice(0, 5)) {
        expect(Array.isArray(item.properties)).toBe(true);
      }
    });

    it('each item has supportedNodes array', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = response.json();
      for (const item of body.slice(0, 5)) {
        expect(Array.isArray(item.supportedNodes)).toBe(true);
      }
    });

    it('filters by search term (case-insensitive)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types?search=basic',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.length).toBeGreaterThan(0);

      // All results should contain "basic" in name or displayName (case-insensitive)
      for (const item of body) {
        const nameMatch = item.name.toLowerCase().includes('basic');
        const displayMatch = item.displayName.toLowerCase().includes('basic');
        expect(nameMatch || displayMatch).toBe(true);
      }
    });

    it('returns empty array for search with no matches', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types?search=zzz_totally_nonexistent_xyz',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual([]);
    });

    it('returns 100+ credential types without filters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = response.json();
      expect(body.length).toBeGreaterThan(100);
    });
  });

  // -------------------------------------------------------
  // GET /api/credential-types/:name
  // -------------------------------------------------------

  describe('GET /api/credential-types/:name', () => {
    it('returns full schema for httpBasicAuth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types/httpBasicAuth',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe('httpBasicAuth');
      expect(body.displayName).toBeDefined();
      expect(typeof body.displayName).toBe('string');
      expect(Array.isArray(body.properties)).toBe(true);
      expect(body.properties.length).toBeGreaterThan(0);
    });

    it('includes mergedProperties in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types/httpBasicAuth',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = response.json();
      expect(Array.isArray(body.mergedProperties)).toBe(true);
      expect(body.mergedProperties.length).toBeGreaterThan(0);
    });

    it('includes supportedNodes in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types/httpBasicAuth',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = response.json();
      expect(Array.isArray(body.supportedNodes)).toBe(true);
    });

    it('includes parentTypes in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types/httpBasicAuth',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = response.json();
      expect(Array.isArray(body.parentTypes)).toBe(true);
      // httpBasicAuth should have no parents
      expect(body.parentTypes.length).toBe(0);
    });

    it('returns 404 for unknown credential type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types/nonExistentType123',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Not Found');
      expect(body.message).toContain('nonExistentType123');
    });

    it('returns httpHeaderAuth with correct properties', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types/httpHeaderAuth',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe('httpHeaderAuth');
      expect(body.displayName).toBeDefined();
      expect(body.properties.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------
  // GET /api/credential-types/:name/properties
  // -------------------------------------------------------

  describe('GET /api/credential-types/:name/properties', () => {
    it('returns merged properties for httpBasicAuth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types/httpBasicAuth/properties',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);

      // Each property should have INodeProperties shape
      for (const prop of body) {
        expect(prop.name).toBeDefined();
        expect(typeof prop.name).toBe('string');
        expect(prop.displayName).toBeDefined();
        expect(prop.type).toBeDefined();
      }
    });

    it('httpBasicAuth properties include user and password', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types/httpBasicAuth/properties',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = response.json();
      const propNames = body.map((p: { name: string }) => p.name);
      expect(propNames).toContain('user');
      expect(propNames).toContain('password');
    });

    it('returns 404 for unknown credential type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types/totallyFakeType/properties',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Not Found');
    });

    it('returns merged properties for types with inheritance', async () => {
      // First, find a type with extends by checking the list endpoint
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/credential-types',
        headers: { authorization: `Bearer ${token}` },
      });

      const allTypes = listResponse.json();
      const typeWithExtends = allTypes.find(
        (t: { extends?: string[] }) => t.extends && t.extends.length > 0,
      );

      if (typeWithExtends) {
        const response = await app.inject({
          method: 'GET',
          url: `/api/credential-types/${typeWithExtends.name}/properties`,
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(Array.isArray(body)).toBe(true);
        // Merged properties should include at least the type's own properties
        expect(body.length).toBeGreaterThan(0);
      }
    });
  });

  // -------------------------------------------------------
  // Authentication enforcement
  // -------------------------------------------------------

  describe('authentication', () => {
    it('requires valid auth token for credential-types list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types',
        // No auth header
      });

      expect(response.statusCode).toBe(401);
    });

    it('requires valid auth token for credential-types detail', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types/httpBasicAuth',
        // No auth header
      });

      expect(response.statusCode).toBe(401);
    });

    it('requires valid auth token for credential-types properties', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types/httpBasicAuth/properties',
        // No auth header
      });

      expect(response.statusCode).toBe(401);
    });

    it('accepts viewer role (no admin required for read-only endpoints)', async () => {
      const viewerToken = await signTestToken({
        tenantId: 'tenant-credtype',
        userId: 'user-viewer',
        role: 'viewer',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/credential-types',
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});

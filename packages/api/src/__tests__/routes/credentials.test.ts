import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer } from '../helpers/test-server.js';
import { signTestToken } from '../helpers/test-auth.js';
import type { FastifyInstance } from 'fastify';

describe('Credential CRUD API', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await createTestServer();
    token = await signTestToken({
      tenantId: 'tenant-cred',
      userId: 'user-1',
      role: 'admin',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/credentials', () => {
    it('creates an encrypted credential and returns 201 without encryptedData', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Slack Bot Token',
          type: 'slackApi',
          data: { token: 'xoxb-secret-value' },
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Slack Bot Token');
      expect(body.type).toBe('slackApi');
      expect(body.tenantId).toBe('tenant-cred');
      expect(body.createdBy).toBe('user-1');
      // Must NOT return encrypted data to client
      expect(body.encryptedData).toBeUndefined();
      expect(body.data).toBeUndefined();
    });

    it('returns 400 for invalid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          // missing required fields
          name: '',
        },
      });
      expect(response.statusCode).toBe(400);
    });

    it('requires admin role', async () => {
      const viewerToken = await signTestToken({
        tenantId: 'tenant-cred',
        userId: 'user-viewer',
        role: 'viewer',
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${viewerToken}` },
        payload: {
          name: 'Test Cred',
          type: 'httpBasicAuth',
          data: { username: 'u', password: 'p' },
        },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/credentials', () => {
    it('lists credentials without exposing encrypted data', async () => {
      // Create a credential first
      await app.inject({
        method: 'POST',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'List Test Cred',
          type: 'httpBasicAuth',
          data: { username: 'admin', password: 'secret' },
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.total).toBeGreaterThan(0);
      for (const cred of body.data) {
        expect(cred.encryptedData).toBeUndefined();
        expect(cred.data).toBeUndefined();
      }
    });
  });

  describe('GET /api/credentials/:id', () => {
    it('returns credential metadata without encrypted data', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Get Test Cred',
          type: 'oauth2',
          data: { clientId: 'abc', clientSecret: 'def' },
        },
      });
      const credId = createRes.json().id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/credentials/${credId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(credId);
      expect(body.name).toBe('Get Test Cred');
      expect(body.encryptedData).toBeUndefined();
      expect(body.data).toBeUndefined();
    });
  });

  describe('Tenant Isolation', () => {
    it('cannot access credentials from another tenant', async () => {
      // Create as tenant-cred
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Secret Cred',
          type: 'httpBasicAuth',
          data: { username: 'admin', password: 'secret' },
        },
      });
      const credId = createRes.json().id;

      // Try to access as different tenant
      const otherToken = await signTestToken({
        tenantId: 'tenant-other',
        userId: 'user-other',
        role: 'admin',
      });
      const response = await app.inject({
        method: 'GET',
        url: `/api/credentials/${credId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(response.statusCode).toBe(404);
    });

    it('cannot update credentials from another tenant', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Isolation Update Test',
          type: 'httpBasicAuth',
          data: { username: 'admin', password: 'secret' },
        },
      });
      const credId = createRes.json().id;

      const otherToken = await signTestToken({
        tenantId: 'tenant-other',
        userId: 'user-other',
        role: 'admin',
      });
      const response = await app.inject({
        method: 'PUT',
        url: `/api/credentials/${credId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { name: 'Hacked' },
      });
      expect(response.statusCode).toBe(404);
    });

    it('cannot delete credentials from another tenant', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Isolation Delete Test',
          type: 'httpBasicAuth',
          data: { username: 'admin', password: 'secret' },
        },
      });
      const credId = createRes.json().id;

      const otherToken = await signTestToken({
        tenantId: 'tenant-other',
        userId: 'user-other',
        role: 'admin',
      });
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/credentials/${credId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/credentials/:id', () => {
    it('updates name for own credential', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Original Name',
          type: 'httpBasicAuth',
          data: { username: 'u', password: 'p' },
        },
      });
      const credId = createRes.json().id;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/credentials/${credId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated Name' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe('Updated Name');
      expect(body.encryptedData).toBeUndefined();
    });

    it('updates data (re-encrypts) for own credential', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Re-encrypt Test',
          type: 'httpBasicAuth',
          data: { username: 'old', password: 'oldpass' },
        },
      });
      const credId = createRes.json().id;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/credentials/${credId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { data: { username: 'new', password: 'newpass' } },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.encryptedData).toBeUndefined();
    });
  });

  describe('DELETE /api/credentials/:id', () => {
    it('hard deletes the credential row', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/credentials',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'To Delete',
          type: 'httpBasicAuth',
          data: { username: 'u', password: 'p' },
        },
      });
      const credId = createRes.json().id;

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/credentials/${credId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json().message).toBe('Credential deleted');

      // Verify it is actually gone
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/credentials/${credId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(getRes.statusCode).toBe(404);
    });

    it('returns 404 when deleting non-existent credential', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/credentials/00000000-0000-0000-0000-000000000099',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(404);
    });
  });
});

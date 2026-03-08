import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, createApiClient } from '../api-client';
import type { ApiClient } from '../api-client';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResponse(body: unknown, status = 200) {
  return {
    ok: true,
    status,
    statusText: 'OK',
    json: async () => body,
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

function errorResponse(
  status: number,
  statusText: string,
  body: unknown = { error: statusText },
) {
  return {
    ok: false,
    status,
    statusText,
    json: async () => body,
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    client = createApiClient({
      baseUrl: 'http://localhost:3000/api',
      getAuthToken: async () => 'test-token-123',
      tenantId: 'tenant-abc',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Request headers
  // -----------------------------------------------------------------------

  describe('request headers', () => {
    it('includes Authorization header with bearer token', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ data: [] }));

      await client.get('/workflows');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/workflows',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      );
    });

    it('includes X-Tenant-Id header', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({}));

      await client.get('/workflows');

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders['X-Tenant-Id']).toBe('tenant-abc');
    });

    it('includes Content-Type: application/json header', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({}));

      await client.get('/workflows');

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders['Content-Type']).toBe('application/json');
    });
  });

  // -----------------------------------------------------------------------
  // HTTP methods
  // -----------------------------------------------------------------------

  describe('HTTP methods', () => {
    it('GET sends correct method', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ workflows: [] }));

      await client.get('/workflows');
      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });

    it('GET appends query params', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ workflows: [] }));

      await client.get('/workflows', { page: 1, limit: 10 });
      expect(mockFetch.mock.calls[0][0]).toBe(
        'http://localhost:3000/api/workflows?page=1&limit=10',
      );
    });

    it('GET omits undefined/null params', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ workflows: [] }));

      await client.get('/workflows', {
        page: 1,
        filter: undefined,
        sort: null,
      });
      expect(mockFetch.mock.calls[0][0]).toBe(
        'http://localhost:3000/api/workflows?page=1',
      );
    });

    it('POST sends body as JSON', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ id: 'wf-1' }, 201));

      const body = { name: 'My Workflow', definitionJson: {} };
      await client.post('/workflows', body);

      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
      expect(mockFetch.mock.calls[0][1].body).toBe(JSON.stringify(body));
    });

    it('PUT sends body as JSON', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ id: 'wf-1' }));

      await client.put('/workflows/wf-1', { name: 'Updated' });
      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });

    it('PATCH sends body as JSON', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({ id: 'wf-1' }));

      await client.patch('/workflows/wf-1', { name: 'Patched' });
      expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
    });

    it('DELETE sends correct method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: 'No Content',
        json: async () => ({}),
        headers: new Headers(),
      });

      await client.delete('/workflows/wf-1');
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  // -----------------------------------------------------------------------
  // Response handling
  // -----------------------------------------------------------------------

  describe('response handling', () => {
    it('returns parsed JSON body on success', async () => {
      const data = { id: 'wf-1', name: 'Test' };
      mockFetch.mockResolvedValueOnce(okResponse(data));

      const result = await client.get('/workflows/wf-1');
      expect(result).toEqual(data);
    });

    it('handles 204 No Content without parsing JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: 'No Content',
        json: vi.fn().mockRejectedValue(new Error('No body')),
        headers: new Headers(),
      });

      const result = await client.delete('/workflows/wf-1');
      expect(result).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('throws ApiError on 4xx responses', async () => {
      mockFetch.mockResolvedValue(
        errorResponse(404, 'Not Found', { error: 'Workflow not found' }),
      );

      await expect(client.get('/workflows/nonexistent')).rejects.toThrow(
        ApiError,
      );
      await expect(
        client.get('/workflows/nonexistent'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('does not retry on 4xx errors (except 429)', async () => {
      mockFetch.mockResolvedValue(
        errorResponse(400, 'Bad Request', { error: 'Invalid input' }),
      );

      await expect(client.post('/workflows', {})).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 403 Forbidden', async () => {
      mockFetch.mockResolvedValue(errorResponse(403, 'Forbidden'));

      await expect(client.get('/secrets')).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws ApiError on 5xx responses after retries', async () => {
      mockFetch.mockResolvedValue(
        errorResponse(500, 'Internal Server Error', { error: 'Server error' }),
      );

      await expect(client.get('/workflows')).rejects.toThrow(ApiError);
      // initial + 2 retries = 3 calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('ApiError has correct convenience getters', () => {
      const e404 = new ApiError(404, 'Not Found', null, '/test');
      expect(e404.isNotFound).toBe(true);
      expect(e404.isUnauthorized).toBe(false);
      expect(e404.isForbidden).toBe(false);
      expect(e404.isConflict).toBe(false);
      expect(e404.isRateLimited).toBe(false);

      const e401 = new ApiError(401, 'Unauthorized', null, '/test');
      expect(e401.isUnauthorized).toBe(true);

      const e403 = new ApiError(403, 'Forbidden', null, '/test');
      expect(e403.isForbidden).toBe(true);

      const e409 = new ApiError(409, 'Conflict', null, '/test');
      expect(e409.isConflict).toBe(true);

      const e429 = new ApiError(429, 'Too Many Requests', null, '/test');
      expect(e429.isRateLimited).toBe(true);
    });

    it('ApiError extends Error and has correct name', () => {
      const err = new ApiError(500, 'Internal Server Error', null, '/test');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ApiError');
      expect(err.message).toContain('500');
      expect(err.message).toContain('/test');
    });
  });

  // -----------------------------------------------------------------------
  // Retry logic
  // -----------------------------------------------------------------------

  describe('retry logic', () => {
    it('retries on 5xx with exponential backoff', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'))
        .mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'))
        .mockResolvedValueOnce(okResponse({ recovered: true }));

      const result = await client.get('/workflows');
      expect(result).toEqual({ recovered: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('retries on 429 Too Many Requests', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(429, 'Too Many Requests'))
        .mockResolvedValueOnce(okResponse({ data: 'ok' }));

      const result = await client.get('/workflows');
      expect(result).toEqual({ data: 'ok' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on network failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(okResponse({ data: 'success' }));

      const result = await client.get('/workflows');
      expect(result).toEqual({ data: 'success' });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('respects maxRetries configuration', async () => {
      const noRetryClient = createApiClient({
        baseUrl: 'http://localhost:3000/api',
        getAuthToken: async () => 'token',
        tenantId: 'tenant-abc',
        maxRetries: 0,
      });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(noRetryClient.get('/test')).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws last error after exhausting retries on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(client.get('/workflows')).rejects.toThrow('Network error');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  // -----------------------------------------------------------------------
  // onUnauthorized callback
  // -----------------------------------------------------------------------

  describe('onUnauthorized callback', () => {
    it('fires onUnauthorized on 401 response', async () => {
      const onUnauthorized = vi.fn();
      const authClient = createApiClient({
        baseUrl: 'http://localhost:3000/api',
        getAuthToken: async () => 'expired-token',
        tenantId: 'tenant-abc',
        onUnauthorized,
      });

      mockFetch.mockResolvedValueOnce(errorResponse(401, 'Unauthorized'));

      await expect(authClient.get('/workflows')).rejects.toThrow(ApiError);
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it('does not fire onUnauthorized on other errors', async () => {
      const onUnauthorized = vi.fn();
      const authClient = createApiClient({
        baseUrl: 'http://localhost:3000/api',
        getAuthToken: async () => 'token',
        tenantId: 'tenant-abc',
        onUnauthorized,
      });

      mockFetch.mockResolvedValueOnce(errorResponse(403, 'Forbidden'));

      await expect(authClient.get('/admin')).rejects.toThrow(ApiError);
      expect(onUnauthorized).not.toHaveBeenCalled();
    });
  });
});

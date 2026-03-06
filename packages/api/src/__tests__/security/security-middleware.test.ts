import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { securityMiddleware, sanitizeInput } from '../../middleware/security.js';

// ─── sanitizeInput unit tests ───────────────────────────────────────────────

describe('sanitizeInput', () => {
  it('should strip HTML tags from string inputs', () => {
    expect(sanitizeInput('<script>alert("xss")</script>')).toBe('alert("xss")');
    expect(sanitizeInput('Hello <b>world</b>')).toBe('Hello world');
    expect(sanitizeInput('<img src="x" onerror="alert(1)">')).toBe('');
    expect(sanitizeInput('no tags here')).toBe('no tags here');
  });

  it('should sanitize nested objects', () => {
    const input = {
      name: '<b>Alice</b>',
      profile: {
        bio: '<script>steal()</script>Safe text',
        nested: {
          deep: '<em>emphasis</em>',
        },
      },
    };
    const result = sanitizeInput(input) as Record<string, unknown>;
    expect(result).toEqual({
      name: 'Alice',
      profile: {
        bio: 'steal()Safe text',
        nested: {
          deep: 'emphasis',
        },
      },
    });
  });

  it('should sanitize arrays', () => {
    const input = ['<b>bold</b>', '<i>italic</i>', 'plain'];
    const result = sanitizeInput(input);
    expect(result).toEqual(['bold', 'italic', 'plain']);
  });

  it('should pass through non-string primitives unchanged', () => {
    expect(sanitizeInput(42)).toBe(42);
    expect(sanitizeInput(true)).toBe(true);
    expect(sanitizeInput(null)).toBe(null);
    expect(sanitizeInput(undefined)).toBe(undefined);
  });
});

// ─── Fastify integration tests ─────────────────────────────────────────────

describe('securityMiddleware (Fastify integration)', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    // Suppress Fastify's default error logging during tests
    app = Fastify({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  // Helper to register the plugin and add simple test routes
  async function setupApp(opts: Parameters<typeof securityMiddleware>[1] = {}) {
    await app.register(securityMiddleware, opts);

    app.post('/test', async (request) => {
      return { ok: true, body: request.body };
    });

    app.get('/test', async () => {
      return { ok: true };
    });

    await app.ready();
  }

  // ── Body size tests ─────────────────────────────────────────────────────

  it('should reject oversized request bodies', async () => {
    // Use a large bodyLimit in Fastify so our middleware handles it, not Fastify itself.
    app = Fastify({ logger: false, bodyLimit: 10_485_760 });
    await setupApp({ maxBodySize: 100 });

    // Send a request where content-length exceeds our security limit.
    // The actual payload matches content-length so Fastify won't reject it.
    const largePayload = JSON.stringify({ data: 'x'.repeat(200) });
    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(largePayload)),
      },
      payload: largePayload,
    });

    expect(response.statusCode).toBe(413);
    const body = response.json();
    expect(body.error).toBe('Request body too large');
  });

  it('should allow requests within size limit', async () => {
    await setupApp({ maxBodySize: 10_000 });

    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: {
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ data: 'small' }),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
  });

  // ── Content-Type tests ──────────────────────────────────────────────────

  it('should reject POST without Content-Type', async () => {
    await setupApp({ enforceContentType: true });

    // Use a raw request via inject to avoid Fastify auto-adding content-type.
    // By not providing 'payload', Fastify won't infer a content-type.
    const response = await app.inject({
      method: 'POST',
      url: '/test',
    });

    expect(response.statusCode).toBe(415);
    const body = response.json();
    expect(body.error).toBe('Content-Type header is required for this request');
  });

  it('should reject unsupported Content-Type', async () => {
    await setupApp({ enforceContentType: true });

    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: {
        'content-type': 'text/plain',
      },
      payload: 'hello',
    });

    expect(response.statusCode).toBe(415);
    const body = response.json();
    expect(body.error).toContain('Unsupported Content-Type');
  });

  it('should allow application/json Content-Type', async () => {
    await setupApp({ enforceContentType: true });

    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: {
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ data: 'test' }),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
  });

  // ── Origin / CSRF tests ────────────────────────────────────────────────

  it('should reject disallowed origin', async () => {
    await setupApp({ allowedOrigins: ['https://app.r360.com'] });

    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example.com',
      },
      payload: JSON.stringify({ data: 'test' }),
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error).toBe('Origin not allowed');
  });

  it('should allow requests from allowed origins', async () => {
    await setupApp({ allowedOrigins: ['https://app.r360.com'] });

    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: {
        'content-type': 'application/json',
        origin: 'https://app.r360.com',
      },
      payload: JSON.stringify({ data: 'test' }),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
  });
});

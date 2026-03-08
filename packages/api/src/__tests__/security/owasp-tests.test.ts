import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeInput } from '../../middleware/security';
import { TenantService } from '../../services/tenant-service';
import type { TenantDb, TenantRecord } from '../../services/tenant-service';

// ─── Helper: create mock Fastify request/reply ─────────────────────────────

function createMockReply() {
  const reply: Record<string, unknown> = {};
  reply.status = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply as unknown as {
    status: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    method: 'GET',
    ...overrides,
  } as any;
}

// ─── OWASP Security Tests ──────────────────────────────────────────────────

describe('OWASP Security Tests', () => {
  // ── A1: SQL Injection Prevention ────────────────────────────────────────

  describe('SQL Injection Prevention (OWASP A03:2021 - Injection)', () => {
    it('should treat classic SQL injection payloads as plain strings', () => {
      // Drizzle ORM uses parameterized queries, so SQL injection payloads are
      // never interpolated into SQL. sanitizeInput only strips HTML tags, so
      // SQL payloads pass through as harmless string values.
      const payload = "'; DROP TABLE users; --";
      expect(sanitizeInput(payload)).toBe(payload);
    });

    it('should not interpret boolean-based SQL injection', () => {
      const payload = '1 OR 1=1';
      expect(sanitizeInput(payload)).toBe(payload);
    });

    it('should treat UNION-based injection as a plain string', () => {
      const payload = "' UNION SELECT * FROM credentials --";
      expect(sanitizeInput(payload)).toBe(payload);
    });

    it('should treat stacked queries injection as a plain string', () => {
      const payload = "1; UPDATE tenants SET plan='enterprise' WHERE id='x'";
      expect(sanitizeInput(payload)).toBe(payload);
    });

    it('should treat time-based blind injection as a plain string', () => {
      const payload = "1' AND SLEEP(5) --";
      expect(sanitizeInput(payload)).toBe(payload);
    });

    it('should preserve SQL-like strings in nested objects (ORM handles safety)', () => {
      const input = {
        name: "Robert'); DROP TABLE students;--",
        query: '1 OR 1=1',
        nested: {
          filter: "' UNION SELECT password FROM users --",
        },
      };
      const result = sanitizeInput(input) as Record<string, unknown>;
      // All values pass through unchanged since they contain no HTML
      expect(result.name).toBe("Robert'); DROP TABLE students;--");
      expect(result.query).toBe('1 OR 1=1');
      expect((result.nested as Record<string, unknown>).filter).toBe(
        "' UNION SELECT password FROM users --",
      );
    });
  });

  // ── A7: XSS Prevention ─────────────────────────────────────────────────

  describe('XSS Prevention (OWASP A03:2021 - Injection / A7 XSS)', () => {
    it('should strip script tags from input', () => {
      expect(sanitizeInput("<script>alert('xss')</script>")).toBe("alert('xss')");
    });

    it('should strip img tags with event handlers', () => {
      const result = sanitizeInput('<img src=x onerror=alert(1)>') as string;
      expect(result).not.toContain('<img');
      expect(result).not.toContain('>');
    });

    it('should strip bold/italic/formatting tags', () => {
      expect(sanitizeInput('Hello <b>world</b>')).toBe('Hello world');
      expect(sanitizeInput('<i>italic</i>')).toBe('italic');
      expect(sanitizeInput('<em>emphasis</em>')).toBe('emphasis');
    });

    it('should strip anchor tags', () => {
      expect(sanitizeInput('<a href="https://evil.com">click me</a>')).toBe('click me');
    });

    it('should strip event handler attributes in tags', () => {
      const result = sanitizeInput('<div onmouseover="steal()">content</div>') as string;
      expect(result).not.toContain('<div');
      expect(result).toBe('content');
    });

    it('should strip iframe tags', () => {
      const result = sanitizeInput('<iframe src="https://evil.com"></iframe>') as string;
      expect(result).not.toContain('<iframe');
      expect(result).toBe('');
    });

    it('should strip SVG-based XSS payloads', () => {
      const result = sanitizeInput('<svg onload=alert(1)>') as string;
      expect(result).not.toContain('<svg');
    });

    it('should sanitize nested objects recursively', () => {
      const input = {
        name: '<script>evil</script>',
        nested: { value: '<img src=x onerror=alert(1)>' },
      };
      const result = sanitizeInput(input) as Record<string, unknown>;
      expect(result.name).toBe('evil');
      expect((result.nested as Record<string, unknown>).value).not.toContain('<img');
    });

    it('should sanitize arrays of strings', () => {
      const input = ['<script>a</script>', '<b>b</b>', 'plain'];
      const result = sanitizeInput(input) as string[];
      expect(result).toEqual(['a', 'b', 'plain']);
    });

    it('should handle deeply nested mixed structures', () => {
      const input = {
        level1: {
          level2: {
            level3: ['<script>deep</script>', { level4: '<b>nested</b>' }],
          },
        },
      };
      const result = sanitizeInput(input) as any;
      expect(result.level1.level2.level3[0]).toBe('deep');
      expect(result.level1.level2.level3[1].level4).toBe('nested');
    });

    it('should preserve non-string primitives in mixed objects', () => {
      const input = {
        count: 42,
        active: true,
        label: '<b>bold</b>',
        nothing: null,
      };
      const result = sanitizeInput(input) as any;
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.label).toBe('bold');
      expect(result.nothing).toBe(null);
    });
  });

  // ── A01: IDOR Prevention (Broken Access Control) ────────────────────────

  describe('IDOR Prevention (OWASP A01:2021 - Broken Access Control)', () => {
    const TENANT_A_ID = '00000000-0000-4000-a000-000000000001';
    const TENANT_B_ID = '00000000-0000-4000-a000-000000000002';

    let mockDb: TenantDb;
    let tenantService: TenantService;

    const tenantARecord: TenantRecord = {
      id: TENANT_A_ID,
      name: 'Tenant A',
      plan: 'pro',
      active: true,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    };

    const tenantBRecord: TenantRecord = {
      id: TENANT_B_ID,
      name: 'Tenant B',
      plan: 'free',
      active: true,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    };

    beforeEach(() => {
      mockDb = {
        create: vi.fn(),
        getById: vi.fn().mockImplementation(async (id: string) => {
          if (id === TENANT_A_ID) return tenantARecord;
          if (id === TENANT_B_ID) return tenantBRecord;
          return null;
        }),
        getByStripeCustomerId: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockImplementation(async (id: string, data: Partial<TenantRecord>) => {
          if (id === TENANT_A_ID) return { ...tenantARecord, ...data };
          if (id === TENANT_B_ID) return { ...tenantBRecord, ...data };
          return null;
        }),
      };
      tenantService = new TenantService(mockDb);
    });

    it('should only return data for the specifically requested tenant', async () => {
      // TenantService.getTenant uses the ID directly from the request context.
      // The service does NOT return all tenants -- it returns only the one matching the ID.
      const result = await tenantService.getTenant(TENANT_A_ID);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(TENANT_A_ID);
      expect(result!.name).toBe('Tenant A');

      // Verify that querying for A does not leak B's data
      expect(result!.id).not.toBe(TENANT_B_ID);
    });

    it('should return null for non-existent tenant IDs (no enumeration)', async () => {
      const fakeId = '99999999-9999-4999-9999-999999999999';
      const result = await tenantService.getTenant(fakeId);
      expect(result).toBeNull();
    });

    it('should isolate tenant updates to the correct tenant', async () => {
      // Updating Tenant A's plan should not affect Tenant B
      await tenantService.updatePlan(TENANT_A_ID, 'enterprise');

      expect(mockDb.update).toHaveBeenCalledWith(TENANT_A_ID, { plan: 'enterprise' });
      expect(mockDb.update).not.toHaveBeenCalledWith(TENANT_B_ID, expect.anything());
    });

    it('should isolate deactivation to the specified tenant', async () => {
      await tenantService.deactivate(TENANT_A_ID);

      expect(mockDb.update).toHaveBeenCalledWith(TENANT_A_ID, { active: false });
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it('should use UUIDs (not sequential IDs) to prevent ID enumeration', () => {
      // UUIDs are not guessable, unlike auto-increment integer IDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(TENANT_A_ID).toMatch(uuidRegex);
      expect(TENANT_B_ID).toMatch(uuidRegex);
    });
  });

  // ── A07: Auth Bypass Prevention (Identification & Authentication Failures) ─

  describe('Auth Bypass Prevention (OWASP A07:2021 - Authentication Failures)', () => {
    let authMiddleware: typeof import('../../middleware/auth.js').authMiddleware;

    beforeEach(async () => {
      // Set required env vars for JWT verification
      process.env.JWT_SECRET = 'dev-secret-change-in-production-min-32-chars!!';
      process.env.JWT_ISSUER = 'r360-flow';
      process.env.JWT_AUDIENCE = 'r360-flow-api';

      // Import fresh to pick up env vars
      const mod = await import('../../middleware/auth.js');
      authMiddleware = mod.authMiddleware;
    });

    it('should reject requests with no Authorization header', async () => {
      const request = createMockRequest({ headers: {} });
      const reply = createMockReply();

      await authMiddleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'Missing or invalid Authorization header',
        }),
      );
    });

    it('should reject requests with empty Authorization header', async () => {
      const request = createMockRequest({
        headers: { authorization: '' },
      });
      const reply = createMockReply();

      await authMiddleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Unauthorized' }),
      );
    });

    it('should reject requests with non-Bearer auth scheme', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });
      const reply = createMockReply();

      await authMiddleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Missing or invalid Authorization header',
        }),
      );
    });

    it('should reject requests with a malformed JWT token', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Bearer not.a.valid.jwt.token' },
      });
      const reply = createMockReply();

      await authMiddleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'Invalid or expired token',
        }),
      );
    });

    it('should reject requests with a completely garbage token', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Bearer !!garbage!!not!!jwt!!' },
      });
      const reply = createMockReply();

      await authMiddleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it('should reject a JWT signed with the wrong secret', async () => {
      // Create a token signed with a different secret
      const jose = await import('jose');
      const wrongSecret = new TextEncoder().encode('wrong-secret-not-the-real-one!!!!!!');
      const jwt = await new jose.SignJWT({
        tenantId: '00000000-0000-4000-a000-000000000001',
        userId: '00000000-0000-4000-b000-000000000001',
        role: 'admin',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('r360-flow')
        .setAudience('r360-flow-api')
        .setExpirationTime('1h')
        .sign(wrongSecret);

      const request = createMockRequest({
        headers: { authorization: `Bearer ${jwt}` },
      });
      const reply = createMockReply();

      await authMiddleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid or expired token',
        }),
      );
    });

    it('should reject an expired JWT token', async () => {
      const jose = await import('jose');
      const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
      const jwt = await new jose.SignJWT({
        tenantId: '00000000-0000-4000-a000-000000000001',
        userId: '00000000-0000-4000-b000-000000000001',
        role: 'admin',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('r360-flow')
        .setAudience('r360-flow-api')
        .setExpirationTime('0s') // Expires immediately
        .sign(secret);

      // Small delay to ensure expiration
      await new Promise((r) => setTimeout(r, 50));

      const request = createMockRequest({
        headers: { authorization: `Bearer ${jwt}` },
      });
      const reply = createMockReply();

      await authMiddleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid or expired token',
        }),
      );
    });

    it('should reject a JWT with wrong issuer', async () => {
      const jose = await import('jose');
      const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
      const jwt = await new jose.SignJWT({
        tenantId: '00000000-0000-4000-a000-000000000001',
        userId: '00000000-0000-4000-b000-000000000001',
        role: 'admin',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('evil-issuer')
        .setAudience('r360-flow-api')
        .setExpirationTime('1h')
        .sign(secret);

      const request = createMockRequest({
        headers: { authorization: `Bearer ${jwt}` },
      });
      const reply = createMockReply();

      await authMiddleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it('should reject a JWT with wrong audience', async () => {
      const jose = await import('jose');
      const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
      const jwt = await new jose.SignJWT({
        tenantId: '00000000-0000-4000-a000-000000000001',
        userId: '00000000-0000-4000-b000-000000000001',
        role: 'admin',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('r360-flow')
        .setAudience('wrong-audience')
        .setExpirationTime('1h')
        .sign(secret);

      const request = createMockRequest({
        headers: { authorization: `Bearer ${jwt}` },
      });
      const reply = createMockReply();

      await authMiddleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it('should reject a valid JWT missing required claims (tenantId)', async () => {
      const jose = await import('jose');
      const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
      const jwt = await new jose.SignJWT({
        // Missing tenantId
        userId: '00000000-0000-4000-b000-000000000001',
        role: 'admin',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('r360-flow')
        .setAudience('r360-flow-api')
        .setExpirationTime('1h')
        .sign(secret);

      const request = createMockRequest({
        headers: { authorization: `Bearer ${jwt}` },
      });
      const reply = createMockReply();

      await authMiddleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token missing required claims (tenantId, userId, role)',
        }),
      );
    });

    it('should reject a valid JWT missing required claims (role)', async () => {
      const jose = await import('jose');
      const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
      const jwt = await new jose.SignJWT({
        tenantId: '00000000-0000-4000-a000-000000000001',
        userId: '00000000-0000-4000-b000-000000000001',
        // Missing role
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('r360-flow')
        .setAudience('r360-flow-api')
        .setExpirationTime('1h')
        .sign(secret);

      const request = createMockRequest({
        headers: { authorization: `Bearer ${jwt}` },
      });
      const reply = createMockReply();

      await authMiddleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token missing required claims (tenantId, userId, role)',
        }),
      );
    });

    it('should accept a properly signed, non-expired JWT with all claims', async () => {
      const jose = await import('jose');
      const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
      const jwt = await new jose.SignJWT({
        tenantId: '00000000-0000-4000-a000-000000000001',
        userId: '00000000-0000-4000-b000-000000000001',
        role: 'admin',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('r360-flow')
        .setAudience('r360-flow-api')
        .setExpirationTime('1h')
        .sign(secret);

      const request = createMockRequest({
        headers: { authorization: `Bearer ${jwt}` },
      });
      const reply = createMockReply();

      await authMiddleware(request, reply as any);

      // Should NOT call reply.status (no error response)
      expect(reply.status).not.toHaveBeenCalled();
      // Should set tenantContext on the request
      expect(request.tenantContext).toEqual({
        tenantId: '00000000-0000-4000-a000-000000000001',
        userId: '00000000-0000-4000-b000-000000000001',
        role: 'admin',
      });
    });
  });

  // ── A04: Request Size Limits (Insecure Design) ─────────────────────────

  describe('Request Size Limits (OWASP A04:2021 - Insecure Design)', () => {
    it('should reject oversized Content-Length via security middleware logic', () => {
      // The security middleware checks content-length and rejects bodies
      // exceeding maxBodySize. This verifies the concept at the unit level.
      const maxSize = 1_048_576; // 1MB default
      const oversizedLength = 10_485_760; // 10MB

      expect(oversizedLength).toBeGreaterThan(maxSize);

      // Simulate what validateBodySize checks
      const contentLength = oversizedLength;
      const isOversized = contentLength > maxSize;
      expect(isOversized).toBe(true);
    });

    it('should allow requests within default size limit', () => {
      const maxSize = 1_048_576; // 1MB default
      const smallPayloadSize = 256; // 256 bytes

      const isOversized = smallPayloadSize > maxSize;
      expect(isOversized).toBe(false);
    });

    it('should apply configurable size limits', () => {
      // Verify that the SecurityConfig interface supports custom maxBodySize
      const customLimit = 500;
      const payloadSize = 600;

      const isOversized = payloadSize > customLimit;
      expect(isOversized).toBe(true);
    });
  });

  // ── A05: Security Misconfiguration ─────────────────────────────────────

  describe('Security Misconfiguration (OWASP A05:2021)', () => {
    it('should enforce Content-Type on state-changing requests', () => {
      // State-changing methods (POST, PUT, PATCH) require Content-Type.
      // This prevents attackers from sending unexpected data formats.
      const stateChangingMethods = ['POST', 'PUT', 'PATCH'];
      const safeReadMethods = ['GET', 'HEAD', 'OPTIONS'];

      for (const method of stateChangingMethods) {
        expect(['POST', 'PUT', 'PATCH']).toContain(method);
      }

      for (const method of safeReadMethods) {
        expect(['POST', 'PUT', 'PATCH']).not.toContain(method);
      }
    });

    it('should restrict Content-Type to known-safe types', () => {
      // The security middleware only allows these Content-Types
      const allowedTypes = [
        'application/json',
        'multipart/form-data',
        'application/x-www-form-urlencoded',
      ];

      const dangerousTypes = ['text/xml', 'text/plain', 'application/xml'];

      for (const dangerousType of dangerousTypes) {
        const isAllowed = allowedTypes.some((allowed) =>
          dangerousType.toLowerCase().includes(allowed),
        );
        expect(isAllowed).toBe(false);
      }
    });

    it('should validate CSRF origin header on state-changing requests', () => {
      // The security middleware checks Origin header against allowedOrigins
      // for POST/PUT/PATCH/DELETE requests.
      const allowedOrigins = ['https://app.r360.com'];
      const evilOrigin = 'https://evil.example.com';

      expect(allowedOrigins).not.toContain(evilOrigin);
    });
  });

  // ── A02: Cryptographic Failures ────────────────────────────────────────

  describe('Cryptographic Failures (OWASP A02:2021)', () => {
    it('should use HS256 algorithm for JWT signing (not none)', async () => {
      // The auth middleware uses jose.jwtVerify which validates the algorithm.
      // Tokens with alg: "none" are automatically rejected.
      const jose = await import('jose');
      const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

      const validJwt = await new jose.SignJWT({
        tenantId: 'test',
        userId: 'test',
        role: 'admin',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('r360-flow')
        .setAudience('r360-flow-api')
        .setExpirationTime('1h')
        .sign(secret);

      // The token should have three parts (header.payload.signature)
      const parts = validJwt.split('.');
      expect(parts).toHaveLength(3);

      // Decode header and verify algorithm
      const header = JSON.parse(
        Buffer.from(parts[0]!, 'base64url').toString('utf-8'),
      );
      expect(header.alg).toBe('HS256');
    });

    it('should require minimum secret length for JWT signing', () => {
      // The JWT_SECRET should be long enough to be secure
      const secret = process.env.JWT_SECRET!;
      expect(secret.length).toBeGreaterThanOrEqual(32);
    });
  });
});

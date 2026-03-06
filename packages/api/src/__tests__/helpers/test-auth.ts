import * as jose from 'jose';

const TEST_SECRET = new TextEncoder().encode(
  'dev-secret-change-in-production-min-32-chars!!'
);

/** Test tenant and user IDs for consistent test fixtures */
export const TEST_TENANT_ID = 'test-tenant-00000000-0000-0000-0000-000000000001';
export const TEST_USER_ID = 'test-user-00000000-0000-0000-0000-000000000001';
export const TEST_TENANT_B_ID = 'test-tenant-00000000-0000-0000-0000-000000000002';
export const TEST_USER_B_ID = 'test-user-00000000-0000-0000-0000-000000000002';

interface TestTokenPayload {
  tenantId: string;
  userId: string;
  role: string;
  exp?: number;
}

/**
 * Signs a test JWT token with the given payload.
 * Uses HS256 algorithm with the test secret.
 * Tokens include proper issuer and audience claims.
 */
export async function signTestToken(payload: TestTokenPayload): Promise<string> {
  const builder = new jose.SignJWT({
    tenantId: payload.tenantId,
    userId: payload.userId,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('r360-flow')
    .setAudience('r360-flow-api')
    .setIssuedAt();

  if (payload.exp) {
    // Use raw expiration timestamp
    builder.setExpirationTime(payload.exp);
  } else {
    builder.setExpirationTime('24h');
  }

  return builder.sign(TEST_SECRET);
}

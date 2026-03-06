import { beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';

// Set test environment variables before any imports
process.env.JWT_SECRET = 'dev-secret-change-in-production-min-32-chars!!';
process.env.JWT_ISSUER = 'r360-flow';
process.env.JWT_AUDIENCE = 'r360-flow-api';
process.env.MASTER_ENCRYPTION_KEY = 'dev-master-key-change-in-production-256bit!!';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? 'sk_test_fake_key_for_testing_only';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test_fake_secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://r360:r360_dev_password@localhost:5432/r360flow_test';
process.env.NODE_ENV = 'test';

beforeAll(async () => {
  // Run migrations if a real database is available
  // For unit tests this is typically skipped; integration tests rely on it
  try {
    const { getDb } = await import('@r360/db');
    const db = getDb();
    // Verify connectivity with a simple query
    await db.execute(sql`SELECT 1`);
  } catch {
    // Database not available -- unit tests can still run without it
    console.warn('[test-setup] Database not available, skipping migration check');
  }
});

afterAll(async () => {
  // Close database connections
  try {
    const { closeConnection } = await import('@r360/db');
    await closeConnection();
  } catch {
    // Connection may not have been opened
  }
});

/**
 * Truncates all tenant-scoped tables in the correct order (respecting FK constraints).
 * Call this in `beforeAll` or `afterAll` of integration test suites that need
 * a clean database state.
 *
 * Uses TRUNCATE ... CASCADE so foreign key order is handled by PostgreSQL.
 */
export async function truncateAllTables(): Promise<void> {
  const { getDb } = await import('@r360/db');
  const db = getDb();

  // TRUNCATE with CASCADE handles FK dependencies automatically.
  // Order: child tables first for clarity, though CASCADE makes it safe either way.
  await db.execute(sql`
    TRUNCATE TABLE
      execution_steps,
      executions,
      webhooks,
      credentials,
      workflows,
      users,
      tenants
    CASCADE
  `);
}

/**
 * Inserts a tenant record into the tenants table.
 * Required before inserting any tenant-scoped data due to FK constraints.
 */
export async function seedTenant(
  id: string,
  name: string,
  slug: string
): Promise<void> {
  const { getDb } = await import('@r360/db');
  const db = getDb();

  await db.execute(sql`
    INSERT INTO tenants (id, name, slug)
    VALUES (${id}::uuid, ${name}, ${slug})
    ON CONFLICT (id) DO NOTHING
  `);
}

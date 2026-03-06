import { beforeAll, afterAll } from 'vitest';

// Set test environment variables before any imports
process.env.JWT_SECRET = 'dev-secret-change-in-production-min-32-chars!!';
process.env.JWT_ISSUER = 'r360-flow';
process.env.JWT_AUDIENCE = 'r360-flow-api';
process.env.MASTER_ENCRYPTION_KEY = 'dev-master-key-change-in-production-256bit!!';
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
    await db.execute(/* sql */ `SELECT 1`);
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

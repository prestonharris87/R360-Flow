import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';

describe('Database Connection', () => {
  it('should connect to PostgreSQL and run a simple query', async () => {
    const { getDb } = await import('../connection.js');
    const db = getDb();
    const result = await db.execute(sql`SELECT 1 as value`);
    expect(result).toBeDefined();
  });

  it('should have required extensions installed', async () => {
    const { getDb } = await import('../connection.js');
    const db = getDb();
    // uuid-ossp for UUID generation
    const result = await db.execute(
      sql`SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'`
    );
    expect(result.length).toBe(1);
  });
});

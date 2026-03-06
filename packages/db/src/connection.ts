import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

let sql: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

export function getConnection() {
  if (!sql) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    sql = postgres(databaseUrl, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

export function getDb() {
  if (!db) {
    db = drizzle(getConnection(), { schema });
  }
  return db;
}

export async function closeConnection() {
  if (sql) {
    await sql.end();
    sql = null;
    db = null;
  }
}

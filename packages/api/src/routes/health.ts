import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sql } from 'drizzle-orm';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    let databaseStatus: 'connected' | 'disconnected' = 'disconnected';

    try {
      // Dynamically import to avoid hard failure if db is not available
      const { getDb } = await import('@r360/db');
      const db = getDb();
      // Simple query to verify connection
      await db.execute(sql`SELECT 1`);
      databaseStatus = 'connected';
    } catch {
      // Database is not available -- that's okay for health check
      databaseStatus = 'disconnected';
    }

    const status = databaseStatus === 'connected' ? 'ok' : 'degraded';
    const statusCode = status === 'ok' ? 200 : 503;

    return reply.status(statusCode).send({
      status,
      timestamp: new Date().toISOString(),
      database: databaseStatus,
      redis: 'not_configured',
    });
  });
}

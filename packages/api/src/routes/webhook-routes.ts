import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { WebhookRouter } from '../webhooks/webhook-router.js';

export function webhookRoutes(webhookRouter: WebhookRouter) {
  return async function (app: FastifyInstance): Promise<void> {
    app.all('/webhook/:tenantId/*', async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = request.params as { tenantId: string };
      const webhookPath = (request.params as Record<string, string>)['*'];

      const result = await webhookRouter.handleWebhook({
        tenantId,
        path: webhookPath,
        method: request.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
        headers: request.headers as Record<string, string>,
        body: request.body as unknown,
        rawBody: typeof request.body === 'string' ? request.body : JSON.stringify(request.body),
        query: request.query as Record<string, string>,
      });

      switch (result.status) {
        case 'accepted': return reply.status(202).send({ status: 'accepted', executionId: result.executionId });
        case 'not_found': return reply.status(404).send({ error: 'Webhook not found' });
        case 'unauthorized': return reply.status(401).send({ error: 'Invalid signature' });
        case 'error': return reply.status(500).send({ error: result.message });
      }
    });
  };
}

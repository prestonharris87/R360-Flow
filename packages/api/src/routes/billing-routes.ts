import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import type { StripeWebhookHandler } from '../billing/stripe-webhook-handler.js';

export interface BillingRoutesConfig {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  webhookHandler: StripeWebhookHandler;
}

export async function billingRoutes(
  fastify: FastifyInstance,
  opts: BillingRoutesConfig,
): Promise<void> {
  const stripe = new Stripe(opts.stripeSecretKey);

  fastify.post(
    '/api/billing/webhook',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sig = request.headers['stripe-signature'] as string;
      if (!sig) {
        return reply.status(400).send({ error: 'Missing stripe-signature header' });
      }

      let event: Stripe.Event;
      try {
        // rawBody must be available via Fastify rawBody plugin or similar
        const body = (request as unknown as { rawBody?: string }).rawBody ?? request.body;
        event = stripe.webhooks.constructEvent(
          typeof body === 'string' ? body : JSON.stringify(body),
          sig,
          opts.stripeWebhookSecret,
        );
      } catch (_err) {
        return reply.status(400).send({ error: 'Invalid signature' });
      }

      const result = await opts.webhookHandler.handleEvent(event);
      return reply.status(200).send({ received: true, ...result });
    },
  );
}

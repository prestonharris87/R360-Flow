import {
  pgTable, uuid, varchar, boolean,
  timestamp, pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { workflows } from './workflows.js';

export const httpMethodEnum = pgEnum('http_method', [
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE',
]);

export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    path: varchar('path', { length: 512 }).notNull(),
    method: httpMethodEnum('method').notNull().default('POST'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('webhooks_tenant_id_idx').on(table.tenantId),
    pathIdx: index('webhooks_path_idx').on(table.tenantId, table.path),
    workflowIdx: index('webhooks_workflow_id_idx').on(table.workflowId),
  })
);

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;

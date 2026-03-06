import {
  pgTable, uuid, varchar, jsonb, text,
  timestamp, pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { workflows } from './workflows.js';

export const executionStatusEnum = pgEnum('execution_status', [
  'pending', 'running', 'success', 'error', 'cancelled', 'timeout',
]);

export const executions = pgTable(
  'executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    status: executionStatusEnum('status').notNull().default('pending'),
    mode: varchar('mode', { length: 50 }).notNull().default('manual'),
    contextJson: jsonb('context_json').default({}),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('executions_tenant_id_idx').on(table.tenantId),
    workflowIdx: index('executions_workflow_id_idx').on(table.workflowId),
    tenantStatusIdx: index('executions_tenant_status_idx').on(table.tenantId, table.status),
    tenantCreatedIdx: index('executions_tenant_created_idx').on(table.tenantId, table.createdAt),
  })
);

export type Execution = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;

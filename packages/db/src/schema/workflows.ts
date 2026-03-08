import {
  pgTable, uuid, varchar, jsonb, boolean,
  timestamp, pgEnum, index, text,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

export const workflowStatusEnum = pgEnum('workflow_status', [
  'draft', 'active', 'inactive', 'archived',
]);

export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    definitionJson: jsonb('definition_json').notNull().default({}),
    status: workflowStatusEnum('status').notNull().default('draft'),
    isActive: boolean('is_active').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('workflows_tenant_id_idx').on(table.tenantId),
    tenantStatusIdx: index('workflows_tenant_status_idx').on(table.tenantId, table.status),
    tenantActiveIdx: index('workflows_tenant_active_idx').on(table.tenantId, table.isActive),
  })
);

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;

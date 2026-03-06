import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const credentials = pgTable(
  'credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 128 }).notNull(),
    encryptedData: text('encrypted_data').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('credentials_tenant_id_idx').on(table.tenantId),
    tenantTypeIdx: index('credentials_tenant_type_idx').on(table.tenantId, table.type),
  })
);

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;

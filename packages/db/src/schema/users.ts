import { pgTable, uuid, varchar, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member', 'viewer']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    externalId: varchar('external_id', { length: 255 }).notNull(),
    email: varchar('email', { length: 320 }).notNull(),
    name: varchar('name', { length: 255 }),
    role: userRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('users_tenant_id_idx').on(table.tenantId),
    externalIdx: index('users_external_id_idx').on(table.externalId),
    emailTenantIdx: index('users_email_tenant_idx').on(table.email, table.tenantId),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

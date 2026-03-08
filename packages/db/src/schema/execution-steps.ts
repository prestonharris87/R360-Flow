import {
  pgTable, uuid, varchar, jsonb,
  timestamp, pgEnum, index,
} from 'drizzle-orm/pg-core';
import { executions } from './executions';

export const stepStatusEnum = pgEnum('step_status', [
  'pending', 'running', 'success', 'error', 'skipped',
]);

export const executionSteps = pgTable(
  'execution_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    nodeId: varchar('node_id', { length: 255 }).notNull(),
    nodeName: varchar('node_name', { length: 255 }),
    nodeType: varchar('node_type', { length: 255 }),
    status: stepStatusEnum('status').notNull().default('pending'),
    inputJson: jsonb('input_json'),
    outputJson: jsonb('output_json'),
    error: jsonb('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => ({
    executionIdx: index('execution_steps_execution_id_idx').on(table.executionId),
    nodeIdx: index('execution_steps_node_id_idx').on(table.executionId, table.nodeId),
  })
);

export type ExecutionStep = typeof executionSteps.$inferSelect;
export type NewExecutionStep = typeof executionSteps.$inferInsert;

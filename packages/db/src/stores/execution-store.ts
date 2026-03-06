import { and, eq } from 'drizzle-orm';
import { getDb } from '../connection.js';
import { executions } from '../schema/executions.js';

export interface CreateExecutionParams {
  id: string;
  tenant_id: string;
  workflow_id: string;
  status: string;
  started_at: Date;
  context_json: string | null;
  error: string | null;
}

export interface UpdateExecutionParams {
  tenant_id: string;
  status: string;
  finished_at?: Date;
  context_json?: string | null;
  error?: string | null;
}

export const executionStore = {
  async create(params: CreateExecutionParams) {
    const db = getDb();
    const [row] = await db.insert(executions).values({
      id: params.id,
      tenantId: params.tenant_id,
      workflowId: params.workflow_id,
      status: params.status as 'pending' | 'running' | 'success' | 'error' | 'cancelled' | 'timeout',
      startedAt: params.started_at,
      error: params.error,
    }).returning();
    return row;
  },

  async update(executionId: string, params: UpdateExecutionParams) {
    const db = getDb();
    const [row] = await db.update(executions)
      .set({
        status: params.status as 'pending' | 'running' | 'success' | 'error' | 'cancelled' | 'timeout',
        finishedAt: params.finished_at,
        error: params.error,
      })
      .where(and(eq(executions.id, executionId), eq(executions.tenantId, params.tenant_id)))
      .returning();
    return row;
  },
};

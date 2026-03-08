import { getDb } from '../connection';
import { executionSteps } from '../schema/execution-steps';

export interface CreateExecutionStepParams {
  execution_id: string;
  tenant_id: string;
  node_id: string;
  status: string;
  started_at: Date;
  finished_at?: Date;
  input_json: string | null;
  output_json: string | null;
}

export const executionStepStore = {
  async create(params: CreateExecutionStepParams) {
    const db = getDb();
    const [row] = await db.insert(executionSteps).values({
      executionId: params.execution_id,
      nodeId: params.node_id,
      status: params.status as 'pending' | 'running' | 'success' | 'error' | 'skipped',
      startedAt: params.started_at,
      finishedAt: params.finished_at,
      inputJson: params.input_json,
      outputJson: params.output_json,
    }).returning();
    return row;
  },
};

/**
 * Typed workflow API client built on top of the generic ApiClient.
 *
 * Mirrors the endpoints defined in packages/api/src/routes/workflows.ts.
 */

import type { ApiClient } from './api-client';

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

export interface WorkflowSummary {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface WorkflowDetail extends WorkflowSummary {
  definition_json: Record<string, unknown>;
}

export interface WorkflowListResponse {
  workflows: WorkflowSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateWorkflowInput {
  name: string;
  definition_json: Record<string, unknown>;
}

export interface UpdateWorkflowInput {
  name?: string;
  definition_json?: Record<string, unknown>;
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWorkflowApi(client: ApiClient) {
  return {
    list(page = 1, pageSize = 20): Promise<WorkflowListResponse> {
      return client.get('/workflows', { page, pageSize });
    },

    get(id: string): Promise<WorkflowDetail> {
      return client.get(`/workflows/${id}`);
    },

    create(input: CreateWorkflowInput): Promise<WorkflowDetail> {
      return client.post('/workflows', input);
    },

    update(id: string, input: UpdateWorkflowInput): Promise<WorkflowDetail> {
      return client.put(`/workflows/${id}`, input);
    },

    delete(id: string): Promise<void> {
      return client.delete(`/workflows/${id}`);
    },
  };
}

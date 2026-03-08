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
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface WorkflowDetail extends WorkflowSummary {
  definitionJson: Record<string, unknown>;
}

interface WorkflowListEnvelope {
  data: WorkflowSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateWorkflowInput {
  name: string;
  definitionJson: Record<string, unknown>;
}

export interface UpdateWorkflowInput {
  name?: string;
  definitionJson?: Record<string, unknown>;
  isActive?: boolean;
}

export interface ImportN8nInput {
  name?: string;
  n8nWorkflow: Record<string, unknown>;
}

export interface ImportN8nResponse {
  workflow: WorkflowDetail;
  credentialMapping: {
    mapped: Array<{ type: string; credentialId: string; credentialName: string }>;
    unmapped: string[];
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWorkflowApi(client: ApiClient) {
  return {
    async list(page = 1, pageSize = 20): Promise<WorkflowSummary[]> {
      const response = await client.get<WorkflowListEnvelope>('/workflows', { page, limit: pageSize });
      if (response && Array.isArray((response as WorkflowListEnvelope).data)) {
        return (response as WorkflowListEnvelope).data;
      }
      if (Array.isArray(response)) {
        return response as unknown as WorkflowSummary[];
      }
      return [];
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

    importN8n(input: ImportN8nInput): Promise<ImportN8nResponse> {
      return client.post('/workflows/import', input);
    },
  };
}

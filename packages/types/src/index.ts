// Branded types
export type TenantId = string & { readonly __brand: 'TenantId' };
export type UserId = string & { readonly __brand: 'UserId' };
export type WorkflowId = string & { readonly __brand: 'WorkflowId' };
export type CredentialId = string & { readonly __brand: 'CredentialId' };
export type ExecutionId = string & { readonly __brand: 'ExecutionId' };

// For runtime checking (test exports)
export const TenantId = { __brand: 'TenantId' as const };

// Enums
export const WorkflowStatus = {
  Draft: 'draft',
  Active: 'active',
  Inactive: 'inactive',
  Archived: 'archived',
} as const;
export type WorkflowStatus = (typeof WorkflowStatus)[keyof typeof WorkflowStatus];

export const ExecutionStatus = {
  Pending: 'pending',
  Running: 'running',
  Success: 'success',
  Error: 'error',
  Cancelled: 'cancelled',
  Timeout: 'timeout',
} as const;
export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

export const UserRole = {
  Owner: 'owner',
  Admin: 'admin',
  Member: 'member',
  Viewer: 'viewer',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const Plan = {
  Free: 'free',
  Starter: 'starter',
  Pro: 'pro',
  Enterprise: 'enterprise',
} as const;
export type Plan = (typeof Plan)[keyof typeof Plan];

// API types
export interface TenantContext {
  tenantId: TenantId;
  userId: UserId;
  role: UserRole;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

// Workflow API types
export interface WorkflowResponse {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  definitionJson: Record<string, unknown>;
  status: WorkflowStatus;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialResponse {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Note: encryptedData is NEVER returned to the client
}

export interface ExecutionResponse {
  id: string;
  tenantId: string;
  workflowId: string;
  status: ExecutionStatus;
  mode: string;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface ExecutionDetailResponse extends ExecutionResponse {
  contextJson: Record<string, unknown>;
  steps: ExecutionStepResponse[];
}

export interface ExecutionStepResponse {
  id: string;
  nodeId: string;
  nodeName: string | null;
  nodeType: string | null;
  status: string;
  inputJson: unknown;
  outputJson: unknown;
  error: unknown;
  startedAt: string | null;
  finishedAt: string | null;
}

// Re-export validators
export * from './validators';

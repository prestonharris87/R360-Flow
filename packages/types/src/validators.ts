import { z } from 'zod';

// -- Pagination --
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationInput = z.infer<typeof PaginationSchema>;

// -- Workflows --
export const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  definitionJson: z.record(z.unknown()).default({}),
});
export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;

export const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  definitionJson: z.record(z.unknown()).optional(),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>;

// -- Credentials --
export const CreateCredentialSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(128),
  data: z.record(z.unknown()),
});
export type CreateCredentialInput = z.infer<typeof CreateCredentialSchema>;

export const UpdateCredentialSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  data: z.record(z.unknown()).optional(),
});
export type UpdateCredentialInput = z.infer<typeof UpdateCredentialSchema>;

// -- Executions --
export const TriggerExecutionSchema = z.object({
  inputData: z.record(z.unknown()).optional(),
});
export type TriggerExecutionInput = z.infer<typeof TriggerExecutionSchema>;

// -- UUID param --
export const UuidParamSchema = z.object({
  id: z.string().uuid(),
});

// -- Credential List Query --
export const CredentialListQuerySchema = PaginationSchema.extend({
  type: z.string().min(1).optional(),
  nodeType: z.string().min(1).optional(),
});
export type CredentialListQuery = z.infer<typeof CredentialListQuerySchema>;

// -- Credential Types (metadata endpoints) --
export const CredentialTypeQuerySchema = z.object({
  nodeType: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
});
export type CredentialTypeQuery = z.infer<typeof CredentialTypeQuerySchema>;

export const CredentialTypeParamSchema = z.object({
  name: z.string().min(1),
});
export type CredentialTypeParam = z.infer<typeof CredentialTypeParamSchema>;

export const CredentialTypeFilterQuerySchema = z.object({
  expressions: z.string().min(1),
  search: z.string().min(1).optional(),
});
export type CredentialTypeFilterQuery = z.infer<typeof CredentialTypeFilterQuerySchema>;

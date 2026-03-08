import { describe, it, expect } from 'vitest';
import {
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  PaginationSchema,
  CreateCredentialSchema,
  UpdateCredentialSchema,
  TriggerExecutionSchema,
  UuidParamSchema,
} from '../validators';

describe('Zod Validators', () => {
  describe('CreateWorkflowSchema', () => {
    it('accepts valid workflow input', () => {
      const result = CreateWorkflowSchema.safeParse({
        name: 'My Workflow',
        description: 'A test workflow',
        definitionJson: { nodes: [], edges: [] },
      });
      expect(result.success).toBe(true);
    });

    it('accepts workflow with only name', () => {
      const result = CreateWorkflowSchema.safeParse({
        name: 'Minimal Workflow',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.definitionJson).toEqual({});
      }
    });

    it('rejects workflow without name', () => {
      const result = CreateWorkflowSchema.safeParse({
        definitionJson: {},
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty name', () => {
      const result = CreateWorkflowSchema.safeParse({
        name: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects name longer than 255 chars', () => {
      const result = CreateWorkflowSchema.safeParse({
        name: 'x'.repeat(256),
        definitionJson: {},
      });
      expect(result.success).toBe(false);
    });

    it('accepts name exactly 255 chars', () => {
      const result = CreateWorkflowSchema.safeParse({
        name: 'x'.repeat(255),
      });
      expect(result.success).toBe(true);
    });

    it('rejects description longer than 2000 chars', () => {
      const result = CreateWorkflowSchema.safeParse({
        name: 'Test',
        description: 'x'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateWorkflowSchema', () => {
    it('accepts partial update with only name', () => {
      const result = UpdateWorkflowSchema.safeParse({
        name: 'Updated Name',
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty object (no updates)', () => {
      const result = UpdateWorkflowSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts valid status values', () => {
      for (const status of ['draft', 'active', 'inactive', 'archived']) {
        const result = UpdateWorkflowSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid status value', () => {
      const result = UpdateWorkflowSchema.safeParse({
        status: 'deleted',
      });
      expect(result.success).toBe(false);
    });

    it('accepts nullable description', () => {
      const result = UpdateWorkflowSchema.safeParse({
        description: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts isActive boolean', () => {
      const result = UpdateWorkflowSchema.safeParse({
        isActive: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('PaginationSchema', () => {
    it('defaults page to 1 and limit to 20', () => {
      const result = PaginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('defaults sortOrder to desc', () => {
      const result = PaginationSchema.parse({});
      expect(result.sortOrder).toBe('desc');
    });

    it('caps limit at 100', () => {
      const result = PaginationSchema.safeParse({ limit: 500 });
      expect(result.success).toBe(false);
    });

    it('rejects page less than 1', () => {
      const result = PaginationSchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects limit less than 1', () => {
      const result = PaginationSchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });

    it('accepts valid pagination input', () => {
      const result = PaginationSchema.safeParse({
        page: 3,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'asc',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(3);
        expect(result.data.limit).toBe(50);
        expect(result.data.sortBy).toBe('createdAt');
        expect(result.data.sortOrder).toBe('asc');
      }
    });

    it('coerces string numbers', () => {
      const result = PaginationSchema.parse({ page: '2', limit: '10' });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });

    it('accepts limit of exactly 100', () => {
      const result = PaginationSchema.safeParse({ limit: 100 });
      expect(result.success).toBe(true);
    });
  });

  describe('CreateCredentialSchema', () => {
    it('accepts valid credential input', () => {
      const result = CreateCredentialSchema.safeParse({
        name: 'My Slack Token',
        type: 'slackApi',
        data: { token: 'xoxb-test-token' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects credential without name', () => {
      const result = CreateCredentialSchema.safeParse({
        type: 'slackApi',
        data: { token: 'test' },
      });
      expect(result.success).toBe(false);
    });

    it('rejects credential without type', () => {
      const result = CreateCredentialSchema.safeParse({
        name: 'Test',
        data: { token: 'test' },
      });
      expect(result.success).toBe(false);
    });

    it('rejects credential without data', () => {
      const result = CreateCredentialSchema.safeParse({
        name: 'Test',
        type: 'slackApi',
      });
      expect(result.success).toBe(false);
    });

    it('rejects name longer than 255 chars', () => {
      const result = CreateCredentialSchema.safeParse({
        name: 'x'.repeat(256),
        type: 'slackApi',
        data: {},
      });
      expect(result.success).toBe(false);
    });

    it('rejects type longer than 128 chars', () => {
      const result = CreateCredentialSchema.safeParse({
        name: 'Test',
        type: 'x'.repeat(129),
        data: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateCredentialSchema', () => {
    it('accepts partial update with only name', () => {
      const result = UpdateCredentialSchema.safeParse({
        name: 'Updated Name',
      });
      expect(result.success).toBe(true);
    });

    it('accepts partial update with only data', () => {
      const result = UpdateCredentialSchema.safeParse({
        data: { newToken: 'abc123' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty object', () => {
      const result = UpdateCredentialSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('TriggerExecutionSchema', () => {
    it('accepts valid trigger input', () => {
      const result = TriggerExecutionSchema.safeParse({
        inputData: { key: 'value' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty object', () => {
      const result = TriggerExecutionSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('UuidParamSchema', () => {
    it('accepts valid UUID', () => {
      const result = UuidParamSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID', () => {
      const result = UuidParamSchema.safeParse({
        id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing id', () => {
      const result = UuidParamSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects empty string', () => {
      const result = UuidParamSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });
  });
});

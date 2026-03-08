import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ErrorHandlerService,
  type ErrorStore,
  type ExecutionError,
  type ErrorClassification,
} from '../../services/error-handler';

/** In-memory mock implementation of ErrorStore */
function createMockStore(): ErrorStore & {
  _errors: Map<string, ExecutionError>;
  save: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  getByTenant: ReturnType<typeof vi.fn>;
  getByWorkflow: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
} {
  const errors = new Map<string, ExecutionError>();

  return {
    _errors: errors,

    save: vi.fn(async (error: ExecutionError) => {
      errors.set(error.id, { ...error });
    }),

    getById: vi.fn(async (id: string) => {
      const found = errors.get(id);
      return found ? { ...found } : null;
    }),

    getByTenant: vi.fn(async (tenantId: string, limit?: number) => {
      const results = [...errors.values()].filter(
        (e) => e.tenantId === tenantId
      );
      return limit ? results.slice(0, limit) : results;
    }),

    getByWorkflow: vi.fn(
      async (tenantId: string, workflowId: string) => {
        return [...errors.values()].filter(
          (e) => e.tenantId === tenantId && e.workflowId === workflowId
        );
      }
    ),

    update: vi.fn(
      async (id: string, data: Partial<ExecutionError>) => {
        const existing = errors.get(id);
        if (!existing) return null;
        const updated = { ...existing, ...data };
        errors.set(id, updated);
        return { ...updated };
      }
    ),
  };
}

function makeErrorParams(
  overrides: Partial<
    Omit<ExecutionError, 'id' | 'timestamp' | 'retryCount' | 'resolved'>
  > = {}
): Omit<ExecutionError, 'id' | 'timestamp' | 'retryCount' | 'resolved'> {
  return {
    tenantId: 'tenant-1',
    executionId: 'exec-1',
    workflowId: 'wf-1',
    errorType: 'network',
    message: 'Connection refused',
    maxRetries: 3,
    ...overrides,
  };
}

describe('ErrorHandlerService', () => {
  let store: ReturnType<typeof createMockStore>;
  let service: ErrorHandlerService;

  beforeEach(() => {
    store = createMockStore();
    service = new ErrorHandlerService(store);
  });

  describe('recordError', () => {
    it('should record an error with classification', async () => {
      const params = makeErrorParams({ errorType: 'timeout' });
      const error = await service.recordError(params);

      expect(error.id).toBeDefined();
      expect(error.tenantId).toBe('tenant-1');
      expect(error.executionId).toBe('exec-1');
      expect(error.workflowId).toBe('wf-1');
      expect(error.errorType).toBe('timeout');
      expect(error.message).toBe('Connection refused');
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.retryCount).toBe(0);
      expect(error.resolved).toBe(false);
      expect(error.maxRetries).toBe(3);

      expect(store.save).toHaveBeenCalledOnce();
      expect(store.save).toHaveBeenCalledWith(error);
    });
  });

  describe('classifyError', () => {
    it('should classify timeout errors', () => {
      expect(service.classifyError('Request timeout after 30s')).toBe(
        'timeout'
      );
      expect(service.classifyError('Operation timed out')).toBe('timeout');
    });

    it('should classify network errors', () => {
      expect(service.classifyError('connect ECONNREFUSED 127.0.0.1:5432')).toBe(
        'network'
      );
      expect(service.classifyError('getaddrinfo ENOTFOUND api.example.com')).toBe(
        'network'
      );
      expect(service.classifyError('Network error occurred')).toBe('network');
    });

    it('should classify auth errors', () => {
      expect(service.classifyError('401 Unauthorized')).toBe('auth');
      expect(service.classifyError('403 Forbidden')).toBe('auth');
      expect(service.classifyError('Auth token expired')).toBe('auth');
    });

    it('should classify rate limit errors', () => {
      expect(service.classifyError('Rate limit exceeded')).toBe('rate_limit');
      expect(service.classifyError('Too many requests')).toBe('rate_limit');
      expect(service.classifyError('HTTP 429 response')).toBe('rate_limit');
    });

    it('should classify validation errors', () => {
      expect(service.classifyError('Validation failed for field X')).toBe(
        'validation'
      );
      expect(service.classifyError('Invalid input provided')).toBe(
        'validation'
      );
      expect(service.classifyError('Field "name" is required')).toBe(
        'validation'
      );
    });

    it('should classify unknown errors as internal', () => {
      expect(service.classifyError('Something went wrong')).toBe('internal');
      expect(service.classifyError('Segfault in native module')).toBe(
        'internal'
      );
      expect(service.classifyError('')).toBe('internal');
    });
  });

  describe('getRecoverySuggestion', () => {
    it('should provide recovery suggestions', () => {
      const types: ErrorClassification[] = [
        'network',
        'auth',
        'timeout',
        'validation',
        'internal',
        'rate_limit',
      ];

      for (const type of types) {
        const suggestion = service.getRecoverySuggestion(type);
        expect(suggestion).toBeDefined();
        expect(typeof suggestion).toBe('string');
        expect(suggestion.length).toBeGreaterThan(0);
      }

      // Spot-check specific suggestions
      expect(service.getRecoverySuggestion('network')).toContain(
        'network connectivity'
      );
      expect(service.getRecoverySuggestion('auth')).toContain('credentials');
      expect(service.getRecoverySuggestion('timeout')).toContain('timeout');
      expect(service.getRecoverySuggestion('rate_limit')).toContain(
        'Wait before retrying'
      );
    });
  });

  describe('canRetry', () => {
    it('should allow retry when under maxRetries', () => {
      const error: ExecutionError = {
        id: 'err-1',
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        workflowId: 'wf-1',
        errorType: 'network',
        message: 'ECONNREFUSED',
        timestamp: new Date(),
        retryCount: 1,
        maxRetries: 3,
        resolved: false,
      };

      expect(service.canRetry(error)).toBe(true);
    });

    it('should not retry validation errors', () => {
      const error: ExecutionError = {
        id: 'err-2',
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        workflowId: 'wf-1',
        errorType: 'validation',
        message: 'Invalid input',
        timestamp: new Date(),
        retryCount: 0,
        maxRetries: 3,
        resolved: false,
      };

      expect(service.canRetry(error)).toBe(false);
    });

    it('should not retry resolved errors', () => {
      const error: ExecutionError = {
        id: 'err-3',
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        workflowId: 'wf-1',
        errorType: 'network',
        message: 'ECONNREFUSED',
        timestamp: new Date(),
        retryCount: 0,
        maxRetries: 3,
        resolved: true,
      };

      expect(service.canRetry(error)).toBe(false);
    });

    it('should not retry when maxRetries exceeded', () => {
      const error: ExecutionError = {
        id: 'err-4',
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        workflowId: 'wf-1',
        errorType: 'timeout',
        message: 'Request timed out',
        timestamp: new Date(),
        retryCount: 3,
        maxRetries: 3,
        resolved: false,
      };

      expect(service.canRetry(error)).toBe(false);
    });
  });

  describe('scheduleRetry', () => {
    it('should schedule retry by incrementing retryCount', async () => {
      const recorded = await service.recordError(
        makeErrorParams({ errorType: 'network', maxRetries: 3 })
      );

      const retried = await service.scheduleRetry(recorded.id);

      expect(retried).not.toBeNull();
      expect(retried!.retryCount).toBe(1);

      expect(store.update).toHaveBeenCalledOnce();
      expect(store.update).toHaveBeenCalledWith(recorded.id, {
        retryCount: 1,
      });
    });
  });

  describe('resolveError', () => {
    it('should resolve an error', async () => {
      const recorded = await service.recordError(makeErrorParams());

      const resolved = await service.resolveError(recorded.id);

      expect(resolved).not.toBeNull();
      expect(resolved!.resolved).toBe(true);

      expect(store.update).toHaveBeenCalledOnce();
      expect(store.update).toHaveBeenCalledWith(recorded.id, {
        resolved: true,
      });
    });
  });

  describe('getErrors', () => {
    it('should get errors by tenant', async () => {
      await service.recordError(
        makeErrorParams({ tenantId: 'tenant-a', message: 'Error A1' })
      );
      await service.recordError(
        makeErrorParams({ tenantId: 'tenant-a', message: 'Error A2' })
      );
      await service.recordError(
        makeErrorParams({ tenantId: 'tenant-b', message: 'Error B1' })
      );

      const tenantAErrors = await service.getErrors('tenant-a');

      expect(tenantAErrors).toHaveLength(2);
      expect(tenantAErrors.every((e) => e.tenantId === 'tenant-a')).toBe(true);
    });
  });

  describe('getErrorsByWorkflow', () => {
    it('should get errors by workflow', async () => {
      await service.recordError(
        makeErrorParams({
          tenantId: 'tenant-1',
          workflowId: 'wf-alpha',
          message: 'WF Alpha error',
        })
      );
      await service.recordError(
        makeErrorParams({
          tenantId: 'tenant-1',
          workflowId: 'wf-beta',
          message: 'WF Beta error',
        })
      );
      await service.recordError(
        makeErrorParams({
          tenantId: 'tenant-1',
          workflowId: 'wf-alpha',
          message: 'WF Alpha error 2',
        })
      );

      const wfAlphaErrors = await service.getErrorsByWorkflow(
        'tenant-1',
        'wf-alpha'
      );

      expect(wfAlphaErrors).toHaveLength(2);
      expect(wfAlphaErrors.every((e) => e.workflowId === 'wf-alpha')).toBe(
        true
      );
      expect(wfAlphaErrors.every((e) => e.tenantId === 'tenant-1')).toBe(true);
    });
  });
});

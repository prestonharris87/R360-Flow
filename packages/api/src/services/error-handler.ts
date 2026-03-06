import { randomUUID } from 'node:crypto';

export type ErrorClassification =
  | 'network'
  | 'auth'
  | 'timeout'
  | 'validation'
  | 'internal'
  | 'rate_limit';

export interface ExecutionError {
  id: string;
  tenantId: string;
  executionId: string;
  workflowId: string;
  nodeId?: string;
  nodeName?: string;
  errorType: ErrorClassification;
  message: string;
  stack?: string;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  resolved: boolean;
}

export interface ErrorStore {
  save(error: ExecutionError): Promise<void>;
  getById(id: string): Promise<ExecutionError | null>;
  getByTenant(tenantId: string, limit?: number): Promise<ExecutionError[]>;
  getByWorkflow(
    tenantId: string,
    workflowId: string
  ): Promise<ExecutionError[]>;
  update(
    id: string,
    data: Partial<ExecutionError>
  ): Promise<ExecutionError | null>;
}

const RECOVERY_SUGGESTIONS: Record<ErrorClassification, string> = {
  network:
    'Check network connectivity and retry. Verify external service endpoints are accessible.',
  auth: 'Verify credentials are valid and not expired. Re-authenticate if necessary.',
  timeout:
    'Consider increasing timeout limits or optimizing the workflow. Check for infinite loops.',
  validation:
    'Check input data format and required fields. Review node configuration.',
  internal:
    'An unexpected error occurred. Check logs for details. Contact support if persistent.',
  rate_limit:
    'Too many requests. Wait before retrying. Consider upgrading your plan for higher limits.',
};

export class ErrorHandlerService {
  constructor(private store: ErrorStore) {}

  async recordError(
    params: Omit<ExecutionError, 'id' | 'timestamp' | 'retryCount' | 'resolved'> & {
      retryCount?: number;
    }
  ): Promise<ExecutionError> {
    const error: ExecutionError = {
      ...params,
      id: randomUUID(),
      timestamp: new Date(),
      retryCount: params.retryCount ?? 0,
      resolved: false,
    };
    await this.store.save(error);
    return error;
  }

  classifyError(message: string): ErrorClassification {
    const lower = message.toLowerCase();
    if (lower.includes('timeout') || lower.includes('timed out'))
      return 'timeout';
    if (
      lower.includes('econnrefused') ||
      lower.includes('enotfound') ||
      lower.includes('network')
    )
      return 'network';
    if (
      lower.includes('unauthorized') ||
      lower.includes('forbidden') ||
      lower.includes('auth')
    )
      return 'auth';
    if (
      lower.includes('rate limit') ||
      lower.includes('too many requests') ||
      lower.includes('429')
    )
      return 'rate_limit';
    if (
      lower.includes('validation') ||
      lower.includes('invalid') ||
      lower.includes('required')
    )
      return 'validation';
    return 'internal';
  }

  getRecoverySuggestion(errorType: ErrorClassification): string {
    return RECOVERY_SUGGESTIONS[errorType];
  }

  canRetry(error: ExecutionError): boolean {
    if (error.resolved) return false;
    if (error.retryCount >= error.maxRetries) return false;
    // Don't retry validation errors
    if (error.errorType === 'validation') return false;
    return true;
  }

  async scheduleRetry(errorId: string): Promise<ExecutionError | null> {
    const error = await this.store.getById(errorId);
    if (!error || !this.canRetry(error)) return null;
    return this.store.update(errorId, { retryCount: error.retryCount + 1 });
  }

  async resolveError(errorId: string): Promise<ExecutionError | null> {
    return this.store.update(errorId, { resolved: true });
  }

  async getErrors(tenantId: string, limit?: number): Promise<ExecutionError[]> {
    return this.store.getByTenant(tenantId, limit);
  }

  async getErrorsByWorkflow(
    tenantId: string,
    workflowId: string
  ): Promise<ExecutionError[]> {
    return this.store.getByWorkflow(tenantId, workflowId);
  }
}

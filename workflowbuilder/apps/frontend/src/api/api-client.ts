/**
 * Generic typed HTTP client for the R360 Flow API.
 *
 * Handles authentication headers, tenant context injection,
 * automatic retry with exponential backoff, and structured error handling.
 */

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
    public readonly url: string,
  ) {
    super(`API Error ${status} ${statusText}: ${url}`);
    this.name = 'ApiError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

// ---------------------------------------------------------------------------
// Config & interface
// ---------------------------------------------------------------------------

export interface ApiClientConfig {
  baseUrl: string;
  getAuthToken: () => Promise<string>;
  tenantId: string;
  maxRetries?: number;
  retryDelayMs?: number;
  onUnauthorized?: () => void;
}

export interface ApiClient {
  get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a query-string from a plain object, omitting undefined/null values.
 */
function toQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return '';
  const qs = entries
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join('&');
  return `?${qs}`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createApiClient(config: ApiClientConfig): ApiClient {
  const {
    baseUrl,
    getAuthToken,
    tenantId,
    maxRetries = 2,
    retryDelayMs = 500,
    onUnauthorized,
  } = config;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const token = await getAuthToken();
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
        };

        const fetchOptions: RequestInit = {
          method,
          headers,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        };

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          let responseBody: unknown;
          try {
            responseBody = await response.json();
          } catch {
            responseBody = { error: response.statusText };
          }

          if (response.status === 401 && onUnauthorized) {
            onUnauthorized();
          }

          const apiError = new ApiError(
            response.status,
            response.statusText,
            responseBody,
            url,
          );

          // Only retry on 5xx and 429 (rate limit)
          if (isRetryable(response.status) && attempt < maxRetries) {
            lastError = apiError;
            await sleep(retryDelayMs * Math.pow(2, attempt));
            continue;
          }

          throw apiError;
        }

        // Handle 204 No Content
        if (response.status === 204) {
          return undefined as T;
        }

        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }
        // Network error — retry
        lastError = error as Error;
        if (attempt < maxRetries) {
          await sleep(retryDelayMs * Math.pow(2, attempt));
          continue;
        }
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }

  return {
    get: <T>(path: string, params?: Record<string, unknown>) =>
      request<T>('GET', `${path}${toQueryString(params)}`),
    post: <T>(path: string, body?: unknown) =>
      request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) =>
      request<T>('PUT', path, body),
    patch: <T>(path: string, body?: unknown) =>
      request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  };
}

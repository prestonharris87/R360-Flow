# Phase 2: Connect Workflow Builder UI to API

## Overview

- **Goal**: Wire the Workflow Builder frontend to the R360 Flow API so that workflows are persisted, authenticated, and tenant-scoped. Build the JSON translation layer that converts between Workflow Builder's `DiagramModel` and n8n's `WorkflowParameters` format -- the critical bridge that every later phase depends on.
- **Prerequisites**: Phase 1 complete -- API server running with tenant middleware, PostgreSQL schema (tenants, users, workflows, credentials, executions, execution_steps, webhooks tables), auth provider integrated, workflow CRUD endpoints functional.
- **Cardinal Rule Checkpoint**: Zero n8n execution in this phase. We are connecting the frontend to our API and building the JSON translator. No n8n packages are installed or imported yet. The translator produces n8n-compatible JSON structures using our own type definitions that mirror n8n's interfaces -- actual n8n package imports happen in Phase 3.
- **Duration Estimate**: 1-2 weeks (Weeks 3-4)
- **Key Deliverables**:
  - API client module with auth headers, retry logic, and tenant context (`workflowbuilder/apps/frontend/src/api/`)
  - Auth UI integration: login/signup, protected routes, tenant switching
  - API-backed workflow persistence replacing local JSON import/export
  - Workflow list dashboard with create, open, rename, delete
  - Auto-save with debounce and conflict detection
  - Bidirectional JSON translator (`packages/json-translator/`): `DiagramModel <-> WorkflowParameters`
  - Round-trip fidelity test suite with snapshot fixtures
  - Phase 2 integration tests covering save/load/translate end-to-end

---

## Environment Setup

### Required Tools and Versions

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | >= 20.x LTS | Runtime |
| pnpm | >= 9.x | Package manager |
| PostgreSQL | >= 15 | Tenant-scoped data storage (from Phase 1) |
| TypeScript | >= 5.4 | Type checking |
| Vitest | Latest | Test runner |
| React | 19.x | Frontend framework (from Workflow Builder) |

### Environment Variables

```bash
# .env.development (frontend)
VITE_API_BASE_URL=http://localhost:3000/api
VITE_AUTH_PROVIDER=clerk
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxx

# .env.development (api -- from Phase 1)
DATABASE_URL=postgresql://r360:r360@localhost:5432/r360_flow
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY=sk_test_xxx
JWT_SECRET=dev-jwt-secret-32-chars-minimum!!
API_PORT=3000
```

### Infrastructure Prerequisites

```bash
# Phase 1 API server must be running
docker compose -f infrastructure/docker-compose.yml up -d postgres
pnpm --filter @r360/api dev

# Verify API is accessible
curl http://localhost:3000/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

### Setup Verification Commands

```bash
# From monorepo root
pnpm install
pnpm -r build
pnpm -r typecheck

# Verify Phase 1 is complete
pnpm --filter @r360/api test         # API tests pass
pnpm --filter @r360/db test          # DB schema tests pass
curl -s http://localhost:3000/api/workflows -H "Authorization: Bearer $TOKEN" | jq .
# Expected: {"workflows":[],"total":0}
```

---

## Step 2.1: API Client Module

### Objective

Create a typed, reusable HTTP client for the Workflow Builder frontend that handles authentication headers, tenant context injection, automatic retry with exponential backoff, and structured error handling. This is the single point of contact between the frontend and the R360 Flow API.

### TDD Implementation

#### 1. Write failing tests first

**File:** `workflowbuilder/apps/frontend/src/api/__tests__/api-client.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, ApiError, createApiClient } from '../api-client';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = createApiClient({
      baseUrl: 'http://localhost:3000/api',
      getAuthToken: async () => 'test-token-123',
      tenantId: 'tenant-abc',
    });
  });

  describe('request headers', () => {
    it('includes Authorization header with bearer token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await client.get('/workflows');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/workflows',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
            'X-Tenant-Id': 'tenant-abc',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('includes X-Tenant-Id header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await client.get('/workflows');

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders['X-Tenant-Id']).toBe('tenant-abc');
    });
  });

  describe('HTTP methods', () => {
    it('GET sends correct method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ workflows: [] }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await client.get('/workflows');
      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });

    it('POST sends body as JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 'wf-1' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const body = { name: 'My Workflow', definition_json: {} };
      await client.post('/workflows', body);

      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
      expect(mockFetch.mock.calls[0][1].body).toBe(JSON.stringify(body));
    });

    it('PUT sends body as JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'wf-1' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await client.put('/workflows/wf-1', { name: 'Updated' });
      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });

    it('DELETE sends correct method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await client.delete('/workflows/wf-1');
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  describe('error handling', () => {
    it('throws ApiError on 4xx responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Workflow not found' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await expect(client.get('/workflows/nonexistent')).rejects.toThrow(ApiError);
      await expect(client.get('/workflows/nonexistent')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws ApiError on 5xx responses after retries', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server error' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await expect(client.get('/workflows')).rejects.toThrow(ApiError);
      // Should have retried 3 times (initial + 2 retries)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('does not retry on 4xx errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: 'Invalid input' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await expect(client.post('/workflows', {})).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry logic', () => {
    it('retries on network failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: 'success' }),
          headers: new Headers({ 'content-type': 'application/json' }),
        });

      const result = await client.get('/workflows');
      expect(result).toEqual({ data: 'success' });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('respects maxRetries configuration', async () => {
      const noRetryClient = createApiClient({
        baseUrl: 'http://localhost:3000/api',
        getAuthToken: async () => 'token',
        tenantId: 'tenant-abc',
        maxRetries: 0,
      });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(noRetryClient.get('/test')).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
```

#### 2. Implement the API client

**File:** `workflowbuilder/apps/frontend/src/api/api-client.ts`

```typescript
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
}

export interface ApiClientConfig {
  baseUrl: string;
  getAuthToken: () => Promise<string>;
  tenantId: string;
  maxRetries?: number;
  retryDelayMs?: number;
  onUnauthorized?: () => void;
}

export interface ApiClient {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const {
    baseUrl,
    getAuthToken,
    tenantId,
    maxRetries = 2,
    retryDelayMs = 500,
    onUnauthorized,
  } = config;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
        // Network error -- retry
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
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  };
}
```

**File:** `workflowbuilder/apps/frontend/src/api/workflow-api.ts`

```typescript
import type { DiagramModel } from '@workflow-builder/types';
import type { ApiClient } from './api-client';

export interface WorkflowSummary {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface WorkflowDetail extends WorkflowSummary {
  definition_json: DiagramModel;
}

export interface WorkflowListResponse {
  workflows: WorkflowSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateWorkflowInput {
  name: string;
  definition_json: DiagramModel;
}

export interface UpdateWorkflowInput {
  name?: string;
  definition_json?: DiagramModel;
  is_active?: boolean;
}

export function createWorkflowApi(client: ApiClient) {
  return {
    list(page = 1, pageSize = 20): Promise<WorkflowListResponse> {
      return client.get(`/workflows?page=${page}&pageSize=${pageSize}`);
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
```

#### 3. Run tests and verify

```bash
cd workflowbuilder
pnpm test apps/frontend/src/api/__tests__/api-client.test.ts
```

#### 4. If tests fail

| Failure | Cause | Fix |
|---------|-------|-----|
| `fetch is not defined` | Test environment missing fetch mock | Add `global.fetch = vi.fn()` in test setup |
| `Cannot find module '../api-client'` | File not created | Create `api-client.ts` in the correct path |
| `Headers is not defined` | Node test environment missing Headers | Add `@types/node` or use `happy-dom` / `jsdom` test environment |
| Token async resolution fails | `getAuthToken` not awaited | Ensure `await getAuthToken()` in request function |

### Success Criteria

- [ ] All HTTP methods (GET, POST, PUT, PATCH, DELETE) send correct method and body
- [ ] Authorization bearer token included on every request
- [ ] X-Tenant-Id header included on every request
- [ ] 4xx errors throw `ApiError` immediately (no retry)
- [ ] 5xx errors retry up to `maxRetries` with exponential backoff
- [ ] Network errors retry with exponential backoff
- [ ] `onUnauthorized` callback fires on 401 responses
- [ ] 204 No Content responses handled without JSON parse error
- [ ] `WorkflowApi` wraps all CRUD endpoints with typed methods

### Verification Commands

```bash
pnpm --filter @workflow-builder/frontend test src/api/__tests__/api-client.test.ts
pnpm --filter @workflow-builder/frontend typecheck
```

---

## Step 2.2: Auth UI Integration

### Objective

Integrate the authentication provider (Clerk) into the Workflow Builder frontend with login/signup flows, protected routes that require authentication to access the editor, and tenant switching for users who belong to multiple organizations.

### TDD Implementation

#### 1. Write failing tests first

**File:** `workflowbuilder/apps/frontend/src/auth/__tests__/auth-guard.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthGuard } from '../auth-guard';
import { useAuth } from '../use-auth';

vi.mock('../use-auth');

const mockedUseAuth = vi.mocked(useAuth);

describe('AuthGuard', () => {
  it('renders children when user is authenticated', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'user-1', email: 'test@example.com', tenantId: 'tenant-abc' },
      token: 'token-123',
      login: vi.fn(),
      logout: vi.fn(),
      switchTenant: vi.fn(),
    });

    render(
      <AuthGuard>
        <div data-testid="protected-content">Protected</div>
      </AuthGuard>,
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('renders login prompt when user is not authenticated', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      token: null,
      login: vi.fn(),
      logout: vi.fn(),
      switchTenant: vi.fn(),
    });

    render(
      <AuthGuard>
        <div data-testid="protected-content">Protected</div>
      </AuthGuard>,
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it('renders loading spinner while auth state is resolving', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      token: null,
      login: vi.fn(),
      logout: vi.fn(),
      switchTenant: vi.fn(),
    });

    render(
      <AuthGuard>
        <div data-testid="protected-content">Protected</div>
      </AuthGuard>,
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
```

#### 2. Implement auth components

**File:** `workflowbuilder/apps/frontend/src/auth/types.ts`

```typescript
export interface AuthUser {
  id: string;
  email: string;
  tenantId: string;
  tenants?: TenantInfo[];
  role?: 'owner' | 'admin' | 'member' | 'viewer';
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  token: string | null;
  login: () => void;
  logout: () => void;
  switchTenant: (tenantId: string) => void;
}
```

**File:** `workflowbuilder/apps/frontend/src/auth/use-auth.ts`

```typescript
import { useCallback, useEffect, useState } from 'react';
import type { AuthState, AuthUser } from './types';

/**
 * Auth hook that wraps Clerk (or other provider).
 * Provides authentication state, tenant context, and switching.
 */
export function useAuth(): AuthState {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Initialize auth provider session
    async function initAuth() {
      try {
        // Clerk integration point:
        // const { getToken, user, isLoaded } = useClerk();
        // For now, check for existing session
        const storedToken = sessionStorage.getItem('r360_auth_token');
        if (storedToken) {
          const response = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (response.ok) {
            const userData = await response.json();
            setUser(userData);
            setToken(storedToken);
          }
        }
      } finally {
        setIsLoading(false);
      }
    }
    initAuth();
  }, []);

  const login = useCallback(() => {
    // Redirect to auth provider login page
    window.location.href = '/auth/login';
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('r360_auth_token');
    setUser(null);
    setToken(null);
    window.location.href = '/auth/login';
  }, []);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      if (!token) return;
      const response = await fetch('/api/auth/switch-tenant', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId }),
      });
      if (response.ok) {
        const { user: updatedUser, token: newToken } = await response.json();
        setUser(updatedUser);
        setToken(newToken);
      }
    },
    [token],
  );

  return {
    isAuthenticated: user !== null,
    isLoading,
    user,
    token,
    login,
    logout,
    switchTenant,
  };
}
```

**File:** `workflowbuilder/apps/frontend/src/auth/auth-guard.tsx`

```typescript
import type { ReactNode } from 'react';
import { useAuth } from './use-auth';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) {
    return (
      <div role="status" style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <span>Loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem' }}>
        <h2>Authentication Required</h2>
        <p>You must sign in to access the workflow editor.</p>
        <button onClick={login}>Sign In</button>
      </div>
    );
  }

  return <>{children}</>;
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @workflow-builder/frontend test src/auth/__tests__/auth-guard.test.tsx
```

#### 4. If tests fail

| Failure | Cause | Fix |
|---------|-------|-----|
| `Cannot find module '../use-auth'` | Hook file not created or path wrong | Verify file exists at `src/auth/use-auth.ts` |
| `screen.getByText(/sign in/i)` fails | Button text does not match | Check `AuthGuard` rendered text matches test expectation |
| `useAuth` mock not working | `vi.mock` path incorrect | Verify mock path is relative to test file |
| `@testing-library/react` not found | Dependency missing | `pnpm add -D @testing-library/react @testing-library/jest-dom` |

### Success Criteria

- [ ] Authenticated users see the workflow editor
- [ ] Unauthenticated users see a login prompt
- [ ] Loading state shows a spinner/status indicator
- [ ] `useAuth` hook exposes `user`, `token`, `login`, `logout`, `switchTenant`
- [ ] Tenant switching updates user context and auth token
- [ ] All auth state types are defined and exported

### Verification Commands

```bash
pnpm --filter @workflow-builder/frontend test src/auth/
pnpm --filter @workflow-builder/frontend typecheck
```

---

## Step 2.3: Workflow Persistence

### Objective

Replace Workflow Builder's local JSON import/export with API-backed persistence. Add a workflow list dashboard, auto-save with debounce, and conflict detection. Keep JSON export as a secondary feature for portability.

### TDD Implementation

#### 1. Write failing tests first

**File:** `workflowbuilder/apps/frontend/src/workflows/__tests__/use-workflow-persistence.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkflowPersistence } from '../use-workflow-persistence';
import type { DiagramModel } from '@workflow-builder/types';
import type { WorkflowDetail } from '../../api/workflow-api';

// Mock the workflow API
const mockWorkflowApi = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../../api/workflow-api', () => ({
  createWorkflowApi: () => mockWorkflowApi,
}));

const sampleDiagram: DiagramModel = {
  name: 'Test Workflow',
  layoutDirection: 'RIGHT',
  diagram: {
    nodes: [
      {
        id: 'node-1',
        type: 'start-node',
        position: { x: 100, y: 200 },
        data: {
          type: 'manualTrigger',
          icon: 'PlayCircle',
          properties: { label: 'Start' },
        },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
};

const sampleWorkflow: WorkflowDetail = {
  id: 'wf-123',
  name: 'Test Workflow',
  is_active: false,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
  created_by: 'user-1',
  definition_json: sampleDiagram,
};

describe('useWorkflowPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads a workflow by ID', async () => {
    mockWorkflowApi.get.mockResolvedValueOnce(sampleWorkflow);

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    expect(mockWorkflowApi.get).toHaveBeenCalledWith('wf-123');
    expect(result.current.currentWorkflow).toEqual(sampleWorkflow);
    expect(result.current.isDirty).toBe(false);
  });

  it('saves a new workflow', async () => {
    mockWorkflowApi.create.mockResolvedValueOnce(sampleWorkflow);

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.saveWorkflow(sampleDiagram);
    });

    expect(mockWorkflowApi.create).toHaveBeenCalledWith({
      name: 'Test Workflow',
      definition_json: sampleDiagram,
    });
  });

  it('updates an existing workflow', async () => {
    mockWorkflowApi.get.mockResolvedValueOnce(sampleWorkflow);
    mockWorkflowApi.update.mockResolvedValueOnce({
      ...sampleWorkflow,
      updated_at: '2026-03-02T00:00:00Z',
    });

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    const updatedDiagram = { ...sampleDiagram, name: 'Updated Name' };
    await act(async () => {
      await result.current.saveWorkflow(updatedDiagram);
    });

    expect(mockWorkflowApi.update).toHaveBeenCalledWith('wf-123', {
      name: 'Updated Name',
      definition_json: updatedDiagram,
    });
  });

  it('tracks dirty state when diagram changes', async () => {
    mockWorkflowApi.get.mockResolvedValueOnce(sampleWorkflow);

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.markDirty();
    });

    expect(result.current.isDirty).toBe(true);
  });

  it('resets dirty state after save', async () => {
    mockWorkflowApi.get.mockResolvedValueOnce(sampleWorkflow);
    mockWorkflowApi.update.mockResolvedValueOnce(sampleWorkflow);

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    act(() => {
      result.current.markDirty();
    });
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.saveWorkflow(sampleDiagram);
    });

    expect(result.current.isDirty).toBe(false);
  });

  it('detects save conflicts via updated_at mismatch', async () => {
    const staleWorkflow = { ...sampleWorkflow };
    mockWorkflowApi.get.mockResolvedValueOnce(staleWorkflow);
    mockWorkflowApi.update.mockRejectedValueOnce(
      Object.assign(new Error('Conflict'), { status: 409 }),
    );

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    await act(async () => {
      try {
        await result.current.saveWorkflow(sampleDiagram);
      } catch {
        // expected
      }
    });

    expect(result.current.hasConflict).toBe(true);
  });
});
```

#### 2. Implement workflow persistence hook

**File:** `workflowbuilder/apps/frontend/src/workflows/use-workflow-persistence.ts`

```typescript
import { useCallback, useRef, useState } from 'react';
import type { DiagramModel } from '@workflow-builder/types';
import type { WorkflowDetail } from '../api/workflow-api';

interface WorkflowApi {
  list: (page?: number, pageSize?: number) => Promise<{ workflows: WorkflowDetail[]; total: number }>;
  get: (id: string) => Promise<WorkflowDetail>;
  create: (input: { name: string; definition_json: DiagramModel }) => Promise<WorkflowDetail>;
  update: (id: string, input: { name?: string; definition_json?: DiagramModel }) => Promise<WorkflowDetail>;
  delete: (id: string) => Promise<void>;
}

export function useWorkflowPersistence(api: WorkflowApi) {
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowDetail | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadWorkflow = useCallback(async (id: string) => {
    setError(null);
    setHasConflict(false);
    const workflow = await api.get(id);
    setCurrentWorkflow(workflow);
    setIsDirty(false);
    return workflow;
  }, [api]);

  const saveWorkflow = useCallback(
    async (diagram: DiagramModel) => {
      setIsSaving(true);
      setError(null);
      try {
        let saved: WorkflowDetail;
        if (currentWorkflow) {
          saved = await api.update(currentWorkflow.id, {
            name: diagram.name,
            definition_json: diagram,
          });
        } else {
          saved = await api.create({
            name: diagram.name,
            definition_json: diagram,
          });
        }
        setCurrentWorkflow(saved);
        setIsDirty(false);
        setHasConflict(false);
        return saved;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
          setHasConflict(true);
        }
        setError(err instanceof Error ? err : new Error('Save failed'));
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [api, currentWorkflow],
  );

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const scheduleAutoSave = useCallback(
    (diagram: DiagramModel, delayMs = 3000) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        saveWorkflow(diagram).catch(() => {
          // Auto-save failures are silently logged
        });
      }, delayMs);
    },
    [saveWorkflow],
  );

  const cancelAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const exportAsJson = useCallback(
    (diagram: DiagramModel) => {
      const blob = new Blob([JSON.stringify(diagram, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${diagram.name || 'workflow'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [],
  );

  return {
    currentWorkflow,
    isDirty,
    isSaving,
    hasConflict,
    error,
    loadWorkflow,
    saveWorkflow,
    markDirty,
    scheduleAutoSave,
    cancelAutoSave,
    exportAsJson,
  };
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @workflow-builder/frontend test src/workflows/__tests__/
```

#### 4. If tests fail

| Failure | Cause | Fix |
|---------|-------|-----|
| `renderHook` is not a function | Wrong import path | Import from `@testing-library/react` (v14+) |
| `act` warnings about state updates | Async operations not wrapped in `act` | Ensure all state-changing operations are inside `act(async () => ...)` |
| `isDirty` still false after `markDirty()` | State update not flushed | Wrap in `act(() => ...)` |
| Auto-save timer leaks | Timer not cleared between tests | Add `afterEach(() => vi.clearAllTimers())` |

### Success Criteria

- [ ] `loadWorkflow(id)` fetches from API and sets current workflow
- [ ] `saveWorkflow(diagram)` creates new or updates existing workflow
- [ ] `isDirty` tracks unsaved changes
- [ ] `isDirty` resets to `false` after successful save
- [ ] 409 conflict responses set `hasConflict` flag
- [ ] Auto-save debounces with configurable delay (default 3s)
- [ ] JSON export works as secondary feature for portability
- [ ] `isSaving` flag prevents concurrent save operations

### Verification Commands

```bash
pnpm --filter @workflow-builder/frontend test src/workflows/
pnpm --filter @workflow-builder/frontend typecheck
```

---

## Step 2.4: JSON Translation Layer

### Objective

Build the `packages/json-translator/` package that provides bidirectional translation between Workflow Builder's `DiagramModel` format and n8n's `WorkflowParameters` format. This is the most complex step in Phase 2 and the critical bridge that every later phase depends on.

The translator is broken into five sub-steps:
- **2.4a**: Node mapping (WorkflowBuilderNode -> INode)
- **2.4b**: Connection mapping (WorkflowBuilderEdge[] -> IConnections)
- **2.4c**: Parameter mapping (NodeData properties -> INodeParameters)
- **2.4d**: Reverse mapping (n8n WorkflowParameters -> DiagramModel)
- **2.4e**: Round-trip fidelity tests with snapshot fixtures

### Key Type Definitions

These types mirror n8n's interfaces but are defined locally to avoid importing n8n packages (which are not installed until Phase 3).

**File:** `packages/json-translator/src/types.ts`

```typescript
/**
 * Local type definitions that mirror n8n's interfaces.
 * We define these locally because n8n packages are not installed until Phase 3.
 * In Phase 3, these will be validated against the actual n8n types via type tests.
 */

// -- n8n types (mirrored) --

export interface INode {
  id: string;
  name: string;
  typeVersion: number;
  type: string;
  position: [number, number];
  parameters: INodeParameters;
  credentials?: Record<string, INodeCredentialDescription>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  continueOnFail?: boolean;
  onError?: 'stopWorkflow' | 'continueRegularOutput' | 'continueErrorOutput';
}

export interface INodeCredentialDescription {
  id: string;
  name: string;
}

export type INodeParameters = Record<string, NodeParameterValue>;

export type NodeParameterValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | NodeParameterValue[]
  | { [key: string]: NodeParameterValue };

export type NodeConnectionType = 'main' | 'ai_agent' | 'ai_tool' | 'ai_memory' | 'ai_outputParser';

export interface IConnection {
  node: string;
  type: NodeConnectionType;
  index: number;
}

export type NodeInputConnections = Array<IConnection[] | null>;

export interface INodeConnections {
  [connectionType: string]: NodeInputConnections;
}

export interface IConnections {
  [nodeName: string]: INodeConnections;
}

export interface WorkflowParameters {
  name: string;
  nodes: INode[];
  connections: IConnections;
  active: boolean;
  settings?: WorkflowSettings;
  staticData?: Record<string, unknown>;
  pinData?: Record<string, unknown>;
}

export interface WorkflowSettings {
  executionOrder?: 'v0' | 'v1';
  saveExecutionProgress?: boolean;
  saveManualExecutions?: boolean;
  timezone?: string;
  errorWorkflow?: string;
}

// -- Workflow Builder types (re-exported for convenience) --

export type { DiagramModel } from './wb-types';
```

**File:** `packages/json-translator/src/wb-types.ts`

```typescript
/**
 * Minimal Workflow Builder type re-definitions for the translator.
 * These match the types from workflowbuilder/apps/types/ but are defined
 * locally so the translator package has no dependency on the frontend monorepo.
 */

export type LayoutDirection = 'DOWN' | 'RIGHT';

export interface WorkflowBuilderNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: WorkflowBuilderNodeData;
  width?: number;
  height?: number;
  selected?: boolean;
  dragging?: boolean;
}

export interface WorkflowBuilderNodeData {
  type: string;
  icon: string;
  templateType?: string;
  properties: Record<string, unknown>;
  segments?: unknown[];
}

export interface WorkflowBuilderEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  data?: {
    label?: string;
    icon?: string;
  };
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface DiagramModel {
  name: string;
  layoutDirection: LayoutDirection;
  diagram: {
    nodes: WorkflowBuilderNode[];
    edges: WorkflowBuilderEdge[];
    viewport: Viewport;
  };
}
```

---

### Step 2.4a: Node Mapping (WB -> n8n)

#### Objective

Convert a `WorkflowBuilderNode` to an n8n `INode`. Map the visual editor's node representation to n8n's execution-oriented format.

#### TDD Implementation

**File:** `packages/json-translator/src/__tests__/node-mapping.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { mapWBNodeToN8nNode, buildNodeNameMap } from '../node-mapping';
import type { WorkflowBuilderNode } from '../wb-types';

describe('mapWBNodeToN8nNode', () => {
  it('maps a trigger node', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-1',
      type: 'start-node',
      position: { x: 250, y: 100 },
      data: {
        type: 'n8n-nodes-base.manualTrigger',
        icon: 'PlayCircle',
        properties: {
          label: 'When clicking "Test workflow"',
          description: 'Manual trigger',
        },
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);

    expect(result).toEqual({
      id: 'node-1',
      name: 'When clicking "Test workflow"',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 100],
      parameters: {},
    });
  });

  it('maps a regular node with parameters', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-2',
      type: 'node',
      position: { x: 500, y: 100 },
      data: {
        type: 'n8n-nodes-base.set',
        icon: 'PenTool',
        properties: {
          label: 'Set Values',
          description: 'Set data',
          mode: 'manual',
          duplicateItem: false,
          assignments: {
            assignments: [
              { name: 'firstName', value: 'John', type: 'string' },
            ],
          },
        },
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);

    expect(result.id).toBe('node-2');
    expect(result.name).toBe('Set Values');
    expect(result.type).toBe('n8n-nodes-base.set');
    expect(result.position).toEqual([500, 100]);
    expect(result.parameters).toEqual({
      mode: 'manual',
      duplicateItem: false,
      assignments: {
        assignments: [
          { name: 'firstName', value: 'John', type: 'string' },
        ],
      },
    });
  });

  it('uses node type as name when label is missing', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-3',
      type: 'node',
      position: { x: 300, y: 200 },
      data: {
        type: 'n8n-nodes-base.httpRequest',
        icon: 'Globe',
        properties: {},
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);
    expect(result.name).toBe('HTTP Request');
  });

  it('extracts typeVersion from data properties', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-4',
      type: 'node',
      position: { x: 100, y: 100 },
      data: {
        type: 'n8n-nodes-base.httpRequest',
        icon: 'Globe',
        properties: {
          label: 'Fetch Data',
          typeVersion: 4,
          method: 'GET',
          url: 'https://api.example.com/data',
        },
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);
    expect(result.typeVersion).toBe(4);
    // typeVersion should NOT be in parameters
    expect(result.parameters).not.toHaveProperty('typeVersion');
  });

  it('handles disabled nodes', () => {
    const wbNode: WorkflowBuilderNode = {
      id: 'node-5',
      type: 'node',
      position: { x: 100, y: 100 },
      data: {
        type: 'n8n-nodes-base.noOp',
        icon: 'Minus',
        properties: {
          label: 'Disabled Node',
          disabled: true,
        },
      },
    };

    const result = mapWBNodeToN8nNode(wbNode);
    expect(result.disabled).toBe(true);
    expect(result.parameters).not.toHaveProperty('disabled');
  });
});

describe('buildNodeNameMap', () => {
  it('maps node IDs to unique names', () => {
    const nodes: WorkflowBuilderNode[] = [
      {
        id: 'node-1',
        position: { x: 0, y: 0 },
        data: { type: 'n8n-nodes-base.set', icon: '', properties: { label: 'Set' } },
      },
      {
        id: 'node-2',
        position: { x: 100, y: 0 },
        data: { type: 'n8n-nodes-base.set', icon: '', properties: { label: 'Set' } },
      },
    ];

    const nameMap = buildNodeNameMap(nodes);
    expect(nameMap.get('node-1')).toBe('Set');
    expect(nameMap.get('node-2')).toBe('Set 1');
  });
});
```

**File:** `packages/json-translator/src/node-mapping.ts`

```typescript
import type { INode, INodeParameters, NodeParameterValue } from './types';
import type { WorkflowBuilderNode } from './wb-types';

/**
 * Properties that are metadata (not n8n node parameters).
 * These are stripped from the properties object before creating INodeParameters.
 */
const META_PROPERTIES = new Set([
  'label',
  'description',
  'typeVersion',
  'disabled',
  'notes',
  'notesInFlow',
  'retryOnFail',
  'maxTries',
  'waitBetweenTries',
  'continueOnFail',
  'onError',
  'credentials',
]);

/**
 * Known n8n node type to default display-name map.
 * Used when a WB node has no label.
 */
const NODE_TYPE_DISPLAY_NAMES: Record<string, string> = {
  'n8n-nodes-base.manualTrigger': 'Manual Trigger',
  'n8n-nodes-base.httpRequest': 'HTTP Request',
  'n8n-nodes-base.set': 'Edit Fields',
  'n8n-nodes-base.code': 'Code',
  'n8n-nodes-base.if': 'If',
  'n8n-nodes-base.switch': 'Switch',
  'n8n-nodes-base.merge': 'Merge',
  'n8n-nodes-base.noOp': 'No Operation',
  'n8n-nodes-base.webhook': 'Webhook',
  'n8n-nodes-base.scheduleTrigger': 'Schedule Trigger',
  'n8n-nodes-base.slack': 'Slack',
  'n8n-nodes-base.gmail': 'Gmail',
  'n8n-nodes-base.googleSheets': 'Google Sheets',
};

function resolveNodeName(wbNode: WorkflowBuilderNode): string {
  const label = wbNode.data.properties.label;
  if (typeof label === 'string' && label.trim().length > 0) {
    return label.trim();
  }

  const n8nType = wbNode.data.type;
  if (NODE_TYPE_DISPLAY_NAMES[n8nType]) {
    return NODE_TYPE_DISPLAY_NAMES[n8nType];
  }

  // Derive from type string: "n8n-nodes-base.httpRequest" -> "HTTP Request"
  const shortType = n8nType.includes('.') ? n8nType.split('.').pop()! : n8nType;
  return shortType.replace(/([A-Z])/g, ' $1').trim();
}

function extractParameters(properties: Record<string, unknown>): INodeParameters {
  const params: INodeParameters = {};
  for (const [key, value] of Object.entries(properties)) {
    if (META_PROPERTIES.has(key)) continue;
    params[key] = value as NodeParameterValue;
  }
  return params;
}

/**
 * Convert a WorkflowBuilderNode to an n8n INode.
 */
export function mapWBNodeToN8nNode(wbNode: WorkflowBuilderNode): INode {
  const props = wbNode.data.properties;

  const node: INode = {
    id: wbNode.id,
    name: resolveNodeName(wbNode),
    type: wbNode.data.type,
    typeVersion: typeof props.typeVersion === 'number' ? props.typeVersion : 1,
    position: [wbNode.position.x, wbNode.position.y],
    parameters: extractParameters(props),
  };

  // Optional meta fields
  if (props.disabled === true) node.disabled = true;
  if (typeof props.notes === 'string') node.notes = props.notes;
  if (props.continueOnFail === true) node.continueOnFail = true;
  if (typeof props.onError === 'string') {
    node.onError = props.onError as INode['onError'];
  }
  if (props.credentials && typeof props.credentials === 'object') {
    node.credentials = props.credentials as Record<string, { id: string; name: string }>;
  }

  return node;
}

/**
 * Build a map from node ID -> unique node name.
 * n8n requires unique node names within a workflow.
 * Duplicate names get a numeric suffix.
 */
export function buildNodeNameMap(nodes: WorkflowBuilderNode[]): Map<string, string> {
  const nameMap = new Map<string, string>();
  const nameCounts = new Map<string, number>();

  for (const node of nodes) {
    const baseName = resolveNodeName(node);
    const count = nameCounts.get(baseName) ?? 0;

    if (count === 0) {
      nameMap.set(node.id, baseName);
    } else {
      nameMap.set(node.id, `${baseName} ${count}`);
    }

    nameCounts.set(baseName, count + 1);
  }

  return nameMap;
}
```

---

### Step 2.4b: Connection Mapping (Edges -> IConnections)

#### Objective

Convert Workflow Builder's `WorkflowBuilderEdge[]` (source/target ID pairs) to n8n's `IConnections` adjacency map (node-name-based, grouped by connection type and output index).

#### TDD Implementation

**File:** `packages/json-translator/src/__tests__/connection-mapping.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { mapEdgesToConnections } from '../connection-mapping';
import type { WorkflowBuilderEdge } from '../wb-types';

describe('mapEdgesToConnections', () => {
  const nameMap = new Map<string, string>([
    ['node-1', 'Manual Trigger'],
    ['node-2', 'Set Values'],
    ['node-3', 'HTTP Request'],
    ['node-4', 'If'],
    ['node-5', 'Slack'],
    ['node-6', 'Gmail'],
  ]);

  it('maps a simple linear connection', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-1', target: 'node-2' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    expect(connections).toEqual({
      'Manual Trigger': {
        main: [
          [{ node: 'Set Values', type: 'main', index: 0 }],
        ],
      },
    });
  });

  it('maps a chain of three nodes', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-1', target: 'node-2' },
      { id: 'e2', source: 'node-2', target: 'node-3' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    expect(connections['Manual Trigger'].main[0]).toEqual([
      { node: 'Set Values', type: 'main', index: 0 },
    ]);
    expect(connections['Set Values'].main[0]).toEqual([
      { node: 'HTTP Request', type: 'main', index: 0 },
    ]);
  });

  it('maps branching connections (one source, multiple targets)', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-4', target: 'node-5', sourceHandle: 'output_0' },
      { id: 'e2', source: 'node-4', target: 'node-6', sourceHandle: 'output_1' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    // Output 0 -> Slack
    expect(connections['If'].main[0]).toEqual([
      { node: 'Slack', type: 'main', index: 0 },
    ]);
    // Output 1 -> Gmail
    expect(connections['If'].main[1]).toEqual([
      { node: 'Gmail', type: 'main', index: 0 },
    ]);
  });

  it('maps multiple edges from same output to different targets', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-1', target: 'node-2' },
      { id: 'e2', source: 'node-1', target: 'node-3' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    // Both targets connected from output 0
    expect(connections['Manual Trigger'].main[0]).toHaveLength(2);
    expect(connections['Manual Trigger'].main[0]).toContainEqual(
      { node: 'Set Values', type: 'main', index: 0 },
    );
    expect(connections['Manual Trigger'].main[0]).toContainEqual(
      { node: 'HTTP Request', type: 'main', index: 0 },
    );
  });

  it('handles edges with targetHandle for multi-input nodes', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-2', target: 'node-3', targetHandle: 'input_1' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    expect(connections['Set Values'].main[0]).toEqual([
      { node: 'HTTP Request', type: 'main', index: 1 },
    ]);
  });

  it('returns empty object for no edges', () => {
    const connections = mapEdgesToConnections([], nameMap);
    expect(connections).toEqual({});
  });

  it('handles AI connection types from handle prefixes', () => {
    const edges: WorkflowBuilderEdge[] = [
      { id: 'e1', source: 'node-1', target: 'node-2', sourceHandle: 'ai_tool_0' },
    ];

    const connections = mapEdgesToConnections(edges, nameMap);

    expect(connections['Manual Trigger'].ai_tool[0]).toEqual([
      { node: 'Set Values', type: 'ai_tool', index: 0 },
    ]);
  });
});
```

**File:** `packages/json-translator/src/connection-mapping.ts`

```typescript
import type { IConnection, IConnections, NodeConnectionType } from './types';
import type { WorkflowBuilderEdge } from './wb-types';

/**
 * Parse a source handle string to extract connection type and output index.
 * Handle formats:
 *   - null/undefined -> { type: 'main', index: 0 }
 *   - "output_0"     -> { type: 'main', index: 0 }
 *   - "output_2"     -> { type: 'main', index: 2 }
 *   - "ai_tool_0"    -> { type: 'ai_tool', index: 0 }
 */
function parseSourceHandle(handle: string | null | undefined): {
  connectionType: NodeConnectionType;
  outputIndex: number;
} {
  if (!handle) {
    return { connectionType: 'main', outputIndex: 0 };
  }

  // AI connection types: ai_tool_0, ai_agent_0, ai_memory_0, ai_outputParser_0
  const aiMatch = handle.match(/^(ai_\w+?)_(\d+)$/);
  if (aiMatch) {
    return {
      connectionType: aiMatch[1] as NodeConnectionType,
      outputIndex: parseInt(aiMatch[2], 10),
    };
  }

  // Standard output: output_N
  const outputMatch = handle.match(/^output_(\d+)$/);
  if (outputMatch) {
    return {
      connectionType: 'main',
      outputIndex: parseInt(outputMatch[1], 10),
    };
  }

  return { connectionType: 'main', outputIndex: 0 };
}

/**
 * Parse a target handle string to extract the target input index.
 * Handle formats:
 *   - null/undefined -> 0
 *   - "input_0"      -> 0
 *   - "input_1"      -> 1
 */
function parseTargetInputIndex(handle: string | null | undefined): number {
  if (!handle) return 0;
  const match = handle.match(/^input_(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Convert Workflow Builder edges to n8n IConnections.
 *
 * n8n connections use a node-name-based adjacency map:
 * {
 *   "Source Node Name": {
 *     "main": [           // connection type
 *       [                  // output index 0
 *         { node: "Target Node Name", type: "main", index: 0 }
 *       ],
 *       [                  // output index 1
 *         { node: "Other Target", type: "main", index: 0 }
 *       ]
 *     ]
 *   }
 * }
 */
export function mapEdgesToConnections(
  edges: WorkflowBuilderEdge[],
  nodeNameMap: Map<string, string>,
): IConnections {
  const connections: IConnections = {};

  for (const edge of edges) {
    const sourceName = nodeNameMap.get(edge.source);
    const targetName = nodeNameMap.get(edge.target);

    if (!sourceName || !targetName) {
      console.warn(`Edge ${edge.id} references unknown node: source=${edge.source}, target=${edge.target}`);
      continue;
    }

    const { connectionType, outputIndex } = parseSourceHandle(edge.sourceHandle);
    const targetInputIndex = parseTargetInputIndex(edge.targetHandle);

    // Ensure the source node entry exists
    if (!connections[sourceName]) {
      connections[sourceName] = {};
    }

    // Ensure the connection type array exists
    if (!connections[sourceName][connectionType]) {
      connections[sourceName][connectionType] = [];
    }

    const outputArray = connections[sourceName][connectionType];

    // Ensure the output index slot exists (fill gaps with empty arrays)
    while (outputArray.length <= outputIndex) {
      outputArray.push([]);
    }

    // Ensure the slot is an array (not null)
    if (!outputArray[outputIndex]) {
      outputArray[outputIndex] = [];
    }

    // Add the connection
    const connection: IConnection = {
      node: targetName,
      type: connectionType,
      index: targetInputIndex,
    };

    outputArray[outputIndex]!.push(connection);
  }

  return connections;
}
```

---

### Step 2.4c: Parameter Mapping

#### Objective

Handle the conversion of Workflow Builder's schema-driven property values to n8n's `INodeParameters`. This includes expression syntax handling, resource locator fields, and collection/fixedCollection parameter structures.

#### TDD Implementation

**File:** `packages/json-translator/src/__tests__/parameter-mapping.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { mapWBPropertiesToN8nParameters, mapN8nParametersToWBProperties } from '../parameter-mapping';

describe('mapWBPropertiesToN8nParameters', () => {
  it('passes through primitive values unchanged', () => {
    const properties = {
      url: 'https://api.example.com',
      method: 'GET',
      timeout: 30000,
      followRedirects: true,
    };

    const params = mapWBPropertiesToN8nParameters(properties);

    expect(params).toEqual({
      url: 'https://api.example.com',
      method: 'GET',
      timeout: 30000,
      followRedirects: true,
    });
  });

  it('strips metadata properties (label, description, etc.)', () => {
    const properties = {
      label: 'My Node',
      description: 'Does things',
      typeVersion: 2,
      disabled: false,
      url: 'https://example.com',
    };

    const params = mapWBPropertiesToN8nParameters(properties);

    expect(params).toEqual({ url: 'https://example.com' });
    expect(params).not.toHaveProperty('label');
    expect(params).not.toHaveProperty('description');
    expect(params).not.toHaveProperty('typeVersion');
    expect(params).not.toHaveProperty('disabled');
  });

  it('preserves nested objects (collections, fixedCollections)', () => {
    const properties = {
      label: 'Set Fields',
      assignments: {
        assignments: [
          { name: 'email', value: 'test@example.com', type: 'string' },
          { name: 'age', value: 25, type: 'number' },
        ],
      },
      options: {
        dotNotation: true,
        ignoreEmpty: false,
      },
    };

    const params = mapWBPropertiesToN8nParameters(properties);

    expect(params.assignments).toEqual({
      assignments: [
        { name: 'email', value: 'test@example.com', type: 'string' },
        { name: 'age', value: 25, type: 'number' },
      ],
    });
    expect(params.options).toEqual({
      dotNotation: true,
      ignoreEmpty: false,
    });
  });

  it('preserves expression syntax strings', () => {
    const properties = {
      label: 'Dynamic Node',
      value: '={{ $json.name }}',
      url: '={{ $json.apiUrl }}/endpoint',
    };

    const params = mapWBPropertiesToN8nParameters(properties);

    expect(params.value).toBe('={{ $json.name }}');
    expect(params.url).toBe('={{ $json.apiUrl }}/endpoint');
  });

  it('handles empty properties', () => {
    const params = mapWBPropertiesToN8nParameters({});
    expect(params).toEqual({});
  });
});

describe('mapN8nParametersToWBProperties', () => {
  it('passes through n8n parameters as WB properties', () => {
    const params = {
      url: 'https://api.example.com',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };

    const properties = mapN8nParametersToWBProperties(params, 'HTTP Request');

    expect(properties.label).toBe('HTTP Request');
    expect(properties.url).toBe('https://api.example.com');
    expect(properties.method).toBe('POST');
  });
});
```

**File:** `packages/json-translator/src/parameter-mapping.ts`

```typescript
import type { INodeParameters, NodeParameterValue } from './types';

const META_KEYS = new Set([
  'label',
  'description',
  'typeVersion',
  'disabled',
  'notes',
  'notesInFlow',
  'retryOnFail',
  'maxTries',
  'waitBetweenTries',
  'continueOnFail',
  'onError',
  'credentials',
]);

/**
 * Convert Workflow Builder node properties to n8n INodeParameters.
 * Strips metadata fields (label, description, typeVersion, etc.)
 * and passes everything else through as-is.
 */
export function mapWBPropertiesToN8nParameters(
  properties: Record<string, unknown>,
): INodeParameters {
  const params: INodeParameters = {};

  for (const [key, value] of Object.entries(properties)) {
    if (META_KEYS.has(key)) continue;
    params[key] = value as NodeParameterValue;
  }

  return params;
}

/**
 * Convert n8n INodeParameters back to Workflow Builder node properties.
 * Re-adds the label and description metadata fields.
 */
export function mapN8nParametersToWBProperties(
  parameters: INodeParameters,
  nodeName: string,
  nodeNotes?: string,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    label: nodeName,
  };

  if (nodeNotes) {
    properties.description = nodeNotes;
  }

  for (const [key, value] of Object.entries(parameters)) {
    properties[key] = value;
  }

  return properties;
}
```

---

### Step 2.4d: Reverse Mapping (n8n -> WB)

#### Objective

Convert n8n's `WorkflowParameters` back to Workflow Builder's `DiagramModel`. This enables loading workflows that were created or modified outside the visual editor.

#### TDD Implementation

**File:** `packages/json-translator/src/__tests__/reverse-mapping.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { mapN8nToWBNode, mapConnectionsToEdges } from '../reverse-mapping';
import type { INode, IConnections } from '../types';

describe('mapN8nToWBNode', () => {
  it('converts an n8n INode to a WorkflowBuilderNode', () => {
    const n8nNode: INode = {
      id: 'abc-123',
      name: 'When clicking "Test workflow"',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 100],
      parameters: {},
    };

    const wbNode = mapN8nToWBNode(n8nNode);

    expect(wbNode.id).toBe('abc-123');
    expect(wbNode.position).toEqual({ x: 250, y: 100 });
    expect(wbNode.data.type).toBe('n8n-nodes-base.manualTrigger');
    expect(wbNode.data.properties.label).toBe('When clicking "Test workflow"');
    expect(wbNode.type).toBe('start-node'); // trigger nodes get start-node type
  });

  it('converts a regular node with parameters', () => {
    const n8nNode: INode = {
      id: 'def-456',
      name: 'Set Values',
      type: 'n8n-nodes-base.set',
      typeVersion: 3,
      position: [500, 100],
      parameters: {
        mode: 'manual',
        assignments: {
          assignments: [
            { name: 'key', value: 'val', type: 'string' },
          ],
        },
      },
    };

    const wbNode = mapN8nToWBNode(n8nNode);

    expect(wbNode.data.properties.label).toBe('Set Values');
    expect(wbNode.data.properties.typeVersion).toBe(3);
    expect(wbNode.data.properties.mode).toBe('manual');
    expect(wbNode.type).toBe('node'); // regular nodes
  });

  it('maps disabled state', () => {
    const n8nNode: INode = {
      id: 'x',
      name: 'Disabled',
      type: 'n8n-nodes-base.noOp',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
      disabled: true,
    };

    const wbNode = mapN8nToWBNode(n8nNode);
    expect(wbNode.data.properties.disabled).toBe(true);
  });
});

describe('mapConnectionsToEdges', () => {
  const nodeIdByName = new Map<string, string>([
    ['Manual Trigger', 'node-1'],
    ['Set Values', 'node-2'],
    ['HTTP Request', 'node-3'],
    ['If', 'node-4'],
    ['Slack', 'node-5'],
  ]);

  it('converts a simple connection to an edge', () => {
    const connections: IConnections = {
      'Manual Trigger': {
        main: [
          [{ node: 'Set Values', type: 'main', index: 0 }],
        ],
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: 'node-1',
      target: 'node-2',
    });
  });

  it('converts branching connections', () => {
    const connections: IConnections = {
      'If': {
        main: [
          [{ node: 'Slack', type: 'main', index: 0 }],
          [{ node: 'HTTP Request', type: 'main', index: 0 }],
        ],
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);

    expect(edges).toHaveLength(2);

    const slackEdge = edges.find(e => e.target === 'node-5');
    expect(slackEdge?.sourceHandle).toBe('output_0');

    const httpEdge = edges.find(e => e.target === 'node-3');
    expect(httpEdge?.sourceHandle).toBe('output_1');
  });

  it('generates unique edge IDs', () => {
    const connections: IConnections = {
      'Manual Trigger': {
        main: [
          [
            { node: 'Set Values', type: 'main', index: 0 },
            { node: 'HTTP Request', type: 'main', index: 0 },
          ],
        ],
      },
    };

    const edges = mapConnectionsToEdges(connections, nodeIdByName);

    expect(edges).toHaveLength(2);
    const ids = edges.map(e => e.id);
    expect(new Set(ids).size).toBe(2); // all unique
  });
});
```

**File:** `packages/json-translator/src/reverse-mapping.ts`

```typescript
import type { IConnection, IConnections, INode, NodeConnectionType } from './types';
import type { WorkflowBuilderEdge, WorkflowBuilderNode } from './wb-types';
import { mapN8nParametersToWBProperties } from './parameter-mapping';

/** Node types that represent trigger/start nodes in the WB visual editor. */
const TRIGGER_NODE_TYPES = new Set([
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.emailTrigger',
  'n8n-nodes-base.cron',
]);

/** Map n8n node type to a WB icon name. */
const NODE_TYPE_ICONS: Record<string, string> = {
  'n8n-nodes-base.manualTrigger': 'PlayCircle',
  'n8n-nodes-base.webhook': 'Webhook',
  'n8n-nodes-base.scheduleTrigger': 'Clock',
  'n8n-nodes-base.httpRequest': 'Globe',
  'n8n-nodes-base.set': 'PenTool',
  'n8n-nodes-base.if': 'GitBranch',
  'n8n-nodes-base.switch': 'GitBranch',
  'n8n-nodes-base.code': 'Code',
  'n8n-nodes-base.merge': 'GitMerge',
  'n8n-nodes-base.noOp': 'Minus',
  'n8n-nodes-base.slack': 'MessageSquare',
  'n8n-nodes-base.gmail': 'Mail',
  'n8n-nodes-base.googleSheets': 'Table',
};

function isTriggerNode(type: string): boolean {
  return TRIGGER_NODE_TYPES.has(type) || type.toLowerCase().includes('trigger');
}

function resolveIcon(n8nType: string): string {
  return NODE_TYPE_ICONS[n8nType] ?? 'Box';
}

function resolveWBNodeType(n8nType: string): string {
  if (isTriggerNode(n8nType)) return 'start-node';
  if (n8nType.includes('if') || n8nType.includes('switch')) return 'decision-node';
  return 'node';
}

/**
 * Convert an n8n INode to a WorkflowBuilderNode.
 */
export function mapN8nToWBNode(n8nNode: INode): WorkflowBuilderNode {
  const properties = mapN8nParametersToWBProperties(
    n8nNode.parameters,
    n8nNode.name,
    n8nNode.notes,
  );

  // Carry over typeVersion so round-trip preserves it
  if (n8nNode.typeVersion !== 1) {
    properties.typeVersion = n8nNode.typeVersion;
  }

  // Carry over meta fields
  if (n8nNode.disabled) properties.disabled = true;
  if (n8nNode.continueOnFail) properties.continueOnFail = true;
  if (n8nNode.onError) properties.onError = n8nNode.onError;
  if (n8nNode.credentials) properties.credentials = n8nNode.credentials;

  return {
    id: n8nNode.id,
    type: resolveWBNodeType(n8nNode.type),
    position: { x: n8nNode.position[0], y: n8nNode.position[1] },
    data: {
      type: n8nNode.type,
      icon: resolveIcon(n8nNode.type),
      properties,
    },
  };
}

/**
 * Convert n8n IConnections to WorkflowBuilderEdge[].
 */
export function mapConnectionsToEdges(
  connections: IConnections,
  nodeIdByName: Map<string, string>,
): WorkflowBuilderEdge[] {
  const edges: WorkflowBuilderEdge[] = [];
  let edgeCounter = 0;

  for (const [sourceName, nodeConnections] of Object.entries(connections)) {
    const sourceId = nodeIdByName.get(sourceName);
    if (!sourceId) continue;

    for (const [connectionType, outputArrays] of Object.entries(nodeConnections)) {
      for (let outputIndex = 0; outputIndex < outputArrays.length; outputIndex++) {
        const connectionsAtOutput = outputArrays[outputIndex];
        if (!connectionsAtOutput) continue;

        for (const conn of connectionsAtOutput) {
          const targetId = nodeIdByName.get(conn.node);
          if (!targetId) continue;

          const sourceHandle =
            connectionType === 'main'
              ? `output_${outputIndex}`
              : `${connectionType}_${outputIndex}`;

          const targetHandle = conn.index > 0 ? `input_${conn.index}` : undefined;

          edges.push({
            id: `e-${edgeCounter++}`,
            source: sourceId,
            target: targetId,
            sourceHandle,
            ...(targetHandle ? { targetHandle } : {}),
          });
        }
      }
    }
  }

  return edges;
}
```

---

### Step 2.4e: Round-Trip Fidelity Tests

#### Objective

Verify that the translator can convert `DiagramModel -> WorkflowParameters -> DiagramModel` without data loss. Use snapshot fixtures that are checked into version control and validated on every test run.

#### TDD Implementation

**File:** `packages/json-translator/src/__tests__/fixtures/simple-linear-workflow.wb.json`

```json
{
  "name": "Simple Linear Workflow",
  "layoutDirection": "RIGHT",
  "diagram": {
    "nodes": [
      {
        "id": "node-1",
        "type": "start-node",
        "position": { "x": 100, "y": 200 },
        "data": {
          "type": "n8n-nodes-base.manualTrigger",
          "icon": "PlayCircle",
          "properties": {
            "label": "Start"
          }
        }
      },
      {
        "id": "node-2",
        "type": "node",
        "position": { "x": 350, "y": 200 },
        "data": {
          "type": "n8n-nodes-base.set",
          "icon": "PenTool",
          "properties": {
            "label": "Set Values",
            "mode": "manual",
            "assignments": {
              "assignments": [
                { "name": "greeting", "value": "Hello World", "type": "string" }
              ]
            }
          }
        }
      },
      {
        "id": "node-3",
        "type": "node",
        "position": { "x": 600, "y": 200 },
        "data": {
          "type": "n8n-nodes-base.httpRequest",
          "icon": "Globe",
          "properties": {
            "label": "Send Request",
            "typeVersion": 4,
            "method": "POST",
            "url": "https://api.example.com/greet",
            "sendBody": true,
            "bodyParameters": {
              "parameters": [
                { "name": "message", "value": "={{ $json.greeting }}" }
              ]
            }
          }
        }
      }
    ],
    "edges": [
      { "id": "e-0", "source": "node-1", "target": "node-2" },
      { "id": "e-1", "source": "node-2", "target": "node-3" }
    ],
    "viewport": { "x": 0, "y": 0, "zoom": 1 }
  }
}
```

**File:** `packages/json-translator/src/__tests__/fixtures/simple-linear-workflow.n8n.json`

```json
{
  "name": "Simple Linear Workflow",
  "nodes": [
    {
      "id": "node-1",
      "name": "Start",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [100, 200],
      "parameters": {}
    },
    {
      "id": "node-2",
      "name": "Set Values",
      "type": "n8n-nodes-base.set",
      "typeVersion": 1,
      "position": [350, 200],
      "parameters": {
        "mode": "manual",
        "assignments": {
          "assignments": [
            { "name": "greeting", "value": "Hello World", "type": "string" }
          ]
        }
      }
    },
    {
      "id": "node-3",
      "name": "Send Request",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [600, 200],
      "parameters": {
        "method": "POST",
        "url": "https://api.example.com/greet",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "message", "value": "={{ $json.greeting }}" }
          ]
        }
      }
    }
  ],
  "connections": {
    "Start": {
      "main": [
        [{ "node": "Set Values", "type": "main", "index": 0 }]
      ]
    },
    "Set Values": {
      "main": [
        [{ "node": "Send Request", "type": "main", "index": 0 }]
      ]
    }
  },
  "active": false,
  "settings": {
    "executionOrder": "v1"
  }
}
```

**File:** `packages/json-translator/src/__tests__/fixtures/branching-workflow.wb.json`

```json
{
  "name": "Branching Workflow",
  "layoutDirection": "RIGHT",
  "diagram": {
    "nodes": [
      {
        "id": "node-1",
        "type": "start-node",
        "position": { "x": 100, "y": 300 },
        "data": {
          "type": "n8n-nodes-base.webhook",
          "icon": "Webhook",
          "properties": {
            "label": "Webhook",
            "httpMethod": "POST",
            "path": "incoming"
          }
        }
      },
      {
        "id": "node-2",
        "type": "decision-node",
        "position": { "x": 350, "y": 300 },
        "data": {
          "type": "n8n-nodes-base.if",
          "icon": "GitBranch",
          "properties": {
            "label": "Check Status",
            "conditions": {
              "options": {
                "caseSensitive": true
              },
              "conditions": [
                {
                  "leftValue": "={{ $json.status }}",
                  "rightValue": "active",
                  "operator": { "type": "string", "operation": "equals" }
                }
              ]
            }
          }
        }
      },
      {
        "id": "node-3",
        "type": "node",
        "position": { "x": 600, "y": 200 },
        "data": {
          "type": "n8n-nodes-base.slack",
          "icon": "MessageSquare",
          "properties": {
            "label": "Notify Slack",
            "resource": "message",
            "operation": "post",
            "channel": "general",
            "text": "User is active!"
          }
        }
      },
      {
        "id": "node-4",
        "type": "node",
        "position": { "x": 600, "y": 400 },
        "data": {
          "type": "n8n-nodes-base.gmail",
          "icon": "Mail",
          "properties": {
            "label": "Send Email",
            "resource": "message",
            "operation": "send",
            "sendTo": "admin@example.com",
            "subject": "Inactive user alert"
          }
        }
      }
    ],
    "edges": [
      { "id": "e-0", "source": "node-1", "target": "node-2" },
      { "id": "e-1", "source": "node-2", "target": "node-3", "sourceHandle": "output_0" },
      { "id": "e-2", "source": "node-2", "target": "node-4", "sourceHandle": "output_1" }
    ],
    "viewport": { "x": 0, "y": 0, "zoom": 1 }
  }
}
```

**File:** `packages/json-translator/src/__tests__/round-trip.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { translateWBToN8n, translateN8nToWB } from '../index';
import type { DiagramModel } from '../wb-types';
import type { WorkflowParameters } from '../types';

function loadFixture<T>(filename: string): T {
  const filePath = join(__dirname, 'fixtures', filename);
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

describe('Round-trip fidelity: WB -> n8n -> WB', () => {
  it('simple linear workflow survives round-trip', () => {
    const originalWB = loadFixture<DiagramModel>('simple-linear-workflow.wb.json');
    const expectedN8n = loadFixture<WorkflowParameters>('simple-linear-workflow.n8n.json');

    // Forward translation
    const n8nResult = translateWBToN8n(originalWB);

    expect(n8nResult.name).toBe(expectedN8n.name);
    expect(n8nResult.nodes).toHaveLength(expectedN8n.nodes.length);
    expect(n8nResult.active).toBe(false);

    // Verify node structure
    for (const expectedNode of expectedN8n.nodes) {
      const actualNode = n8nResult.nodes.find(n => n.id === expectedNode.id);
      expect(actualNode).toBeDefined();
      expect(actualNode!.name).toBe(expectedNode.name);
      expect(actualNode!.type).toBe(expectedNode.type);
      expect(actualNode!.position).toEqual(expectedNode.position);
      expect(actualNode!.parameters).toEqual(expectedNode.parameters);
    }

    // Verify connections
    expect(Object.keys(n8nResult.connections)).toEqual(Object.keys(expectedN8n.connections));

    // Reverse translation
    const roundTripWB = translateN8nToWB(n8nResult);

    expect(roundTripWB.name).toBe(originalWB.name);
    expect(roundTripWB.diagram.nodes).toHaveLength(originalWB.diagram.nodes.length);
    expect(roundTripWB.diagram.edges).toHaveLength(originalWB.diagram.edges.length);

    // Verify node positions and types survive round-trip
    for (const originalNode of originalWB.diagram.nodes) {
      const roundTripNode = roundTripWB.diagram.nodes.find(n => n.id === originalNode.id);
      expect(roundTripNode).toBeDefined();
      expect(roundTripNode!.position).toEqual(originalNode.position);
      expect(roundTripNode!.data.type).toBe(originalNode.data.type);
    }
  });

  it('branching workflow survives round-trip', () => {
    const originalWB = loadFixture<DiagramModel>('branching-workflow.wb.json');

    const n8nResult = translateWBToN8n(originalWB);

    // Verify If node has two output branches
    expect(n8nResult.connections['Check Status']).toBeDefined();
    expect(n8nResult.connections['Check Status'].main).toHaveLength(2);

    // Round-trip back
    const roundTripWB = translateN8nToWB(n8nResult);

    expect(roundTripWB.diagram.nodes).toHaveLength(4);
    expect(roundTripWB.diagram.edges).toHaveLength(3);

    // Verify branching edges have correct source handles
    const branchEdges = roundTripWB.diagram.edges.filter(
      e => e.source === 'node-2',
    );
    expect(branchEdges).toHaveLength(2);
    expect(branchEdges.map(e => e.sourceHandle).sort()).toEqual(['output_0', 'output_1']);
  });

  it('parameters with expressions survive round-trip', () => {
    const originalWB = loadFixture<DiagramModel>('simple-linear-workflow.wb.json');

    const n8nResult = translateWBToN8n(originalWB);
    const roundTripWB = translateN8nToWB(n8nResult);

    // Find the HTTP Request node
    const httpNode = roundTripWB.diagram.nodes.find(
      n => n.data.type === 'n8n-nodes-base.httpRequest',
    );
    expect(httpNode).toBeDefined();

    // Verify expression parameter survived
    const bodyParams = httpNode!.data.properties.bodyParameters as {
      parameters: Array<{ value: string }>;
    };
    expect(bodyParams.parameters[0].value).toBe('={{ $json.greeting }}');
  });
});

describe('Round-trip fidelity: n8n -> WB -> n8n', () => {
  it('n8n workflow format survives round-trip', () => {
    const originalN8n = loadFixture<WorkflowParameters>('simple-linear-workflow.n8n.json');

    // Reverse: n8n -> WB
    const wbResult = translateN8nToWB(originalN8n);

    // Forward: WB -> n8n
    const roundTripN8n = translateWBToN8n(wbResult);

    expect(roundTripN8n.name).toBe(originalN8n.name);
    expect(roundTripN8n.nodes).toHaveLength(originalN8n.nodes.length);

    for (const originalNode of originalN8n.nodes) {
      const roundTripNode = roundTripN8n.nodes.find(n => n.id === originalNode.id);
      expect(roundTripNode).toBeDefined();
      expect(roundTripNode!.type).toBe(originalNode.type);
      expect(roundTripNode!.typeVersion).toBe(originalNode.typeVersion);
      expect(roundTripNode!.position).toEqual(originalNode.position);
      expect(roundTripNode!.parameters).toEqual(originalNode.parameters);
    }

    // Connection structure should match
    for (const [nodeName, nodeConns] of Object.entries(originalN8n.connections)) {
      expect(roundTripN8n.connections[nodeName]).toBeDefined();
      for (const [connType, outputs] of Object.entries(nodeConns)) {
        expect(roundTripN8n.connections[nodeName][connType]).toHaveLength(
          outputs.length,
        );
      }
    }
  });
});
```

---

### Translator Entry Point

**File:** `packages/json-translator/src/index.ts`

```typescript
import { mapWBNodeToN8nNode, buildNodeNameMap } from './node-mapping';
import { mapEdgesToConnections } from './connection-mapping';
import { mapN8nToWBNode, mapConnectionsToEdges } from './reverse-mapping';
import type { WorkflowParameters } from './types';
import type { DiagramModel } from './wb-types';

export type { WorkflowParameters, INode, IConnections, IConnection } from './types';
export type { DiagramModel } from './wb-types';

/**
 * Translate a Workflow Builder DiagramModel to n8n WorkflowParameters.
 *
 * This is the forward path: visual editor -> execution engine.
 */
export function translateWBToN8n(diagram: DiagramModel): WorkflowParameters {
  const nodes = diagram.diagram.nodes;
  const edges = diagram.diagram.edges;

  // Build unique name map (n8n requires unique node names)
  const nameMap = buildNodeNameMap(nodes);

  // Map each WB node to an n8n INode, using the resolved unique name
  const n8nNodes = nodes.map((wbNode) => {
    const n8nNode = mapWBNodeToN8nNode(wbNode);
    const uniqueName = nameMap.get(wbNode.id);
    if (uniqueName) {
      n8nNode.name = uniqueName;
    }
    return n8nNode;
  });

  // Map edges to n8n connections (using the name map)
  const connections = mapEdgesToConnections(edges, nameMap);

  return {
    name: diagram.name,
    nodes: n8nNodes,
    connections,
    active: false,
    settings: {
      executionOrder: 'v1',
    },
  };
}

/**
 * Translate n8n WorkflowParameters to a Workflow Builder DiagramModel.
 *
 * This is the reverse path: execution engine -> visual editor.
 */
export function translateN8nToWB(workflow: WorkflowParameters): DiagramModel {
  // Build reverse lookup: node name -> node ID
  const nodeIdByName = new Map<string, string>();
  for (const node of workflow.nodes) {
    nodeIdByName.set(node.name, node.id);
  }

  // Map each n8n node to a WB node
  const wbNodes = workflow.nodes.map(mapN8nToWBNode);

  // Map connections to edges
  const wbEdges = mapConnectionsToEdges(workflow.connections, nodeIdByName);

  return {
    name: workflow.name,
    layoutDirection: 'RIGHT',
    diagram: {
      nodes: wbNodes,
      edges: wbEdges,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}
```

**File:** `packages/json-translator/package.json`

```json
{
  "name": "@r360/json-translator",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

**File:** `packages/json-translator/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/__tests__"]
}
```

### Step 2.4 Success Criteria

- [ ] `translateWBToN8n()` produces valid n8n `WorkflowParameters` from any `DiagramModel`
- [ ] `translateN8nToWB()` produces valid `DiagramModel` from any `WorkflowParameters`
- [ ] Node positions preserved: `[x, y]` <-> `{ x, y }` bidirectionally
- [ ] Node names are unique (duplicate labels get numeric suffixes)
- [ ] Metadata properties (label, description, typeVersion, disabled) separated from execution parameters
- [ ] Expression syntax strings (`={{ ... }}`) pass through without modification
- [ ] Branching connections (If, Switch) map to correct output indices
- [ ] Multi-input node connections map to correct input indices
- [ ] AI connection types (ai_tool, ai_agent, ai_memory) preserved
- [ ] All snapshot fixtures pass round-trip tests (WB -> n8n -> WB and n8n -> WB -> n8n)
- [ ] Edge IDs are unique after reverse mapping
- [ ] Empty workflows (no nodes, no edges) translate without errors

### Verification Commands

```bash
pnpm --filter @r360/json-translator test
pnpm --filter @r360/json-translator typecheck
```

---

## Step 2.5: Phase 2 Integration Tests

### Objective

Validate that all Phase 2 components work together end-to-end: the API client saves a workflow, the translator converts it, the persistence hook manages state, and auth gates protect access.

### TDD Implementation

**File:** `packages/json-translator/src/__tests__/integration.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { translateWBToN8n, translateN8nToWB } from '../index';
import type { DiagramModel } from '../wb-types';

describe('Phase 2 Integration: Full Translation Pipeline', () => {
  it('handles a complex workflow with multiple node types', () => {
    const complexWorkflow: DiagramModel = {
      name: 'Customer Onboarding',
      layoutDirection: 'RIGHT',
      diagram: {
        nodes: [
          {
            id: 'trigger-1',
            type: 'start-node',
            position: { x: 0, y: 300 },
            data: {
              type: 'n8n-nodes-base.webhook',
              icon: 'Webhook',
              properties: {
                label: 'New Signup Webhook',
                httpMethod: 'POST',
                path: 'signup',
              },
            },
          },
          {
            id: 'validate-1',
            type: 'node',
            position: { x: 250, y: 300 },
            data: {
              type: 'n8n-nodes-base.set',
              icon: 'PenTool',
              properties: {
                label: 'Normalize Data',
                mode: 'manual',
                assignments: {
                  assignments: [
                    { name: 'email', value: '={{ $json.email.toLowerCase() }}', type: 'string' },
                    { name: 'name', value: '={{ $json.firstName }} {{ $json.lastName }}', type: 'string' },
                  ],
                },
              },
            },
          },
          {
            id: 'check-1',
            type: 'decision-node',
            position: { x: 500, y: 300 },
            data: {
              type: 'n8n-nodes-base.if',
              icon: 'GitBranch',
              properties: {
                label: 'Is Enterprise?',
                conditions: {
                  conditions: [
                    {
                      leftValue: '={{ $json.plan }}',
                      rightValue: 'enterprise',
                      operator: { type: 'string', operation: 'equals' },
                    },
                  ],
                },
              },
            },
          },
          {
            id: 'slack-1',
            type: 'node',
            position: { x: 750, y: 200 },
            data: {
              type: 'n8n-nodes-base.slack',
              icon: 'MessageSquare',
              properties: {
                label: 'Alert Sales Team',
                resource: 'message',
                operation: 'post',
                channel: 'sales-alerts',
                text: '={{ "Enterprise signup: " + $json.name }}',
              },
            },
          },
          {
            id: 'email-1',
            type: 'node',
            position: { x: 750, y: 400 },
            data: {
              type: 'n8n-nodes-base.gmail',
              icon: 'Mail',
              properties: {
                label: 'Send Welcome Email',
                resource: 'message',
                operation: 'send',
                sendTo: '={{ $json.email }}',
                subject: 'Welcome to R360!',
              },
            },
          },
        ],
        edges: [
          { id: 'e-0', source: 'trigger-1', target: 'validate-1' },
          { id: 'e-1', source: 'validate-1', target: 'check-1' },
          { id: 'e-2', source: 'check-1', target: 'slack-1', sourceHandle: 'output_0' },
          { id: 'e-3', source: 'check-1', target: 'email-1', sourceHandle: 'output_1' },
        ],
        viewport: { x: 0, y: 0, zoom: 0.8 },
      },
    };

    // Forward translation
    const n8n = translateWBToN8n(complexWorkflow);

    // Structural validation
    expect(n8n.nodes).toHaveLength(5);
    expect(n8n.name).toBe('Customer Onboarding');
    expect(n8n.active).toBe(false);

    // All node names unique
    const nodeNames = n8n.nodes.map(n => n.name);
    expect(new Set(nodeNames).size).toBe(5);

    // Trigger node correct
    const trigger = n8n.nodes.find(n => n.type === 'n8n-nodes-base.webhook');
    expect(trigger).toBeDefined();
    expect(trigger!.parameters.httpMethod).toBe('POST');
    expect(trigger!.parameters.path).toBe('signup');

    // If node branches
    expect(n8n.connections['Is Enterprise?']).toBeDefined();
    expect(n8n.connections['Is Enterprise?'].main).toHaveLength(2);

    // Expression parameters preserved
    const setNode = n8n.nodes.find(n => n.name === 'Normalize Data');
    expect(setNode).toBeDefined();
    const assignments = (setNode!.parameters.assignments as { assignments: Array<{ value: string }> }).assignments;
    expect(assignments[0].value).toBe('={{ $json.email.toLowerCase() }}');

    // Round-trip
    const roundTrip = translateN8nToWB(n8n);
    expect(roundTrip.diagram.nodes).toHaveLength(5);
    expect(roundTrip.diagram.edges).toHaveLength(4);

    // Verify branching edges exist in round-trip
    const ifEdges = roundTrip.diagram.edges.filter(e => e.source === 'check-1');
    expect(ifEdges).toHaveLength(2);
  });

  it('handles an empty workflow', () => {
    const emptyWorkflow: DiagramModel = {
      name: 'Empty',
      layoutDirection: 'DOWN',
      diagram: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    const n8n = translateWBToN8n(emptyWorkflow);
    expect(n8n.nodes).toHaveLength(0);
    expect(n8n.connections).toEqual({});

    const roundTrip = translateN8nToWB(n8n);
    expect(roundTrip.diagram.nodes).toHaveLength(0);
    expect(roundTrip.diagram.edges).toHaveLength(0);
  });

  it('handles a single-node workflow (no edges)', () => {
    const singleNode: DiagramModel = {
      name: 'Single Trigger',
      layoutDirection: 'RIGHT',
      diagram: {
        nodes: [
          {
            id: 'only-node',
            type: 'start-node',
            position: { x: 100, y: 100 },
            data: {
              type: 'n8n-nodes-base.manualTrigger',
              icon: 'PlayCircle',
              properties: { label: 'Start' },
            },
          },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    const n8n = translateWBToN8n(singleNode);
    expect(n8n.nodes).toHaveLength(1);
    expect(n8n.connections).toEqual({});

    const roundTrip = translateN8nToWB(n8n);
    expect(roundTrip.diagram.nodes).toHaveLength(1);
    expect(roundTrip.diagram.nodes[0].id).toBe('only-node');
  });

  it('preserves node IDs through full pipeline', () => {
    const workflow: DiagramModel = {
      name: 'ID Preservation',
      layoutDirection: 'RIGHT',
      diagram: {
        nodes: [
          {
            id: 'uuid-aaaa-bbbb-cccc',
            type: 'node',
            position: { x: 0, y: 0 },
            data: {
              type: 'n8n-nodes-base.code',
              icon: 'Code',
              properties: {
                label: 'Custom Code',
                jsCode: 'return items;',
              },
            },
          },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    const n8n = translateWBToN8n(workflow);
    expect(n8n.nodes[0].id).toBe('uuid-aaaa-bbbb-cccc');

    const roundTrip = translateN8nToWB(n8n);
    expect(roundTrip.diagram.nodes[0].id).toBe('uuid-aaaa-bbbb-cccc');
  });
});
```

### Success Criteria

- [ ] Complex multi-node workflows translate correctly end-to-end
- [ ] Empty workflows (0 nodes, 0 edges) translate without errors
- [ ] Single-node workflows (no connections) translate correctly
- [ ] Node IDs preserved through full pipeline
- [ ] Expression strings survive the full round-trip
- [ ] Branching/merging connection topology preserved
- [ ] All Phase 2 tests pass in CI

### Verification Commands

```bash
# Run all Phase 2 tests
pnpm --filter @r360/json-translator test
pnpm --filter @workflow-builder/frontend test src/api/ src/auth/ src/workflows/

# Type checking
pnpm --filter @r360/json-translator typecheck
pnpm --filter @workflow-builder/frontend typecheck

# Full monorepo check
pnpm -r typecheck
pnpm -r test
```

---

## Phase Completion Checklist

- [ ] **Step 2.1**: API client module with auth headers, tenant context, retry, typed error handling
- [ ] **Step 2.2**: Auth UI with login/signup, protected routes, tenant switching, loading states
- [ ] **Step 2.3**: Workflow persistence (API-backed save/load, auto-save, conflict detection, JSON export)
- [ ] **Step 2.4a**: Node mapping: WorkflowBuilderNode -> INode with unique names
- [ ] **Step 2.4b**: Connection mapping: WorkflowBuilderEdge[] -> IConnections adjacency map
- [ ] **Step 2.4c**: Parameter mapping: properties <-> INodeParameters with metadata stripping
- [ ] **Step 2.4d**: Reverse mapping: INode -> WorkflowBuilderNode, IConnections -> edges
- [ ] **Step 2.4e**: Round-trip fidelity tests with snapshot fixtures all passing
- [ ] **Step 2.5**: Integration tests covering complex, empty, and single-node workflows
- [ ] All tests pass: `pnpm --filter @r360/json-translator test`
- [ ] All tests pass: `pnpm --filter @workflow-builder/frontend test`
- [ ] TypeScript compiles: `pnpm -r typecheck`
- [ ] No n8n packages installed or imported (Phase 3 responsibility)
- [ ] API client connects to Phase 1 endpoints successfully
- [ ] Workflow Builder can save and load workflows via the API

## Rollback Procedure

If Phase 2 introduces instability:

### Level 1: Revert Individual Step

```bash
# Identify the problematic commit
git log --oneline packages/json-translator/ workflowbuilder/apps/frontend/src/api/

# Revert the specific commit
git revert <commit-hash>

# Re-run tests to verify stability
pnpm -r test
```

### Level 2: Disable API Integration, Revert to Local JSON

```typescript
// In workflowbuilder config, switch back to local mode:
const PERSISTENCE_MODE = process.env.PERSISTENCE_MODE ?? 'local'; // 'local' | 'api'

// Local mode uses the existing JSON import/export (Workflow Builder's built-in)
// API mode uses the new API-backed persistence from Step 2.3
```

### Level 3: Full Phase Rollback

```bash
# Remove all Phase 2 additions
git revert --no-commit <first-phase2-commit>..<latest-phase2-commit>
git commit -m "Revert Phase 2: API integration unstable, reverting to Phase 1 state"

# Phase 1 (API server, DB) remains fully functional
# Workflow Builder continues to work with local JSON import/export
# JSON translator is removed but can be re-built from this spec
```

### Data Safety

- Phase 2 does NOT modify the database schema (that was Phase 1)
- Phase 2 does NOT install n8n packages (that is Phase 3)
- Phase 2 does NOT modify Workflow Builder's core canvas/node system
- Rollback only affects: `packages/json-translator/`, `workflowbuilder/apps/frontend/src/api/`, `workflowbuilder/apps/frontend/src/auth/`, `workflowbuilder/apps/frontend/src/workflows/`
- All existing workflow definitions remain intact in the DB
- JSON translator types are standalone -- no external dependencies to break

---

## Cross-Phase Integration Notes

### From Phase 1

- API endpoints (`POST/GET/PUT/DELETE /api/workflows`) are consumed by the API client (Step 2.1)
- Auth middleware validates the `Authorization` header and `X-Tenant-Id` header that the API client sends
- The `workflows.definition_json` column stores the `DiagramModel` JSON produced by the Workflow Builder
- Tenant middleware extracts tenant context that the frontend injects via `X-Tenant-Id`

### For Phase 3

- `packages/json-translator/` output (`WorkflowParameters`) is the input to `packages/execution-engine/`
- `ExecutionService` calls `translateWBToN8n(diagram)` to get `WorkflowParameters`, then constructs the n8n `Workflow` object
- The mirrored n8n types in `packages/json-translator/src/types.ts` will be validated against actual n8n types via type-compatibility tests after n8n packages are installed
- Node palette (Phase 3, Step 3.5) will use the reverse mapping to display n8n node descriptions in the WB editor

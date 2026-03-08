> **Note:** The editor-v2 experiment (`workflowbuilder/apps/editor-v2/`) referenced in this document has been removed. Its functionality is now part of frontend-v2.

# Phase 8: Vue Frontend Rewrite

## Task Description

Replace the React frontend (`workflowbuilder/apps/frontend/`) with a Vue 3 application that can directly import n8n's Vue-based design system components, use `@vue-flow/core` for the workflow canvas, and provide a single-framework architecture. The new app lives at `workflowbuilder/apps/frontend-v2/` during development and replaces the React app when complete.

## Objective

When Phase 8 is complete, R360 Flow has a Vue 3 frontend that:
- Provides every feature present in the React frontend (9 pages, 4 stores, 4 API modules, 5 shared components)
- Directly imports `@n8n/design-system` Vue components (80+ pure Vue components)
- Uses `@vue-flow/core` for the workflow canvas (same library n8n uses)
- Replaces both the React app (port 4200) and the editor-v2 experiment (port 4202)
- Runs on port 4200, proxying `/api` to the R360 Flow API on port 3100

## Prerequisites

- Phases 1-7 complete (backend API, execution engine, all React pages working)
- editor-v2 experiment at `workflowbuilder/apps/editor-v2/` (proof of concept for Vite aliases, @vue-flow/core, node types store)
- n8n source tree at `n8n/` (read-only reference for Vite alias resolution)
- API server running on port 3100

## Cardinal Rule

n8n packages (`n8n-workflow`, `n8n-core`, `n8n-nodes-base`, `@n8n/di`, `@n8n/config`, `@n8n/backend-common`, `@n8n/errors`, `@n8n/constants`, `@n8n/decorators`) are **unmodified npm dependencies**. NEVER fork, patch, monkey-patch, or vendor n8n source code. Only import from installed npm packages or via Vite aliases pointing to the read-only `n8n/packages/` source tree.

## Deliverables

1. `workflowbuilder/apps/frontend-v2/` -- complete Vue 3 application
2. All 9 pages ported from React with feature parity
3. 4 Pinia stores replacing 4 Zustand stores
4. 4 API modules (identical endpoints, Vue-idiomatic client)
5. Workflow editor with @vue-flow/core canvas, node palette, properties panel
6. E2E tests for every page and feature
7. editor-v2 experiment removed
8. API server CORS updated for new frontend

## Architecture

```
Vue Frontend V2 (port 4200, replaces React app)
+-- @n8n/design-system -- imported via Vite aliases (buttons, inputs, dialogs)
+-- @vue-flow/core -- workflow canvas (same library n8n uses)
+-- Custom pages -- Dashboard, Workflows, Executions, Credentials, Settings
+-- Pinia stores -- replacing Zustand stores
+-- Custom API layer -- same endpoints, fetch client
+-- Auth -- sessionStorage + route guards (same as React app)
```

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Vue 3 (Composition API) | ^3.5.0 |
| State | Pinia | ^2.2.0 |
| Routing | Vue Router | ^4.5.0 |
| Canvas | @vue-flow/core | ^1.41.0 |
| Design System | @n8n/design-system | via Vite aliases |
| Build | Vite | ^6.0.0 |
| Styling | SCSS + @n8n/design-system tokens | -- |
| HTTP | fetch (native) | -- |
| Testing | Vitest + @vue/test-utils | -- |
| E2E | Playwright or Browser MCP | -- |

### n8n Component Import Strategy

For each component category, we document whether to import from n8n or build custom:

| Component | Strategy | Rationale |
|-----------|----------|-----------|
| @n8n/design-system (N8nButton, N8nInput, N8nDialog, etc.) | **Import directly** via Vite aliases | Pure Vue components, no backend deps. 80+ components proven in editor-v2. |
| @vue-flow/core | **Import as npm dep** | Same library n8n uses. Our own canvas wrapper. Proven in editor-v2. |
| Canvas (Canvas.vue) | **Build custom** using @vue-flow/core | n8n's Canvas.vue has too many store dependencies (2+ Pinia stores, drag manager). |
| CanvasNode rendering | **Build custom** using @n8n/design-system primitives | Render node icons, labels, handles. Proven in editor-v2 CanvasNode.vue. |
| Node Palette / Creator | **Build custom** with @n8n/design-system | n8n's NodeCreator has deep store coupling. Build simple searchable list. |
| Parameter Inputs | **Try import**, fallback to custom | n8n's ParameterInput depends on design-system + n8n-workflow types. Try importing; if too coupled, build custom with N8nInput/N8nSelect. |
| Expression Editor | **Build custom** with CodeMirror | n8n's expression editor has deep completions integration. Build simplified version. |
| Credential UI | **Build custom** using @n8n/design-system | n8n's credential UI requires REST client + i18n + multiple stores. Build custom dynamic form. |
| Pages (Dashboard, Lists, etc.) | **Build from scratch** | These are R360-specific pages, not present in n8n. |
| Auth system | **Build from scratch** | SessionStorage-based, same pattern as React app. |

### New File Structure

```
workflowbuilder/apps/frontend-v2/
  package.json
  vite.config.mts
  tsconfig.json
  index.html
  env.d.ts
  src/
    main.ts
    App.vue
    router/
      index.ts
    auth/
      use-auth.ts
      auth-guard.ts
      types.ts
    api/
      api-client.ts
      workflow-api.ts
      execution-api.ts
      credential-api.ts
      health-api.ts
      index.ts
    stores/
      use-dashboard-store.ts
      use-workflow-list-store.ts
      use-execution-store.ts
      use-credential-store.ts
    components/
      AppShell.vue
      TheSidebar.vue
      PageHeader.vue
      DataTable.vue
      StatusBadge.vue
      StatCard.vue
      EmptyState.vue
      ConfirmDialog.vue
      ToastNotification.vue
    pages/
      LoginPage.vue
      DashboardPage.vue
      WorkflowListPage.vue
      ExecutionListPage.vue
      ExecutionDetailPage.vue
      CredentialsPage.vue
      SettingsPage.vue
    editor/
      WorkflowEditorPage.vue
      components/
        EditorCanvas.vue
        CanvasNode.vue
        CanvasEdge.vue
        CanvasControls.vue
        NodePalette.vue
        PropertiesPanel.vue
        ParameterInput.vue
        ExpressionEditor.vue
        CredentialSelector.vue
        NodeSettings.vue
        CanvasContextMenu.vue
    composables/
      use-toast.ts
      use-theme.ts
      use-auto-save.ts
    styles/
      main.scss
      variables.scss
      _theme-light.scss
      _theme-dark.scss
    __tests__/
      (unit tests per component)
    __e2e__/
      (E2E test files)
```

## Relevant Files

### React Frontend -- Read for Feature Parity
- `workflowbuilder/apps/frontend/src/api/api-client.ts` -- API client pattern
- `workflowbuilder/apps/frontend/src/api/workflow-api.ts` -- Workflow API
- `workflowbuilder/apps/frontend/src/api/execution-api.ts` -- Execution API
- `workflowbuilder/apps/frontend/src/api/credential-api.ts` -- Credential API
- `workflowbuilder/apps/frontend/src/auth/use-auth.ts` -- Auth hook
- `workflowbuilder/apps/frontend/src/auth/auth-guard.tsx` -- Auth guard
- `workflowbuilder/apps/frontend/src/stores/` -- Zustand stores
- `workflowbuilder/apps/frontend/src/pages/` -- All page components
- `workflowbuilder/apps/frontend/src/layouts/` -- AppShell, Sidebar, PageHeader
- `workflowbuilder/apps/frontend/src/components/` -- Shared components

### editor-v2 Experiment -- Reference for Vite Config
- `workflowbuilder/apps/editor-v2/vite.config.mts` -- Proven Vite alias configuration
- `workflowbuilder/apps/editor-v2/package.json` -- Vue dependency versions
- `workflowbuilder/apps/editor-v2/src/main.ts` -- Vue app bootstrap
- `workflowbuilder/apps/editor-v2/src/stores/nodeTypes.ts` -- Node types Pinia store
- `workflowbuilder/apps/editor-v2/src/stores/workflow.ts` -- Workflow Pinia store
- `workflowbuilder/apps/editor-v2/src/views/EditorView.vue` -- Canvas implementation
- `workflowbuilder/apps/editor-v2/src/components/CanvasNode.vue` -- Custom node rendering
- `workflowbuilder/apps/editor-v2/src/components/NodePalette.vue` -- Palette implementation

### Backend -- API Contracts
- `packages/api/src/routes/workflows.ts` -- Workflow CRUD endpoints
- `packages/api/src/routes/executions.ts` -- Execution endpoints
- `packages/api/src/routes/credentials.ts` -- Credential endpoints
- `packages/api/src/routes/credential-types.ts` -- Credential type endpoints
- `packages/api/src/routes/health-routes.ts` -- Health check
- `packages/api/src/server.ts` -- CORS config, all registered routes

---

## Steps

### Sub-Phase A: Foundation (Steps 8.1 -- 8.6)

---

### Step 8.1: Scaffold Vue App

**Objective**: Create the `frontend-v2` directory with package.json, Vite config, TypeScript config, index.html, and a minimal main.ts that renders a "Hello Vue" message.

**n8n Import Strategy**: No n8n imports yet. Pure scaffolding.

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/app-mounts.test.ts`:
   ```typescript
   import { describe, it, expect } from 'vitest';
   import { mount } from '@vue/test-utils';
   import App from '../App.vue';

   describe('App', () => {
     it('mounts without error', () => {
       const wrapper = mount(App);
       expect(wrapper.exists()).toBe(true);
     });
   });
   ```

2. **Implement**:
   - Create `workflowbuilder/apps/frontend-v2/package.json`:
     ```json
     {
       "name": "@r360/frontend-v2",
       "version": "0.1.0",
       "private": true,
       "type": "module",
       "scripts": {
         "dev": "vite --port 4200",
         "build": "vue-tsc --noEmit && vite build",
         "preview": "vite preview",
         "test": "vitest run",
         "test:watch": "vitest"
       },
       "dependencies": {
         "vue": "^3.5.0",
         "vue-router": "^4.5.0",
         "pinia": "^2.2.0",
         "@vue-flow/core": "^1.41.0",
         "@vue-flow/background": "^1.3.0",
         "@vue-flow/controls": "^1.1.0",
         "@vue-flow/minimap": "^1.5.0"
       },
       "devDependencies": {
         "@vitejs/plugin-vue": "^5.2.0",
         "vite": "^6.0.0",
         "typescript": "^5.7.0",
         "vue-tsc": "^2.0.0",
         "vitest": "^2.0.0",
         "@vue/test-utils": "^2.4.0",
         "jsdom": "^25.0.0",
         "sass": "^1.80.0"
       }
     }
     ```
   - Create `index.html`, `tsconfig.json`, `env.d.ts`
   - Create `src/main.ts` with `createApp(App).mount('#app')`
   - Create `src/App.vue` with minimal template

3. **Run & Fix**: `cd workflowbuilder/apps/frontend-v2 && pnpm install && pnpm test && pnpm build`

4. **Refactor**: Ensure vite dev server starts on port 4200.

**Success Criteria**:
- `workflowbuilder/apps/frontend-v2/` exists with all scaffold files
- `pnpm install` succeeds
- `pnpm test` passes (App mounts)
- `pnpm dev` starts Vite on port 4200
- Browser shows "Hello Vue" at localhost:4200

**Key Files**:
- `workflowbuilder/apps/frontend-v2/package.json`
- `workflowbuilder/apps/frontend-v2/vite.config.mts`
- `workflowbuilder/apps/frontend-v2/tsconfig.json`
- `workflowbuilder/apps/frontend-v2/index.html`
- `workflowbuilder/apps/frontend-v2/src/main.ts`
- `workflowbuilder/apps/frontend-v2/src/App.vue`

---

### Step 8.2: Configure Vite Aliases for n8n Design System

**Objective**: Set up Vite aliases so `@n8n/design-system` components can be imported directly. This is the foundational build configuration that enables all n8n component reuse.

**n8n Import Strategy**: **Import directly** via Vite aliases pointing to `n8n/packages/frontend/@n8n/design-system/src/`. Proven working in editor-v2 experiment.

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/design-system-import.test.ts`:
   ```typescript
   import { describe, it, expect } from 'vitest';

   describe('n8n design system imports', () => {
     it('can import N8nButton', async () => {
       // This test validates that the Vite alias resolves correctly
       const mod = await import('@n8n/design-system');
       expect(mod).toBeDefined();
     });
   });
   ```

2. **Implement**: Update `vite.config.mts` with aliases copied from editor-v2:
   ```typescript
   import { resolve } from 'node:path';
   import vue from '@vitejs/plugin-vue';
   import { defineConfig } from 'vite';
   import { nodePolyfills } from 'vite-plugin-node-polyfills';
   import svgLoader from 'vite-svg-loader';

   const n8nRoot = resolve(__dirname, '../../../n8n/packages');

   export default defineConfig({
     plugins: [vue(), svgLoader(), nodePolyfills({ include: ['path', 'buffer', 'process', 'stream', 'util'] })],
     resolve: {
       alias: [
         { find: 'stream', replacement: 'stream-browserify' },
         { find: '@n8n/design-system/css', replacement: resolve(n8nRoot, 'frontend/@n8n/design-system/src/css') },
         { find: /^@n8n\/design-system\/src\/(.*)/, replacement: resolve(n8nRoot, 'frontend/@n8n/design-system/src/$1') },
         { find: /^@n8n\/design-system(.+)$/, replacement: resolve(n8nRoot, 'frontend/@n8n/design-system/src$1') },
         { find: '@n8n/design-system', replacement: resolve(n8nRoot, 'frontend/@n8n/design-system/src') },
         // Additional aliases as needed (see editor-v2 vite.config.mts for full list)
       ],
       extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'],
       dedupe: ['vue', 'vue-router', 'pinia'],
     },
     css: {
       preprocessorOptions: {
         scss: {
           additionalData: '@use "@n8n/design-system/css/mixins" as mixins;\n',
         },
       },
     },
     server: {
       port: 4200,
       strictPort: true,
       fs: { allow: [resolve(__dirname), resolve(__dirname, '../../..')] },
       proxy: { '/api': { target: 'http://localhost:3100', changeOrigin: true } },
     },
   });
   ```
   - Add `vite-plugin-node-polyfills`, `vite-svg-loader`, `stream-browserify` to devDependencies
   - Add `element-plus`, `sass` to dependencies (required by design system)

3. **Run & Fix**: `pnpm dev` -- verify design system SCSS compiles without errors.

4. **Refactor**: Create a `src/styles/main.scss` that imports design system base CSS.

**Success Criteria**:
- `@n8n/design-system` components can be imported in `.vue` files
- SCSS compiles with design system mixins available
- Vite dev server starts without alias resolution errors
- A test component using `<N8nButton>` renders correctly

**Key Files**:
- `workflowbuilder/apps/frontend-v2/vite.config.mts`
- `workflowbuilder/apps/frontend-v2/src/styles/main.scss`

---

### Step 8.3: Set Up Vue Router with All Routes

**Objective**: Configure Vue Router with all 9 routes matching the React app. Include lazy-loaded route components (placeholders initially).

**n8n Import Strategy**: No n8n imports. Pure Vue Router setup.

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/router.test.ts`:
   ```typescript
   import { describe, it, expect } from 'vitest';
   import { createRouter, createMemoryHistory } from 'vue-router';
   import { routes } from '../router';

   describe('Router', () => {
     it('has all required routes', () => {
       const routePaths = routes.flatMap(r =>
         r.children ? r.children.map(c => c.path) : [r.path]
       );
       expect(routePaths).toContain('/login');
       // Auth-guarded routes are children
     });

     it('resolves /login to LoginPage', async () => {
       const router = createRouter({ history: createMemoryHistory(), routes });
       await router.push('/login');
       expect(router.currentRoute.value.name).toBe('login');
     });

     it('resolves / to DashboardPage', async () => {
       const router = createRouter({ history: createMemoryHistory(), routes });
       await router.push('/');
       expect(router.currentRoute.value.matched.length).toBeGreaterThan(0);
     });
   });
   ```

2. **Implement**: Create `src/router/index.ts`:
   ```typescript
   import type { RouteRecordRaw } from 'vue-router';
   import { createRouter, createWebHistory } from 'vue-router';

   export const routes: RouteRecordRaw[] = [
     {
       path: '/login',
       name: 'login',
       component: () => import('../pages/LoginPage.vue'),
     },
     {
       path: '/',
       component: () => import('../components/AppShell.vue'),
       meta: { requiresAuth: true },
       children: [
         { path: '', name: 'dashboard', component: () => import('../pages/DashboardPage.vue') },
         { path: 'workflows', name: 'workflows', component: () => import('../pages/WorkflowListPage.vue') },
         { path: 'executions', name: 'executions', component: () => import('../pages/ExecutionListPage.vue') },
         { path: 'executions/:id', name: 'execution-detail', component: () => import('../pages/ExecutionDetailPage.vue'), props: true },
         { path: 'credentials', name: 'credentials', component: () => import('../pages/CredentialsPage.vue') },
         { path: 'settings', name: 'settings', component: () => import('../pages/SettingsPage.vue') },
       ],
     },
     {
       path: '/workflows/:id/edit',
       name: 'workflow-editor',
       component: () => import('../editor/WorkflowEditorPage.vue'),
       meta: { requiresAuth: true },
       props: true,
     },
   ];

   export const router = createRouter({
     history: createWebHistory('/'),
     routes,
   });
   ```
   - Create placeholder `.vue` files for every page (minimal `<template><div>PageName</div></template>`)
   - Update `src/main.ts` to use router and Pinia

3. **Run & Fix**: All route tests pass. Dev server navigates between routes.

4. **Refactor**: Add route-level `meta` for page titles.

**Success Criteria**:
- All 9 routes defined and resolve correctly
- Lazy-loaded components work with Vite code splitting
- Navigation between routes works in dev server
- Route guards (meta.requiresAuth) are in place for auth step

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/router/index.ts`
- `workflowbuilder/apps/frontend-v2/src/pages/*.vue` (placeholders)
- `workflowbuilder/apps/frontend-v2/src/main.ts`

---

### Step 8.4: Build Auth System

**Objective**: Port the React auth system (useAuth hook, AuthGuard, sessionStorage) to Vue composables. Identical behavior: sessionStorage key `r360_auth`, dev-mode login, route guard.

**n8n Import Strategy**: **Build from scratch**. Auth is R360-specific, not related to n8n.

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/auth.test.ts`:
   ```typescript
   import { describe, it, expect, beforeEach } from 'vitest';
   import { useAuth } from '../auth/use-auth';

   describe('useAuth', () => {
     beforeEach(() => sessionStorage.clear());

     it('starts as not authenticated', () => {
       // Test in a Vue component context
     });

     it('reads session from sessionStorage', () => {
       sessionStorage.setItem('r360_auth', JSON.stringify({
         token: 'test-token',
         user: { id: '1', email: 'test@r360.dev', name: 'Test', role: 'admin', tenantId: 't1' },
       }));
       // Verify isAuthenticated is true
     });

     it('login stores session and sets authenticated', async () => {
       // Call login, verify sessionStorage updated
     });

     it('logout clears session', () => {
       // Set session, call logout, verify cleared
     });
   });
   ```

2. **Implement**:
   - Create `src/auth/types.ts`:
     ```typescript
     export interface AuthUser {
       id: string;
       email: string;
       name: string;
       role: string;
       tenantId: string;
     }
     ```
   - Create `src/auth/use-auth.ts`:
     ```typescript
     import { ref, computed, onMounted } from 'vue';
     import type { AuthUser } from './types';

     const SESSION_KEY = 'r360_auth';

     // Shared reactive state (singleton across components)
     const token = ref<string | null>(null);
     const user = ref<AuthUser | null>(null);
     const isLoading = ref(true);
     const error = ref<string | null>(null);

     export function useAuth() {
       const isAuthenticated = computed(() => !!token.value && !!user.value);

       function init() {
         try {
           const stored = sessionStorage.getItem(SESSION_KEY);
           if (stored) {
             const session = JSON.parse(stored);
             token.value = session.token;
             user.value = session.user;
           }
         } catch { sessionStorage.removeItem(SESSION_KEY); }
         finally { isLoading.value = false; }
       }

       async function login(email: string, password: string) {
         const res = await fetch('/api/auth/login', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ email, password }),
         });
         if (!res.ok) throw new Error('Login failed');
         const data = await res.json();
         sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
         token.value = data.token;
         user.value = data.user;
       }

       function loginDemo() {
         const session = {
           token: 'demo-token',
           user: { id: 'demo', email: 'demo@r360.dev', name: 'Demo User', role: 'admin', tenantId: 'demo-tenant' },
         };
         sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
         token.value = session.token;
         user.value = session.user;
       }

       function logout() {
         sessionStorage.removeItem(SESSION_KEY);
         token.value = null;
         user.value = null;
       }

       return { isAuthenticated, isLoading, user, token, error, init, login, loginDemo, logout };
     }
     ```
   - Create `src/auth/auth-guard.ts` as a Vue Router navigation guard:
     ```typescript
     import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router';
     import { useAuth } from './use-auth';

     export function authGuard(to: RouteLocationNormalized, _from: RouteLocationNormalized, next: NavigationGuardNext) {
       const { isAuthenticated } = useAuth();
       if (to.meta.requiresAuth && !isAuthenticated.value) {
         next({ name: 'login', query: { redirect: to.fullPath } });
       } else {
         next();
       }
     }
     ```
   - Register the guard in router: `router.beforeEach(authGuard)`

3. **Run & Fix**: All auth tests pass. Guard redirects unauthenticated users.

4. **Refactor**: Extract session persistence into a helper.

**Success Criteria**:
- `useAuth()` composable works identically to the React `useAuth()` hook
- SessionStorage key is `r360_auth` (same as React, enabling session sharing during migration)
- Auth guard redirects to `/login` when not authenticated
- Demo login works without API server
- Login with email/password calls `/api/auth/login`

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/auth/use-auth.ts`
- `workflowbuilder/apps/frontend-v2/src/auth/auth-guard.ts`
- `workflowbuilder/apps/frontend-v2/src/auth/types.ts`

---

### Step 8.5: Build API Client Layer

**Objective**: Port the React API client (api-client.ts, workflow-api.ts, execution-api.ts, credential-api.ts) to Vue-compatible modules. Same endpoints, same types, same retry logic.

**n8n Import Strategy**: **Build from scratch**. API layer is R360-specific.

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/api-client.test.ts`:
   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { createApiClient, ApiError } from '../api/api-client';

   describe('ApiClient', () => {
     beforeEach(() => { vi.restoreAllMocks(); });

     it('adds auth and tenant headers', async () => {
       const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => ({ data: 'ok' }) });
       vi.stubGlobal('fetch', fetchSpy);
       const client = createApiClient({ baseUrl: '', getAuthToken: async () => 'tok', tenantId: 't1' });
       await client.get('/test');
       expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
         headers: expect.objectContaining({ Authorization: 'Bearer tok', 'X-Tenant-Id': 't1' }),
       }));
     });

     it('retries on 500', async () => { /* ... */ });
     it('throws ApiError on 4xx', async () => { /* ... */ });
     it('handles 204 No Content', async () => { /* ... */ });
   });
   ```

2. **Implement**:
   - Copy `api-client.ts` from React app -- it is framework-agnostic (pure fetch), works as-is
   - Copy type definitions from `workflow-api.ts`, `execution-api.ts`, `credential-api.ts`
   - Copy factory functions -- they only depend on the `ApiClient` interface
   - Create `src/api/index.ts` that creates a singleton client using `useAuth()` token:
     ```typescript
     import { createApiClient } from './api-client';
     import { createWorkflowApi } from './workflow-api';
     import { createExecutionApi } from './execution-api';
     import { createCredentialApi } from './credential-api';
     import { useAuth } from '../auth/use-auth';

     let _client: ReturnType<typeof createApiClient> | null = null;

     export function getApiClient() {
       if (!_client) {
         const { token } = useAuth();
         _client = createApiClient({
           baseUrl: '/api',
           getAuthToken: async () => token.value ?? '',
           tenantId: 'default',
           onUnauthorized: () => { window.location.href = '/login'; },
         });
       }
       return _client;
     }

     export const workflowApi = () => createWorkflowApi(getApiClient());
     export const executionApi = () => createExecutionApi(getApiClient());
     export const credentialApi = () => createCredentialApi(getApiClient());
     ```

3. **Run & Fix**: All API client tests pass.

4. **Refactor**: Ensure `onUnauthorized` clears the session.

**Success Criteria**:
- API client adds Bearer token and X-Tenant-Id headers to every request
- Retry logic works (5xx, 429)
- ApiError class provides status helpers (isNotFound, isUnauthorized, etc.)
- All 4 API modules (workflow, execution, credential, health) work
- Same endpoint paths as React app (`/api/workflows`, `/api/executions`, etc.)

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/api/api-client.ts`
- `workflowbuilder/apps/frontend-v2/src/api/workflow-api.ts`
- `workflowbuilder/apps/frontend-v2/src/api/execution-api.ts`
- `workflowbuilder/apps/frontend-v2/src/api/credential-api.ts`
- `workflowbuilder/apps/frontend-v2/src/api/health-api.ts`
- `workflowbuilder/apps/frontend-v2/src/api/index.ts`

---

### Step 8.6: Set Up Pinia Stores Skeleton

**Objective**: Create 4 Pinia stores (dashboard, workflow-list, execution, credential) matching the Zustand stores. Initial implementation with state shape and action stubs.

**n8n Import Strategy**: **Build from scratch**. Stores are R360-specific.

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/stores.test.ts`:
   ```typescript
   import { describe, it, expect, beforeEach } from 'vitest';
   import { setActivePinia, createPinia } from 'pinia';
   import { useDashboardStore } from '../stores/use-dashboard-store';
   import { useWorkflowListStore } from '../stores/use-workflow-list-store';

   describe('Pinia Stores', () => {
     beforeEach(() => setActivePinia(createPinia()));

     it('dashboard store has correct initial state', () => {
       const store = useDashboardStore();
       expect(store.status).toBe('idle');
       expect(store.recentWorkflows).toEqual([]);
     });

     it('workflow list store has correct initial state', () => {
       const store = useWorkflowListStore();
       expect(store.workflows).toEqual([]);
       expect(store.page).toBe(1);
       expect(store.searchQuery).toBe('');
     });
   });
   ```

2. **Implement**:
   - Create `src/stores/use-dashboard-store.ts` (Pinia setup store):
     State: `recentWorkflows`, `recentExecutions`, `stats`, `status`
     Actions: `fetchDashboardData()`
   - Create `src/stores/use-workflow-list-store.ts`:
     State: `workflows`, `total`, `page`, `pageSize`, `status`, `searchQuery`
     Actions: `fetchWorkflows()`, `setPage()`, `setSearchQuery()`, `deleteWorkflow()`, `createWorkflow()`
   - Create `src/stores/use-execution-store.ts`:
     State: `executions`, `total`, `page`, `status`, `filterStatus`, `selectedExecution`
     Actions: `fetchExecutions()`, `fetchExecutionDetail()`, `cancelExecution()`
   - Create `src/stores/use-credential-store.ts`:
     State: `credentials`, `credentialTypes`, `status`, `selectedType`
     Actions: `fetchCredentials()`, `fetchCredentialTypes()`, `createCredential()`, `deleteCredential()`, `testCredential()`

3. **Run & Fix**: All store tests pass.

4. **Refactor**: Add TypeScript types for all store state shapes.

**Success Criteria**:
- 4 Pinia stores created with correct state shapes
- All actions call the appropriate API module
- Stores match the Zustand store interfaces from the React app
- Tests verify initial state and action behavior

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/stores/use-dashboard-store.ts`
- `workflowbuilder/apps/frontend-v2/src/stores/use-workflow-list-store.ts`
- `workflowbuilder/apps/frontend-v2/src/stores/use-execution-store.ts`
- `workflowbuilder/apps/frontend-v2/src/stores/use-credential-store.ts`

---

### Sub-Phase B: Shared Components (Steps 8.7 -- 8.13)

---

### Step 8.7: AppShell Layout

**Objective**: Build the AppShell component that provides the sidebar + router-view layout for all authenticated pages. Matches the React `AppShell` layout.

**n8n Import Strategy**: **Build custom** using @n8n/design-system for basic styling tokens. Layout is R360-specific.

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/AppShell.test.ts`:
   ```typescript
   import { describe, it, expect } from 'vitest';
   import { mount } from '@vue/test-utils';
   import AppShell from '../components/AppShell.vue';

   describe('AppShell', () => {
     it('renders sidebar and main content area', () => {
       const wrapper = mount(AppShell, { global: { stubs: { TheSidebar: true, RouterView: true } } });
       expect(wrapper.find('.app-shell').exists()).toBe(true);
       expect(wrapper.findComponent({ name: 'TheSidebar' }).exists()).toBe(true);
     });
   });
   ```

2. **Implement**: Create `src/components/AppShell.vue`:
   ```vue
   <script setup lang="ts">
   import TheSidebar from './TheSidebar.vue';
   </script>
   <template>
     <div class="app-shell">
       <TheSidebar />
       <main class="app-shell__content">
         <router-view />
       </main>
     </div>
   </template>
   <style scoped lang="scss">
   .app-shell {
     display: flex;
     height: 100vh;
     overflow: hidden;
   }
   .app-shell__content {
     flex: 1;
     overflow-y: auto;
     padding: 24px;
     max-width: 1400px;
   }
   </style>
   ```

3. **Run & Fix**: Component mounts and renders correctly.

**Success Criteria**:
- AppShell renders sidebar on the left, content area on the right
- Content area uses `<router-view />` for nested routes
- Layout fills full viewport height

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/components/AppShell.vue`

---

### Step 8.8: Sidebar Component

**Objective**: Build the sidebar with logo, navigation links, user info section, and logout button. Matches the React `Sidebar` component.

**n8n Import Strategy**: **Build custom** with @n8n/design-system primitives (N8nIcon if available, otherwise SVG icons).

**TDD Implementation**:

1. **Write Tests**: Test that sidebar renders all nav links, highlights active route, shows user info, and logout button calls `useAuth().logout()`.

2. **Implement**: Create `src/components/TheSidebar.vue`:
   - Fixed width 240px, collapsible to 60px
   - Logo at top ("R360 Flow")
   - Nav links: Dashboard (/), Workflows (/workflows), Executions (/executions), Credentials (/credentials), Settings (/settings)
   - Use `<router-link>` with active-class styling
   - User section at bottom: name, email, role badge
   - Logout button calls `useAuth().logout()` then `router.push('/login')`
   - Collapse toggle button

3. **Run & Fix**: All sidebar tests pass.

**Success Criteria**:
- 5 navigation links with active state highlighting
- User info from `useAuth().user`
- Logout clears session and redirects to /login
- Collapsible sidebar state persists in localStorage

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/components/TheSidebar.vue`

---

### Step 8.9: PageHeader Component

**Objective**: Reusable page header with title, optional description, and action slot.

**n8n Import Strategy**: **Build custom** with @n8n/design-system. Use `N8nButton` for action buttons if available.

**TDD Implementation**:

1. **Write Tests**: Test that title renders, description is optional, slot content renders.

2. **Implement**: Create `src/components/PageHeader.vue`:
   ```vue
   <script setup lang="ts">
   defineProps<{ title: string; description?: string }>();
   </script>
   <template>
     <div class="page-header">
       <div class="page-header__text">
         <h1 class="page-header__title">{{ title }}</h1>
         <p v-if="description" class="page-header__description">{{ description }}</p>
       </div>
       <div class="page-header__actions">
         <slot name="actions" />
       </div>
     </div>
   </template>
   ```

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Title and description render correctly
- Actions slot allows buttons on the right side
- Consistent styling across all pages

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/components/PageHeader.vue`

---

### Step 8.10: DataTable Component

**Objective**: Generic, reusable data table with typed columns, pagination, row click, loading state, and custom cell renderers. Matches the React `DataTable<T>` component.

**n8n Import Strategy**: **Build custom** with @n8n/design-system. Use `N8nLoading` for skeleton state if available.

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/DataTable.test.ts`:
   ```typescript
   describe('DataTable', () => {
     it('renders column headers', () => { /* ... */ });
     it('renders rows from data', () => { /* ... */ });
     it('calls onRowClick when row is clicked', () => { /* ... */ });
     it('shows loading skeleton when loading=true', () => { /* ... */ });
     it('shows empty state when data is empty', () => { /* ... */ });
     it('renders pagination controls', () => { /* ... */ });
     it('uses custom cell renderer via slot', () => { /* ... */ });
   });
   ```

2. **Implement**: Create `src/components/DataTable.vue`:
   - Props: `columns`, `data`, `loading`, `emptyMessage`, `page`, `totalPages`
   - Emits: `row-click`, `page-change`
   - Scoped slot for custom cell rendering: `#cell-[columnKey]="{ row, value }"`
   - Pagination footer with prev/next buttons and page indicator
   - Loading state shows skeleton rows
   - Empty state uses EmptyState component

3. **Run & Fix**: All 7 test cases pass.

**Success Criteria**:
- Renders any data shape via typed column definitions
- Pagination controls emit page-change events
- Row click handler works
- Loading and empty states display correctly
- Custom cell rendering via scoped slots

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/components/DataTable.vue`

---

### Step 8.11: StatusBadge Component

**Objective**: Small pill/badge that auto-colors based on status string. Matches the React `StatusBadge` component.

**n8n Import Strategy**: **Build custom**. Simple enough that importing n8n components would be overkill.

**TDD Implementation**:

1. **Write Tests**: Test each status variant maps to correct CSS class and color.

2. **Implement**: Create `src/components/StatusBadge.vue`:
   - Props: `status: string`
   - Auto-map: `success/completed` = green, `error/failed` = red, `running/pending` = blue, `cancelled/waiting` = gray
   - Small pill with colored background and text

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- All status strings render with correct colors
- Unknown statuses get a neutral/gray fallback

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/components/StatusBadge.vue`

---

### Step 8.12: StatCard, EmptyState, ConfirmDialog Components

**Objective**: Three small shared components ported from React. StatCard (label + value), EmptyState (centered message + CTA), ConfirmDialog (modal with confirm/cancel).

**n8n Import Strategy**: **Build custom** with @n8n/design-system. Use `N8nDialog` for ConfirmDialog if available, otherwise build with native `<dialog>` or a simple overlay.

**TDD Implementation**:

1. **Write Tests**: One test file per component:
   - StatCard: renders label, value, optional trend indicator
   - EmptyState: renders title, description, optional action button
   - ConfirmDialog: renders when `visible=true`, emits `confirm` and `cancel`

2. **Implement**: Create three `.vue` files in `src/components/`.

3. **Run & Fix**: All tests pass.

**Success Criteria**:
- StatCard displays large number with label
- EmptyState shows centered message with optional CTA button
- ConfirmDialog opens/closes, emits confirm/cancel events
- Danger variant for ConfirmDialog (red confirm button)

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/components/StatCard.vue`
- `workflowbuilder/apps/frontend-v2/src/components/EmptyState.vue`
- `workflowbuilder/apps/frontend-v2/src/components/ConfirmDialog.vue`

---

### Step 8.13: Toast Notification System

**Objective**: Build a toast/snackbar notification system to replace React's notistack. Display success, error, warning, and info messages.

**n8n Import Strategy**: **Build custom**. Could use Element Plus `ElMessage` or build a simple custom toast. Prefer custom for minimal dependency.

**TDD Implementation**:

1. **Write Tests**: Test `useToast()` composable: `show()`, `success()`, `error()` methods add items to a reactive list.

2. **Implement**:
   - Create `src/composables/use-toast.ts`:
     ```typescript
     import { ref } from 'vue';
     interface Toast { id: number; message: string; type: 'success' | 'error' | 'warning' | 'info'; }
     const toasts = ref<Toast[]>([]);
     let nextId = 0;
     export function useToast() {
       function show(message: string, type: Toast['type'] = 'info') {
         const id = ++nextId;
         toasts.value.push({ id, message, type });
         setTimeout(() => remove(id), 4000);
       }
       function remove(id: number) { toasts.value = toasts.value.filter(t => t.id !== id); }
       return { toasts, show, success: (m: string) => show(m, 'success'), error: (m: string) => show(m, 'error') };
     }
     ```
   - Create `src/components/ToastNotification.vue` that renders the toast list in a fixed position.
   - Mount it in `App.vue`.

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- `useToast().success('Saved!')` shows a green toast that auto-dismisses
- `useToast().error('Failed')` shows a red toast
- Multiple toasts stack vertically
- Toasts can be manually dismissed

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/composables/use-toast.ts`
- `workflowbuilder/apps/frontend-v2/src/components/ToastNotification.vue`

---

### Sub-Phase C: Pages -- Non-Editor (Steps 8.14 -- 8.21)

---

### Step 8.14: LoginPage

**Objective**: Port the React LoginPage to Vue. Centered card with email/password form, demo login button, error display.

**n8n Import Strategy**: **Build custom** with @n8n/design-system. Use `N8nInput` and `N8nButton` for form fields.

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/LoginPage.test.ts`:
   - Renders email and password inputs
   - Shows error message on failed login
   - Demo login button sets session and navigates to /
   - Redirects to / if already authenticated

2. **Implement**: Create `src/pages/LoginPage.vue`:
   - Centered card layout
   - Email + password fields (N8nInput or native input)
   - "Sign In" button calls `useAuth().login(email, password)`
   - "Continue as Demo User" button calls `useAuth().loginDemo()`
   - On success, `router.push('/')`
   - If already authenticated, redirect immediately

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Login form submits to API
- Demo login works without API
- Error messages display
- Redirect on already-authenticated

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/pages/LoginPage.vue`

---

### Step 8.15: DashboardPage

**Objective**: Port the React DashboardPage. 4 stat cards, recent workflows table, recent executions table.

**n8n Import Strategy**: **Build custom**. Uses our StatCard, DataTable components.

**TDD Implementation**:

1. **Write Tests**: Test that stat cards render, recent tables render with mock data, loading state shows.

2. **Implement**: Create `src/pages/DashboardPage.vue`:
   - Uses `useDashboardStore().fetchDashboardData()` on mount
   - 4 StatCards: Total Workflows, Total Executions, Active Credentials, Success Rate
   - Recent Workflows DataTable (last 5, columns: name, status, updated)
   - Recent Executions DataTable (last 5, columns: workflow, status, started, duration)
   - Row clicks navigate to detail pages

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- 4 stat cards display with data from API
- Recent workflows and executions tables render
- Loading state while fetching
- Row clicks navigate correctly

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/pages/DashboardPage.vue`

---

### Step 8.16: WorkflowListPage

**Objective**: Port the React WorkflowListPage. DataTable with search, active toggle, delete, create new, navigate to editor.

**n8n Import Strategy**: **Build custom**. Uses DataTable, ConfirmDialog, PageHeader.

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/WorkflowListPage.test.ts`:
   - Renders workflow list from store
   - Search input filters workflows
   - Create button opens workflow creation flow
   - Delete button shows confirm dialog
   - Row click navigates to editor
   - Active toggle calls API

2. **Implement**: Create `src/pages/WorkflowListPage.vue`:
   - PageHeader with "Create Workflow" button
   - Search input for filtering
   - DataTable with columns: name, active (toggle), created, updated, actions (delete)
   - ConfirmDialog for delete confirmation
   - Row click navigates to `/workflows/:id/edit`
   - Create navigates to `/workflows/new/edit`

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- All workflows display in table
- Search filters by name
- Create/delete/toggle operations work
- Navigation to editor works

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/pages/WorkflowListPage.vue`

---

### Step 8.17: ExecutionListPage

**Objective**: Port the React ExecutionListPage. DataTable with status filter, cancel running executions.

**n8n Import Strategy**: **Build custom**. Uses DataTable, StatusBadge, PageHeader.

**TDD Implementation**:

1. **Write Tests**:
   - Renders execution list with status badges
   - Status filter dropdown filters by status
   - Cancel button appears for running executions
   - Row click navigates to execution detail

2. **Implement**: Create `src/pages/ExecutionListPage.vue`:
   - PageHeader with status filter dropdown
   - DataTable with columns: workflow name, status (StatusBadge), started, duration, actions (cancel if running)
   - Pagination support
   - Row click navigates to `/executions/:id`

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Executions display with correct status badges
- Status filter works
- Cancel running executions works
- Pagination works

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/pages/ExecutionListPage.vue`

---

### Step 8.18: ExecutionDetailPage

**Objective**: Port the React ExecutionDetailPage. Metadata card, expandable step list with input/output JSON display.

**n8n Import Strategy**: **Build custom**. May use @n8n/design-system `N8nCard` if available.

**TDD Implementation**:

1. **Write Tests**:
   - Renders execution metadata (workflow name, status, started, duration)
   - Renders step list
   - Expanding a step shows input/output JSON
   - Error message displays for failed steps

2. **Implement**: Create `src/pages/ExecutionDetailPage.vue`:
   - Uses route param `id` to fetch execution detail
   - Metadata card at top: workflow name, status badge, started at, finished at, duration
   - Error message section if execution failed
   - Step list: each step shows node name, type, status, timing
   - Expandable/collapsible step detail showing input and output JSON
   - JSON displayed in a `<pre>` block with syntax highlighting (or `vue-json-pretty`)
   - Back button to execution list

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Execution metadata renders correctly
- All steps display with status
- JSON input/output is readable
- Failed step error messages display

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/pages/ExecutionDetailPage.vue`

---

### Step 8.19: CredentialsPage -- Type Picker

**Objective**: First half of the credentials page: list existing credentials, and provide a type picker modal for creating new ones.

**n8n Import Strategy**: **Build custom** with @n8n/design-system primitives. The type picker lists credential types from the API.

**TDD Implementation**:

1. **Write Tests**:
   - Renders credential list from store
   - "Add Credential" button opens type picker modal
   - Type picker displays searchable list of credential types
   - Selecting a type transitions to the credential form (Step 8.20)

2. **Implement**: Create `src/pages/CredentialsPage.vue` (first iteration):
   - PageHeader with "Add Credential" button
   - DataTable with columns: name, type, created, actions (delete)
   - Type picker modal: searchable list of credential types from `credentialApi.getCredentialTypes()`
   - Delete with ConfirmDialog

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Credential list displays
- Type picker modal opens and shows types
- Search in type picker works
- Delete credential works

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/pages/CredentialsPage.vue`

---

### Step 8.20: CredentialsPage -- Dynamic Form + Test

**Objective**: Second half of credentials: dynamic form that renders based on credential type schema, and a "Test" button to verify credentials.

**n8n Import Strategy**: **Build custom** with @n8n/design-system primitives (`N8nInput`, `N8nSelect`). The form fields are generated from `credentialApi.getCredentialTypeProperties(typeName)`.

**TDD Implementation**:

1. **Write Tests**:
   - Dynamic form renders fields based on credential type properties
   - Password fields are masked
   - Required fields show validation errors
   - Submit calls `credentialApi.create()`
   - Test button calls `credentialApi.testCredential()` and shows result

2. **Implement**: Enhance `CredentialsPage.vue` or create a `CredentialFormModal.vue`:
   - Fetch properties for selected type via `credentialApi.getCredentialTypeProperties(name)`
   - Generate form fields dynamically:
     - `string` -> text input (or password input if `typeOptions.password`)
     - `number` -> number input
     - `options` -> select dropdown
     - `boolean` -> checkbox/switch
   - "Test Connection" button calls API test endpoint
   - "Save" button calls create/update

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Dynamic form renders all field types
- Credential creation works end-to-end
- Test connection shows success/failure
- Form validation prevents empty required fields

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/pages/CredentialsPage.vue` (or split into `CredentialFormModal.vue`)

---

### Step 8.21: SettingsPage

**Objective**: Port the React SettingsPage. Read-only workspace info, theme toggle, logout.

**n8n Import Strategy**: **Build custom**. Simple page, no n8n components needed.

**TDD Implementation**:

1. **Write Tests**: Renders workspace name, user info, theme toggle, logout button.

2. **Implement**: Create `src/pages/SettingsPage.vue`:
   - PageHeader: "Settings"
   - Workspace section: workspace/tenant name, ID (read-only)
   - Account section: user name, email, role (from `useAuth().user`)
   - Theme section: light/dark toggle (stores preference in localStorage)
   - Danger zone: Logout button

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- User info displays correctly
- Theme toggle works
- Logout clears session and redirects

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/pages/SettingsPage.vue`

---

### Sub-Phase D: Workflow Editor -- Canvas (Steps 8.22 -- 8.28)

---

### Step 8.22: Canvas Foundation with @vue-flow/core

**Objective**: Build the basic workflow editor canvas using @vue-flow/core. Render nodes and edges, pan/zoom, snap to grid.

**n8n Import Strategy**: **Import @vue-flow/core as npm dependency**. Build our own wrapper. Do NOT import n8n's Canvas.vue (too many store dependencies).

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/EditorCanvas.test.ts`:
   - Canvas mounts without error
   - Renders provided nodes
   - Renders provided edges
   - Emits events on node selection

2. **Implement**: Create `src/editor/components/EditorCanvas.vue`:
   ```vue
   <script setup lang="ts">
   import { VueFlow, useVueFlow } from '@vue-flow/core';
   import { Background } from '@vue-flow/background';
   import { Controls } from '@vue-flow/controls';
   import { MiniMap } from '@vue-flow/minimap';
   import type { Node, Edge } from '@vue-flow/core';
   import CanvasNode from './CanvasNode.vue';

   const props = defineProps<{ nodes: Node[]; edges: Edge[] }>();
   const emit = defineEmits<{ 'node-select': [nodeId: string | null]; 'update:nodes': [nodes: Node[]]; 'update:edges': [edges: Edge[]] }>();

   const { fitView, onConnect, onNodeClick } = useVueFlow({
     id: 'r360-editor',
     defaultViewport: { x: 0, y: 0, zoom: 1 },
     minZoom: 0.1, maxZoom: 4,
     snapToGrid: true, snapGrid: [20, 20] as [number, number],
     fitViewOnInit: true,
   });

   onNodeClick(({ node }) => emit('node-select', node.id));
   </script>
   <template>
     <VueFlow v-model:nodes="props.nodes" v-model:edges="props.edges" class="r360-canvas">
       <template #node-canvasNode="nodeProps">
         <CanvasNode v-bind="nodeProps" />
       </template>
       <Background :gap="20" :size="1" />
       <Controls position="bottom-right" />
       <MiniMap position="bottom-left" :pannable="true" :zoomable="true" />
     </VueFlow>
   </template>
   ```
   - Import VueFlow CSS in `main.ts`

3. **Run & Fix**: Canvas renders and responds to pan/zoom.

**Success Criteria**:
- Canvas renders with background grid
- Nodes and edges display
- Pan and zoom work
- Controls (zoom in/out, fit) work
- MiniMap displays

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/components/EditorCanvas.vue`

---

### Step 8.23: Custom Canvas Node Component

**Objective**: Build the custom node component that renders inside VueFlow. Shows node icon, label, input/output handles, and status indicators.

**n8n Import Strategy**: **Build custom** using @n8n/design-system primitives (N8nTooltip if available). Reference editor-v2's `CanvasNode.vue` implementation.

**TDD Implementation**:

1. **Write Tests**: Test that node renders label, icon, correct number of handles, trigger styling.

2. **Implement**: Create `src/editor/components/CanvasNode.vue`:
   - Receives node data via VueFlow slot props
   - Renders: icon (from node type), display name, description tooltip
   - Input handles on left, output handles on right
   - Special styling for trigger nodes (no left handle, different shape)
   - Selected state styling (border glow)
   - Color from node type defaults

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Node displays icon, label, handles
- Trigger nodes have distinct appearance
- Selected state is visually distinct
- Handles allow connection dragging

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/components/CanvasNode.vue`

---

### Step 8.24: Canvas Edge Component

**Objective**: Custom edge component with animated connections, arrow markers, and styling.

**n8n Import Strategy**: **Build custom**. Simple SVG edge using VueFlow's edge utilities.

**TDD Implementation**:

1. **Write Tests**: Test that edge renders between two nodes with arrow marker.

2. **Implement**: Create `src/editor/components/CanvasEdge.vue`:
   - Uses VueFlow's `getBezierPath` or `getSmoothStepPath`
   - Arrow marker at target end
   - Animated dash when execution is running (optional)
   - Click to select edge

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Edges render between connected nodes
- Arrow markers at target
- Smooth step path style (matching editor-v2)

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/components/CanvasEdge.vue`

---

### Step 8.25: Canvas Controls

**Objective**: Toolbar above the canvas with zoom controls, fit view, save button, workflow name, and status indicator.

**n8n Import Strategy**: **Build custom** with @n8n/design-system buttons.

**TDD Implementation**:

1. **Write Tests**: Test toolbar renders buttons, save button emits event, workflow name displays.

2. **Implement**: Create `src/editor/components/CanvasControls.vue`:
   - Workflow name (editable inline)
   - "Add Node" button (opens palette)
   - "Fit View" button
   - "Save" button (Ctrl+S shortcut)
   - Save status indicator (saved/dirty/saving)
   - Node/edge count display
   - Back button (navigate to workflow list)

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- All toolbar actions work
- Save shortcut Ctrl+S / Cmd+S triggers save
- Status indicator updates correctly

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/components/CanvasControls.vue`

---

### Step 8.26: Node Palette/Creator

**Objective**: Searchable panel listing all available node types, grouped by category, with drag-to-canvas support.

**n8n Import Strategy**: **Build custom** with @n8n/design-system. n8n's NodeCreator has deep store coupling. Build a simple searchable list using our nodeTypes store. Reference editor-v2's `NodePalette.vue`.

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/NodePalette.test.ts`:
   - Renders node types from store
   - Search filters by name
   - Categories group nodes
   - Clicking a node emits `select` event
   - Trigger nodes appear in a separate section

2. **Implement**: Create `src/editor/components/NodePalette.vue`:
   - Slide-in panel from the left
   - Search input at top
   - Grouped by category (from `nodeType.codex.categories`)
   - Each item shows: icon, display name, brief description
   - Click to add node, or drag to canvas
   - Close button
   - Uses the nodeTypes Pinia store (from editor-v2)

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- All 483+ node types display
- Search filters in real-time
- Category grouping works
- Node selection emits event for canvas

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/components/NodePalette.vue`
- `workflowbuilder/apps/frontend-v2/src/stores/use-node-types-store.ts` (port from editor-v2)

---

### Step 8.27: Drag-and-Drop from Palette to Canvas

**Objective**: Enable dragging a node type from the palette and dropping it onto the canvas to create a new node at the drop position.

**n8n Import Strategy**: **Build from scratch** using native HTML5 drag-and-drop or VueFlow's built-in drop handling.

**TDD Implementation**:

1. **Write Tests**: Test that dropping on canvas creates a new node at the correct position.

2. **Implement**:
   - Add `draggable="true"` to palette items
   - Set `dataTransfer` with node type name on dragstart
   - Handle `drop` event on the VueFlow canvas
   - Convert screen coordinates to canvas coordinates using VueFlow's `project()` or `screenToFlowCoordinate()`
   - Create a new node at the drop position

3. **Run & Fix**: Tests pass. Manual verification that drag-and-drop works.

**Success Criteria**:
- Dragging from palette shows drag preview
- Dropping on canvas creates node at correct position
- New node has correct type, label, icon, handles

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/components/NodePalette.vue` (drag source)
- `workflowbuilder/apps/frontend-v2/src/editor/components/EditorCanvas.vue` (drop target)

---

### Step 8.28: Canvas Context Menu

**Objective**: Right-click context menu on canvas and nodes for actions: delete node, duplicate, copy/paste.

**n8n Import Strategy**: **Build custom**. Simple positioned div.

**TDD Implementation**:

1. **Write Tests**: Test menu appears on right-click, actions emit correct events.

2. **Implement**: Create `src/editor/components/CanvasContextMenu.vue`:
   - Shows on right-click (node or canvas)
   - Node context: Delete, Duplicate, Copy
   - Canvas context: Paste, Select All, Fit View
   - Positioned at cursor location
   - Closes on click outside or action selection

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Right-click on node shows node context menu
- Right-click on canvas shows canvas context menu
- Delete removes node and connected edges
- Duplicate creates a copy offset by (40, 40)

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/components/CanvasContextMenu.vue`

---

### Sub-Phase E: Workflow Editor -- Node Configuration (Steps 8.29 -- 8.34)

---

### Step 8.29: Properties Panel

**Objective**: Right sidebar panel that opens when a node is selected on the canvas. Shows node name, type info, and parameter form.

**n8n Import Strategy**: **Build custom** with @n8n/design-system. n8n's NDV (Node Detail View) is too coupled to import.

**TDD Implementation**:

1. **Write Tests**:
   - Panel appears when a node is selected
   - Panel closes when no node is selected
   - Shows node display name and type
   - Contains tabs: Parameters, Settings, Output

2. **Implement**: Create `src/editor/components/PropertiesPanel.vue`:
   - Slides in from right when `selectedNodeId` is set
   - Header: node icon, display name, close button
   - Tab bar: Parameters | Settings | Output
   - Parameters tab: renders ParameterInput components for each node property
   - Settings tab: retry, timeout, notes (Step 8.33)
   - Output tab: shows last execution output (future)
   - Width: 400px, resizable

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Panel opens/closes on node selection
- Node info displays correctly
- Tabs switch between content areas

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/components/PropertiesPanel.vue`

---

### Step 8.30: Parameter Input Components

**Objective**: Build parameter input components that render node configuration forms based on `INodeTypeDescription.properties`.

**n8n Import Strategy**: **Try importing** n8n's ParameterInput components via Vite aliases. They depend on @n8n/design-system (which we have) and n8n-workflow types. **Fallback**: build custom using @n8n/design-system primitives (N8nInput, N8nSelect) and generate forms from the `properties` array.

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/ParameterInput.test.ts`:
   - String parameter renders text input
   - Number parameter renders number input
   - Options parameter renders select dropdown
   - Boolean parameter renders toggle
   - Collection parameter renders expandable section
   - Expression toggle switches to expression editor

2. **Implement**: Create `src/editor/components/ParameterInput.vue`:
   - Props: `parameter: INodeProperties` (from n8n-workflow types), `value: unknown`
   - Emits: `update:value`
   - Renders appropriate input based on `parameter.type`:
     - `string` -> `<N8nInput>` or `<input type="text">`
     - `number` -> `<N8nInput type="number">`
     - `options` -> `<N8nSelect>` with `parameter.options`
     - `boolean` -> `<N8nSwitch>` or `<input type="checkbox">`
     - `collection` -> expandable fieldset with child parameters
     - `fixedCollection` -> repeatable group of fields
     - `json` -> JSON textarea
   - Expression toggle button next to each field

3. **Run & Fix**: Tests pass.

4. **Refactor**: If n8n import works, remove custom implementation. If not, keep custom.

**Success Criteria**:
- All n8n parameter types render correctly
- Values update bidirectionally
- Expression toggle works
- Nested parameters (collection, fixedCollection) render recursively

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/components/ParameterInput.vue`

---

### Step 8.31: Expression Editor

**Objective**: A simple expression editor for parameters that use n8n expressions (`{{ $json.field }}`).

**n8n Import Strategy**: **Build custom** with CodeMirror. n8n's expression editor has deep completions integration that requires workflow context. Build a simplified version.

**TDD Implementation**:

1. **Write Tests**: Test editor mounts, accepts input, emits value changes.

2. **Implement**: Create `src/editor/components/ExpressionEditor.vue`:
   - CodeMirror 6 instance with JavaScript/JSON syntax highlighting
   - Accepts expression string value
   - Emits value changes on blur or Ctrl+Enter
   - Basic autocomplete for `$json`, `$input`, `$env` prefixes
   - Preview area showing evaluated result (placeholder)
   - Toggle between expression mode and fixed value mode

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Expression editor renders with syntax highlighting
- Value changes emit correctly
- Basic completions for n8n expression variables

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/components/ExpressionEditor.vue`

---

### Step 8.32: Credential Selector in Node Params

**Objective**: When a node's parameter refers to credentials, show a dropdown to select from the tenant's existing credentials of the matching type, plus a "Create New" option.

**n8n Import Strategy**: **Build custom** with @n8n/design-system. Uses our credential API.

**TDD Implementation**:

1. **Write Tests**: Test dropdown shows credentials filtered by type, "Create New" opens credential form.

2. **Implement**: Create `src/editor/components/CredentialSelector.vue`:
   - Props: `credentialType: string`, `value: string` (credential ID)
   - Fetches credentials of matching type via `credentialApi.listByType(type)`
   - Renders select dropdown with credential names
   - "Create New" option at bottom opens credential creation modal
   - Emits selected credential ID

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Shows only credentials of the matching type
- "Create New" opens credential form
- Selection updates the node parameter

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/components/CredentialSelector.vue`

---

### Step 8.33: Node Settings

**Objective**: The Settings tab in the properties panel: retry on failure, timeout, notes, continue on fail.

**n8n Import Strategy**: **Build custom**. Simple form fields.

**TDD Implementation**:

1. **Write Tests**: Test form renders retry count, timeout, notes textarea.

2. **Implement**: Create `src/editor/components/NodeSettings.vue`:
   - Retry on failure: toggle + retry count (1-5)
   - Max timeout: number input (seconds)
   - Continue on fail: toggle
   - Notes: textarea for user annotations
   - Values stored in node data and serialized with workflow

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- All settings render and update correctly
- Values persist in node data

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/components/NodeSettings.vue`

---

### Step 8.34: Properties Panel Integration with Canvas

**Objective**: Wire everything together: selecting a node on canvas opens the properties panel, editing parameters updates the node data, and changes are reflected on the canvas.

**n8n Import Strategy**: N/A -- integration step.

**TDD Implementation**:

1. **Write Tests**: Create `src/__tests__/editor-integration.test.ts`:
   - Select node on canvas -> properties panel opens with correct node data
   - Edit parameter in panel -> node data updates
   - Deselect node -> panel closes
   - Delete node while panel is open -> panel closes

2. **Implement**: Update `WorkflowEditorPage.vue`:
   - Track `selectedNodeId` state
   - Pass it to both EditorCanvas and PropertiesPanel
   - When panel emits parameter changes, update the corresponding node in the nodes array
   - Use VueFlow's `updateNode` or direct array manipulation

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Full select -> edit -> update cycle works
- Parameter changes reflect in node data
- Canvas re-renders node after data change (if visual properties changed)

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/WorkflowEditorPage.vue`

---

### Sub-Phase F: Workflow Persistence (Steps 8.35 -- 8.39)

---

### Step 8.35: Workflow Loading

**Objective**: Load a workflow from the API by ID, convert it to VueFlow nodes/edges, and render on canvas.

**n8n Import Strategy**: N/A. Uses our API client and existing workflow serialization format.

**TDD Implementation**:

1. **Write Tests**: Test that API response is correctly converted to VueFlow nodes and edges.

2. **Implement**: Create/enhance `src/stores/use-workflow-editor-store.ts`:
   - `fetchWorkflow(id)` calls `workflowApi.get(id)`
   - Convert `definitionJson` (n8n WorkflowParameters format) to VueFlow nodes/edges
   - Each n8n node becomes a VueFlow Node with position, type data, and handles
   - Each n8n connection becomes a VueFlow Edge
   - Store current workflow metadata (id, name, isActive)

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Workflow loads from API by route param ID
- Nodes render at correct positions
- Edges connect correct nodes
- Node metadata (type, icon, label) is resolved from nodeTypes store

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/stores/use-workflow-editor-store.ts`
- `workflowbuilder/apps/frontend-v2/src/editor/WorkflowEditorPage.vue`

---

### Step 8.36: Workflow Saving

**Objective**: Serialize the canvas state (VueFlow nodes/edges) back to n8n WorkflowParameters format and save via API.

**n8n Import Strategy**: N/A. Reverse of loading.

**TDD Implementation**:

1. **Write Tests**: Test that VueFlow state serializes correctly to the API format.

2. **Implement**: Add to `use-workflow-editor-store.ts`:
   - `saveWorkflow(nodes, edges)` converts VueFlow state to `definitionJson`
   - Each VueFlow Node converts to n8n node (name, type, position, parameters)
   - Each VueFlow Edge converts to n8n connection
   - Calls `workflowApi.update(id, { definitionJson })`
   - Updates `lastSavedAt` timestamp

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Canvas state serializes to correct format
- API update call succeeds
- Save status indicator updates (saving -> saved)
- Ctrl+S / Cmd+S triggers save

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/stores/use-workflow-editor-store.ts`

---

### Step 8.37: New Workflow Creation

**Objective**: Create a new workflow from scratch: empty canvas, name input, save as new.

**n8n Import Strategy**: N/A.

**TDD Implementation**:

1. **Write Tests**: Test new workflow flow: navigate to /workflows/new/edit, empty canvas, save creates via POST.

2. **Implement**:
   - Route `/workflows/new/edit` detected by `id === 'new'`
   - Empty canvas with a prompt to add first node
   - "Save" calls `workflowApi.create({ name, definitionJson })`
   - After creation, redirect to `/workflows/:newId/edit`

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- New workflow route shows empty canvas
- Saving creates workflow via API
- Redirect to real workflow URL after creation

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/WorkflowEditorPage.vue`

---

### Step 8.38: Auto-Save with Dirty Tracking

**Objective**: Track unsaved changes (dirty state) and optionally auto-save after a debounce period.

**n8n Import Strategy**: N/A.

**TDD Implementation**:

1. **Write Tests**: Test dirty flag sets on changes, auto-save triggers after debounce, unsaved warning on navigation.

2. **Implement**: Create `src/composables/use-auto-save.ts`:
   - Watch for node/edge changes in the editor store
   - Set `isDirty = true` on any change
   - Debounce auto-save (5 seconds after last change)
   - `beforeRouteLeave` guard warns if dirty
   - Clear dirty flag after successful save

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Dirty state indicator shows in toolbar
- Auto-save triggers after inactivity
- Navigation away warns about unsaved changes
- Manual save resets dirty state

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/composables/use-auto-save.ts`

---

### Step 8.39: JSON Export/Import

**Objective**: Allow exporting a workflow as JSON file and importing a JSON file to create/update a workflow.

**n8n Import Strategy**: N/A.

**TDD Implementation**:

1. **Write Tests**: Test export generates valid JSON, import parses and loads onto canvas.

2. **Implement**:
   - Export: serialize current workflow to JSON, trigger browser download
   - Import: file input, parse JSON, validate structure, load onto canvas
   - Support both n8n native format and our API format

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Export downloads a .json file
- Import loads a workflow from .json file
- Invalid JSON shows error message

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/editor/WorkflowEditorPage.vue`

---

### Sub-Phase G: Integration & Polish (Steps 8.40 -- 8.45)

---

### Step 8.40: Theme Support (Light/Dark)

**Objective**: Implement light and dark theme support using @n8n/design-system CSS variables.

**n8n Import Strategy**: **Import** @n8n/design-system CSS tokens for theming. The design system provides `--color-*` CSS variables for both themes.

**TDD Implementation**:

1. **Write Tests**: Test theme toggle changes CSS class on root element, localStorage persists preference.

2. **Implement**: Create `src/composables/use-theme.ts`:
   - Reads theme preference from localStorage (`r360_theme`)
   - Applies `data-theme="light"` or `data-theme="dark"` on `<html>`
   - Import n8n design system theme CSS files
   - `toggleTheme()` switches and persists
   - Create `_theme-light.scss` and `_theme-dark.scss` with CSS variable overrides

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Light and dark themes work
- Theme persists across page reloads
- All components respect theme variables
- @n8n/design-system components render correctly in both themes

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/composables/use-theme.ts`
- `workflowbuilder/apps/frontend-v2/src/styles/_theme-light.scss`
- `workflowbuilder/apps/frontend-v2/src/styles/_theme-dark.scss`

---

### Step 8.41: Error Boundaries and Loading States

**Objective**: Add error boundaries (Vue error handlers) and consistent loading states across all pages.

**n8n Import Strategy**: **Build custom**. May use @n8n/design-system `N8nLoading` component.

**TDD Implementation**:

1. **Write Tests**: Test error boundary catches component errors, loading states display.

2. **Implement**:
   - Create `src/components/ErrorBoundary.vue` using Vue's `onErrorCaptured`
   - Shows friendly error message with retry button
   - Add loading spinner component used consistently across all pages
   - Each page shows loading state while fetching data
   - Global error handler in `main.ts` via `app.config.errorHandler`

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Component errors don't crash the entire app
- Error boundary shows recovery UI
- All pages have consistent loading indicators

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/components/ErrorBoundary.vue`

---

### Step 8.42: Responsive Layout and Sidebar Collapse

**Objective**: Make the layout responsive: sidebar collapses on small screens, content area adapts.

**n8n Import Strategy**: N/A.

**TDD Implementation**:

1. **Write Tests**: Test sidebar collapses at breakpoint, collapsed state shows icon-only mode.

2. **Implement**:
   - Sidebar collapse state persisted in localStorage
   - Below 768px: sidebar auto-collapses to icon-only (60px)
   - Above 768px: user can toggle collapse
   - Content area expands to fill available space
   - Editor page: sidebar is hidden entirely (full-screen editor)

3. **Run & Fix**: Tests pass.

**Success Criteria**:
- Sidebar collapses to icon-only mode
- Responsive at 768px breakpoint
- State persists in localStorage

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/components/TheSidebar.vue`
- `workflowbuilder/apps/frontend-v2/src/components/AppShell.vue`

---

### Step 8.43: Remove editor-v2 Experiment

**Objective**: Delete the `workflowbuilder/apps/editor-v2/` directory. Its purpose was proof-of-concept for Vue + @vue-flow/core; that is now fulfilled by frontend-v2.

**n8n Import Strategy**: N/A.

**TDD Implementation**:

1. **Verify**: Confirm all editor-v2 features are present in frontend-v2:
   - Vite aliases (same config)
   - Canvas with VueFlow (EditorCanvas.vue)
   - Node types store (use-node-types-store.ts)
   - Workflow store (use-workflow-editor-store.ts)
   - CanvasNode component
   - NodePalette component

2. **Implement**:
   - Delete `workflowbuilder/apps/editor-v2/` directory
   - Remove from `workflowbuilder/pnpm-workspace.yaml` if listed
   - Remove any references in React frontend (WorkflowEditorV2Page redirect)
   - Remove the `/workflows/:id/edit-v2` route from React app if it exists

3. **Run & Fix**: Build succeeds without editor-v2.

**Success Criteria**:
- `workflowbuilder/apps/editor-v2/` directory deleted
- No references to editor-v2 remain in codebase
- Build succeeds

**Key Files**:
- `workflowbuilder/pnpm-workspace.yaml` (if modified)

---

### Step 8.44: Update API Server CORS

**Objective**: Update the API server CORS configuration to allow requests from the Vue frontend on port 4200.

**n8n Import Strategy**: N/A. Backend change.

**TDD Implementation**:

1. **Write Tests**: Verify CORS headers include `http://localhost:4200`.

2. **Implement**: Update `packages/api/src/server.ts`:
   - Ensure CORS origin includes `http://localhost:4200`
   - If already configured for port 4200 (from React app), no change needed
   - Verify proxy config in `vite.config.mts` routes `/api` to `http://localhost:3100`

3. **Run & Fix**: API responds to requests from Vue frontend.

**Success Criteria**:
- API server accepts requests from localhost:4200
- No CORS errors in browser console

**Key Files**:
- `packages/api/src/server.ts`

---

### Step 8.45: Update Build Progress and Configuration

**Objective**: Update build-progress.json and any orchestration config to reflect Phase 8 completion.

**n8n Import Strategy**: N/A.

**TDD Implementation**:

1. **Implement**:
   - Update `.claude/build-progress.json`:
     ```json
     { "currentPhase": 8, "phaseState": "complete", "completedPhases": [1,2,3,4,5,6,7,8] }
     ```
   - Update `.claude/ralph-prompts/build-all-phases.md` to include Phase 8
   - Rename `workflowbuilder/apps/frontend-v2/` to `workflowbuilder/apps/frontend/` (final switchover)
   - Move old React app to `workflowbuilder/apps/frontend-react-archive/` or delete

2. **Run & Fix**: Build succeeds with renamed directory.

**Success Criteria**:
- Build progress reflects Phase 8 complete
- Vue frontend is the primary frontend at `workflowbuilder/apps/frontend/`
- React app archived or deleted

**Key Files**:
- `.claude/build-progress.json`
- `.claude/ralph-prompts/build-all-phases.md`
- `workflowbuilder/apps/frontend/` (now Vue)

---

### Sub-Phase H: E2E Testing (Steps 8.46 -- 8.55)

---

### Step 8.46: E2E Test Framework Setup

**Objective**: Set up Playwright (or Browser MCP) for end-to-end testing of the Vue frontend.

**n8n Import Strategy**: N/A.

**TDD Implementation**:

1. **Implement**:
   - Install Playwright: `pnpm add -D @playwright/test`
   - Create `playwright.config.ts` with base URL `http://localhost:4200`
   - Create test helper: start dev server, seed test data
   - Create `src/__e2e__/helpers/` with login helper, API seed functions

2. **Success Criteria**:
   - `pnpm exec playwright test` can discover and run tests
   - Test helper can log in and navigate

**Key Files**:
- `workflowbuilder/apps/frontend-v2/playwright.config.ts`
- `workflowbuilder/apps/frontend-v2/src/__e2e__/helpers/`

---

### Step 8.47: E2E -- Login Flow

**Objective**: Test the complete login flow: visit /login, enter credentials, submit, verify redirect to dashboard.

**TDD Implementation**:

1. **Implement**: Create `src/__e2e__/login.spec.ts`:
   - Navigate to /login
   - Fill email and password
   - Click "Sign In" or "Continue as Demo User"
   - Verify redirect to / (dashboard)
   - Verify sidebar appears with user info

2. **Success Criteria**: Test passes end-to-end.

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/__e2e__/login.spec.ts`

---

### Step 8.48: E2E -- Dashboard

**Objective**: Test that the dashboard loads with stat cards and recent data tables.

**TDD Implementation**:

1. **Implement**: Create `src/__e2e__/dashboard.spec.ts`:
   - Log in
   - Verify 4 stat cards are visible
   - Verify recent workflows table renders
   - Verify recent executions table renders
   - Click a workflow row -> navigates to editor

2. **Success Criteria**: Test passes.

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/__e2e__/dashboard.spec.ts`

---

### Step 8.49: E2E -- Workflow List CRUD

**Objective**: Test workflow list page: view list, create new, toggle active, delete.

**TDD Implementation**:

1. **Implement**: Create `src/__e2e__/workflow-list.spec.ts`:
   - Navigate to /workflows
   - Verify workflow table renders
   - Click "Create Workflow" -> redirects to editor
   - Search for workflow by name
   - Toggle active status
   - Delete a workflow (confirm dialog)

2. **Success Criteria**: Test passes.

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/__e2e__/workflow-list.spec.ts`

---

### Step 8.50: E2E -- Workflow Editor (Canvas Operations)

**Objective**: Test the workflow editor: open, add node from palette, connect nodes, save.

**TDD Implementation**:

1. **Implement**: Create `src/__e2e__/workflow-editor.spec.ts`:
   - Navigate to a workflow's editor page
   - Verify canvas renders with existing nodes
   - Click "Add Node" to open palette
   - Search for a node type
   - Click to add node to canvas
   - Verify new node appears on canvas
   - Connect two nodes by dragging handles (or via context menu)
   - Click "Save"
   - Verify save status indicator shows "Saved"

2. **Success Criteria**: Test passes.

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/__e2e__/workflow-editor.spec.ts`

---

### Step 8.51: E2E -- Node Properties Editing

**Objective**: Test editing node properties in the properties panel.

**TDD Implementation**:

1. **Implement**: Create `src/__e2e__/node-properties.spec.ts`:
   - Open a workflow in the editor
   - Click on a node
   - Verify properties panel opens
   - Change a parameter value
   - Switch to Settings tab
   - Add a note
   - Save workflow
   - Reload page and verify changes persisted

2. **Success Criteria**: Test passes.

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/__e2e__/node-properties.spec.ts`

---

### Step 8.52: E2E -- Execution List and Detail

**Objective**: Test execution list and detail pages.

**TDD Implementation**:

1. **Implement**: Create `src/__e2e__/executions.spec.ts`:
   - Navigate to /executions
   - Verify execution table renders with status badges
   - Filter by status
   - Click on an execution row
   - Verify execution detail page shows metadata and steps
   - Expand a step to see input/output JSON
   - Navigate back to list

2. **Success Criteria**: Test passes.

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/__e2e__/executions.spec.ts`

---

### Step 8.53: E2E -- Credentials CRUD

**Objective**: Test credential management end-to-end.

**TDD Implementation**:

1. **Implement**: Create `src/__e2e__/credentials.spec.ts`:
   - Navigate to /credentials
   - Click "Add Credential"
   - Select a credential type from picker
   - Fill out the dynamic form
   - Save credential
   - Verify credential appears in list
   - Click "Test" button
   - Delete credential

2. **Success Criteria**: Test passes.

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/__e2e__/credentials.spec.ts`

---

### Step 8.54: E2E -- Settings Page

**Objective**: Test settings page functionality.

**TDD Implementation**:

1. **Implement**: Create `src/__e2e__/settings.spec.ts`:
   - Navigate to /settings
   - Verify user info displays
   - Toggle theme (light/dark)
   - Verify theme changes visually
   - Click logout
   - Verify redirect to /login

2. **Success Criteria**: Test passes.

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/__e2e__/settings.spec.ts`

---

### Step 8.55: E2E -- Auth Flow (Guard, Redirect, Session)

**Objective**: Test auth guard behavior: unauthenticated users are redirected, session persists across reloads.

**TDD Implementation**:

1. **Implement**: Create `src/__e2e__/auth-flow.spec.ts`:
   - Clear session
   - Navigate to / -> redirected to /login
   - Navigate to /workflows -> redirected to /login
   - Log in
   - Navigate freely between all routes
   - Reload page -> still authenticated
   - Log out -> redirected to /login
   - Navigate to /workflows -> redirected to /login again

2. **Success Criteria**: Test passes.

**Key Files**:
- `workflowbuilder/apps/frontend-v2/src/__e2e__/auth-flow.spec.ts`

---

## Team Orchestration

### Team Members

- **Builder (foundation-builder)**
  - Role: Steps 8.1-8.6 (Sub-Phase A: scaffold, Vite config, router, auth, API, stores)
  - Agent Type: builder
  - Resume: true

- **Builder (component-builder)**
  - Role: Steps 8.7-8.13 (Sub-Phase B: shared components)
  - Agent Type: builder
  - Resume: true
  - Can start after 8.6 completes

- **Builder (pages-builder)**
  - Role: Steps 8.14-8.21 (Sub-Phase C: non-editor pages)
  - Agent Type: builder
  - Resume: true
  - Can start after 8.13 completes

- **Builder (editor-builder)**
  - Role: Steps 8.22-8.34 (Sub-Phases D+E: workflow editor)
  - Agent Type: builder
  - Resume: true
  - Can start after 8.6 completes (independent of pages)

- **Builder (persistence-builder)**
  - Role: Steps 8.35-8.39 (Sub-Phase F: workflow persistence)
  - Agent Type: builder
  - Resume: true
  - Can start after 8.34 completes

- **Builder (polish-builder)**
  - Role: Steps 8.40-8.45 (Sub-Phase G: integration and polish)
  - Agent Type: builder
  - Resume: true
  - Can start after 8.39 completes

- **Builder (e2e-builder)**
  - Role: Steps 8.46-8.55 (Sub-Phase H: E2E testing)
  - Agent Type: builder
  - Resume: true
  - Can start after 8.45 completes

- **Validator (final-validator)**
  - Role: Validate all acceptance criteria, run all tests, browser verification
  - Agent Type: validator
  - Resume: false
  - Runs after all builders complete

### Parallelism

Sub-Phases can be partially parallelized:
- **A** (foundation) must complete first
- **B** (components) and **D** (editor canvas) can run in parallel after A
- **C** (pages) depends on B
- **E** (node config) depends on D
- **F** (persistence) depends on D+E
- **G** (polish) depends on C+F
- **H** (E2E) depends on G

```
A (8.1-8.6) -> B (8.7-8.13) -> C (8.14-8.21) ----+
            |                                       |
            +-> D (8.22-8.28) -> E (8.29-8.34) -> F (8.35-8.39) -> G (8.40-8.45) -> H (8.46-8.55)
```

## Acceptance Criteria

### Feature Parity with React Frontend

- [ ] Login page with email/password form and demo login
- [ ] Dashboard with 4 stat cards, recent workflows table, recent executions table
- [ ] Workflow list with search, create, delete, active toggle
- [ ] Workflow editor with VueFlow canvas
- [ ] Node palette with 483+ node types, search, categories
- [ ] Drag-and-drop nodes from palette to canvas
- [ ] Node connections via handle dragging
- [ ] Properties panel with parameter editing
- [ ] Credential selector in node params
- [ ] Expression editor for parameters
- [ ] Execution list with status filter, cancel running
- [ ] Execution detail with step list and JSON display
- [ ] Credentials page with type picker, dynamic form, test button
- [ ] Settings page with user info, theme toggle, logout
- [ ] Sidebar navigation with active state
- [ ] Auth guard redirects unauthenticated users

### Technical Requirements

- [ ] Vue 3.5 with Composition API (no Options API)
- [ ] Pinia stores for all state management
- [ ] Vue Router with lazy-loaded routes
- [ ] @n8n/design-system imported via Vite aliases
- [ ] @vue-flow/core for canvas (NOT n8n's Canvas.vue)
- [ ] TypeScript strict mode throughout
- [ ] SCSS styling with @n8n/design-system tokens
- [ ] Vite build succeeds with no errors
- [ ] All unit tests pass
- [ ] All E2E tests pass

### Cleanup

- [ ] editor-v2 experiment deleted
- [ ] API server CORS updated
- [ ] Build progress updated to Phase 8 complete
- [ ] frontend-v2 renamed to frontend (final switchover)

## Validation Commands

```bash
# --- Build checks ---

# Vue app builds successfully
cd workflowbuilder/apps/frontend-v2 && pnpm build
echo "Build: $?"

# TypeScript compiles
cd workflowbuilder/apps/frontend-v2 && pnpm exec vue-tsc --noEmit
echo "TypeScript: $?"

# --- Unit tests ---
cd workflowbuilder/apps/frontend-v2 && pnpm test
echo "Unit tests: $?"

# --- E2E tests ---
cd workflowbuilder/apps/frontend-v2 && pnpm exec playwright test
echo "E2E tests: $?"

# --- Feature parity checks ---

# All pages exist
for page in LoginPage DashboardPage WorkflowListPage ExecutionListPage ExecutionDetailPage CredentialsPage SettingsPage; do
  test -f "workflowbuilder/apps/frontend-v2/src/pages/${page}.vue" && echo "PASS: ${page}" || echo "FAIL: ${page}"
done

# Editor components exist
for comp in EditorCanvas CanvasNode CanvasEdge NodePalette PropertiesPanel ParameterInput; do
  test -f "workflowbuilder/apps/frontend-v2/src/editor/components/${comp}.vue" && echo "PASS: ${comp}" || echo "FAIL: ${comp}"
done

# Stores exist
for store in use-dashboard-store use-workflow-list-store use-execution-store use-credential-store; do
  test -f "workflowbuilder/apps/frontend-v2/src/stores/${store}.ts" && echo "PASS: ${store}" || echo "FAIL: ${store}"
done

# API modules exist
for api in api-client workflow-api execution-api credential-api; do
  test -f "workflowbuilder/apps/frontend-v2/src/api/${api}.ts" && echo "PASS: ${api}" || echo "FAIL: ${api}"
done

# editor-v2 removed
test ! -d "workflowbuilder/apps/editor-v2" && echo "PASS: editor-v2 removed" || echo "FAIL: editor-v2 still exists"

# Line count check
wc -l specs/Phase8.md  # Should be 1000+ lines

# Phase8.md has all sub-phases
grep -c "### Step 8\." specs/Phase8.md  # Should be 40+
```

## Notes

### Key Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| n8n design system import failures | Low | Medium | Vite alias strategy proven in editor-v2. Fallback to Element Plus or custom. |
| Node palette too coupled to import | Medium | Low | Build custom palette (proven in editor-v2). Simple searchable list. |
| Parameter editing too complex | Medium | Medium | Build custom using @n8n/design-system primitives + JSON schema rendering. |
| Canvas complexity / VueFlow issues | Low | High | Same library n8n uses. Custom node rendering proven in editor-v2. |
| Auth session not shared during migration | Low | Low | Same sessionStorage key (`r360_auth`). Same port (4200). |
| E2E test infrastructure | Low | Medium | Playwright is mature. Browser MCP as alternative. |

### What We Learned from editor-v2 Experiment

1. **Vite aliases work** -- pointing `@n8n/*` into `n8n/packages/` source tree compiles correctly
2. **@vue-flow/core works standalone** -- canvas renders with custom nodes, no n8n stores needed
3. **Node types load from our API** -- 483 node types served via n8n-compat facade
4. **n8n's full App.vue is too coupled** -- requires 100+ transitive deps; build our own app shell
5. **Workflow serialization works** -- VueFlow nodes/edges to n8n format round-trip proven
6. **Port 4202 setup adds friction** -- Vue frontend should replace React on port 4200

### Migration Strategy

During development, both apps coexist:
- React app: `workflowbuilder/apps/frontend/` (port 4200)
- Vue app: `workflowbuilder/apps/frontend-v2/` (port 4201 during overlap, then 4200)

Final switchover:
1. Rename `frontend/` to `frontend-react-archive/`
2. Rename `frontend-v2/` to `frontend/`
3. Update port to 4200
4. Delete `frontend-react-archive/` after validation

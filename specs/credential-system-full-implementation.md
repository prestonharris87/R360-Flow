# Plan: Credential System Full Implementation

## Task Description

Build a production-ready credential system for R360 Flow that works with all n8n nodes. The system must:

1. **Fully implement n8n's credential interfaces** — Complete the `TenantCredentialsHelper` with working credential resolution, authentication, OAuth token refresh, credential type registry, and credential testing
2. **Expose credential types from n8n-nodes-base** — Serve credential type schemas (field definitions, authentication configs, test specs) through our API so the frontend can render credential forms
3. **Add per-node credential selection in the Workflow Builder UI** — Nodes that require credentials show a credential selector dropdown, with the ability to create/select/test credentials inline
4. **Wire credential lookup to the execution engine** — Connect the DB query layer to `TenantCredentialsHelper` so credentials are resolved at execution time
5. **Comprehensive testing** — Backend unit/integration tests and frontend component tests

## Objective

When complete, a user can:
- Open a node that requires credentials (e.g., Slack, Gmail, HTTP Request)
- See which credential types the node supports
- Select an existing credential or create a new one via a form generated from the n8n credential type schema
- Test the credential to verify it works
- Save and execute the workflow with credentials resolved per-tenant

## Problem Statement

The credential system has foundational pieces (DB schema, encryption, API CRUD, TenantCredentialsHelper skeleton) but critical gaps prevent actual use:

1. **No credential lookup wiring** — `ExecutionService` creates `TenantCredentialsHelper` without a `credentialLookupFn`, so credential resolution fails at runtime
2. **Stub methods** — `authenticate()`, `preAuthentication()`, `getCredentialsProperties()`, `getParentTypes()`, `updateCredentials()` are all TODO stubs
3. **No credential type registry** — No way to discover what credential types exist, what fields they have, or which nodes use them
4. **No per-node credential UI** — The frontend has a credential management page but no way to select credentials on individual nodes in the workflow editor
5. **No credential testing** — No mechanism to verify credentials work before execution
6. **Credential type mismatch** — Frontend uses generic types (`api_key`, `oauth2`, `basic_auth`) instead of n8n's specific types (`slackApi`, `googleSheetsOAuth2Api`, etc.)

## Solution Approach

**Import n8n's credential type definitions from `n8n-nodes-base`** using the existing `LazyPackageDirectoryLoader` pattern (already used for node types in `R360NodeTypes`). Build a `CredentialTypeRegistry` that loads all `ICredentialType` definitions from installed n8n packages. Then complete the `TenantCredentialsHelper` implementation using this registry, and expose credential type schemas through new API endpoints. Finally, add a `CredentialSelect` control to the Workflow Builder's JSONForm system.

**Key design decisions:**
- Credential types come from n8n packages (npm dependencies) — we never define them ourselves
- Credential data encryption remains per-tenant (existing approach is correct)
- Credential selection is stored on the node: `node.credentials = { [typeName]: { id, name } }`
- The json-translator already handles the `credentials` meta-property — it strips it from parameters and places it on the INode object
- OAuth flows require a callback endpoint in our API (new)

## Relevant Files

### Existing Files to Modify

- `packages/execution-engine/src/credentials-helper.ts` — Complete all stub methods, wire credential type registry
- `packages/execution-engine/src/execution-service.ts` — Pass `credentialLookupFn` to `TenantCredentialsHelper`
- `packages/execution-engine/src/node-types.ts` — Reference for `LazyPackageDirectoryLoader` pattern (credential types use same approach)
- `packages/execution-engine/src/bootstrap.ts` — Register `CredentialTypeRegistry` in DI container
- `packages/api/src/routes/credentials.ts` — Add credential type listing and credential test endpoints
- `packages/api/src/server.ts` — Register new routes
- `packages/db/src/schema/credentials.ts` — Add `node_id` or workflow-credential junction if needed
- `packages/types/src/index.ts` — Export new credential type interfaces
- `packages/types/src/validators.ts` — Add schemas for new endpoints
- `packages/json-translator/src/node-mapping.ts` — Ensure credential property mapping works correctly (verify META_PROPERTIES handling)
- `workflowbuilder/apps/frontend/src/app/features/json-form/json-form.tsx` — Register new CredentialSelect renderer
- `workflowbuilder/apps/frontend/src/app/features/properties-bar/components/node-properties/node-properties.tsx` — Pass credential info to form
- `workflowbuilder/apps/frontend/src/app/data/generate-uischema.ts` — Auto-generate credential selector in UISchema
- `workflowbuilder/apps/frontend/src/app/data/n8n-node-mapper.ts` — Include credential info in palette items
- `workflowbuilder/apps/frontend/src/api/credential-api.ts` — Add credential type and test API calls
- `workflowbuilder/apps/frontend/src/stores/use-credential-store.ts` — Add credential type state
- `workflowbuilder/apps/frontend/src/pages/credentials/credentials-page.tsx` — Update to use n8n credential types

### New Files

- `packages/execution-engine/src/credential-types.ts` — `CredentialTypeRegistry` class that loads `ICredentialType` definitions from n8n-nodes-base
- `packages/api/src/routes/credential-types.ts` — API routes for listing credential types and their schemas
- `workflowbuilder/apps/frontend/src/app/features/json-form/controls/credential-select-control/` — New JSONForm control for credential selection per node
- `workflowbuilder/apps/frontend/src/app/features/credential-form-modal/credential-form-modal.tsx` — Modal for creating/editing credentials with n8n schema-driven form
- `packages/execution-engine/src/__tests__/credential-types.test.ts` — Unit tests for credential type registry
- `packages/execution-engine/src/__tests__/credentials-helper-integration.test.ts` — Integration tests for full credential resolution flow
- `packages/api/src/__tests__/routes/credential-types.test.ts` — API route tests
- `workflowbuilder/apps/frontend/src/app/features/json-form/controls/credential-select-control/credential-select-control.test.tsx` — Component tests

## Implementation Phases

### Phase 1: Foundation — Credential Type Registry & Execution Wiring

Build the `CredentialTypeRegistry` that loads credential type definitions from `n8n-nodes-base`. Wire the credential lookup function into `ExecutionService` → `TenantCredentialsHelper`. Complete all stub methods.

**Key components:**
1. `CredentialTypeRegistry` — Mirrors the pattern in `R360NodeTypes` but for credentials
   - Uses `LazyPackageDirectoryLoader` to discover credential types from `n8n-nodes-base`
   - Provides: `getByName(type)`, `getAll()`, `getParentTypes(type)`, `getCredentialsProperties(type)`, `getSupportedNodes(type)`
   - Handles credential type inheritance (`extends` property)
2. Complete `TenantCredentialsHelper` stub methods using the registry
3. Wire `credentialLookupFn` from DB layer into `ExecutionService`

### Phase 2: Core Implementation — API & Backend

Expose credential types through API endpoints. Add credential testing. Update credential CRUD to use n8n credential type names.

**Key components:**
1. `GET /api/credential-types` — List all available credential types with metadata
2. `GET /api/credential-types/:name` — Get full schema (properties, authentication config) for a specific type
3. `POST /api/credentials/:id/test` — Test a credential by running its `ICredentialTestRequest`
4. Update credential creation to validate `type` against registry
5. Credential test execution using n8n's test spec format

### Phase 3: Integration & Polish — Frontend UI

Add per-node credential selection in the Workflow Builder. Create credential form modal driven by n8n schemas. Wire everything together end-to-end.

**Key components:**
1. `CredentialSelectControl` — JSONForm control showing credential dropdown per node
2. `CredentialFormModal` — Schema-driven form for creating credentials (fields from `ICredentialType.properties`)
3. UISchema generation updates to auto-include credential selectors
4. End-to-end flow: create credential → select on node → execute workflow → credentials resolved

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- You're responsible for deploying the right team members with the right context to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members to do the building, validating, testing, deploying, and other tasks.

### Team Members

- Builder
  - Name: **builder-registry**
  - Role: Implement CredentialTypeRegistry and complete TenantCredentialsHelper
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: **builder-api**
  - Role: Implement credential type API routes and credential testing endpoint
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: **builder-ui**
  - Role: Implement CredentialSelectControl, CredentialFormModal, and UISchema updates
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: **builder-tests**
  - Role: Write comprehensive backend and frontend tests
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: **validator-all**
  - Role: Validate all work meets acceptance criteria
  - Agent Type: validator
  - Resume: true

## Step by Step Tasks

### 1. Build Credential Type Registry
- **Task ID**: credential-type-registry
- **Depends On**: none
- **Assigned To**: builder-registry
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 2)
- Create `packages/execution-engine/src/credential-types.ts` with `CredentialTypeRegistry` class
- Use `LazyPackageDirectoryLoader` to load credential types from `n8n-nodes-base` (follow pattern in `node-types.ts`)
- Implement methods:
  - `getByName(typeName: string): ICredentialType` — Returns full credential type definition
  - `getAll(): ICredentialType[]` — Returns all known credential types
  - `getParentTypes(typeName: string): string[]` — Recursively resolves `extends` chain
  - `getCredentialsProperties(typeName: string): INodeProperties[]` — Merges properties from type + parent types
  - `getSupportedNodes(typeName: string): string[]` — Which nodes can use this credential type
  - `recognizes(typeName: string): boolean` — Whether a type is registered
- Register in `bootstrap.ts` DI container (instantiate once at startup, not per-tenant)
- **Reference:** n8n's `CredentialTypes` class at `n8n/packages/cli/src/credential-types.ts` for how n8n does this
- **Reference:** n8n's `LazyPackageDirectoryLoader` loading pattern in our `node-types.ts`
- **Cardinal Rule:** Import from `n8n-nodes-base` npm package only, never from `n8n/` directory

### 2. Complete TenantCredentialsHelper Stubs
- **Task ID**: complete-credentials-helper
- **Depends On**: credential-type-registry
- **Assigned To**: builder-registry
- **Agent Type**: builder
- **Parallel**: false
- Wire `CredentialTypeRegistry` into `TenantCredentialsHelper` (pass as constructor param or inject)
- Implement `getParentTypes(name)`:
  - Delegate to `CredentialTypeRegistry.getParentTypes(name)`
- Implement `getCredentialsProperties(type)`:
  - Delegate to `CredentialTypeRegistry.getCredentialsProperties(type)`
  - Must merge parent type properties using n8n's inheritance model
- Implement `authenticate(credentials, typeName, requestOptions, workflow, node)`:
  - Load `ICredentialType` from registry
  - If `credentialType.authenticate` is a function, call it with credentials and requestOptions
  - If `credentialType.authenticate` is an object with `type: 'generic'`, apply generic auth (resolve expressions in headers/body/query/auth)
  - If no `authenticate` defined, pass through unchanged
  - **Reference:** n8n's implementation at `n8n/packages/cli/src/credentials-helper.ts` lines 99-155
- Implement `preAuthentication(helpers, credentials, typeName, node, credentialsExpired)`:
  - Load `ICredentialType` from registry
  - If `credentialType.preAuthentication` exists, call it
  - If result returned, call `updateCredentials()` to persist refreshed tokens
  - **Reference:** n8n's implementation at `n8n/packages/cli/src/credentials-helper.ts` lines 157-210
- Implement `updateCredentials(nodeCredentials, type, data)`:
  - Encrypt data with tenant key
  - Update DB record (use credentialLookupFn pattern or add an updateFn)
  - Filter by tenant_id AND credential id
- Implement `updateCredentialsOauthTokenData(...)`:
  - Delegate to `updateCredentials` (merge OAuth token data into existing credential data)

### 3. Wire Credential Lookup into Execution Service
- **Task ID**: wire-credential-lookup
- **Depends On**: complete-credentials-helper
- **Assigned To**: builder-registry
- **Agent Type**: builder
- **Parallel**: false
- Modify `ExecutionService` constructor to accept a credential store/query service
- Create a `credentialLookupFn` implementation that:
  - Queries `credentials` table by `id` AND `tenant_id`
  - Returns `{ id, tenant_id, name, type, encrypted_data }` or null
- Pass the lookup function to `TenantCredentialsHelper` constructor in `executeWorkflow()`
- Also wire an `updateFn` for credential updates (OAuth token refresh)
- Verify the `CredentialTypeRegistry` is accessible from `TenantCredentialsHelper` (passed through bootstrap or constructor)

### 4. Add Credential Type API Routes
- **Task ID**: credential-type-api
- **Depends On**: credential-type-registry
- **Assigned To**: builder-api
- **Agent Type**: builder
- **Parallel**: true (can run alongside tasks 2, 3)
- Create `packages/api/src/routes/credential-types.ts` with routes:
  - `GET /api/credential-types` — List all credential types
    - Response: `Array<{ name, displayName, icon, iconColor, documentationUrl, supportedNodes, extends, properties (summary) }>`
    - Support query params: `?nodeType=n8n-nodes-base.slack` to filter by node compatibility
    - Paginated or full list (credential types are finite ~300-500)
  - `GET /api/credential-types/:name` — Get full credential type schema
    - Response: Full `ICredentialType` serialized (properties, authenticate config, test spec, extends, etc.)
    - Include merged properties from parent types (resolved inheritance)
    - Used by frontend to render credential creation forms
  - `GET /api/credential-types/:name/properties` — Get just the form properties
    - Response: `INodeProperties[]` with inheritance resolved
    - Simpler endpoint for form rendering
- Register routes in `server.ts`
- Add Zod validation schemas in `packages/types/src/validators.ts`
- **Security:** These are read-only metadata endpoints — no tenant-specific data. Require authentication but no admin role.

### 5. Add Credential Test Endpoint
- **Task ID**: credential-test-endpoint
- **Depends On**: credential-type-api, wire-credential-lookup
- **Assigned To**: builder-api
- **Agent Type**: builder
- **Parallel**: false
- Add `POST /api/credentials/:id/test` endpoint:
  - Load credential from DB (tenant-scoped)
  - Decrypt credential data
  - Load credential type from registry
  - If `credentialType.test` exists:
    - If `test.request`: Make HTTP request with credential authentication applied
    - Check response status (2xx = OK, else Error)
  - Return `{ status: 'OK' | 'Error', message: string }`
  - **Security:** Require admin role. Tenant-scoped credential lookup.
  - **Timeout:** 10s max for test requests
- **Reference:** n8n's `ICredentialTestRequest` interface and test execution in `n8n/packages/core/src/execution-engine/node-execution-context/credentials-test-context.ts`

### 6. Update Credential CRUD for n8n Types
- **Task ID**: update-credential-crud
- **Depends On**: credential-type-api
- **Assigned To**: builder-api
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 5)
- Update `POST /api/credentials` to:
  - Validate `type` against `CredentialTypeRegistry.recognizes(type)` — reject unknown types
  - Store the exact n8n credential type name (e.g., `slackApi` not `api_key`)
- Update `GET /api/credentials` to:
  - Include credential type display name from registry in response
  - Support filtering by `?type=slackApi` or `?nodeType=n8n-nodes-base.slack`
- Update Zod validation:
  - `CreateCredentialSchema.type` should validate against registry (or at least be a non-empty string)
  - Consider adding `data` field validation against credential type properties schema

### 7. Implement Credential Select UI Control
- **Task ID**: credential-select-control
- **Depends On**: credential-type-api, update-credential-crud
- **Assigned To**: builder-ui
- **Agent Type**: builder
- **Parallel**: true (can start once API work is available)
- Create `workflowbuilder/apps/frontend/src/app/features/json-form/controls/credential-select-control/`
  - `credential-select-control.tsx` — JSONForm control component
  - `index.ts` — Renderer registration export
- **Behavior:**
  - Renders a dropdown of available credentials for the node's required credential type
  - Shows credential name + type label
  - Includes "Add new credential" option that opens the CredentialFormModal
  - Includes "Test" button next to selected credential
  - Stores selection as `{ id: string, name: string }` in node properties under `credentials` key
  - Reads available credentials from API filtered by type
- Register in `json-form.tsx` renderers array
- Follow existing control pattern (e.g., `select-control`)

### 8. Implement Credential Form Modal
- **Task ID**: credential-form-modal
- **Depends On**: credential-type-api
- **Assigned To**: builder-ui
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 7)
- Create `workflowbuilder/apps/frontend/src/app/features/credential-form-modal/credential-form-modal.tsx`
- **Behavior:**
  - Fetches credential type schema from `GET /api/credential-types/:name`
  - Renders form fields from `ICredentialType.properties` (map to JSONForm field types):
    - `string` → Text input (with `typeOptions.password` → password input)
    - `number` → Number input
    - `boolean` → Switch/toggle
    - `options` → Select dropdown
    - `string` with `typeOptions.rows` → TextArea
  - Handle conditional field visibility (`displayOptions` on properties)
  - Submit creates credential via `POST /api/credentials`
  - Show test button that calls `POST /api/credentials/:id/test`
  - On success, emit selected credential to parent (CredentialSelectControl)
- **Reference:** n8n's `INodeProperties` field type mapping for form rendering
- **Note:** For OAuth2 credentials, show a "Connect" button that initiates OAuth flow (Phase 2 enhancement — for now show the token fields directly)

### 9. Update UISchema Generation for Credentials
- **Task ID**: uischema-credential-generation
- **Depends On**: credential-select-control
- **Assigned To**: builder-ui
- **Agent Type**: builder
- **Parallel**: false
- Modify `workflowbuilder/apps/frontend/src/app/data/generate-uischema.ts`:
  - When generating UISchema for a node, check if node has `credentials` in its definition
  - For each credential requirement, add a `CredentialSelect` control element at the top of the Settings accordion
  - Pass credential type name and required flag as options
- Modify `workflowbuilder/apps/frontend/src/app/data/n8n-node-mapper.ts`:
  - Ensure `credentials` array from `INodeTypeDescription` is included in `N8nPaletteItemResponse`
  - Map `INodeCredentialDescription` → credential selector metadata
- Update `NodeData` type to include optional `credentials` field matching n8n's `INodeCredentials` format: `{ [typeName]: { id: string, name: string } }`

### 10. Update JSON Translator Credential Handling
- **Task ID**: json-translator-credentials
- **Depends On**: uischema-credential-generation
- **Assigned To**: builder-ui
- **Agent Type**: builder
- **Parallel**: false
- Verify `packages/json-translator/src/node-mapping.ts` correctly handles credentials:
  - `credentials` is already in `META_PROPERTIES` set (line filtering)
  - Forward mapping (UI → n8n): Extract `credentials` from WB properties and set on `INode.credentials`
  - Reverse mapping (n8n → UI): Extract `INode.credentials` and include in WB properties
- If not already implemented, add credential mapping logic:
  - `mapWBNodeToN8nNode()`: `node.credentials = wbNode.data.properties.credentials`
  - `mapN8nNodeToWBNode()`: `wbNode.data.properties.credentials = n8nNode.credentials`
- Write/verify unit tests for credential property round-trip

### 11. Backend Unit & Integration Tests
- **Task ID**: backend-tests
- **Depends On**: wire-credential-lookup, credential-test-endpoint, update-credential-crud
- **Assigned To**: builder-tests
- **Agent Type**: builder
- **Parallel**: true (can run alongside UI tasks)
- **Credential Type Registry Tests** (`packages/execution-engine/src/__tests__/credential-types.test.ts`):
  - Loads credential types from n8n-nodes-base successfully
  - `getByName()` returns correct type for known credentials (slackApi, httpBasicAuth, etc.)
  - `getByName()` throws for unknown type
  - `getAll()` returns non-empty array
  - `getParentTypes()` returns correct inheritance chain (e.g., googleSheetsOAuth2Api → oAuth2Api)
  - `getCredentialsProperties()` merges parent properties correctly
  - `getSupportedNodes()` returns correct node list
  - `recognizes()` returns true for valid types, false for invalid
- **TenantCredentialsHelper Integration Tests** (`packages/execution-engine/src/__tests__/credentials-helper-integration.test.ts`):
  - Full flow: create credential → lookup → decrypt → return data
  - `getDecrypted()` returns correct decrypted data for valid credential
  - `getDecrypted()` fails for wrong tenant (isolation test)
  - `getDecrypted()` fails for non-existent credential
  - `authenticate()` applies API key header correctly (test with a simple credential type)
  - `authenticate()` applies generic auth (header injection)
  - `authenticate()` passes through when no auth config
  - `getParentTypes()` returns correct chain via registry
  - `getCredentialsProperties()` returns correct properties via registry
  - `updateCredentials()` encrypts and persists updated data
  - Credential lookup function is called with correct tenant_id and credential_id
- **API Route Tests** (`packages/api/src/__tests__/routes/credential-types.test.ts`):
  - `GET /api/credential-types` returns list of types
  - `GET /api/credential-types` with `?nodeType=` filter returns filtered results
  - `GET /api/credential-types/:name` returns full schema for valid type
  - `GET /api/credential-types/:name` returns 404 for unknown type
  - `GET /api/credential-types/:name/properties` returns merged properties
  - `POST /api/credentials/:id/test` returns OK for valid credential with test spec
  - `POST /api/credentials/:id/test` returns Error for invalid credentials
  - `POST /api/credentials/:id/test` returns 404 for non-existent credential
  - `POST /api/credentials/:id/test` enforces tenant isolation
  - Updated `POST /api/credentials` rejects unknown credential types
  - Updated `GET /api/credentials` supports type filtering

### 12. Frontend Component Tests
- **Task ID**: frontend-tests
- **Depends On**: credential-select-control, credential-form-modal, uischema-credential-generation
- **Assigned To**: builder-tests
- **Agent Type**: builder
- **Parallel**: true (can run alongside backend tests)
- **CredentialSelectControl Tests:**
  - Renders dropdown with available credentials
  - Shows "Add new credential" option
  - Selecting a credential updates node properties
  - Opening "Add new" launches CredentialFormModal
  - Shows "Test" button when credential selected
  - Handles empty credential list gracefully
  - Filters credentials by type
- **CredentialFormModal Tests:**
  - Renders form fields from credential type schema
  - Password fields are masked
  - Submits create credential API call
  - Shows validation errors
  - Test button calls test endpoint and shows result
  - Closes on successful creation
  - Handles API errors gracefully
- **UISchema Generation Tests:**
  - Nodes with credentials get CredentialSelect controls in UISchema
  - Nodes without credentials have no credential controls
  - Multiple credential types generate multiple selectors
  - Required vs optional credentials reflected in UI

### 13. End-to-End Integration Validation
- **Task ID**: validate-all
- **Depends On**: backend-tests, frontend-tests, json-translator-credentials
- **Assigned To**: validator-all
- **Agent Type**: validator
- **Parallel**: false
- Run full build: `pnpm -r build` (all packages compile)
- Run all backend tests: `pnpm --filter @r360/execution-engine test` and `pnpm --filter @r360/api test`
- Run frontend tests if configured: `pnpm --filter workflowbuilder test`
- Verify credential type registry loads types from n8n-nodes-base (check count > 100)
- Verify API endpoints return expected data shapes
- Verify TenantCredentialsHelper resolves credentials with tenant isolation
- Verify json-translator credential round-trip
- Check no imports from `n8n/` directory (Cardinal Rule)
- Check all DB queries include `tenant_id` filtering
- Verify no credential data leaks in API responses (encrypted data never exposed)
- Check TypeScript compilation has no errors across all packages

## Acceptance Criteria

1. **Credential Type Registry loads all n8n credential types** — `CredentialTypeRegistry.getAll()` returns 100+ credential types from n8n-nodes-base
2. **TenantCredentialsHelper fully functional** — All abstract methods implemented (no TODO stubs remaining)
3. **Credential lookup wired** — `ExecutionService.executeWorkflow()` passes a working `credentialLookupFn` that queries by tenant_id
4. **API serves credential types** — `GET /api/credential-types` returns credential type list; `GET /api/credential-types/:name` returns full schema
5. **Credential testing works** — `POST /api/credentials/:id/test` executes the credential type's test spec and returns status
6. **Credential CRUD validates types** — Creating credentials requires a valid n8n credential type name
7. **UI shows credential selector** — Nodes with credential requirements show a dropdown in the properties panel
8. **UI renders credential forms** — Creating a new credential shows a form with fields from the credential type schema
9. **Credential selection persisted** — Selected credentials are stored on node data and survive save/load
10. **JSON translator handles credentials** — Credentials round-trip correctly between DiagramModel and n8n WorkflowParameters
11. **Tenant isolation maintained** — All credential operations filter by tenant_id; cross-tenant access is impossible
12. **Cardinal Rule respected** — Zero imports from `n8n/` directory; all n8n usage is from npm packages
13. **All tests pass** — Backend: 20+ test cases for registry, helper, and API; Frontend: 15+ test cases for controls and modal
14. **Full build succeeds** — `pnpm -r build` completes with no TypeScript errors

## Validation Commands

Execute these commands to validate the task is complete:

```bash
# 1. Full build (all packages)
cd /Users/preston/Documents/Claude/R360-Flow
pnpm -r build

# 2. Backend tests — execution engine
pnpm --filter @r360/execution-engine test

# 3. Backend tests — API
pnpm --filter @r360/api test

# 4. Backend tests — json-translator
pnpm --filter @r360/json-translator test

# 5. Frontend tests (if vitest configured)
cd workflowbuilder && pnpm test

# 6. Cardinal Rule check — no imports from n8n/ directory
grep -r "from ['\"].*n8n/" packages/ --include="*.ts" | grep -v node_modules | grep -v "n8n-workflow" | grep -v "n8n-core" | grep -v "n8n-nodes-base" | grep -v "__tests__"

# 7. Verify credential types load (manual check)
# Start server and curl:
# curl http://localhost:3100/api/credential-types | jq '.length'
# Should return > 100

# 8. Verify no encrypted data in API responses
grep -r "encrypted_data\|encryptedData" packages/api/src/routes/ --include="*.ts" -n
# Should only appear in internal queries, never in response objects

# 9. Verify tenant_id in all credential queries
grep -r "credentials" packages/db/src/ --include="*.ts" -n | grep -v node_modules
# All queries should include tenant_id filtering

# 10. TypeScript strict check
pnpm -r exec tsc --noEmit
```

## Notes

### n8n Credential Type Loading Pattern

The `LazyPackageDirectoryLoader` in n8n-nodes-base discovers credential files by scanning the `credentials/` directory in the installed package. Each file exports a class implementing `ICredentialType`. The loader creates a `KnownCredentials` map keyed by `ICredentialType.name`.

In `node-types.ts`, we already use this pattern:
```typescript
const loader = new LazyPackageDirectoryLoader(n8nNodesBasePath);
await loader.loadAll();
// loader.nodeTypes gives us INodeTypeData
// loader.credentialTypes gives us ICredentialTypeData  ← Use this!
```

The `LazyPackageDirectoryLoader` already loads BOTH node types AND credential types. We just need to expose the credential types through a registry class.

### OAuth2 Flow (Future Enhancement)

Full OAuth2 support requires:
1. A callback URL endpoint (`/api/credentials/oauth2/callback`)
2. State parameter management (CSRF protection)
3. Token exchange and storage
4. This is a significant feature and should be a separate plan — for now, OAuth2 credentials can be entered manually (access token, refresh token fields)

### Credential Type Inheritance

n8n credential types support inheritance via `extends`. For example:
- `googleSheetsOAuth2Api` extends `googleApi` which extends `oAuth2Api`
- When resolving properties, we must merge all ancestor properties
- `getCredentialsProperties()` should call n8n's `NodeHelpers.mergeNodeProperties()` or implement equivalent logic

### Expression Resolution in Credentials

Some credential values use n8n expressions (e.g., `={{$credentials.apiKey}}`). The `getDecrypted()` method must resolve these using the workflow's expression evaluator. Our current implementation should pass `expressionResolveValues` through to n8n's expression engine.

### Generic Authentication Config

n8n supports declarative authentication via `IAuthenticateGeneric`:
```typescript
authenticate: {
  type: 'generic',
  properties: {
    headers: { 'Authorization': 'Bearer ={{$credentials.apiKey}}' },
    // or qs: { api_key: '={{$credentials.apiKey}}' },
    // or body: { ... },
  }
}
```
The `authenticate()` method must resolve these expressions against the decrypted credential data and merge them into the request options.

# Plan: Fix Workflow Import Node Mapping & Auto-Credential Assignment

## Task Description
When importing an n8n workflow JSON into R360 Flow, nodes lose their parameters and configuration. The imported workflow stores raw n8n-format nodes (`{ name, type, position: [x,y], parameters }`) but the frontend expects DiagramModel-format nodes (`{ id, type: "node", position: {x,y}, data: { type, icon, properties } }`). This causes the UI to render nodes with empty parameter panels. Additionally, credential references from the source n8n instance are not mapped to the tenant's existing credentials.

## Objective
1. Imported n8n workflows render with full node parameters/configuration in the UI
2. Credentials are automatically mapped to the tenant's matching credentials on import
3. Existing mis-imported workflows can be re-imported correctly

## Problem Statement

### Problem 1: Node Format Mismatch
The `POST /api/workflows` endpoint stores `definitionJson` as-is. When a user imports raw n8n JSON, it gets stored in n8n format. But the frontend reads `node.data.properties` (DiagramModel format) for parameter panels. Since n8n nodes have `node.parameters` at the top level (no `data.properties` wrapper), the UI finds nothing to render.

**What n8n JSON stores per node:**
```json
{
  "name": "Create a window",
  "type": "n8n-nodes-base.airtop",
  "typeVersion": 1,
  "position": [672, 352],
  "parameters": { "resource": "window", "sessionId": "={{ $json.data.id }}" },
  "credentials": { "airtopApi": { "id": "YCOWLdSAPov7Hyg1", "name": "Airtop account" } }
}
```

**What the frontend expects (DiagramModel):**
```json
{
  "id": "23fb1a28-cf24-4828-a79a-8941a1798e23",
  "type": "node",
  "position": { "x": 672, "y": 352 },
  "data": {
    "type": "n8n-nodes-base.airtop",
    "icon": "Globe",
    "properties": {
      "label": "Create a window",
      "typeVersion": 1,
      "resource": "window",
      "sessionId": "={{ $json.data.id }}",
      "credentials": { "airtopApi": { "id": "...", "name": "Preston Harris" } }
    }
  }
}
```

### Problem 2: Credential References Not Mapped
Imported nodes reference credential IDs from the source n8n instance (e.g., `"id": "YCOWLdSAPov7Hyg1"`). These IDs don't exist in R360. The system should auto-assign the tenant's first matching credential by type (e.g., find the first `airtopApi` credential the tenant owns).

## Solution Approach

Create a dedicated **import endpoint** (`POST /api/workflows/import`) that:

1. Accepts raw n8n workflow JSON
2. Translates it to DiagramModel format using the existing `translateN8nToWB()` function from `json-translator`
3. Queries the tenant's credentials and auto-maps them by credential type
4. Stores the properly formatted DiagramModel in the database

The frontend import modal will be updated to detect n8n-format JSON and route it through this new endpoint.

## Relevant Files

### Existing Files to Modify

- **`packages/api/src/routes/workflows.ts`** — Add new `POST /api/workflows/import` route that accepts n8n JSON, translates, and auto-maps credentials
- **`packages/json-translator/src/reverse-mapping.ts`** — The `mapN8nToWBNode()` function handles n8n→DiagramModel node conversion. May need minor enhancements for credential passthrough
- **`packages/json-translator/src/index.ts`** — The `translateN8nToWB()` entry point. Verify it handles all fields from real n8n exports (id, credentials, typeVersion)
- **`packages/json-translator/src/node-mapping.ts`** — `mapN8nToWBNode()` implementation. Must ensure `credentials` and `typeVersion` and `id` are carried into `data.properties`
- **`packages/json-translator/src/types.ts`** — Verify `INode` type includes `credentials` and `id` fields
- **`workflowbuilder/apps/frontend/src/app/features/integration/components/import-export/import-modal/import-modal.tsx`** — Update to detect n8n format and call import endpoint
- **`workflowbuilder/apps/frontend/src/api/workflow-api.ts`** — Add `importN8n()` API method
- **`workflowbuilder/apps/frontend/src/app/features/integration/utils/validate-integration-data.ts`** — May need to relax validation for n8n-format imports or skip validation (handled server-side)

### New Files
- **`packages/api/src/services/credential-mapper.ts`** — Service to auto-map n8n credential references to tenant credentials by type

## Implementation Phases

### Phase 1: Foundation — Fix json-translator for Real n8n Exports
The existing `translateN8nToWB()` was built for internal round-trips but may not handle all fields from real n8n export files. Ensure:
- Node `id` from n8n JSON is preserved (used as the WB node `id`)
- Node `credentials` object is carried into `data.properties.credentials`
- Node `typeVersion` is always carried into `data.properties.typeVersion`
- Position `[x, y]` → `{ x, y }` conversion works
- Connection types `main`, `ai_tool`, `ai_languageModel`, `ai_memory` are all handled

### Phase 2: Core Implementation — Import Endpoint + Credential Mapper
- Create `POST /api/workflows/import` that accepts n8n JSON body
- Build credential auto-mapping: query tenant credentials, group by type, substitute first match
- Wire translation + credential mapping together
- Store the resulting DiagramModel in the workflows table

### Phase 3: Integration & Polish — Frontend Import Flow
- Update the import modal to detect n8n-format JSON (top-level `nodes` array with objects containing `parameters`)
- Route n8n imports through the new API endpoint
- Handle the response and load the workflow in the editor
- Ensure re-import of the test workflow works correctly

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- You're responsible for deploying the right team members with the right context to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members to to the building, validating, testing, deploying, and other tasks.
  - This is critical. You're job is to act as a high level director of the team, not a builder.
  - You're role is to validate all work is going well and make sure the team is on track to complete the plan.
  - You'll orchestrate this by using the Task* Tools to manage coordination between the team members.
  - Communication is paramount. You'll use the Task* Tools to communicate with the team members and ensure they're on track to complete the plan.
- Take note of the session id of each team member. This is how you'll reference them.

### Team Members

- Builder
  - Name: translator-fixer
  - Role: Fix json-translator to properly handle real n8n export JSON (node IDs, credentials, typeVersion, all connection types)
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: api-importer
  - Role: Build the import endpoint and credential auto-mapper service in the API package
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: frontend-importer
  - Role: Update the frontend import modal to detect n8n format and route through the import endpoint
  - Agent Type: builder
  - Resume: true

- Validator
  - Name: import-validator
  - Role: Validate the full import flow end-to-end using the real test workflow
  - Agent Type: validator
  - Resume: false

## Step by Step Tasks

### 1. Fix json-translator n8n→WB Node Mapping
- **Task ID**: fix-translator
- **Depends On**: none
- **Assigned To**: translator-fixer
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 2 prep work)
- Read `packages/json-translator/src/reverse-mapping.ts` and `node-mapping.ts`
- Ensure `mapN8nToWBNode()` carries these n8n node fields into the WB node:
  - `node.id` → `wbNode.id` (use the n8n node's UUID or generate one if missing)
  - `node.credentials` → `wbNode.data.properties.credentials`
  - `node.typeVersion` → `wbNode.data.properties.typeVersion` (always, not just when ≠ 1)
  - `node.name` → `wbNode.data.properties.label`
  - `node.parameters.*` → `wbNode.data.properties.*` (already works)
  - `node.disabled` → `wbNode.data.properties.disabled`
- Verify `types.ts` `INode` interface has `id?: string` and `credentials?: Record<string, INodeCredentialDescription>` fields
- Ensure `translateN8nToWB()` in `index.ts` handles the connection types `ai_tool`, `ai_languageModel`, `ai_memory` (not just `main`)
- Verify position conversion: `[x, y]` tuple → `{ x: number, y: number }` object
- Run existing json-translator tests: `pnpm --filter @r360/json-translator test`
- Add a test case using a representative subset of the real n8n export (airtop node with credentials, AI agent node with ai_tool connections)

### 2. Build Credential Auto-Mapper Service
- **Task ID**: credential-mapper
- **Depends On**: none
- **Assigned To**: api-importer
- **Agent Type**: builder
- **Parallel**: true (independent of task 1)
- Create `packages/api/src/services/credential-mapper.ts`
- Implement `autoMapCredentials(nodes: WBNode[], tenantId: string, db): WBNode[]`:
  - Extract all unique credential types from nodes (e.g., `airtopApi`, `openAiApi`)
  - Query `credentials` table for the tenant: `SELECT id, name, type FROM credentials WHERE tenant_id = ? AND type IN (?)`
  - Group tenant credentials by type
  - For each node with credentials, replace each credential reference with the first matching tenant credential of that type: `{ id: tenantCredentialId, name: tenantCredentialName }`
  - If no matching credential exists for a type, leave the reference as-is (or clear it) and include a warning in the response
  - Return the updated nodes array and a list of mapping results (mapped, unmapped types)

### 3. Build Import Workflow Endpoint
- **Task ID**: import-endpoint
- **Depends On**: fix-translator, credential-mapper
- **Assigned To**: api-importer
- **Agent Type**: builder
- **Parallel**: false
- Add `POST /api/workflows/import` route in `packages/api/src/routes/workflows.ts`
- Request body schema: `{ name?: string, n8nWorkflow: object }` where `n8nWorkflow` is the raw n8n export JSON
- Implementation steps:
  1. Parse and validate the n8n JSON (must have `nodes` array)
  2. Call `translateN8nToWB(n8nWorkflow)` to get DiagramModel
  3. Call `autoMapCredentials(diagramModel.diagram.nodes, tenantId, db)` to map credentials
  4. Use `name` from request body (falling back to n8n workflow name)
  5. Store the DiagramModel as `definitionJson` in the workflows table
  6. Return the created workflow with credential mapping results: `{ workflow, credentialMapping: { mapped: [...], unmapped: [...] } }`
- The endpoint must use the same auth middleware as existing workflow routes (`requireAuth`, `requireRole`)

### 4. Update Frontend Import Modal
- **Task ID**: frontend-import
- **Depends On**: import-endpoint
- **Assigned To**: frontend-importer
- **Agent Type**: builder
- **Parallel**: false
- Update `workflowbuilder/apps/frontend/src/api/workflow-api.ts`:
  - Add `importN8n(input: { name?: string, n8nWorkflow: object }): Promise<{ workflow: WorkflowDetail, credentialMapping: object }>`
  - Calls `POST /workflows/import`
- Update `workflowbuilder/apps/frontend/src/app/features/integration/components/import-export/import-modal/import-modal.tsx`:
  - Add detection: if parsed JSON has top-level `nodes` array where items have `parameters` key (n8n format), treat as n8n import
  - For n8n format: call `workflowApi.importN8n()` instead of `setStoreDataFromIntegration()`
  - On success: navigate to the newly created workflow's editor page
  - Show credential mapping results (which credentials were auto-assigned, which are missing)
  - For DiagramModel format: keep existing behavior unchanged
- Update `validate-integration-data.ts` if needed to handle the n8n format detection gracefully

### 5. End-to-End Validation
- **Task ID**: validate-all
- **Depends On**: fix-translator, credential-mapper, import-endpoint, frontend-import
- **Assigned To**: import-validator
- **Agent Type**: validator
- **Parallel**: false
- Re-import the real n8n workflow (`/Users/preston/Downloads/POR Demo AI Automation.json`) through the new endpoint using curl
- Verify the stored workflow in the DB has proper DiagramModel format:
  - All 13 nodes present with `data.properties` containing their parameters
  - All airtop nodes have `data.properties.credentials.airtopApi` pointing to tenant credential `Preston Harris`
  - OpenAI node has `data.properties.credentials.openAiApi` pointing to tenant credential `Preston Harris`
  - Connections preserved including `ai_tool` and `ai_languageModel` types
  - Node positions are `{ x, y }` objects not `[x, y]` arrays
- Verify all existing json-translator tests still pass
- Verify all existing API tests still pass
- Check that opening the imported workflow in the frontend shows nodes with full parameter panels

## Acceptance Criteria

1. Importing the `POR Demo AI Automation.json` via `POST /api/workflows/import` produces a workflow where all 13 nodes have their full parameters visible in the UI
2. Airtop nodes are auto-assigned the tenant's `airtopApi` credential ("Preston Harris")
3. OpenAI node is auto-assigned the tenant's `openAiApi` credential ("Preston Harris")
4. The import response includes credential mapping results showing which credentials were mapped
5. Existing workflow create/edit functionality is unchanged (no regressions)
6. The frontend import modal correctly detects n8n-format JSON and routes through the import endpoint
7. All existing tests pass (`pnpm --filter @r360/json-translator test`, `pnpm --filter @r360/api test`)

## Validation Commands

```bash
# Run json-translator tests
pnpm --filter @r360/json-translator test

# Run API tests
pnpm --filter @r360/api test

# Test the import endpoint with the real workflow
TOKEN=$(curl -s -X POST http://localhost:3100/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@r360.dev","password":"admin"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s -X POST http://localhost:3100/api/workflows/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"name\": \"POR Demo AI Automation\", \"n8nWorkflow\": $(cat '/Users/preston/Downloads/POR Demo AI Automation.json')}" | python3 -m json.tool

# Verify the imported workflow has proper DiagramModel format
curl -s http://localhost:3100/api/workflows \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Verify credential mapping on a specific node
# (check that airtopApi credentials point to the tenant's credential ID, not the source n8n ID)
```

## Notes

- The `translateN8nToWB()` function in json-translator was originally built for internal round-trip testing. It needs hardening for real-world n8n exports which may include fields not present in synthetic test data.
- The n8n export includes `pinData` (cached test results) and `meta` fields that can be safely ignored during import.
- Some n8n nodes in the export use `@n8n/n8n-nodes-langchain.*` types (AI Agent, OpenAI Chat Model). The reverse-mapping icon map and trigger detection need to handle these prefixed types.
- The credential auto-mapper should be a reusable service since it may be needed for bulk imports or API-driven imports in the future.
- The existing "import-test-1" workflow in the DB is malformed and can be deleted or re-imported through the new endpoint.

# Plan: Converge Vue Frontend on n8n Editor Feature Parity

## Task Description

The R360 Flow Vue frontend (`workflowbuilder/apps/frontend-v2/`) has multiple critical issues and missing features compared to the n8n workflow editor. This plan addresses:

1. **Broken connections on loaded workflows** - Existing workflow nodes can't be connected; only new nodes work
2. **401 auth errors** - CredentialSelector makes unauthenticated fetch calls
3. **500 error on credential creation** - Token mismatch + missing error handling
4. **No "Execute Workflow" button** - Backend endpoint exists but frontend doesn't call it
5. **Missing node icons** - Using emoji fallbacks instead of real n8n SVG icons
6. **Agent node missing special connectors** - AI nodes (Chat Model, Memory, Tool) need typed connection support
7. **UI divergence from n8n** - Node rendering, edge styling, and layout don't match n8n's editor

## Objective

When this plan is complete, the R360 Flow workflow editor will:
- Load existing workflows with working connections between all nodes
- Use real n8n node icons (SVGs) instead of emoji placeholders
- Support AI/Agent node special connection types (Chat Model, Memory, Tool, Output Parser)
- Have a working "Execute Workflow" button with live status polling
- Have no auth errors when fetching credentials or creating them
- Visually converge toward n8n's editor appearance (node shapes, edge styles, colors)

## Problem Statement

The screenshots reveal major divergence between n8n's editor and ours:

**n8n editor shows:**
- Proper node icons (globe for HTTP, custom logos for Airtop, robot for Agent)
- Agent node with labeled sub-inputs (Chat Model, Memory, Tool) below the main flow
- Colored connections (green for triggers, dashed for AI connections)
- Connected edges between all nodes
- "Execute workflow" button at bottom center
- Data count badges on edges ("1 item")
- Node subtitle showing operation type

**Our editor shows:**
- Emoji icons or generic gear icons
- Agent node as a plain box with no special connectors
- Dashed/disconnected edges (handles don't match on loaded workflows)
- No execute button
- No data badges or operation subtitles
- All nodes look identical (same shape, same styling)

## Solution Approach

Seven focused work streams, prioritized by user impact:

1. **Fix handle ID indexing** (Critical) - Off-by-one error: edges use 0-indexed handles but CanvasNode generates 1-indexed handles
2. **Fix auth token flow** (Critical) - CredentialSelector uses raw fetch; demo-token vs dev-token mismatch
3. **Add "Execute Workflow"** (High) - Wire frontend to existing `POST /api/workflows/:id/execute` endpoint
4. **Serve and render n8n node icons** (High) - Add icon-serving API route + resolve `file:` and `iconUrl` in CanvasNode
5. **Support AI/Agent typed connections** (High) - Parse `inputs`/`outputs` for `ai_*` types, render labeled sub-handles
6. **Improve node rendering** (Medium) - Node subtitles, operation labels, colored borders, proper sizing
7. **Improve edge rendering** (Medium) - Connected/animated edges, data badges, AI connection styling

## Relevant Files

### Backend (API Server)
- `packages/api/src/routes/n8n-compat.ts` - n8n-compat API routes; needs icon-serving route
- `packages/api/src/routes/credentials.ts` - Credential CRUD; needs error handling improvement
- `packages/api/src/routes/executions.ts` - Execution routes; has `POST /workflows/:id/execute` already
- `packages/api/src/server.ts` - Auth middleware, CORS, route registration
- `packages/api/src/services/execution-bridge.ts` - Execution bridge (complete)
- `packages/execution-engine/src/node-types.ts` - R360NodeTypes with LazyPackageDirectoryLoader

### Frontend (Vue)
- `workflowbuilder/apps/frontend-v2/src/stores/use-workflow-editor-store.ts` - Workflow conversion (handle ID bug)
- `workflowbuilder/apps/frontend-v2/src/editor/components/CanvasNode.vue` - Node rendering (needs icons + AI handles)
- `workflowbuilder/apps/frontend-v2/src/editor/components/CanvasEdge.vue` - Edge rendering (needs AI styling)
- `workflowbuilder/apps/frontend-v2/src/editor/components/EditorCanvas.vue` - Canvas (needs AI connection support)
- `workflowbuilder/apps/frontend-v2/src/editor/components/CanvasControls.vue` - Toolbar (needs Execute button)
- `workflowbuilder/apps/frontend-v2/src/editor/components/CredentialSelector.vue` - Broken auth (raw fetch)
- `workflowbuilder/apps/frontend-v2/src/editor/components/PropertiesPanel.vue` - Properties panel
- `workflowbuilder/apps/frontend-v2/src/editor/WorkflowEditorPage.vue` - Main editor orchestration
- `workflowbuilder/apps/frontend-v2/src/stores/use-node-types-store.ts` - Node type metadata
- `workflowbuilder/apps/frontend-v2/src/auth/use-auth.ts` - Auth composable (token mismatch)
- `workflowbuilder/apps/frontend-v2/src/api/execution-api.ts` - Needs `execute()` method

### n8n Reference (Read-Only)
- `n8n/packages/frontend/editor-ui/src/app/utils/nodeIcon.ts` - Icon resolution logic
- `n8n/packages/workflow/src/interfaces.ts` - INodeTypeDescription, NodeConnectionType definitions
- `n8n/packages/@n8n/nodes-langchain/nodes/agents/Agent/Agent.node.ts` - Agent node with AI inputs
- `n8n/packages/core/src/nodes-loader/directory-loader.ts` - iconBasePath assignment

### New Files
- `packages/api/src/routes/icon-routes.ts` - Static icon file serving route
- `workflowbuilder/apps/frontend-v2/src/editor/components/NodeIcon.vue` - Icon resolver component
- `workflowbuilder/apps/frontend-v2/src/editor/components/ExecutionPanel.vue` - Execution status panel

## Implementation Phases

### Phase 1: Critical Fixes (Tasks 1-3)
Fix the three blocking bugs: handle indexing, auth tokens, credential errors. These must be fixed first because they prevent basic usage.

### Phase 2: Execution & Icons (Tasks 4-6)
Add the Execute button, serve real n8n icons, and build the icon resolution component. These are high-visibility features that dramatically improve the user experience.

### Phase 3: AI Node Support (Tasks 7-8)
Parse AI connection types from node descriptions and render them as labeled sub-handles on Agent and AI nodes. This is what makes the Agent node look correct.

### Phase 4: Visual Polish (Tasks 9-10)
Improve node rendering (subtitles, colors, sizing) and edge rendering (styles, badges) to converge on n8n's visual language.

### Phase 5: Validation (Task 11)
End-to-end testing of all fixes and features.

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use Task tools to deploy team members.
- Take note of the session id of each team member for resumption.

### Team Members

- Builder
  - Name: fix-builder
  - Role: Fix critical bugs (handle IDs, auth, credentials)
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: execution-builder
  - Role: Build Execute Workflow feature and execution panel
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: icon-builder
  - Role: Serve n8n icons via API and render them in CanvasNode
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: ai-node-builder
  - Role: Implement AI/Agent typed connections and special handles
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: polish-builder
  - Role: Visual improvements to nodes and edges
  - Agent Type: builder
  - Resume: true

- Validator
  - Name: final-validator
  - Role: Validate all acceptance criteria, run tests, verify in browser
  - Agent Type: validator
  - Resume: false

## Step by Step Tasks

### 1. Fix Handle ID Indexing on Loaded Workflows
- **Task ID**: fix-handle-ids
- **Depends On**: none
- **Assigned To**: fix-builder
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 2)
- In `workflowbuilder/apps/frontend-v2/src/stores/use-workflow-editor-store.ts`, fix the `n8nToVueFlowEdges()` function:
  - Change `sourceHandle: \`output-${outputIdx}\`` to `sourceHandle: \`output-${outputIdx + 1}\``
  - Change `targetHandle: \`input-${target.index}\`` to `targetHandle: \`input-${target.index + 1}\``
- Also fix the reverse conversion in `vueFlowToN8n()` (if it exists) to subtract 1 when converting back
- In the `n8nToVueFlowNodes()` function, ensure `data.inputs` and `data.outputs` counts match the actual number of inputs/outputs from the node type description (not hardcoded to 1)
- For AI nodes, count `main` inputs separately from `ai_*` inputs
- Run tests after fix: `cd workflowbuilder/apps/frontend-v2 && pnpm test`
- Verify by loading an existing workflow and confirming edges connect properly

### 2. Fix Auth Token Mismatch and CredentialSelector Auth
- **Task ID**: fix-auth-tokens
- **Depends On**: none
- **Assigned To**: fix-builder
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 1)
- Fix `workflowbuilder/apps/frontend-v2/src/auth/use-auth.ts`:
  - In `loginDemo()`, change token from `'demo-token'` to `'dev-token-demo'` so it matches the backend's `dev-token-*` pattern
  - The backend auth middleware (`packages/api/src/middleware/auth.ts`) checks for `dev-token-` prefix
- Fix `workflowbuilder/apps/frontend-v2/src/editor/components/CredentialSelector.vue`:
  - Replace the raw `fetch()` call with proper API client usage
  - Accept an API client instance via props or create one using `useAuth()` token
  - Pattern: use `createApiClient()` + `createCredentialApi()` like CredentialsPage.vue does
- Fix `packages/api/src/routes/credentials.ts`:
  - Wrap the POST handler's `encryptCredentialData()` and DB insert in try-catch
  - Return 400/422 with descriptive error instead of letting it throw 500

### 3. Fix Credential Creation Error Handling
- **Task ID**: fix-credential-creation
- **Depends On**: fix-auth-tokens
- **Assigned To**: fix-builder
- **Agent Type**: builder
- **Parallel**: false
- In `packages/api/src/routes/credentials.ts` POST handler:
  - Add try-catch around `encryptCredentialData()` call
  - Validate required fields before DB insert
  - Return structured error responses (400 for validation, 500 with message for internal)
- Test by creating a credential from the CredentialsPage after logging in with demo user

### 4. Add "Execute Workflow" Button and API Call
- **Task ID**: add-execute-button
- **Depends On**: fix-auth-tokens
- **Assigned To**: execution-builder
- **Agent Type**: builder
- **Parallel**: true
- Add `execute(workflowId: string, inputData?: Record<string, unknown>)` method to `src/api/execution-api.ts`:
  ```typescript
  execute(workflowId: string, inputData?: Record<string, unknown>): Promise<{ id: string }> {
    return client.post(`/workflows/${workflowId}/execute`, { inputData });
  }
  ```
- Add an "Execute Workflow" button to `src/editor/components/CanvasControls.vue`:
  - Red/orange button (matching n8n's style) at the right side of toolbar or bottom center
  - Emits `execute` event
  - Disabled when workflow hasn't been saved yet (workflowId is null)
  - Shows "Executing..." state while running
- In `WorkflowEditorPage.vue`:
  - Handle the execute event: save first if dirty, then call `executionApi.execute(workflowId)`
  - After triggering, show execution status panel or navigate to execution detail
  - Poll `GET /api/executions/:id` every 2 seconds until status is terminal
- Create `src/editor/components/ExecutionPanel.vue`:
  - Bottom panel or overlay showing execution progress
  - Shows status (pending, running, success, failed)
  - Shows step-by-step progress as nodes execute
  - Shows error messages for failed steps
  - "View Full Details" link to execution detail page

### 5. Add Icon-Serving API Route
- **Task ID**: add-icon-route
- **Depends On**: none
- **Assigned To**: icon-builder
- **Agent Type**: builder
- **Parallel**: true
- Create `packages/api/src/routes/icon-routes.ts`:
  - Route: `GET /api/icons/:packageName/*`
  - Resolve icon file path using the installed n8n-nodes-base package directory
  - Use `node_modules/n8n-nodes-base/` as the base directory for `n8n-nodes-base` package
  - Also support `@n8n/n8n-nodes-langchain` package
  - Validate the resolved path is within the package directory (prevent path traversal)
  - Serve the file with appropriate Content-Type (image/svg+xml or image/png)
  - Add cache headers (max-age: 86400)
- Register the route in `packages/api/src/server.ts`
- Test: `curl http://localhost:3100/api/icons/n8n-nodes-base/nodes/HttpRequest/httpRequest.svg` should return SVG

### 6. Build NodeIcon Component and Render Real Icons
- **Task ID**: render-node-icons
- **Depends On**: add-icon-route
- **Assigned To**: icon-builder
- **Agent Type**: builder
- **Parallel**: false
- Create `workflowbuilder/apps/frontend-v2/src/editor/components/NodeIcon.vue`:
  - Props: `icon` (string|object), `iconUrl` (string), `iconBasePath` (string), `size` (number, default 28)
  - Resolution logic (matching n8n's `getNodeIconSource()`):
    1. If `iconUrl` exists: render `<img :src="'/api' + iconUrl">` (prefix with API base)
    2. If `icon` starts with `file:`: extract filename, render `<img :src="'/api/' + iconBasePath + '/' + filename">`
    3. If `icon` starts with `fa:`: render a FontAwesome-style icon (or a simple SVG fallback)
    4. If `icon` starts with `icon:`: render from a minimal icon set
    5. Fallback: render a default node icon
  - Handle themed icons (object with light/dark keys)
  - Show loading placeholder while image loads
  - Show fallback icon on image error
- Update `src/editor/components/CanvasNode.vue`:
  - Replace the emoji mapping with `<NodeIcon>` component
  - Pass `icon`, `iconUrl`, `iconBasePath` from node type description through node data
- Update `src/stores/use-workflow-editor-store.ts`:
  - When converting n8n nodes to VueFlow nodes, include `icon`, `iconUrl`, `iconBasePath` from the nodeTypes store lookup
- Update `src/stores/use-node-types-store.ts`:
  - Ensure `icon`, `iconUrl`, `iconBasePath` are part of the `NodeTypeDescription` interface
- Update `src/editor/components/NodePalette.vue`:
  - Use `<NodeIcon>` for palette items too

### 7. Parse AI Connection Types from Node Descriptions
- **Task ID**: parse-ai-connections
- **Depends On**: none
- **Assigned To**: ai-node-builder
- **Agent Type**: builder
- **Parallel**: true
- Update `src/stores/use-node-types-store.ts`:
  - Add a helper `getNodeInputs(nodeType)` that parses the `inputs` field:
    - If `inputs` is a string array: `['main']` -> 1 main input
    - If `inputs` is an object array: parse `{ type: 'ai_languageModel', displayName: 'Chat Model' }` etc.
    - If `inputs` is an expression string (Agent node): provide a default fallback for known agent types
  - Same for `getNodeOutputs(nodeType)`
  - Return structured data: `{ main: number, ai: Array<{ type: string, displayName: string, required: boolean }> }`
- Update `src/stores/use-workflow-editor-store.ts`:
  - In `n8nToVueFlowNodes()`, when creating VueFlow node data, include:
    - `mainInputs`: count of 'main' type inputs
    - `mainOutputs`: count of 'main' type outputs
    - `aiInputs`: array of `{ type, displayName, required }` for AI-specific inputs
    - `aiOutputs`: similar for outputs
  - In `n8nToVueFlowEdges()`, handle non-main connection types:
    - n8n connections object has keys per source node, each with typed outputs (not just `main`)
    - AI connections use types like `ai_languageModel`, `ai_memory`, `ai_tool`
    - Generate correct handle IDs for AI connections (e.g., `ai_tool-1`, `ai_memory-1`)

### 8. Render AI/Agent Special Handles on CanvasNode
- **Task ID**: render-ai-handles
- **Depends On**: parse-ai-connections
- **Assigned To**: ai-node-builder
- **Agent Type**: builder
- **Parallel**: false
- Update `src/editor/components/CanvasNode.vue`:
  - In addition to main input/output handles (left/right), render AI handles at the **bottom** of the node
  - Each AI input renders as a labeled handle below the node:
    - Small diamond or circle connector
    - Label below: "Chat Model", "Memory", "Tool", etc.
    - Use `Position.Bottom` for handle placement
    - Handle ID format: `${type}-${index}` (e.g., `ai_languageModel-1`, `ai_tool-1`)
  - Required AI inputs get a different styling (solid vs hollow)
  - Tool inputs allow multiple connections (no maxConnections limit by default)
  - Agent node gets a wider card to accommodate labels
- Update `src/editor/components/CanvasEdge.vue`:
  - AI connection edges use dashed lines (matching n8n screenshot)
  - Different color for AI edges (muted purple or gray)
  - Curved bezier paths for bottom-connected AI edges
- Update `src/editor/components/EditorCanvas.vue`:
  - Register a connection validation function that checks if source/target handle types are compatible
  - `ai_languageModel` output can only connect to `ai_languageModel` input, etc.
  - `isValidConnection` callback on VueFlow

### 9. Improve Node Visual Rendering
- **Task ID**: improve-node-visuals
- **Depends On**: render-node-icons, render-ai-handles
- **Assigned To**: polish-builder
- **Agent Type**: builder
- **Parallel**: true
- Update `src/editor/components/CanvasNode.vue`:
  - Add node subtitle showing operation type (e.g., "create: window", "fill: interaction", "POST: https://...")
    - Extract from node parameters: look for `operation`, `resource`, `url` fields
  - Left border color based on node category/type:
    - Trigger nodes: green left border (as n8n shows)
    - HTTP Request: blue
    - AI nodes: purple/gray
    - Default: neutral gray
  - Proper node sizing: min-width based on label length, fixed height
  - Handle count indicator (small dots on edges showing handle positions)
  - Selected node: blue border + subtle shadow (matching n8n's blue outline)
- Style the trigger node with the distinctive n8n trigger shape (hexagonal left edge or green accent)
- Add the "+" button at the end of the last node in a chain (like n8n shows)

### 10. Improve Edge Rendering and Data Badges
- **Task ID**: improve-edge-visuals
- **Depends On**: fix-handle-ids
- **Assigned To**: polish-builder
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 9)
- Update `src/editor/components/CanvasEdge.vue`:
  - Default edges: solid gray line with arrow marker (currently working)
  - Execution data badge: after a workflow runs, show "N items" badge on each edge
    - This requires execution step output data
    - Badge is a small rounded rect centered on the edge path
  - AI/sub-node edges: dashed line, muted color
  - Animated edges during execution: flowing dot animation along the path
  - Hover state: thicker line + brighter color
- Consider using VueFlow's `EdgeLabelRenderer` for data badges

### 11. Final Validation
- **Task ID**: validate-all
- **Depends On**: fix-handle-ids, fix-auth-tokens, fix-credential-creation, add-execute-button, render-node-icons, render-ai-handles, improve-node-visuals, improve-edge-visuals
- **Assigned To**: final-validator
- **Agent Type**: validator
- **Parallel**: false
- Run all unit tests: `cd workflowbuilder/apps/frontend-v2 && pnpm test`
- Run build: `cd workflowbuilder/apps/frontend-v2 && pnpm build`
- Verify in browser:
  - Load an existing workflow -> all edges connected
  - Click nodes -> handles allow new connections
  - Create a new credential -> no errors
  - CredentialSelector in node properties -> loads credentials
  - Execute a workflow -> shows execution status
  - Node icons are real SVGs (not emojis)
  - Agent node shows Chat Model/Memory/Tool sub-handles
  - AI connections render with dashed lines
  - Node subtitles show operation info
- Compare screenshots with n8n editor for visual convergence

## Acceptance Criteria

### Critical Fixes
- [ ] Existing workflow edges render correctly (all nodes connected)
- [ ] New connections can be made to/from loaded nodes
- [ ] CredentialSelector fetches credentials without 401 error
- [ ] Credential creation succeeds without 500 error
- [ ] Demo login token is recognized by backend auth middleware

### Execute Workflow
- [ ] "Execute Workflow" button visible in editor toolbar
- [ ] Clicking execute saves workflow first, then triggers execution via API
- [ ] Execution status panel shows progress (pending -> running -> success/failed)
- [ ] Failed execution shows error message
- [ ] Execute button disabled for unsaved new workflows

### Node Icons
- [ ] API serves icon SVGs from n8n-nodes-base package at `/api/icons/`
- [ ] CanvasNode renders real SVG icons (not emojis) for nodes with `file:` icons
- [ ] FontAwesome icons (e.g., `fa:robot` for Agent) render correctly
- [ ] Fallback icon shown for nodes without recognized icon format
- [ ] NodePalette also shows real icons

### AI/Agent Node Support
- [ ] Agent node renders special AI input handles below the node
- [ ] AI handles are labeled (Chat Model, Memory, Tool, Output Parser)
- [ ] AI connections render as dashed lines
- [ ] Connections validate type compatibility (can't connect Tool output to Memory input)
- [ ] Loading existing workflows with AI nodes correctly displays all AI connections

### Visual Improvements
- [ ] Nodes show subtitle with operation info
- [ ] Trigger nodes have distinctive green left border
- [ ] Selected nodes have blue border highlight
- [ ] Edge hover state is visually distinct
- [ ] Overall appearance is closer to n8n's editor

## Validation Commands

```bash
# Unit tests
cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/frontend-v2 && pnpm test

# Build
cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/frontend-v2 && pnpm build

# Icon route test (requires API server running)
curl -s http://localhost:3100/api/icons/n8n-nodes-base/nodes/HttpRequest/httpRequest.svg | head -5

# Execute endpoint test (requires API server running)
curl -s -X POST http://localhost:3100/api/workflows/test-id/execute \
  -H "Authorization: Bearer dev-token-demo" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: demo-tenant" \
  -d '{}' | head -5

# Verify key files exist
for f in \
  workflowbuilder/apps/frontend-v2/src/editor/components/NodeIcon.vue \
  workflowbuilder/apps/frontend-v2/src/editor/components/ExecutionPanel.vue \
  packages/api/src/routes/icon-routes.ts; do
  test -f "$f" && echo "PASS: $f" || echo "FAIL: $f"
done
```

## Notes

### Key Architectural Decisions

1. **Icon serving**: We serve icons from the installed npm package (`node_modules/n8n-nodes-base/`) rather than copying them. This ensures icons stay in sync with node versions.

2. **AI connection types**: We parse the `inputs`/`outputs` arrays from node type descriptions. For the Agent node, which uses dynamic expressions for inputs, we provide a static fallback mapping of known agent variants to their input types.

3. **Execution**: We use the existing `POST /api/workflows/:id/execute` endpoint (already built in Phase 7). The frontend polls for status rather than using WebSockets (simpler, WebSocket support can be added later).

4. **Cardinal Rule**: All n8n packages remain unmodified npm dependencies. We resolve icons from the installed package directory. We parse node type descriptions as-is from the n8n API response.

### Dependency Graph

```
Task 1 (fix handles) ----+
Task 2 (fix auth) -------+-> Task 3 (fix credentials) -> Task 4 (execute)
Task 5 (icon API) --------> Task 6 (render icons) ------+
Task 7 (parse AI) --------> Task 8 (render AI handles) -+-> Task 9 (node visuals)
Task 1 (fix handles) -----> Task 10 (edge visuals) -----+-> Task 11 (validate)
```

### Parallelism

- Tasks 1, 2, 5, 7 can all start immediately in parallel
- Task 3 waits for 2
- Task 4 waits for 2
- Task 6 waits for 5
- Task 8 waits for 7
- Tasks 9 and 10 wait for their respective predecessors
- Task 11 waits for everything

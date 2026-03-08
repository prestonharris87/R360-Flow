# Plan: Replace Frontend Palette with Real n8n Nodes + Rich Property Panels

## Task Description
The Workflow Builder frontend has 7 hardcoded demo nodes (trigger, action, delay, conditional, decision, notification, AI agent) that are **100% fake** — they have zero connection to n8n execution. Meanwhile, the backend loads 400+ real n8n nodes from `n8n-nodes-base` and serves them through `GET /api/nodes`, but the conversion discards 81% of n8n's property metadata (displayOptions, required, descriptions, typeOptions, collections). This plan removes the fake nodes, replaces them with all real n8n nodes, and enriches the backend schema conversion so the frontend property panels show rich, functional forms with conditional visibility, required fields, help text, and nested properties.

## Objective
When a user opens the Workflow Builder at localhost:4200:
1. The Nodes Library shows ONLY real n8n nodes (300+), grouped by category
2. Selecting a node on the canvas opens a Properties panel with a rich form — conditional fields (show body only when method=POST), required field markers, help text, dropdown options, and nested object properties
3. All nodes use real n8n type names (`n8n-nodes-base.httpRequest`, `n8n-nodes-base.if`, etc.) so they can execute through the engine

## Problem Statement

### Fake Frontend Nodes
The 7 hardcoded nodes use type names like `'trigger'`, `'action'`, `'conditional'` which don't match any n8n node type. The execution engine expects `n8n-nodes-base.*` types. These nodes:
- Cannot be executed — the engine rejects unknown types
- Have no translation to n8n — `json-translator` only handles real n8n type names
- Exist purely as UI demos with manually crafted schemas

### Shallow API Schema Conversion
`node-palette.ts` converts n8n's `INodeProperties` (27 fields) to `FieldSchema` using only ~5 fields (18%). Critical losses:

| Lost Feature | Impact |
|---|---|
| `displayOptions` | Can't hide/show fields dynamically (e.g., show body only when method=POST) |
| `required` | No required field validation in forms |
| `description` / `hint` | No help text next to fields |
| `typeOptions` | No code editors, password masking, min/max values, textarea sizing |
| Collection `values` | Nested property structures collapsed to empty `{}` |
| Option `description` | No help text per dropdown option |

### Frontend Already Supports Rich Schemas
The JSON Forms engine supports `allOf` with `if-then-else` for conditional visibility, `required[]` arrays, Accordion/Group layouts, and multiple control types. The infrastructure exists — we just need to populate it.

## Solution Approach

### Two-Part Fix

**Part A — Enrich Backend Conversion** (`node-palette.ts`):
- Convert `displayOptions` → JSON Schema `allOf` with `if-then-else` rules
- Preserve `required` fields in `NodeSchema.required[]`
- Include `description` in every `FieldSchema`
- Handle `typeOptions`: password → inputType, minValue/maxValue → constraints, rows → textarea sizing
- Recurse into `collection`/`fixedCollection` `values` → nested `FieldSchema` properties
- Auto-generate basic `UISchema` with Accordion grouping based on displayOptions context

**Part B — Replace Frontend Palette** (frontend):
- Remove all 7 fake node definitions
- Replace `getPaletteData()` with async `fetch('/api/nodes')`
- Map API response → frontend `PaletteItem` type (icon, templateType)
- Group nodes by category using `PaletteGroup` accordion UI
- Make `/api/nodes` public (skip JWT auth)

### Architecture
```
Frontend (port 4200)                    API (port 3100)
   PaletteContainer                        GET /api/nodes (public)
     └─ fetchData()                          └─ buildNodePalette()
          └─ fetch('/api/nodes')                  └─ R360NodeTypes (n8n-nodes-base)
          └─ mapApiNodesToPalette()                └─ ENRICHED convertToPaletteItem()
          └─ groupByCategory()                         ├─ displayOptions → allOf
                                                       ├─ required fields
   PropertiesPanel                                     ├─ descriptions/hints
     └─ JSONForm(schema, uischema)                     ├─ typeOptions → constraints
          └─ Renders conditional fields                └─ collections → nested schemas
          └─ Shows required markers
          └─ Displays help text
```

## Relevant Files

### Backend — Schema Conversion (MAJOR CHANGES)
- `packages/execution-engine/src/node-palette.ts` — **REWRITE** `convertToPaletteItem()` and `convertN8nPropertiesToSchema()` to preserve rich metadata. This is the heart of the plan.
- `packages/execution-engine/src/node-types.ts` — Provides `INodeTypeDescription[]`; no changes needed
- `packages/execution-engine/src/__tests__/node-palette.test.ts` — Update tests for enriched schema output

### Backend — API
- `packages/api/src/server.ts` — Add `/api/nodes` to auth skip list (line ~472)
- `packages/api/src/routes/nodes.ts` — No changes needed (already serves enriched data)

### Frontend — Palette Replacement (MAJOR CHANGES)
- `workflowbuilder/apps/frontend/src/app/data/palette.ts` — **REPLACE** hardcoded nodes with API fetch
- `workflowbuilder/apps/frontend/src/app/store/slices/palette/palette-slice.ts` — **REWRITE** `fetchData()` to be async, fetch from API, map types, group by category
- `workflowbuilder/apps/frontend/src/app/data/nodes/` — **DELETE** entire directory (7 fake node definitions)

### Frontend — Type Mapping (NEW)
- `workflowbuilder/apps/frontend/src/app/data/n8n-node-mapper.ts` — **NEW** Maps API `N8nPaletteItem` → frontend `PaletteItem` (icon resolution, templateType mapping, category grouping)

### Frontend — Types (MINOR CHANGES)
- `workflowbuilder/apps/types/src/node-schema.ts` — May need `description` field added to `BaseFieldSchema` if not already there
- `workflowbuilder/apps/types/src/common.ts` — No changes (already supports `PaletteGroup`)

### Frontend — Existing (NO CHANGES)
- `workflowbuilder/apps/frontend/src/app/features/palette/components/items/palette-items.tsx` — Already handles `PaletteGroup` accordion
- `workflowbuilder/apps/frontend/src/app/features/palette/palette-container.tsx` — Already calls `fetchData()` on mount
- `workflowbuilder/apps/frontend/src/app/features/json-form/` — Already supports `allOf`, `if-then-else`, `required`, text/select/switch/textarea/accordion renderers
- `workflowbuilder/apps/frontend/src/app/features/palette/node-preview-container.tsx` — Falls back to `NodeType.Node` template for unknown templateTypes (works for n8n nodes)

### Reference (READ ONLY)
- `node_modules/n8n-workflow/dist/Interfaces.d.ts` — `INodeProperties`, `IDisplayOptions`, `INodePropertyTypeOptions`
- `node_modules/n8n-nodes-base/dist/nodes/` — Real node descriptions for testing

## Implementation Phases

### Phase 1: Foundation — Enrich Backend Schema Conversion
Rewrite `node-palette.ts` to produce rich schemas from n8n metadata. This is the critical path — everything downstream depends on schema quality.

### Phase 2: Core Implementation — Replace Frontend Palette
Remove fake nodes, wire up API fetching, map types, group by category. The enriched schemas from Phase 1 flow through automatically.

### Phase 3: Integration & Polish — Browser Verification
Start both servers, verify palette shows 300+ real nodes, property panels show conditional fields, required markers, and help text.

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members.

### Team Members

- Builder
  - Name: schema-enricher
  - Role: Rewrite node-palette.ts to produce rich schemas with displayOptions → allOf, required, descriptions, typeOptions, nested collections
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: frontend-wirer
  - Role: Remove fake nodes, create n8n-node-mapper.ts, update palette-slice.ts to fetch from API, make /api/nodes public
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: server-runner
  - Role: Build, restart servers, and verify via browser MCP
  - Agent Type: general-purpose
  - Resume: true

- Validator
  - Name: final-validator
  - Role: Validate all acceptance criteria via browser MCP and curl
  - Agent Type: validator
  - Resume: false

## Step by Step Tasks

### 1. Enrich convertN8nPropertiesToSchema — displayOptions → allOf
- **Task ID**: enrich-display-options
- **Depends On**: none
- **Assigned To**: schema-enricher
- **Agent Type**: builder
- **Parallel**: true
- Edit `packages/execution-engine/src/node-palette.ts`
- Read the n8n `INodeProperties` interface from `node_modules/n8n-workflow/dist/Interfaces.d.ts` to understand `displayOptions` shape
- Rewrite `convertN8nPropertiesToSchema()` to:

**a) Separate static vs conditional properties:**
```typescript
// Properties WITHOUT displayOptions go into schema.properties directly
// Properties WITH displayOptions go into schema.allOf as if-then-else rules
```

**b) Convert displayOptions.show → if-then-else:**
```typescript
// n8n: { displayOptions: { show: { method: ['POST', 'PUT'] } } }
// → JSON Schema:
// allOf: [{
//   if: { properties: { method: { enum: ['POST', 'PUT'] } } },
//   then: { properties: { body: { type: 'string', label: 'Body' } } }
// }]
```

**c) Convert displayOptions.hide → if-then-else with negation:**
```typescript
// n8n: { displayOptions: { hide: { method: ['GET'] } } }
// → JSON Schema:
// allOf: [{
//   if: { properties: { method: { not: { enum: ['GET'] } } } },
//   then: { properties: { body: { type: 'string', label: 'Body' } } }
// }]
```

**d) Group related conditional properties:**
When multiple properties share the same displayOptions condition, group them into a single `allOf` entry with combined `then.properties`.

### 2. Enrich Schema — Required Fields, Descriptions, TypeOptions
- **Task ID**: enrich-metadata
- **Depends On**: enrich-display-options
- **Assigned To**: schema-enricher (resume)
- **Agent Type**: builder
- **Parallel**: false
- Continue editing `packages/execution-engine/src/node-palette.ts`

**a) Required fields:**
- Collect property names where `prop.required === true`
- Add to `NodeSchema.required` array
- Update the `NodeSchema` interface to include `required?: string[]` if not present

**b) Descriptions on every field:**
- Add `description` to `FieldSchema` interface: `description?: string`
- In `convertPropertyToField()`, include `description: prop.description`
- Also check if `workflowbuilder/apps/types/src/node-schema.ts` `BaseFieldSchema` already has `description` — if not, the frontend type needs updating too (but check first)

**c) TypeOptions handling in `convertPropertyToField()`:**
```typescript
// Password fields
if (prop.typeOptions?.password) {
  fieldSchema.format = 'password';  // or a custom field
}

// Number constraints
if (prop.type === 'number') {
  if (prop.typeOptions?.minValue !== undefined) fieldSchema.minimum = prop.typeOptions.minValue;
  if (prop.typeOptions?.maxValue !== undefined) fieldSchema.maximum = prop.typeOptions.maxValue;
}

// Textarea (string with rows)
if (prop.typeOptions?.rows) {
  fieldSchema.rows = prop.typeOptions.rows;  // frontend TextArea renderer can use this
}
```

**d) Recurse into collections/fixedCollections:**
```typescript
case 'collection':
case 'fixedCollection':
  const nestedProps: NodePropertiesSchema = {};
  for (const opt of prop.options || []) {
    if ('value' in opt) continue; // skip simple options
    if ('values' in opt) {
      // INodePropertyCollection — has nested INodeProperties[]
      for (const nestedProp of opt.values) {
        const nestedField = convertPropertyToField(nestedProp);
        if (nestedField) nestedProps[nestedProp.name] = nestedField;
      }
    } else if ('name' in opt && 'type' in opt) {
      // INodeProperties directly in options array
      const nestedField = convertPropertyToField(opt as INodeProperties);
      if (nestedField) nestedProps[opt.name] = nestedField;
    }
  }
  return { type: 'object', label: prop.displayName, description: prop.description, properties: nestedProps };
```

**e) Handle more types:**
```typescript
case 'json':
  return { type: 'string', label: prop.displayName, description: prop.description, format: 'json' };
case 'dateTime':
  return { type: 'string', label: prop.displayName, description: prop.description, format: 'date-time' };
case 'color':
  return { type: 'string', label: prop.displayName, description: prop.description, format: 'color' };
case 'notice':
  return null;  // Skip notice properties (informational only)
case 'resourceLocator':
  return { type: 'string', label: prop.displayName, description: prop.description, placeholder: prop.placeholder };
```

### 3. Update N8nPaletteItem Interface
- **Task ID**: update-palette-types
- **Depends On**: enrich-metadata
- **Assigned To**: schema-enricher (resume)
- **Agent Type**: builder
- **Parallel**: false
- Update the `N8nPaletteItem` interface in `node-palette.ts`:
  - `schema` should now include `required?: string[]` and `allOf?: IfThenElseSchema[]`
- Update the `FieldSchema` interface:
  - Add `description?: string`
  - Add `minimum?: number`, `maximum?: number` (for number fields)
  - Add `format?: string` (for password, json, date-time, color)
  - Add `rows?: number` (for textarea sizing)
- Update `convertToPaletteItem()` to also include `credentials` from the node description (list of credential type names)
- Run existing tests: `cd /Users/preston/Documents/Claude/R360-Flow && pnpm --filter @r360/execution-engine test` to check what breaks, then fix tests to match new enriched output
- Build: `pnpm --filter @r360/execution-engine build`

### 4. Make /api/nodes Public + Rebuild API
- **Task ID**: api-public
- **Depends On**: update-palette-types
- **Assigned To**: frontend-wirer
- **Agent Type**: builder
- **Parallel**: false
- Edit `packages/api/src/server.ts` — in the auth hook (line ~472), add: `if (request.url.startsWith('/api/nodes')) return;`
- Build: `pnpm --filter @r360/api build`
- Kill and restart API server
- Verify: `curl -s http://localhost:3100/api/nodes | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Total: {d[\"total\"]} nodes'); n=d['nodes'][0]; print(f'First: {n[\"type\"]} - {n[\"label\"]}'); print(f'Schema has allOf: {\"allOf\" in n.get(\"schema\", {})}'); print(f'Schema has required: {\"required\" in n.get(\"schema\", {})}')"` — should show enriched schemas

### 5. Remove Fake Nodes + Create N8n Node Mapper
- **Task ID**: remove-fakes-create-mapper
- **Depends On**: api-public
- **Assigned To**: frontend-wirer (resume)
- **Agent Type**: builder
- **Parallel**: false

**a) Delete fake node definitions:**
- Delete the entire directory: `workflowbuilder/apps/frontend/src/app/data/nodes/` (trigger, action, delay, conditional, decision, notification, ai-agent subdirectories)

**b) Create `workflowbuilder/apps/frontend/src/app/data/n8n-node-mapper.ts`:**

**`mapTemplateType(apiType: string): NodeType`**
```
'trigger' → NodeType.StartNode   (renders as start-node template with lightning icon area)
'conditional' → NodeType.DecisionNode  (renders as decision-node template with branch visual)
'action' → NodeType.Node         (renders as standard workflow node)
'default' → NodeType.Node
```

**`mapIcon(nodeType: string): WBIcon`**
Build a keyword-to-icon lookup using the node's type string (e.g., `n8n-nodes-base.slack` → `'SlackLogo'`):
```typescript
const ICON_MAP: Record<string, WBIcon> = {
  // Communication
  slack: 'SlackLogo', discord: 'DiscordLogo', telegram: 'TelegramLogo',
  whatsapp: 'WhatsappLogo', email: 'Envelope', gmail: 'Envelope',
  // Development
  httpRequest: 'Globe', http: 'Globe', webhook: 'WebhooksLogo',
  code: 'Code', function: 'Function', github: 'GithubLogo', git: 'GitBranch',
  // Data
  postgres: 'Database', mysql: 'Database', mongodb: 'Database', redis: 'Database',
  spreadsheet: 'Table', csv: 'Table', googleSheets: 'Table',
  // Logic
  if: 'GitBranch', switch: 'GitBranch', merge: 'GitMerge', splitInBatches: 'ArrowsSplit',
  // Scheduling
  cron: 'Clock', schedule: 'Clock', wait: 'Timer',
  // Utility
  set: 'Pencil', noOp: 'Placeholder', manualTrigger: 'Lightning',
  // AI
  openAi: 'Brain', anthropic: 'Brain', langchain: 'Brain',
  // Files
  ftp: 'Terminal', ssh: 'Terminal', readWriteFile: 'File',
  // Social
  twitter: 'TwitterLogo', facebook: 'FacebookLogo',
};
// Default fallback: 'Plug'
```
Extract the service name from the full type string: `n8n-nodes-base.slack` → `slack`

**`mapApiNodeToPaletteItem(apiNode: N8nPaletteItemResponse): PaletteItem`**
- Map: type, label, description, icon (via mapIcon), templateType (via mapTemplateType)
- Pass through: schema (now enriched with allOf, required, descriptions), defaultPropertiesData
- No uischema needed (the JSON Forms engine renders based on schema alone; allOf handles conditional visibility)

**`groupNodesByCategory(items: PaletteItem[], categories: Map<string, string>): PaletteGroup[]`**
- The API response includes `category` per node — pass this through separately or embed in a wrapper
- Group items by category
- Sort groups alphabetically, but put "Core Nodes" / "Flow" / triggers first
- Return `PaletteGroup[]` with `{ label: 'Category Name', groupItems: [...], isOpen: false }`
- First group (triggers/core) should have `isOpen: true`

**API Response Types:**
```typescript
interface N8nPaletteItemResponse {
  type: string;
  label: string;
  description: string;
  icon: string;
  templateType: 'trigger' | 'action' | 'conditional' | 'default';
  schema: {
    properties: Record<string, FieldSchema>;
    required?: string[];
    allOf?: Array<{ if: object; then?: object; else?: object }>;
  };
  defaultPropertiesData: Record<string, unknown>;
  category: string;
}
```

### 6. Update Palette Slice — Async API Fetch
- **Task ID**: update-palette-slice
- **Depends On**: remove-fakes-create-mapper
- **Assigned To**: frontend-wirer (resume)
- **Agent Type**: builder
- **Parallel**: false
- Edit `workflowbuilder/apps/frontend/src/app/store/slices/palette/palette-slice.ts`
- Replace the import of `getPaletteData` with imports from `n8n-node-mapper.ts`
- Rewrite `fetchData()`:

```typescript
fetchData: async () => {
  set({ fetchDataStatus: StatusType.Loading });
  try {
    const response = await fetch('/api/nodes');
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data: NodesApiResponse = await response.json();

    const paletteItems = data.nodes.map(mapApiNodeToPaletteItem);
    const grouped = groupNodesByCategory(paletteItems, data.nodes);

    set({ data: grouped, fetchDataStatus: StatusType.Success });
  } catch (error) {
    console.error('Failed to fetch nodes from API:', error);
    // Graceful degradation: empty palette with error state
    set({ data: [], fetchDataStatus: StatusType.Error });
  }
},
```

- Update `workflowbuilder/apps/frontend/src/app/data/palette.ts` to remove all imports of fake nodes. Either delete the file entirely or make it a no-op.
- **Important**: The `PaletteState.fetchData` type is `() => void` — change to `() => void` (fire-and-forget async) by just making the inner function async without changing the signature. Zustand handles this fine.

### 7. Update Frontend Schema Types (if needed)
- **Task ID**: update-frontend-types
- **Depends On**: update-palette-slice
- **Assigned To**: frontend-wirer (resume)
- **Agent Type**: builder
- **Parallel**: false
- Check `workflowbuilder/apps/types/src/node-schema.ts` `BaseFieldSchema`:
  - If `description` is not in the type, add it: `description?: string;`
- Check `NodeSchema` type:
  - If `required` is not in the type, it should be (it's in `ObjectFieldRequiredValidationSchema` which NodeSchema already extends — verify this works)
  - If `allOf` is not supported, add: `allOf?: IfThenElseSchema[];` — but it should already be there from `node-validation-schema.ts`
- These should be minimal or no-op changes since the frontend types were designed for JSON Schema

### 8. Restart Servers and Browser Verify
- **Task ID**: restart-verify
- **Depends On**: update-frontend-types
- **Assigned To**: server-runner
- **Agent Type**: general-purpose
- **Parallel**: false
- Kill existing servers on ports 3100 and 4200
- Rebuild API: `pnpm --filter @r360/api build`
- Start API: `node /Users/preston/Documents/Claude/R360-Flow/packages/api/dist/server.js` (background)
- Verify API: `curl -s http://localhost:3100/api/nodes | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Nodes: {d[\"total\"]}')"`
- Start frontend: `export PATH="/Users/preston/.nvm/versions/node/v22.20.0/bin:$PATH" && cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && pnpm dev` (background)
- Wait for Vite ready
- Navigate browser to `http://localhost:4200`
- Dismiss template selector → Empty Canvas
- Open Nodes Library → screenshot
- Verify: categories with real n8n nodes (HTTP Request, If, Set, Slack, Code, etc.)
- Expand a category → screenshot showing nodes
- Drag an HTTP Request node onto canvas → screenshot
- Click the node to open Properties panel → screenshot
- Verify property panel shows: labeled fields, conditional fields appear/disappear based on selections, required markers, descriptions

### 9. Final Validation
- **Task ID**: validate-all
- **Depends On**: restart-verify
- **Assigned To**: final-validator
- **Agent Type**: validator
- **Parallel**: false
- Run all validation commands
- Browser MCP verification:
  - No fake nodes visible (no "Trigger", "Action", "Delay", etc. with generic types)
  - Real n8n nodes in categorized groups
  - Property panel for HTTP Request shows method dropdown, URL field, conditional body field
  - Property panel for If node shows condition configuration
  - Console has no errors related to node loading or schema rendering
- Confirm: all n8n nodes use `n8n-nodes-base.*` type names
- Confirm: node count > 200 in palette

## Acceptance Criteria
- `curl -s http://localhost:3100/api/nodes` returns 200 with 300+ nodes (no auth required)
- API response schemas include `allOf` rules for conditional visibility
- API response schemas include `required` arrays
- API response schemas include `description` on fields
- Frontend palette shows ONLY real n8n nodes — no fake trigger/action/delay/conditional/decision/notification/ai-agent nodes
- Nodes are grouped by category in collapsible accordions (10+ categories)
- Dragging an n8n node onto canvas renders it with icon + label
- Clicking a node opens Properties panel with:
  - Labeled form fields from the n8n schema
  - Conditional fields that show/hide based on other field values (e.g., body shows when method=POST)
  - Required field indicators
  - Description help text on fields
- Old fake node directory (`workflowbuilder/apps/frontend/src/app/data/nodes/`) is deleted
- No console errors in browser

## Validation Commands
```bash
# API returns 300+ nodes without auth
curl -s http://localhost:3100/api/nodes | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'Total nodes: {d[\"total\"]}')
assert d['total'] > 200, f'Expected 200+ nodes, got {d[\"total\"]}'
"

# Schemas are enriched (have allOf and required)
curl -s http://localhost:3100/api/nodes?search=httpRequest | python3 -c "
import sys,json; d=json.load(sys.stdin)
node = d['nodes'][0]
schema = node['schema']
print(f'Node: {node[\"type\"]}')
print(f'Properties: {len(schema.get(\"properties\", {}))} fields')
print(f'Has allOf: {\"allOf\" in schema}')
print(f'Has required: {\"required\" in schema}')
has_desc = any(f.get('description') for f in schema.get('properties', {}).values() if isinstance(f, dict))
print(f'Has field descriptions: {has_desc}')
"

# Categories exist
curl -s http://localhost:3100/api/nodes | python3 -c "
import sys,json; d=json.load(sys.stdin)
cats = {}
for n in d['nodes']:
    c = n.get('category', 'unknown')
    cats[c] = cats.get(c, 0) + 1
print(f'Categories ({len(cats)}):')
for c in sorted(cats.keys()):
    print(f'  {c}: {cats[c]} nodes')
assert len(cats) >= 5, f'Expected 5+ categories, got {len(cats)}'
"

# Frontend proxy works
curl -s http://localhost:4200/api/nodes | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Via proxy: {d[\"total\"]} nodes')"

# Both servers running
lsof -i:3100 | head -2
lsof -i:4200 | head -2

# Fake nodes deleted
test ! -d workflowbuilder/apps/frontend/src/app/data/nodes && echo "Fake nodes deleted" || echo "ERROR: Fake nodes still exist"
```

## Notes

### What We're NOT Doing (Future Work)
- **Custom renderers for advanced n8n types**: `resourceLocator`, `resourceMapper`, `filter`, `assignment` — these render as basic text fields for now. Rich UIs for these require new React components.
- **Dynamic option loading**: `loadOptionsMethod` requires backend API calls at runtime — out of scope. Static options from node descriptions are used.
- **Credential type UI**: Credential selection requires a separate credential management UI — not in this plan.
- **Code editor integration**: `typeOptions.editor` (codeNodeEditor, sqlEditor) could map to Monaco/CodeMirror — future enhancement.
- **Expression support**: n8n's `{{ }}` expression system in fields — requires expression parser UI.

### Key Technical Details
- The frontend's `PaletteItems` component already handles `PaletteGroup` with `Accordion` from `@synergycodes/overflow-ui`
- `node-preview-container.tsx` falls back to `NODE_TEMPLATES[NodeType.Node]` (WorkflowNodeTemplate) for any templateType not in the map — n8n nodes will render with the standard node template
- Vite proxy at `/api` → `localhost:3100` means `fetch('/api/nodes')` works without CORS
- The `withOptionalFunctionPlugins` wrapper is removed since `getPaletteData` is replaced
- n8n node descriptions are loaded once and cached — no per-request overhead
- JSON Schema `allOf` with `if-then-else` is the standard way to express conditional visibility in JSON Forms (the library the frontend uses)
- n8n's `displayOptions.show` maps cleanly to `if: { properties: { field: { enum: [values] } } }`
- n8n's `displayOptions.hide` maps to `if: { properties: { field: { not: { enum: [values] } } } }`

# Plan: Fix "No renderer provided for type: Control" in Properties Panel

## Task Description
When clicking any n8n node on the canvas and opening the Properties panel, every field shows the red error message "No renderer provided for type: Control". This happens because the new n8n nodes from the API have no `uischema` — only a JSON `schema`. When JSON Forms receives no UISchema, it auto-generates one using the standard `Control` type. But this frontend uses CUSTOM control types (`Text`, `Select`, `Switch`, etc.) and has no renderer registered for the standard `Control` type, so everything falls through to the `unknownRenderer`.

## Objective
When a user clicks any n8n node on the canvas, the Properties panel renders a functional form with:
- Text inputs for string/number fields
- Select dropdowns for fields with options
- Toggle switches for boolean fields
- TextArea for multi-line fields (json format, rows > 1)
- Accordion grouping to organize the many n8n fields
- Conditional visibility working via `allOf` rules mapped to UISchema rules

## Problem Statement

### Root Cause
The Workflow Builder's JSON Forms setup uses a **custom UISchema type system**:
- `Text` — text inputs (registered at rank 1 via `createControlRenderer('Text', TextControl)`)
- `Select` — dropdowns (rank 1 via `createControlRenderer('Select', SelectControl)`)
- `Switch` — toggles (rank 1 via `createControlRenderer('Switch', SwitchControl)`)
- `TextArea` — multi-line (rank 1 via `createControlRenderer('TextArea', TextAreaControl)`)
- `DatePicker`, `DynamicConditions`, `AiTools`, `DecisionBranches` — specialized controls
- `VerticalLayout`, `HorizontalLayout`, `Accordion`, `Group` — layout types

When `JSONForm` is called with `uischema={undefined}` (which happens for all n8n nodes since `nodeDefinition.uischema` is not set), `@jsonforms/core` auto-generates a UISchema. The auto-generated UISchema uses the standard JSON Forms type `Control` — not the custom types above. The fallback `unknownRenderer` (rank 0, matches `isControl || isLayout`) catches everything and renders "No renderer provided for type: Control".

### The UISchema Contract
Looking at how the old fake nodes worked (e.g., `ai-agent/uischema.ts`):
```typescript
export const uischema: UISchema = {
  type: 'VerticalLayout',
  elements: [
    {
      type: 'Accordion', label: 'General Information',
      elements: [
        { type: 'Text', scope: '#/properties/label', label: 'Title' },
        { type: 'Select', scope: '#/properties/status', label: 'Status' },
      ],
    },
    // ...
  ],
};
```

Each field needs:
- A `type` matching a registered renderer (`Text`, `Select`, `Switch`, `TextArea`)
- A `scope` pointing to the field in the schema (e.g., `#/properties/method`)
- A `label` for display

### What We Need
Auto-generate a UISchema for every n8n node based on its enriched `schema`. The schema already has all the info needed to determine the correct control type:
- `type: 'string'` + `options[]` → `Select`
- `type: 'string'` + `format: 'json'` or `rows > 1` → `TextArea`
- `type: 'string'` (plain) → `Text`
- `type: 'number'` → `Text` (handles numbers via inputType)
- `type: 'boolean'` → `Switch`
- `type: 'object'` with `properties` → nested `VerticalLayout` or `Accordion`
- `type: 'array'` → `Text` (basic fallback for now)

## Solution Approach

### Auto-generate UISchemas from Node Schemas (Frontend-Side)

Create a `generateUiSchema()` function that converts a backend `NodeSchema` into a UISchema tree. Call it in `mapApiNodeToPaletteItem()` so every PaletteItem gets a valid `uischema`.

**Why frontend-side, not backend:**
- The UISchema types (`Text`, `Select`, `Switch`, `Accordion`, `VerticalLayout`) are frontend-specific concepts defined in the Workflow Builder
- Keeps the backend schema format standard JSON Schema (portable)
- The frontend knows its own renderer capabilities

**UISchema generation logic:**
1. Iterate over `schema.properties` — create a UISchema control element per field
2. Determine control type from FieldSchema: `mapFieldToControlType(field)`
3. Wrap all controls in a `VerticalLayout`
4. For nodes with many fields (>5 static), group into `Accordion` sections
5. For `allOf` conditional rules — convert each rule into UISchema `rule` properties with `SHOW/HIDE` effects on the conditional fields

**Conditional visibility via UISchema rules:**
The frontend's JSON Forms setup supports `UISchemaRule` with `effect: 'SHOW' | 'HIDE'` and `SchemaBasedCondition`. The backend's `allOf` entries need to be translated to per-field `rule` properties:

```typescript
// Backend allOf entry:
// { if: { properties: { method: { enum: ['POST','PUT'] } } }, then: { properties: { body: {...} } } }

// Translates to UISchema control for "body":
// { type: 'TextArea', scope: '#/properties/body', label: 'Body',
//   rule: { effect: 'SHOW', condition: { scope: '#/properties/method', schema: { enum: ['POST','PUT'] } } } }
```

### Architecture

```
API Response (schema only, no uischema)
  └─ mapApiNodeToPaletteItem()
       └─ generateUiSchema(schema)     <-- NEW
            ├─ mapFieldToControlType(field) → 'Text' | 'Select' | 'Switch' | 'TextArea'
            ├─ buildControlElement(name, field, controlType) → UISchemaControlElement
            ├─ convertAllOfToRules(allOf) → Map<fieldName, UISchemaRule>
            └─ wrapInLayout(elements) → VerticalLayout with optional Accordions
       └─ PaletteItem { schema, uischema }  <-- now populated
            └─ JSONForm renders correctly using existing renderers
```

## Relevant Files

### Frontend — UISchema Generator (NEW)
- `workflowbuilder/apps/frontend/src/app/data/generate-uischema.ts` — **NEW** Core function that converts a NodeSchema to a UISchema

### Frontend — Mapper Integration (EDIT)
- `workflowbuilder/apps/frontend/src/app/data/n8n-node-mapper.ts` — Call `generateUiSchema()` in `mapApiNodeToPaletteItem()`

### Frontend — Reference (READ ONLY, no changes)
- `workflowbuilder/apps/frontend/src/app/features/json-form/json-form.tsx` — Renderer registry, shows all registered types
- `workflowbuilder/apps/frontend/src/app/features/json-form/types/controls.ts` — Control type definitions (`TextControlElement`, `SelectControlElement`, etc.)
- `workflowbuilder/apps/frontend/src/app/features/json-form/types/layouts.ts` — Layout type definitions (`AccordionLayoutElement`, `VerticalLayoutElement`, etc.)
- `workflowbuilder/apps/frontend/src/app/features/json-form/types/uischema.ts` — UISchema type union
- `workflowbuilder/apps/frontend/src/app/features/json-form/types/rules.ts` — UISchemaRule type
- `workflowbuilder/apps/frontend/src/app/features/json-form/utils/get-scope.ts` — Scope path helper
- `workflowbuilder/apps/frontend/src/app/features/json-form/controls/text-control/text-control.tsx` — Text renderer (handles string + number)
- `workflowbuilder/apps/frontend/src/app/features/json-form/controls/select-control/select-control.tsx` — Select renderer (needs `schema.options[]`)
- `workflowbuilder/apps/frontend/src/app/features/json-form/controls/switch-control/switch-control.tsx` — Switch renderer (boolean)
- `workflowbuilder/apps/frontend/src/app/features/json-form/controls/text-area-control/text-area-control.tsx` — TextArea renderer
- `workflowbuilder/apps/frontend/src/app/features/json-form/controls/control-wrapper.tsx` — Wraps controls with label and error indicator
- `workflowbuilder/apps/frontend/src/app/features/json-form/utils/unknown-renderer.tsx` — Fallback that shows the error
- `workflowbuilder/apps/frontend/src/app/features/properties-bar/components/node-properties/node-properties.tsx` — Where `JSONForm` is called with `schema` and `uischema`
- `workflowbuilder/apps/frontend/src/app/data/nodes/ai-agent/uischema.ts` — Example of hand-crafted UISchema (reference pattern)
- `workflowbuilder/apps/types/src/node-schema.ts` — `NodeSchema`, `FieldSchema`, `NodePropertiesSchema` types
- `workflowbuilder/apps/types/src/node-validation-schema.ts` — `IfThenElseSchema`, `SchemaCondition` types
- `workflowbuilder/apps/types/src/node-data.ts` — `NodeDefinition` type (includes optional `uischema`)
- `packages/execution-engine/src/node-palette.ts` — Backend schema shape (`N8nPaletteItem`, `FieldSchema`, `ConditionalRule`)

## Implementation Phases

### Phase 1: Foundation — Create UISchema Generator
Build the `generateUiSchema()` function with field-to-control type mapping and layout wrapping.

### Phase 2: Core Implementation — Wire Generator + Handle Conditionals
Integrate the generator into the mapper, convert `allOf` rules to per-field UISchema rules, and handle nested object properties.

### Phase 3: Integration & Polish — Browser Verification
Rebuild frontend, verify properties panels render correctly for multiple node types (HTTP Request, If, Set, Slack, Code, etc.), no "No renderer" errors.

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members.

### Team Members

- Builder
  - Name: uischema-generator
  - Role: Create generate-uischema.ts, integrate into n8n-node-mapper.ts, handle all field type mapping and conditional rules
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: browser-verifier
  - Role: Rebuild frontend, restart servers, verify properties panels render correctly in browser
  - Agent Type: general-purpose
  - Resume: true

- Validator
  - Name: final-validator
  - Role: Validate all acceptance criteria via browser inspection and console checks
  - Agent Type: validator
  - Resume: false

## Step by Step Tasks

### 1. Create generate-uischema.ts
- **Task ID**: create-uischema-generator
- **Depends On**: none
- **Assigned To**: uischema-generator
- **Agent Type**: builder
- **Parallel**: false
- Read reference files to understand exact types:
  - `workflowbuilder/apps/frontend/src/app/features/json-form/types/controls.ts` — for control element types
  - `workflowbuilder/apps/frontend/src/app/features/json-form/types/layouts.ts` — for layout element types
  - `workflowbuilder/apps/frontend/src/app/features/json-form/types/uischema.ts` — for UISchema union type
  - `workflowbuilder/apps/frontend/src/app/features/json-form/types/rules.ts` — for UISchemaRule type
  - `workflowbuilder/apps/frontend/src/app/data/nodes/ai-agent/uischema.ts` — reference pattern
  - `workflowbuilder/apps/types/src/node-schema.ts` — NodeSchema, FieldSchema types
- Create `workflowbuilder/apps/frontend/src/app/data/generate-uischema.ts` with:

**`mapFieldToControlType(field: FieldSchema): string`**
```
field.type === 'boolean' → 'Switch'
field.type === 'string' && field.options?.length > 0 → 'Select'
field.type === 'string' && (field.format === 'json' || (field.rows && field.rows > 1)) → 'TextArea'
field.type === 'string' → 'Text'
field.type === 'number' → 'Text'
field.type === 'object' && field.properties → recurse (nested VerticalLayout)
field.type === 'array' → 'Text' (basic fallback)
default → 'Text'
```

**`buildControlElement(name: string, field: FieldSchema, controlType: string): UISchemaControlElement`**
```typescript
{
  type: controlType,           // 'Text', 'Select', 'Switch', 'TextArea'
  scope: `#/properties/${name}`,
  label: field.label || name,
  // For Text: add placeholder from field.placeholder
  // For TextArea: add placeholder and minRows from field.rows
}
```

**`convertAllOfToRules(allOf: ConditionalRule[]): Map<string, UISchemaRule>`**
For each allOf entry:
1. Extract the `if.properties` conditions
2. For each field in `then.properties`, create a UISchemaRule:
```typescript
{
  effect: 'SHOW',
  condition: {
    type: 'AND',  // if multiple condition keys
    conditions: Object.entries(ifCondition.properties).map(([key, val]) => ({
      scope: `#/properties/${key}`,
      schema: val,  // { enum: [...] } or { not: { enum: [...] } }
    })),
  }
}
```
Or for a single condition key (simpler case):
```typescript
{
  effect: 'SHOW',
  condition: {
    scope: `#/properties/${key}`,
    schema: val,
  }
}
```
Return a Map from field name -> UISchemaRule.

**NOTE on condition types**: Check what `@jsonforms/core` exports for condition types. The `UISchemaRule` type in `rules.ts` uses `OrCondition | AndCondition | LeafCondition | SchemaBasedCondition`. For our case, `SchemaBasedCondition` with `scope` and `schema` is the right fit for single-condition rules. For multi-condition `if` blocks (multiple keys in `if.properties`), use `AndCondition` wrapping multiple `SchemaBasedCondition`s.

**`generateUiSchema(schema: NodeSchema): UISchema`**
1. Build a Map of conditional field rules from `schema.allOf`
2. Create control elements for all static fields in `schema.properties` (skip `label` and `description` — these are base node properties, not n8n schema fields; or keep them but put them in a "General" accordion)
3. Create control elements for all conditional fields from `schema.allOf[].then.properties`
4. Attach `rule` to each conditional control element
5. Wrap static fields in an "Accordion" labeled "Configuration" (or "General")
6. Wrap conditional fields — if many share the same condition, group them
7. Return a `VerticalLayout` containing the accordions

**Simplified approach for v1**: Don't over-complicate grouping. Just:
1. Put `label` and `description` fields in a "General" Accordion
2. Put all other static fields in a "Settings" Accordion
3. Put all conditional fields (with their rules) in the same "Settings" Accordion or a "Conditional Settings" Accordion
4. Return `{ type: 'VerticalLayout', elements: [...accordions] }`

### 2. Integrate generator into mapper
- **Task ID**: integrate-generator
- **Depends On**: create-uischema-generator
- **Assigned To**: uischema-generator (resume)
- **Agent Type**: builder
- **Parallel**: false
- Edit `workflowbuilder/apps/frontend/src/app/data/n8n-node-mapper.ts`:
  - Import `generateUiSchema` from `./generate-uischema`
  - In `mapApiNodeToPaletteItem()`, add: `const uischema = generateUiSchema(schema);`
  - Include `uischema` in the returned PaletteItem object
- The `PaletteItem` type (which is `NodeDefinition`) already has `uischema?: UISchema` — so this field just needs to be populated
- Build check: `cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && npx tsc --noEmit` (expect pre-existing errors only, no new ones)

### 3. Handle nested object fields
- **Task ID**: handle-nested-objects
- **Depends On**: integrate-generator
- **Assigned To**: uischema-generator (resume)
- **Agent Type**: builder
- **Parallel**: false
- For `FieldSchema` with `type: 'object'` and `properties`, generate a nested `Group` or `Accordion` layout:
```typescript
{
  type: 'Accordion',
  label: field.label || name,
  elements: Object.entries(field.properties).map(([childName, childField]) =>
    buildControlElement(`${name}.${childName}`, childField, mapFieldToControlType(childField))
  ),
}
```
- Note: the scope for nested fields needs the full path: `#/properties/options/properties/body` — verify this works with JSON Forms

### 4. Rebuild and browser verify
- **Task ID**: rebuild-verify
- **Depends On**: handle-nested-objects
- **Assigned To**: browser-verifier
- **Agent Type**: general-purpose
- **Parallel**: false
- Kill existing servers on ports 3100 and 4200
- Rebuild frontend: `cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && pnpm build`
- Start API server (background): `cd /Users/preston/Documents/Claude/R360-Flow && node packages/api/dist/server.js`
- Start frontend dev server (background): `cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && pnpm dev`
- Navigate browser to http://localhost:4200
- Dismiss template selector (click "Empty Canvas" or similar)
- Drag an HTTP Request node onto the canvas
- Click the node to open Properties panel
- Screenshot and verify: no "No renderer provided" errors, form fields render correctly
- Try If node, Set node, Code node — verify properties render
- Check browser console for errors

### 5. Final validation
- **Task ID**: validate-all
- **Depends On**: rebuild-verify
- **Assigned To**: final-validator
- **Agent Type**: validator
- **Parallel**: false
- Run all validation commands
- Browser verification:
  - HTTP Request node: shows Method dropdown (Select), URL text input (Text), conditional Body field
  - If node: shows condition configuration fields
  - Set node: shows key/value fields
  - No red "No renderer provided for type: Control" messages anywhere
  - Console has no errors related to rendering
- Confirm: at least 5 different node types render property panels correctly

## Acceptance Criteria
- No "No renderer provided for type: Control" errors appear anywhere in the Properties panel
- Clicking any n8n node opens a Properties panel with functional form controls
- String fields render as Text inputs
- String fields with options render as Select dropdowns
- Boolean fields render as Switch toggles
- JSON/multi-row string fields render as TextAreas
- Fields are organized in Accordion sections
- Conditional fields (from allOf rules) show/hide based on other field values (e.g., HTTP Request body shows when method=POST)
- Browser console has no JSON Forms rendering errors
- Frontend builds without new TypeScript errors

## Validation Commands
```bash
# Frontend builds
cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && pnpm build

# Both servers running
lsof -i:3100 | head -2
lsof -i:4200 | head -2

# API still returns 483 nodes
curl -s http://localhost:3100/api/nodes | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Nodes: {d[\"total\"]}')"

# Browser: navigate to http://localhost:4200, drag a node, click it, verify form renders
```

## Notes

### What We're NOT Doing
- **Not changing the backend** — the backend schema format is fine. The issue is purely frontend (missing UISchema generation).
- **Not registering a standard `Control` renderer** — this would bypass the custom control system and create inconsistent UI. Better to generate proper UISchemas.
- **Not adding new renderer types** — the existing Text, Select, Switch, TextArea renderers cover all n8n field types. We just need to map fields to them.
- **Not handling advanced n8n types specially** — `resourceLocator`, `resourceMapper`, `filter`, `assignmentCollection` render as basic Text or Object for now.

### Key Technical Details
- The `UISchema` type is a union: `UISchemaControlElement | UISchemaLayoutElement | LabelElement` (see `types/uischema.ts`)
- Control types must be exactly: `'Text'`, `'Select'`, `'Switch'`, `'TextArea'`, `'DatePicker'`, `'DynamicConditions'`, `'AiTools'`, `'DecisionBranches'`
- Layout types must be exactly: `'VerticalLayout'`, `'HorizontalLayout'`, `'Accordion'`, `'Group'`
- Scope format: `#/properties/fieldName` (see `get-scope.ts`)
- For nested objects: `#/properties/parent/properties/child`
- `UISchemaRule.effect` is `keyof typeof RuleEffect` — which is `'SHOW'`, `'HIDE'`, `'ENABLE'`, `'DISABLE'`
- `SchemaBasedCondition` from `@jsonforms/core` has `{ scope: string, schema: object }` — matches our allOf conditions
- The `PaletteItem` (aka `NodeDefinition`) type already has `uischema?: UISchema` — we just need to populate it
- `TextControl` already handles both `string` and `number` types (checks `schema.type === 'number'` for input type)
- `SelectControl` reads options from `schema.options` (the `PrimitiveFieldSchema` type) — our enriched schemas already provide these

# Plan: Fix Node Parameters UI Rendering

## Task Description

Node parameters in the R360 Flow UI are not rendering correctly compared to n8n's editor. The AI Agent node (and likely all nodes) exhibits three systemic failures:

1. **Missing "Additional Options"** — n8n's `collection` type parameters (the "Add Option" dropdown pattern) show as empty or don't render. Our UI says "No additional options available" while n8n shows a rich dropdown of addable fields (Max Iterations, System Message, Return Intermediate Steps, etc.)
2. **Short text instead of multiline** — Prompt fields (system prompt, user prompt) that n8n renders as tall textareas with `typeOptions: { rows: 6 }` appear as short single-line text inputs in our UI
3. **Parameter values from JSON not rendering** — Values that ARE set in the workflow JSON (like systemMessage) don't appear in the UI because the field definitions are lost during schema processing

This is a **systemic problem** affecting all nodes, not just the AI Agent.

## Objective

Fix the full parameter rendering pipeline so that:
- All n8n parameter types render with correct controls (textarea for multiline, dropdown for options, collection pattern for "Additional Options")
- Conditional fields (those with `displayOptions`) retain their full metadata (label, rows, options, description)
- A new "Collection" UI control supports n8n's "Add Option" pattern for optional parameter groups
- Values set in workflow JSON appear correctly in the parameter panel

## Problem Statement

The parameter rendering pipeline has **three critical breaks** between the backend (which correctly processes n8n's `INodeTypeDescription`) and the frontend (which renders form controls):

### Break 1: Frontend types strip conditional field metadata

**Backend** (`packages/execution-engine/src/node-palette.ts`): Correctly stores full `FieldSchema` objects (with label, description, rows, options, properties) in `schema.allOf[].then.properties`:
```typescript
// Backend ConditionalRule.then.properties contains FULL FieldSchema:
{ systemMessage: { type: 'string', label: 'System Message', rows: 6, description: '...' } }
```

**Frontend** (`workflowbuilder/apps/types/src/node-validation-schema.ts`): Types `allOf` as `IfThenElseSchema[]`, where `then.properties` is `Record<string, FieldValidationSchema>` — which only allows `type`, `minLength`, `maxLength`, `pattern`, `format`, `minimum`, `maximum`. **No label, rows, options, description, placeholder, hint, or nested properties.**

**Result**: `findConditionalField()` in `generate-uischema.ts` (line 261-280) creates a minimal fallback `{ type: 'string' }`, losing ALL rendering metadata. Since **most n8n parameters use `displayOptions`** (making them conditional), this affects the majority of fields.

### Break 2: No "Additional Options" (collection) UI control

n8n's `collection` type parameter is a specific UX pattern:
- A dropdown button labeled "Add Option"
- Users **choose** which optional fields to include
- Only selected fields render in the form
- Users can remove fields they've added

Our backend correctly maps `collection` → `{ type: 'object', properties: {...} }`, but the frontend:
- `mapFieldToControlType()` returns `'Text'` for object/array types (line 66 fallback)
- `buildFieldElements()` renders object fields as static Accordions showing ALL sub-properties
- There is no "add option from dropdown" UX

### Break 3: SchemaCondition type mismatch

Backend sends `{ enum: ['value1', 'value2'] }` in conditional rule properties.
Frontend `SchemaCondition` type expects `{ const: string | number | boolean }`.
This means conditional visibility rules may silently fail, showing/hiding fields incorrectly.

## Solution Approach

### Strategy: Fix from types outward

1. **Align the types** so conditional field metadata flows through the pipeline intact
2. **Fix conditional field resolution** so fields behind `displayOptions` render with correct controls
3. **Add a Collection control** for n8n's "Add Option" pattern
4. **Fix control type mapping** for object and array types
5. **Validate end-to-end** with the AI Agent node and several other complex nodes

### Key Design Decisions

- **Don't change the backend** — `node-palette.ts` already sends correct data. The problem is entirely in the frontend type system and rendering.
- **Preserve JSON Forms architecture** — Add new renderers within the existing `@jsonforms/react` setup rather than replacing it.
- **Use n8n's `collection` semantics** — The "Add Option" dropdown pattern is well-defined in n8n and should be faithfully reproduced.

## Relevant Files

### Files to Modify

- `workflowbuilder/apps/types/src/node-validation-schema.ts` — Fix `IfThenElseSchema` to support full `FieldSchema` in conditional rules, fix `SchemaCondition` to support `enum`
- `workflowbuilder/apps/types/src/node-schema.ts` — May need updates to align with validation schema changes
- `workflowbuilder/apps/frontend/src/app/data/generate-uischema.ts` — Fix `findConditionalField()` to use actual field data; fix `mapFieldToControlType()` for object/array; add collection control type; handle nested object field elements properly
- `workflowbuilder/apps/frontend/src/app/features/json-form/json-form.tsx` — Register new collection control renderer
- `workflowbuilder/apps/frontend/src/app/data/n8n-node-mapper.ts` — Verify schema passthrough preserves all metadata

### New Files

- `workflowbuilder/apps/frontend/src/app/features/json-form/controls/collection-control/collection-control.tsx` — New "Additional Options" control with add/remove pattern
- `workflowbuilder/apps/frontend/src/app/features/json-form/controls/collection-control/collection-control.module.css` — Styles for collection control

### Reference Files (read-only)

- `packages/execution-engine/src/node-palette.ts` — Backend schema conversion (already correct)
- `workflowbuilder/apps/frontend/src/app/features/json-form/controls/text-area-control/text-area-control.tsx` — Existing TextArea control (reference for new control)
- `workflowbuilder/apps/frontend/src/app/features/json-form/controls/select-control/select-control.tsx` — Existing Select control (reference for dropdown UX)
- `workflowbuilder/apps/frontend/src/app/features/json-form/controls/control-wrapper.tsx` — Control wrapper pattern
- `workflowbuilder/apps/frontend/src/app/features/properties-bar/components/node-properties/node-properties.tsx` — Where schema/uischema are consumed
- `workflowbuilder/apps/frontend/src/app/store/slices/palette/palette-slice.ts` — Where API data feeds into the store
- `node_modules/@n8n/n8n-nodes-langchain/dist/nodes/agents/Agent/agents/ToolsAgent/options.js` — n8n Agent node parameter definitions (reference for expected behavior)

## Implementation Phases

### Phase 1: Foundation — Fix Types & Conditional Field Resolution

Fix the type system so conditional field metadata flows through the pipeline.

**Changes to `node-validation-schema.ts`:**
- Expand `ConditionalSchema.properties` to accept full `FieldSchema` (not just `FieldValidationSchema`)
- Add `enum` support to `SchemaCondition` alongside `const`
- Add `not` support to `SchemaCondition` for hide conditions

**Changes to `generate-uischema.ts`:**
- Fix `findConditionalField()` to cast the runtime data as `FieldSchema` (it already IS `FieldSchema` at runtime, just typed incorrectly)
- Return the actual field data with label, rows, options, description, etc.

### Phase 2: Core Implementation — Collection Control & Control Type Fixes

**New `collection-control.tsx`:**
- Renders an "Add Option" button/dropdown
- Lists available (not-yet-added) fields from the collection's `properties`
- When user selects a field, renders the appropriate control for it
- Allows removing added fields
- Stores selected field values in the node's properties data

**Changes to `generate-uischema.ts`:**
- Add `'Collection'` to the `ControlType` union
- Update `mapFieldToControlType()`:
  - `object` with `properties` → `'Collection'` (for n8n collection params)
  - `array` with items → appropriate array handling
- Update `buildFieldElements()` to handle Collection type differently from plain objects

**Changes to `json-form.tsx`:**
- Register the new `CollectionControl` renderer
- Add tester function that matches `type: 'Collection'`

### Phase 3: Integration & Polish

- Verify AI Agent node renders correctly:
  - System Message → TextArea with 6 rows
  - User Prompt → TextArea with 2 rows
  - Options → "Add Option" dropdown with Max Iterations, Return Intermediate Steps, etc.
  - Conditional fields show/hide based on promptType selection
- Test with other complex nodes (HTTP Request, Slack, Gmail, etc.)
- Verify parameter values from workflow JSON appear in the UI
- Ensure data changes flow back through `onChange` correctly

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
  - Name: builder-types
  - Role: Fix TypeScript type definitions in validation schema and node schema to support full field metadata in conditional rules
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: builder-uischema
  - Role: Fix generate-uischema.ts — conditional field resolution, control type mapping, collection support
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: builder-collection-control
  - Role: Create the new CollectionControl React component and register it in json-form.tsx
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: builder-integration
  - Role: Wire everything together, verify n8n-node-mapper passthrough, fix any remaining issues
  - Agent Type: builder
  - Resume: true

- Validator
  - Name: validator
  - Role: Read-only validation that all changes work correctly end-to-end
  - Agent Type: validator
  - Resume: false

## Step by Step Tasks

### 1. Fix Conditional Schema Types
- **Task ID**: fix-conditional-types
- **Depends On**: none
- **Assigned To**: builder-types
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 2's research phase)
- Update `workflowbuilder/apps/types/src/node-validation-schema.ts`:
  - Change `ConditionalSchema.properties` from `Record<string, FieldValidationSchema>` to `Record<string, FieldValidationSchema | FieldSchema>` (import `FieldSchema` from `./node-schema`)
  - Update `SchemaCondition.properties` to support `{ enum?: unknown[]; const?: string | number | boolean; not?: { enum: unknown[] } }` alongside the current `{ const }` pattern
- Verify no type errors are introduced in consuming files (`generate-uischema.ts`, `node-schema.ts`, `conditional-validation.ts`)
- Run `tsc --noEmit` on the workflowbuilder types package to validate

### 2. Fix Conditional Field Resolution in generate-uischema.ts
- **Task ID**: fix-conditional-resolution
- **Depends On**: fix-conditional-types
- **Assigned To**: builder-uischema
- **Agent Type**: builder
- **Parallel**: false
- Update `findConditionalField()` in `workflowbuilder/apps/frontend/src/app/data/generate-uischema.ts`:
  - Instead of returning `{ type: validationSchema.type ?? 'string' }`, cast the runtime object to `FieldSchema` and return it with all its metadata (label, rows, options, description, properties, placeholder, hint)
  - The data IS `FieldSchema` at runtime (sent by `node-palette.ts`), it's just typed as `FieldValidationSchema`
- Update the conditional field processing loop (around line 384-425):
  - When building control elements for conditional fields, ensure the full `FieldSchema` is used so `mapFieldToControlType()` sees `rows`, `options`, `properties`, etc.
  - Specifically: fields with `rows > 1` should map to TextArea, fields with `options` should map to Select, object fields with `properties` should map to Collection

### 3. Create CollectionControl Component
- **Task ID**: create-collection-control
- **Depends On**: none
- **Assigned To**: builder-collection-control
- **Agent Type**: builder
- **Parallel**: true (independent of type fixes)
- Create `workflowbuilder/apps/frontend/src/app/features/json-form/controls/collection-control/collection-control.tsx`:
  - Follow the pattern of existing controls (see `select-control.tsx`, `control-wrapper.tsx`)
  - Component receives an object-type schema with `properties` defining available optional fields
  - Renders an "Add Option" button that opens a dropdown/popover listing available (not-yet-added) fields
  - Each field in the dropdown shows: label, description
  - When a field is selected from dropdown, render the appropriate input control for it (text, textarea, select, switch, number) based on its `FieldSchema`
  - Added fields show with a remove (X) button
  - Store values as a flat object `{ fieldName: value }` in the node's property data
  - Use `@synergycodes/overflow-ui` components to match existing UI style
- Create corresponding CSS module file
- Reference n8n's pattern: `placeholder: 'Add Option'` text, dropdown to select, removable fields

### 4. Update Control Type Mapping
- **Task ID**: update-control-mapping
- **Depends On**: create-collection-control
- **Assigned To**: builder-uischema
- **Agent Type**: builder
- **Parallel**: false
- Update `mapFieldToControlType()` in `generate-uischema.ts`:
  - Add `'Collection'` to the `ControlType` type union
  - For `field.type === 'object'` with `field.properties` → return `'Collection'`
  - For `field.type === 'array'` with items → return appropriate type (or 'Text' as temporary fallback)
  - Keep existing mappings for string, number, boolean, options
- Update `buildFieldElements()`:
  - When control type is `'Collection'`, create a control element (not an Accordion) so the CollectionControl renderer handles it
  - Pass the field's nested `properties` through the schema so CollectionControl can access them
- Update `buildControlElement()`:
  - For Collection type, include the field's `properties` in the element options so the renderer knows what sub-fields are available

### 5. Register CollectionControl Renderer
- **Task ID**: register-collection-renderer
- **Depends On**: create-collection-control, update-control-mapping
- **Assigned To**: builder-integration
- **Agent Type**: builder
- **Parallel**: false
- Update `workflowbuilder/apps/frontend/src/app/features/json-form/json-form.tsx`:
  - Import `CollectionControl` and its tester
  - Add to the renderers array
  - Tester should match elements where `type === 'Collection'`
- Verify `n8n-node-mapper.ts` passes schema data through without stripping fields
- Test that the complete pipeline works:
  1. Backend `node-palette.ts` converts n8n node → schema with collection properties and conditional rules
  2. API returns full schema with all metadata
  3. Frontend `n8n-node-mapper.ts` passes schema to `generateUiSchema()`
  4. `generateUiSchema()` correctly maps fields to Collection, TextArea, Select, etc.
  5. `JSONForm` renders correct controls

### 6. End-to-End Validation
- **Task ID**: validate-all
- **Depends On**: fix-conditional-types, fix-conditional-resolution, create-collection-control, update-control-mapping, register-collection-renderer
- **Assigned To**: validator
- **Agent Type**: validator
- **Parallel**: false
- Verify the AI Agent node renders correctly:
  - `text` (User Prompt) field → TextArea control with 2 rows
  - `systemMessage` field → TextArea control with 6 rows
  - `options` field → Collection control with "Add Option" dropdown
  - Collection dropdown lists: Max Iterations, Return Intermediate Steps, System Message (if in options), etc.
  - Conditional fields show/hide based on `promptType` value
- Verify other complex nodes render correctly:
  - HTTP Request node: method selector shows, URL field appears, conditional body/headers/query params render
  - Slack node: operation selector works, conditional fields appear correctly
- Verify TypeScript compilation: `tsc --noEmit` passes for all affected packages
- Verify no regressions in existing node rendering (simple nodes like Set, If, etc.)
- Run existing tests: `pnpm --filter @workflow-builder/frontend test`

## Acceptance Criteria

1. **Conditional fields retain full metadata**: Fields with `displayOptions` render with correct labels, descriptions, placeholders, and control types (TextArea for `rows > 1`, Select for `options`, etc.)
2. **Collection control works**: n8n `collection` type parameters render as an "Add Option" dropdown where users can select which optional fields to include, with ability to remove added fields
3. **Prompt fields are multiline**: System Message renders as TextArea with ~6 rows, User Prompt as TextArea with ~2 rows
4. **Conditional visibility works**: Fields show/hide correctly based on `displayOptions` rules (both `enum` and `const` condition formats)
5. **Values from JSON render**: Parameter values that exist in the workflow JSON appear in the UI controls when the node is selected
6. **No regressions**: Existing simple nodes (Set, If, Merge, etc.) continue to render correctly
7. **TypeScript compiles**: No type errors introduced in any package

## Validation Commands

```bash
# Type checking
cd workflowbuilder && pnpm tsc --noEmit

# Run frontend tests
cd workflowbuilder && pnpm --filter @workflow-builder/frontend test

# Build check
cd workflowbuilder && pnpm build

# Visual verification (manual)
# 1. Start dev server: pnpm dev
# 2. Open workflow with AI Agent node
# 3. Click on Agent node → verify Settings panel shows:
#    - TextArea for prompts
#    - "Add Option" dropdown for options
#    - Conditional fields appear/disappear based on selections
```

## Notes

- The backend (`node-palette.ts`) is **already correct** — it sends full `FieldSchema` data in conditional rules. All fixes are frontend-only.
- The `IfThenElseSchema` type mismatch is the root cause — the runtime JSON data has rich metadata, but TypeScript types restrict it to validation-only schemas, and `findConditionalField()` creates minimal fallbacks instead of using the actual data.
- This fix will improve ALL nodes systemically, not just the AI Agent. Any node with `displayOptions` (conditional fields) or `collection` type parameters will benefit.
- The `@jsonforms/react` library handles custom renderers well — adding a new `CollectionControl` follows the same pattern as existing controls.
- n8n uses `placeholder: 'Add Option'` as the convention for collection parameters — we should follow this convention in our UI.
- Some n8n parameter types (`resourceMapper`, `filter`, `assignmentCollection`) are complex and may need their own dedicated controls in the future, but this plan focuses on the highest-impact fixes first.

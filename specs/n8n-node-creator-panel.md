# Plan: n8n-Style Node Creator Panel

## Task Description

Replace the flat `NodePalette.vue` component with a multi-level, drill-down node creator panel that matches n8n's "What happens next?" / "Select a trigger" UX pattern. The panel should support:

1. **Top-level category view** — AI, Action in an app, Data transformation, Flow, Core, Human in the loop, Add another trigger
2. **Subcategory drill-down** — clicking a category shows grouped nodes within it (e.g., Data transformation → Popular, Add or remove items, Combine items)
3. **Service list view** — "Action in an app" shows all services alphabetically with their real icons
4. **Node actions view** — clicking a service shows its available actions (e.g., Slack → Send Message, Add Reaction, etc.)
5. **Global search** — searching from any view level filters across all nodes and actions
6. **Back navigation** — breadcrumb-style back button to return to previous view

Direct import from n8n is **not viable** because n8n's node creator depends on `@n8n/design-system`, `@n8n/i18n`, and 10+ tightly-coupled Pinia stores. Instead, we rebuild a lightweight version using the same **codex metadata** that n8n node types already provide (our API already returns this data).

## Objective

When complete, the node creator panel will:
- Show the same category hierarchy as n8n's editor (AI, Action in an app, Data transformation, Flow, Core, HITL)
- Support drill-down navigation with animated transitions
- Show real node icons from our icon-serving API
- Display node actions (operation variants) when drilling into a specific node
- Support drag-and-drop from any level
- Work with both trigger and regular node creation contexts

## Problem Statement

The current `NodePalette.vue` is a flat list with tag-based category filtering. It shows all 598 nodes in a single scrollable list, which is overwhelming. n8n's node creator uses a hierarchical browse-then-drill-down pattern that groups nodes into meaningful categories and lets users progressively narrow their selection. This is dramatically better UX for finding the right node.

## Solution Approach

Rebuild the node creator as a **view stack** component system. The view stack is a navigation pattern where each drill-down pushes a new view onto a stack, and the back button pops it. This matches n8n's internal architecture without importing their code.

**Data source:** The n8n node type descriptions already contain `codex.categories` and `codex.subcategories` fields. Our `/api/n8n-compat/types/nodes.json` endpoint returns these. We use this metadata to build the category hierarchy.

**Actions extraction:** n8n nodes with multiple operations (e.g., Slack has "Send Message", "Add Reaction") expose these via their `properties` array. We parse the `resource` and `operation` properties to generate action items.

## Relevant Files

### Frontend (Vue) — Modified
- `workflowbuilder/apps/frontend-v2/src/editor/WorkflowEditorPage.vue` — Update palette integration (swap NodePalette for NodeCreator)
- `workflowbuilder/apps/frontend-v2/src/editor/components/EditorCanvas.vue` — Update add-node event to open creator with context
- `workflowbuilder/apps/frontend-v2/src/stores/use-node-types-store.ts` — Add codex helpers, action parsing, category grouping

### Frontend (Vue) — Existing (to be replaced)
- `workflowbuilder/apps/frontend-v2/src/editor/components/NodePalette.vue` — Current flat palette (will be superseded but kept for reference)

### New Files
- `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/NodeCreator.vue` — Top-level wrapper (panel container, overlay)
- `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/NodeCreatorPanel.vue` — Content panel with header, search, view rendering
- `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/CategoryView.vue` — Top-level categories (AI, Action in an app, etc.)
- `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/NodeListView.vue` — Flat or sectioned node list within a category
- `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/ActionsView.vue` — Actions for a specific node (e.g., Slack actions)
- `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/NodeCreatorItem.vue` — Reusable list item (icon + name + description + arrow)
- `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/SectionGroup.vue` — Collapsible section with header and children
- `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/use-view-stack.ts` — View stack composable (push/pop/update)
- `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/use-actions-parser.ts` — Parse node properties into action items
- `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/types.ts` — TypeScript interfaces for view items, categories, actions
- `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/category-definitions.ts` — Static category config (names, icons, descriptions, node filters)

### Backend (API) — No changes needed
The `/api/n8n-compat/types/nodes.json` endpoint already returns full `INodeTypeDescription[]` with codex data.

### n8n Reference (Read-Only)
- `n8n/packages/frontend/editor-ui/src/features/shared/nodeCreator/` — Reference implementation (do NOT import)
- `n8n/packages/frontend/editor-ui/src/app/constants/nodeCreator.ts` — Category constants reference

## Implementation Phases

### Phase 1: Foundation (Tasks 1-3)
Build the type system, view stack composable, and category definitions. These are pure TypeScript with no UI — they form the data layer.

### Phase 2: Core Components (Tasks 4-7)
Build the Vue components: NodeCreatorItem, SectionGroup, CategoryView, NodeListView, ActionsView. Each component is self-contained and can be developed in parallel.

### Phase 3: Integration (Tasks 8-9)
Wire the NodeCreator into WorkflowEditorPage, replacing the old NodePalette. Add context-aware opening (trigger vs regular).

### Phase 4: Polish & Validation (Tasks 10-11)
Add transitions, keyboard navigation, search across all levels. Final validation.

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use Task tools to deploy team members.
- Take note of the session id of each team member for resumption.

### Team Members

- Builder
  - Name: foundation-builder
  - Role: Build types, view stack composable, category definitions, and actions parser
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: component-builder
  - Role: Build all Vue components (NodeCreatorItem, SectionGroup, CategoryView, NodeListView, ActionsView)
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: panel-builder
  - Role: Build NodeCreator wrapper, NodeCreatorPanel, and integrate into WorkflowEditorPage
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: polish-builder
  - Role: Add transitions, keyboard navigation, search-across-levels, and visual polish
  - Agent Type: builder
  - Resume: true

- Validator
  - Name: final-validator
  - Role: Validate all acceptance criteria, TypeScript compilation, build, and UX review
  - Agent Type: validator
  - Resume: false

## Step by Step Tasks

### 1. Define Types and Interfaces
- **Task ID**: define-types
- **Depends On**: none
- **Assigned To**: foundation-builder
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 2)
- Create `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/types.ts`
- Define these interfaces:

```typescript
/** The mode the node creator is opened in */
export type NodeCreatorMode = 'trigger' | 'regular' | 'ai';

/** Types of items that can appear in the node creator */
export type CreatorItemType = 'category' | 'subcategory' | 'node' | 'action' | 'section' | 'label';

/** A single view in the navigation stack */
export interface ViewStackEntry {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  iconUrl?: string | { light: string; dark: string };
  mode: 'categories' | 'nodes' | 'actions';
  items: CreatorItem[];
  searchItems?: CreatorItem[]; // flat list for searching within this view
  search: string;
}

/** Base creator item */
export interface CreatorItemBase {
  type: CreatorItemType;
  key: string;
  title: string;
  description?: string;
  icon?: string;
  iconUrl?: string | { light: string; dark: string };
  iconColor?: string;
}

/** Category item — top-level entry (AI, Action in an app, etc.) */
export interface CategoryItem extends CreatorItemBase {
  type: 'category';
  categoryId: string;
  nodeCount: number;
}

/** Subcategory item — drills into a filtered node list */
export interface SubcategoryItem extends CreatorItemBase {
  type: 'subcategory';
  subcategoryId: string;
}

/** Node item — a single node type */
export interface NodeItem extends CreatorItemBase {
  type: 'node';
  nodeType: string; // full n8n name (e.g., "n8n-nodes-base.slack")
  hasActions: boolean; // true if node has multiple operations
  isTrigger: boolean;
}

/** Action item — a specific operation within a node */
export interface ActionItem extends CreatorItemBase {
  type: 'action';
  nodeType: string;
  actionKey: string; // e.g., "sendMessage"
  resource?: string;
  operation?: string;
}

/** Section item — collapsible group header */
export interface SectionItem extends CreatorItemBase {
  type: 'section';
  children: CreatorItem[];
  expanded: boolean;
}

/** Label item — non-interactive heading */
export interface LabelItem extends CreatorItemBase {
  type: 'label';
}

export type CreatorItem = CategoryItem | SubcategoryItem | NodeItem | ActionItem | SectionItem | LabelItem;
```

### 2. Build Category Definitions
- **Task ID**: category-definitions
- **Depends On**: define-types
- **Assigned To**: foundation-builder
- **Agent Type**: builder
- **Parallel**: false
- Create `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/category-definitions.ts`
- Define the top-level categories that match n8n's node creator:

```typescript
import type { NodeTypeDescription } from '../../../stores/use-node-types-store';

export interface CategoryDefinition {
  id: string;
  title: string;
  description: string;
  icon: string; // SVG path data or icon name
  /** Filter function: returns true if a node belongs to this category */
  filter: (node: NodeTypeDescription) => boolean;
  /** Subcategory sections to show when drilling into this category */
  sections?: SubcategorySection[];
  /** If true, show nodes grouped by service (alphabetical icons list) */
  showAsServiceList?: boolean;
}

export interface SubcategorySection {
  id: string;
  title: string;
  filter: (node: NodeTypeDescription) => boolean;
  defaultExpanded?: boolean;
}
```

- Define these categories (matching n8n's screenshots):
  1. **AI** — `codex.categories` includes "AI"
  2. **Action in an app** — nodes NOT in Core/Flow/Transform categories (the "default" bucket of service integrations). `showAsServiceList: true`
  3. **Data transformation** — `codex.subcategories` includes transform-related entries. Sections: Popular, Add or remove items, Combine items, Convert
  4. **Flow** — `codex.subcategories` has Flow entries (IF, Switch, Merge, Loop, etc.)
  5. **Core** — HTTP Request, Code, Webhook, and other core utilities
  6. **Human in the loop** — `codex.categories` includes "HITL" or "Human in the Loop"
- Also define a **trigger categories** variant for the "Select a trigger" context
- Each category includes a description matching n8n's text (e.g., "Build autonomous agents, summarize or search documents, etc.")
- Include node count as computed from filtered list

### 3. Build View Stack Composable and Actions Parser
- **Task ID**: view-stack-and-actions
- **Depends On**: define-types
- **Assigned To**: foundation-builder
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 2)
- Create `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/use-view-stack.ts`:

```typescript
// Composable API:
export function useViewStack() {
  const stack: Ref<ViewStackEntry[]>;
  const currentView: ComputedRef<ViewStackEntry | undefined>;
  const canGoBack: ComputedRef<boolean>;
  const depth: ComputedRef<number>;

  function pushView(view: Omit<ViewStackEntry, 'id' | 'search'>): void;
  function popView(): void;
  function resetStack(): void;
  function updateSearch(query: string): void;

  return { stack, currentView, canGoBack, depth, pushView, popView, resetStack, updateSearch };
}
```

- Create `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/use-actions-parser.ts`:
  - Parse a node type's `properties` array to extract available actions
  - Look for `resource` and `operation` properties (these define the actions)
  - A `resource` property has `options` listing resources (e.g., "channel", "message", "user")
  - An `operation` property has `options` listing operations (e.g., "create", "get", "update", "delete")
  - Cross-product or filtered combinations become actions
  - For simpler nodes (like Code), look for the primary property with options (e.g., `language` → "JavaScript", "Python")
  - Return `ActionItem[]` for a given node type
  - Determine `hasActions(nodeType)` — true if node has resource/operation or similar multi-option primary property

### 4. Build NodeCreatorItem Component
- **Task ID**: build-creator-item
- **Depends On**: define-types
- **Assigned To**: component-builder
- **Agent Type**: builder
- **Parallel**: true
- Create `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/NodeCreatorItem.vue`
- Reusable list item component used across all views
- Props: `item: CreatorItem`, `showArrow: boolean` (default true for categories/subcategories/nodes with actions)
- Layout: `[icon] [title + description] [arrow →]`
- Use `NodeIcon` component for icon rendering (import from parent directory)
- Category items: larger icon area, description below title
- Node items: smaller icon, single-line description
- Action items: indented, no arrow
- Hover state: light gray background
- Click handler: emits `select` event with the item
- Draggable: for node and action items, set `application/r360-node-type` data on dragstart

### 5. Build SectionGroup Component
- **Task ID**: build-section-group
- **Depends On**: define-types
- **Assigned To**: component-builder
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 4)
- Create `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/SectionGroup.vue`
- Collapsible section with header and children
- Props: `title: string`, `count: number`, `defaultExpanded: boolean`
- Header: title text, count badge, chevron toggle
- Body: slot for children (NodeCreatorItem list)
- Animated expand/collapse (max-height transition)
- Clicking header toggles expanded state

### 6. Build CategoryView Component
- **Task ID**: build-category-view
- **Depends On**: category-definitions, build-creator-item
- **Assigned To**: component-builder
- **Agent Type**: builder
- **Parallel**: false
- Create `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/CategoryView.vue`
- Shows the top-level category list (AI, Action in an app, Data transformation, etc.)
- Props: `mode: NodeCreatorMode`, `nodeTypes: NodeTypeDescription[]`
- Uses category definitions to build the list
- Each category shows: icon, title, description, node count, arrow
- Emits `select-category` with the `CategoryDefinition`
- When mode is `'trigger'`: show trigger-specific categories
- When mode is `'regular'`: show the standard "What happens next?" categories
- Bottom section: "Add another trigger" link (in regular mode)

### 7. Build NodeListView and ActionsView
- **Task ID**: build-list-and-actions-views
- **Depends On**: build-creator-item, build-section-group, view-stack-and-actions
- **Assigned To**: component-builder
- **Agent Type**: builder
- **Parallel**: false
- Create `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/NodeListView.vue`:
  - Shows nodes within a category, optionally grouped into sections
  - Props: `nodes: NodeItem[]`, `sections?: SubcategorySection[]`, `showAsServiceList?: boolean`
  - Service list mode: alphabetical list with icons (for "Action in an app")
  - Sectioned mode: collapsible SectionGroup components (for "Data transformation")
  - Flat mode: simple list of NodeCreatorItems
  - Each node item: on click, if `hasActions` → emit `drill-into-node`, else emit `select-node`
  - Search input filters within the current node list
- Create `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/ActionsView.vue`:
  - Shows actions for a specific node type
  - Props: `nodeType: NodeTypeDescription`, `actions: ActionItem[]`
  - Header: node icon + node name
  - Search: "Search {NodeName} Actions..."
  - Group actions into "Triggers" and "Actions" sections (if both exist)
  - Each action: NodeCreatorItem with icon inherited from parent node
  - On click: emit `select-action` with the ActionItem

### 8. Build NodeCreator Wrapper and Panel
- **Task ID**: build-creator-wrapper
- **Depends On**: build-category-view, build-list-and-actions-views
- **Assigned To**: panel-builder
- **Agent Type**: builder
- **Parallel**: false
- Create `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/NodeCreator.vue`:
  - Top-level wrapper component
  - Props: `visible: boolean`, `mode: NodeCreatorMode`, `nodeTypes: NodeTypeDescription[]`
  - Emits: `select` (NodeTypeDescription + optional action params), `close`
  - Renders a slide-in panel (380px wide) on the left side
  - Semi-transparent scrim overlay behind (click to close)
  - Manages the view stack composable
  - Initial view: CategoryView
  - On category select: pushes NodeListView or ActionsView
  - On node select (with actions): pushes ActionsView
  - On node select (no actions): emits `select` and closes
  - On action select: emits `select` with pre-configured parameters and closes
- Create `workflowbuilder/apps/frontend-v2/src/editor/components/node-creator/NodeCreatorPanel.vue`:
  - Inner panel content
  - Header: back button (when depth > 0), icon, title
  - Search bar: persistent across all views
  - Content area: renders current view (CategoryView, NodeListView, or ActionsView)
  - Transition: slide left/right animation between views
  - Back button: calls `popView()` on the view stack

### 9. Integrate into WorkflowEditorPage
- **Task ID**: integrate-into-editor
- **Depends On**: build-creator-wrapper
- **Assigned To**: panel-builder
- **Agent Type**: builder
- **Parallel**: false
- Update `workflowbuilder/apps/frontend-v2/src/editor/WorkflowEditorPage.vue`:
  - Import `NodeCreator` instead of (or alongside) `NodePalette`
  - Replace `showPalette` state with `creatorState: { visible: boolean, mode: NodeCreatorMode }`
  - When "+" button is clicked on canvas or CanvasControls: open creator in `'regular'` mode
  - When adding first node (empty canvas): open in `'trigger'` mode
  - Handle `select` event: receives `NodeTypeDescription` + optional action params
  - If action params provided, pre-populate node parameters (resource, operation)
  - Keep drag-and-drop from NodeCreator working the same way
- Update `workflowbuilder/apps/frontend-v2/src/editor/components/EditorCanvas.vue`:
  - When "add-node" event fires from CanvasNode "+" button, emit with source node context
  - This allows the creator to open in the correct mode
- Update `workflowbuilder/apps/frontend-v2/src/editor/components/CanvasControls.vue`:
  - Update the "Add Node" button to open the new NodeCreator

### 10. Add Transitions, Keyboard Nav, and Polish
- **Task ID**: add-polish
- **Depends On**: integrate-into-editor
- **Assigned To**: polish-builder
- **Agent Type**: builder
- **Parallel**: false
- View transitions: slide-in from right when pushing, slide-out to right when popping
- Panel open/close: slide from left edge
- Keyboard navigation:
  - Arrow Up/Down: navigate items
  - Enter: select current item (drill in or add node)
  - Escape: go back (or close if at root)
  - Type to search (auto-focus search input)
- Global search behavior: when user types in search at any level, filter across ALL nodes (not just current view). Show flat results sorted by relevance.
- Ensure NodeIcon works correctly for all items (reuse existing component)
- Visual polish: match n8n's spacing, font sizes, colors as closely as reasonable
- Ensure the panel works on different viewport sizes (min-height handling, scroll)

### 11. Final Validation
- **Task ID**: validate-all
- **Depends On**: add-polish
- **Assigned To**: final-validator
- **Agent Type**: validator
- **Parallel**: false
- Run TypeScript check: `cd workflowbuilder/apps/frontend-v2 && npx vue-tsc --noEmit`
- Run Vite build: `cd workflowbuilder/apps/frontend-v2 && npx vite build`
- Verify all new files exist:
  ```bash
  for f in \
    src/editor/components/node-creator/NodeCreator.vue \
    src/editor/components/node-creator/NodeCreatorPanel.vue \
    src/editor/components/node-creator/CategoryView.vue \
    src/editor/components/node-creator/NodeListView.vue \
    src/editor/components/node-creator/ActionsView.vue \
    src/editor/components/node-creator/NodeCreatorItem.vue \
    src/editor/components/node-creator/SectionGroup.vue \
    src/editor/components/node-creator/use-view-stack.ts \
    src/editor/components/node-creator/use-actions-parser.ts \
    src/editor/components/node-creator/types.ts \
    src/editor/components/node-creator/category-definitions.ts; do
    test -f "$f" && echo "PASS: $f" || echo "FAIL: $f"
  done
  ```
- Verify category view shows: AI, Action in an app, Data transformation, Flow, Core, Human in the loop
- Verify "Action in an app" drill-down shows alphabetical service list with real icons
- Verify clicking a service with actions shows action list
- Verify clicking a node without actions adds it directly
- Verify back navigation works at every level
- Verify search filters across all nodes
- Verify drag-and-drop still works
- Compare with n8n screenshots for visual similarity

## Acceptance Criteria

### Category Navigation
- [ ] Top-level shows categories: AI, Action in an app, Data transformation, Flow, Core, Human in the loop
- [ ] Each category shows icon, title, description, and node count
- [ ] Clicking a category drills into its node list
- [ ] "Action in an app" shows alphabetical service list with real node icons
- [ ] "Data transformation" shows sectioned view (Popular, Add or remove items, etc.)

### Drill-Down Navigation
- [ ] Back button appears when not at root level
- [ ] Clicking back returns to previous view
- [ ] View transitions animate (slide left/right)
- [ ] Breadcrumb shows current location (icon + title in header)

### Node Actions
- [ ] Clicking a service node with multiple operations shows actions list
- [ ] Actions grouped by "Triggers" and "Actions" sections
- [ ] Selecting an action adds the node with pre-configured resource/operation
- [ ] Nodes without actions add directly on click

### Search
- [ ] Search input present at every level
- [ ] Typing filters visible items within current view
- [ ] Global search (from root) searches across all nodes and actions
- [ ] Search results show node icons and descriptions

### Integration
- [ ] NodeCreator replaces NodePalette in the editor
- [ ] "+" button on canvas nodes opens creator in regular mode
- [ ] Empty canvas opens creator in trigger mode
- [ ] Drag-and-drop from creator to canvas works
- [ ] Selected node is added to canvas with correct type, icon, handles

### Build
- [ ] TypeScript compilation passes (`vue-tsc --noEmit`)
- [ ] Vite production build passes
- [ ] No regressions in existing editor functionality

## Validation Commands

```bash
# TypeScript compilation
cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/frontend-v2 && npx vue-tsc --noEmit

# Vite build
cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/frontend-v2 && npx vite build

# Verify new files exist
cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/frontend-v2
for f in \
  src/editor/components/node-creator/NodeCreator.vue \
  src/editor/components/node-creator/NodeCreatorPanel.vue \
  src/editor/components/node-creator/CategoryView.vue \
  src/editor/components/node-creator/NodeListView.vue \
  src/editor/components/node-creator/ActionsView.vue \
  src/editor/components/node-creator/NodeCreatorItem.vue \
  src/editor/components/node-creator/SectionGroup.vue \
  src/editor/components/node-creator/use-view-stack.ts \
  src/editor/components/node-creator/use-actions-parser.ts \
  src/editor/components/node-creator/types.ts \
  src/editor/components/node-creator/category-definitions.ts; do
  test -f "$f" && echo "PASS: $f" || echo "FAIL: $f"
done

# Line count check (ensure substantial implementation)
find src/editor/components/node-creator -name '*.vue' -o -name '*.ts' | xargs wc -l
```

## Notes

### Key Architectural Decisions

1. **No n8n imports** — We rebuild the node creator using the same codex metadata but our own Vue components. n8n's implementation depends on `@n8n/design-system` and `@n8n/i18n` which are too tightly coupled to import.

2. **View stack pattern** — Matches n8n's internal navigation model. Each drill-down pushes a view onto a stack. Back pops it. This is clean, testable, and supports arbitrarily deep navigation.

3. **Actions from properties** — n8n nodes expose their actions via `resource` and `operation` properties. We parse these at runtime rather than hardcoding action lists. This means new nodes automatically get action support.

4. **Codex metadata** — The `codex.categories` and `codex.subcategories` fields on `INodeTypeDescription` are already returned by our API. No backend changes needed.

5. **Progressive enhancement** — The old NodePalette.vue is kept for reference but superseded by NodeCreator. No breaking changes to the editor's public API.

### Category → Codex Mapping

| Category | Codex Filter |
|----------|-------------|
| AI | `codex.categories` includes "AI" |
| Action in an app | Default bucket — nodes with `codex.categories` containing only service names (not Core/Flow/Transform) |
| Data transformation | `codex.subcategories` has keys matching transform operations, OR `codex.categories` includes "Core Nodes" with data-transform subcategory |
| Flow | `codex.subcategories` has "Flow" key, OR name matches flow-control nodes (if, switch, merge, loop) |
| Core | HTTP Request, Code, Webhook, and other core utility nodes |
| Human in the loop | `codex.categories` includes "HITL" |

### Dependency Graph

```
Task 1 (types) ──────┬──> Task 2 (categories) ──┐
                      ├──> Task 3 (view stack)    ├──> Task 7 (list+actions views) ──┐
                      ├──> Task 4 (creator item)  │                                  │
                      └──> Task 5 (section group) ┘                                  │
                           Task 6 (category view) ──────────────────────────────────┤
                                                                                     │
                                                   Task 8 (wrapper+panel) ───────────┤
                                                   Task 9 (editor integration) ──────┤
                                                   Task 10 (polish) ─────────────────┤
                                                   Task 11 (validate) ───────────────┘
```

### Parallelism

- Tasks 1 runs first (types — everything depends on it)
- Tasks 2, 3, 4, 5 can run in parallel after task 1
- Task 6 needs 2 + 4
- Task 7 needs 4 + 5 + 3
- Tasks 8-11 are sequential

# Plan: n8n Canvas UI Parity — Node Shapes, Agent Tools, Triggers, Edges & Context Menu

## Visual Reference Specifications

The original n8n screenshots are no longer available on disk. The following pixel-level specifications and ASCII diagrams are the authoritative reference for every visual detail. Builders MUST follow these exactly.

---

### REF-01: Regular Node (used by all standard action nodes)

```
                    ●────── output handle: 12px gray (#6b7280) circle, vertically centered on right edge
                    │
    ┌───────────────┼───┐
    │               │   │   Dimensions: H x H (square, e.g. 80x80px)
●───┤    [  ICON  ] │   │   Border: 2px solid #e5e7eb (light gray), border-radius: 8px all corners
    │    (40x40)    │   │   Background: white (#ffffff)
    │               │ ⚡│   Input handle (left): 12px gray circle, vertically centered
    └───────────────┴───┘   Pin icon (⚡): small purple icon, bottom-right corner, ~12px, only when pinned
                            Selected border: 2px solid #7c3aed (purple) + box-shadow: 0 0 0 2px rgba(124,58,237,0.3)
     Create Airtop          Hover: box-shadow: 0 4px 12px rgba(0,0,0,0.1)
        Session             Label: 13px font-weight 500, color #1f2937, centered below node, 8px gap
   POST: https://api...     Subtitle: 11px font-weight 400, color #9ca3af, centered below label, 2px gap
```

**Key details from n8n screenshots:**
- The node body contains ONLY the icon — no text inside. The icon is the service's logo (e.g., globe for HTTP, Airtop logo for Airtop).
- The icon is rendered at 50% of node size (e.g. 40x40 in an 80x80 node), perfectly centered both horizontally and vertically within the square body.
- When a node is selected, the border turns purple (#7c3aed) with a soft purple glow ring.
- A small purple "pin" indicator (like a puzzle-piece/pin icon, ~12x12px) appears in the bottom-right corner of the node body ONLY when the node has pinned data.
- The label below is the user-assigned node name (e.g., "Create Airtop Session"). It's centered, wrapping to 2 lines max, 180px max-width.
- The subtitle below the label is auto-generated (e.g., "POST: https://api.airtop.ai/ap..." or "create: window" or "click: interaction"). It's lighter gray, smaller font.
- Gray data-flow edges connect node output handles (right) to next node input handles (left) with smooth step paths. Between nodes, a small gray label like "1 item" appears on the edge.
- The chain layout is horizontal, left to right, ~200px spacing between nodes.

**Three-node chain layout (from screenshot 02):**
```
 ●──────────┐   "1 item"   ┌──────────●   "1 item"   ┌──────────●
 │  [globe] ●──────────────●  [airtop]●──────────────●  [airtop]●────
 │          │               │         │               │         │
 └──────────┘               └─────────┘               └─────────┘
  Create Airtop              Create a                  Fill Login
    Session                   window                     Form
 POST: https://...          create: window           fill: interaction
```

---

### REF-02: Trigger Node

**Default state (from screenshot 07):**
```
                  ┌─────────┐
                 /           \      Dimensions: H x H (square, same as regular node)
               /    [ ICON ]  │     Left border-radius: 20px (pill shape)
    NO INPUT  (    (40x40)    ●──   Right border-radius: 8px (standard)
    HANDLE     \              │     Border: 2px solid #d1d5db (gray)
                 \           /      Background: white (#ffffff)
              ⚡  └─────────┘       Output handle: right side, 12px gray circle
                                    NO input handle on left (triggers start workflows)
           When clicking 'Test      Lightning bolt: ~14px, positioned bottom-left
               workflow'            outside the node body, color: #f97316 (orange)
                                    or #ef4444 (coral red), slight offset from corner
```

**CSS for pill-left shape:**
```css
border-radius: 20px 8px 8px 20px;  /* TL TR BR BL */
```

**Hover state (from screenshot 08):**
```
    ┌──────────────────┐    ┌─────────┐
    │ 🧪 Execute       │   /           \
    │    workflow       │  (   [ ICON ]  ●──
    └──────────────────┘   \            │
                             \         /
                              └───────┘
                         When clicking 'Test
                             workflow'
```
- On hover, the lightning bolt disappears
- An "Execute workflow" button appears to the LEFT of the trigger node
- Button style: background #ef4444 (red/coral), color white, border-radius: 20px (full pill shape), padding: 8px 16px
- Button contains: flask/beaker icon (🧪) + "Execute workflow" text, font-size 13px, font-weight 500
- Button is positioned ~8px to the left of the node, vertically centered
- Button emits click event to trigger workflow execution

---

### REF-03: Agent Node

**Layout (from screenshots 01, 03, 09):**
```
                                                               Output handle: 12px gray (#6b7280)
    Input handle: 10px dark                                    circle, vertically centered right
    square (#374151), vertically    ┌──────────────────────────────┐
    centered left                   │                              │
                                    │  [🤖]  AI Agent - Fill      │  Dimensions: ~240w x 80h px
    ■━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┤  icon   Item Details        ●━━━━━━━
                                    │ (40x40)                      │  Border: 2px solid #d1d5db
                                    │                              │  Border-radius: 8px
                                    └────────┬─────────┬─────────┬─┘  Background: white
                                             │         │         │
                                             │         │         │   Vertical stem lines: 1px solid #d1d5db
                                             │         │         │   Height: ~30px from node bottom
                                             ◆         ◆         ◆   Diamond handles: 10px rotated 45deg
                                                                      squares, fill #7c3aed (purple),
                                        Chat Model*  Memory    Tool   border: 2px solid #7c3aed

                                           [+]        [+]       [+]  Labels: 11px, color #7c3aed (purple)
                                                                      "Chat Model" has red asterisk (*) = required

                                                                      "+" buttons: 24x24px, border-radius 4px,
                                                                      border: 1.5px solid #d1d5db,
                                                                      background: white, color: #6b7280
                                                                      Positioned ~8px below diamond handle
                                                                      ALWAYS visible (not hover-only)
```

**Key details:**
- The agent node is the ONLY node that is wider than tall (~3x the regular node side length, e.g. ~240px wide vs ~80px for regular). It contains both icon AND text inside the body.
- Content layout inside: icon (40x40) on the left with ~16px padding, then node name text to the right, vertically centered, font-size 14px, font-weight 600, color #1f2937.
- Input handle on left is a SQUARE (not circle) — ~10x10px, filled dark gray (#374151). This distinguishes it from regular node circle handles.
- Output handle on right IS a circle (same as regular nodes).
- The 3 bottom connectors are evenly spaced across the node's width:
  - Connector 1 (left): "Chat Model" — red asterisk means REQUIRED. Label color: #ef4444 for asterisk, #7c3aed for text.
  - Connector 2 (center): "Memory" — optional. Label color: #7c3aed.
  - Connector 3 (right): "Tool" — optional, allows MULTIPLE connections. Label color: #7c3aed.
- Each connector has: vertical stem line (1px gray, ~30px tall) → purple diamond handle (10px, rotated 45°) → label text → "+" button.
- The "+" button for Chat Model hides once a language model is connected (max 1 connection).
- The "+" button for Memory hides once a memory node is connected (max 1 connection).
- The "+" button for Tool ALWAYS shows (allows multiple tool connections).
- Purple dashed edges (stroke: #a78bfa, stroke-dasharray: 5,5, stroke-width: 1.5px) connect from diamond handles down to sub-node top handles.
- When the agent is in a regular workflow chain (between regular nodes), it receives main data flow from the left and outputs to the right via the standard handles, just like any node.

---

### REF-04: Sub-Node (Tool / Memory / Language Model)

**Layout (from screenshots 01, 04):**
```
                  ◆            Diamond handle on TOP: 10px, rotated 45deg square
                  │            fill: #7c3aed (purple), border: 2px solid #7c3aed
                  │            Positioned at top-center of the outer ring
              ┌───┴───┐
            /     │     \      Outer ring: ~88px diameter circle
          /    ┌──┴──┐    \    border: 2px solid #e5e7eb (light gray)
         │    /       \    │   background: transparent (or very light gray #f9fafb)
         │   │ [ICON]  │   │
         │   │ (36x36) │   │   Inner circle: ~68px diameter
         │    \       /    │   background: #f3f4f6 (light gray)
          \    └─────┘    /    border: none
            \           /
              └───────┘        Icon: 36x36px, centered in inner circle
                               Service logo (e.g., Airtop teal circle icon)
      Take screenshot in
           Airtop              Label: 13px, font-weight 500, color #1f2937
     takeScreenshot: window    centered below circle, 8px gap, max-width 160px
                               wraps to multiple lines, text-align: center

                               Subtitle: 11px, font-weight 400, color #9ca3af
                               centered below label, 2px gap
                               format: "operation: resource" (e.g., "takeScreenshot: window")
```

**Key details:**
- Sub-nodes are CIRCLES, not rectangles. This is the primary visual distinction.
- Double-circle effect: outer ring (~88px) with a light gray border serves as a subtle "halo", inner circle (~68px) has the light gray fill and contains the icon.
- The handle is on TOP, not on the left. It's a purple diamond (same style as agent's bottom diamonds).
- There are NO handles on left, right, or bottom. Sub-nodes only connect upward to agent connectors.
- The handle ID for the top connector matches the AI output type: `ai_tool-1`, `ai_memory-1`, `ai_languageModel-1`.
- Sub-nodes for Chat Model (language models) look identical to tool sub-nodes — same circle shape, same top diamond handle. The only difference is the handle type (`ai_languageModel-1` vs `ai_tool-1`).
- In n8n screenshot 01, the OpenAI Chat Model appears as a circle to the LEFT of the agent, connected via a dashed line to the "Chat Model" diamond handle. The 5 Airtop tools appear as circles BELOW the agent, connected to the "Tool" diamond handle.
- Sub-nodes are spaced ~120-150px apart horizontally, positioned ~150px below the agent node.

**Five tool sub-nodes in a row (from screenshot 04):**
```
      ◆           ◆           ◆           ◆           ◆
      │           │           │           │           │
   ┌──┴──┐    ┌──┴──┐    ┌──┴──┐    ┌──┴──┐    ┌──┴──┐
  /  ┌─┐  \  /  ┌─┐  \  /  ┌─┐  \  /  ┌─┐  \  /  ┌─┐  \
 │  │ AT│  ││  │ AT│  ││  │ AT│  ││  │ AT│  ││  │ AT│  │
  \  └─┘  /  \  └─┘  /  \  └─┘  /  \  └─┘  /  \  └─┘  /
   └─────┘    └─────┘    └─────┘    └─────┘    └─────┘
  Take screen  Load a     Type text   Click an   Scroll on
   shot in     page in    in Airtop   element    page in
    Airtop      Airtop                in Airtop   Airtop
  takeScreen   load:      type:       click:     scroll:
  shot: window window     interaction interaction interaction
```

---

### REF-05: Edge Delete on Hover

**Default edge state:**
```
●─────────────────────────────────●   Stroke: #94a3b8 (gray), 2px, solid
                                      For AI edges: #a78bfa (purple), 1.5px, dashed (5,5)
```

**Hover state (from screenshot 05):**
```
                   ┌─────┐
                   │ 🗑️  │        Trash icon container: 28x28px, border-radius: 6px
●╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤     ├╌╌╌╌╌╌●  border: 1.5px solid #d1d5db, background: white
                   │     │        Icon: 16x16 trash SVG, color: #6b7280 (gray)
                   └─────┘        Position: centered at edge midpoint

 Edge stroke changes to: #ef4444 (red/coral), 2px, dashed (8,6)
 BOTH regular and AI edges turn red on hover
```

**Trash icon hover state:**
```
                   ┌─────┐
                   │ 🗑️  │        Container: background #fef2f2 (light red),
●╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤     ├╌╌╌╌╌╌●  border: 1.5px solid #ef4444 (red)
                   │     │        Icon: color changes to #ef4444 (red)
                   └─────┘        Cursor: pointer
                                  Click: delete the edge
```

**Interaction flow:**
1. Mouse enters edge path → edge turns red/dashed, trash icon fades in at midpoint
2. Mouse hovers trash icon → trash container gets red background/border, icon turns red
3. Click trash → edge is deleted (call `removeEdge(edgeId)`)
4. Mouse leaves edge → edge reverts to default color, trash icon fades out

---

### REF-06: Context Menu

**Node context menu (from screenshot 06):**
```
┌──────────────────────────────────────┐   Width: ~240px
│ Open...                        [⏎]  │   Background: white
├──────────────────────────────────────┤   Border: 1px solid #e5e7eb
│ Execute step                         │   Border-radius: 8px
├──────────────────────────────────────┤   Box-shadow: 0 4px 16px rgba(0,0,0,0.12)
│ Rename                      [Space]  │
│ Replace                         [R]  │   Each row: height 36px, padding 0 12px
│ Deactivate                      [D]  │   Font: 13px, color #1f2937
│ Unpin                           [P]  │   Hover: background #f3f4f6
├──────────────────────────────────────┤
│ Copy                     [⌘] [C]    │   Shortcut badges:
│ Duplicate                [⌘] [D]    │     background: #f3f4f6
├──────────────────────────────────────┤     border: 1px solid #e5e7eb
│ Tidy up workflow    [⇧] [⌥] [T]    │     border-radius: 4px
│ Convert node to      [⌥] [X]       │     padding: 2px 6px
│   sub-workflow                       │     font: 11px, color #6b7280
├──────────────────────────────────────┤     gap between badges: 2px
│ Select all               [⌘] [A]    │
│ Clear selection                      │   Separators: 1px solid #e5e7eb
├──────────────────────────────────────┤     margin: 4px 0
│ Delete                       [Del]   │
└──────────────────────────────────────┘   "Delete" text: color #ef4444 (red)
```

**For our implementation, use this simplified menu:**
```
┌──────────────────────────────────────┐
│ Open...                        [⏎]  │
├──────────────────────────────────────┤
│ Rename                      [Space]  │
│ Deactivate                      [D]  │
├──────────────────────────────────────┤
│ Copy                     [⌘] [C]    │
│ Duplicate                [⌘] [D]    │
├──────────────────────────────────────┤
│ Delete                       [Del]   │   ← red text
└──────────────────────────────────────┘
```

**Canvas context menu (right-click on empty area):**
```
┌──────────────────────────────────────┐
│ Add node...                          │
├──────────────────────────────────────┤
│ Select all               [⌘] [A]    │
│ Clear selection                      │
├──────────────────────────────────────┤
│ Fit view                             │
└──────────────────────────────────────┘
```

---

### REF-07: Agent + Tools Full Layout

**Complete agent-with-subnodes layout (from screenshot 01):**
```
                       ━━━━━━ "1 item" ━━━━▶■────────────────────────────────●━━━━━━
                                            │  [🤖] AI Agent - Fill          │
                                            │        Item Details            │
                                            └──────┬────────┬─────────┬─────┘
                                                   │        │         │
                                                   │        │         │
                                                   ◆        ◆         ◆
                                              Chat Model*  Memory    Tool
                                                   │        [+]       [+]
                              ╱────────────────────╱                   │╲──────────────────╲
                            ╱                   ╱           ╱          │  ╲                  ╲
                          ╱                   ╱           ╱            │    ╲                  ╲
                   ◆
                   │
                ┌──┴──┐       ◆          ◆          ◆          ◆          ◆
               /  ┌─┐  \     │          │          │          │          │
              │  │GPT│  │ ┌──┴──┐    ┌──┴──┐   ┌──┴──┐   ┌──┴──┐   ┌──┴──┐
               \  └─┘  / / ┌─┐  \  / ┌─┐  \ / ┌─┐  \ / ┌─┐  \ / ┌─┐  \
                └─────┘ │ │ AT│  ││ │ AT│  ││ │ AT│  ││ │ AT│  ││ │ AT│  │
                         \ └─┘  /  \ └─┘  / \ └─┘  / \ └─┘  / \ └─┘  /
              OpenAI      └────┘    └────┘   └────┘   └────┘   └────┘
             Chat Model   Take      Load a    Type     Click    Scroll
                          screen    page in   text in  element  on page
                          shot in   Airtop    Airtop   in       in
                          Airtop                       Airtop   Airtop
```

**Spatial relationships:**
- Chat Model sub-node: positioned ~150px below and ~200px to the LEFT of agent center
- Tool sub-nodes: positioned ~150px below agent, evenly spaced ~120px apart, centered under the Tool connector
- All dashed edges from agent to sub-nodes are purple (#a78bfa), dashed (5,5), stroke-width 1.5px
- The dashed edges curve smoothly from the agent's bottom diamond handles down to each sub-node's top diamond handle

---

### REF-08: Trigger Node in Workflow Context

**Trigger as first node in chain (from screenshots 07, 08):**
```
    Default state:                          Hover state:

                  ┌────────┐               ┌──────────────┐  ┌────────┐
                 /          │              │ 🧪 Execute    │ /          │
    NO INPUT   (   [ICON]   ●━━━━━━       │    workflow   │(   [ICON]   ●━━━━━━
    HANDLE      \           │              └──────────────┘  \          │
                  └────────┘                  8px gap          └────────┘
              ⚡
            When clicking 'Test             When clicking 'Test
                workflow'                       workflow'
```

- The trigger node is always the FIRST (leftmost) node in the workflow
- It has NO input handle on the left side
- The pill-shaped left side (20px radius) clearly signals "this is where data flow begins"
- The lightning bolt is small (~14px) and positioned at the absolute bottom-left of the node
- On hover, the Execute button slides in from the left with a subtle fade/slide animation

---

### REF-09: Filtered Palette — Language Models

**Panel layout (from screenshot 10):**
```
┌─────────────────────────────────────────┐  Width: ~320px
│  🔤  Language Models                     │  Position: right side panel
│  ─A                                      │  Background: white
├─────────────────────────────────────────┤
│  🔍 Search nodes...                     │  Search: full-width input
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │  Info banner: background #fef9c3
│ │ Chat models are designed for        │ │  (light yellow), border-radius: 8px
│ │ interactive conversations and       │ │  padding: 12px, font-size: 12px
│ │ follow instructions well, while     │ │  color: #92400e
│ │ text completion models focus on     │ │
│ │ generating continuations of a       │ │
│ │ given text input                    │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│  [AI]  Anthropic Chat Model             │  Each row: 56px height
│        Language Model Anthropic          │  Icon: 36x36px circle, left
│─────────────────────────────────────────│  Name: 14px, font-weight 500, #1f2937
│  [A]   Azure OpenAI Chat Model          │  Description: 12px, #9ca3af
│        For advanced usage with AI chain  │
│─────────────────────────────────────────│  Hover: background #f3f4f6
│  [AWS] AWS Bedrock Chat Model           │
│        Language Model AWS Bedrock        │  Separator between items:
│─────────────────────────────────────────│  1px solid #f3f4f6
│  [Co]  Cohere Chat Model                │
│        For advanced usage with AI chain  │  Scrollable list
│─────────────────────────────────────────│
│  [DS]  DeepSeek Chat Model              │
│        For advanced usage with AI chain  │
│─────────────────────────────────────────│
│  [G]   Google Gemini Chat Model         │
│        Chat Model Google Gemini          │
│─────────────────────────────────────────│
│  [G]   Google Vertex Chat Model         │
│        Chat Model Google Vertex          │
│─────────────────────────────────────────│
│  [9]   Groq Chat Model                  │
│        Language Model Groq               │
│─────────────────────────────────────────│
│  [M]   Mistral Cloud Chat Model         │
│        For advanced usage with AI chain  │
│─────────────────────────────────────────│
│  [🍋]  Lemonade Chat Model              │
│        Language Model Lemonade Chat      │
│─────────────────────────────────────────│
│  [Ol]  Ollama Chat Model                │
│        Language Model Ollama             │
│─────────────────────────────────────────│
│  [<]   OpenRouter Chat Model            │
│        For advanced usage with AI chain  │
└─────────────────────────────────────────┘
```

---

### REF-10: Filtered Palette — Tools

**Panel layout (from screenshot 11):**
```
┌─────────────────────────────────────────┐  Width: ~320px
│  🔧  Tools                               │  Header icon: wrench
├─────────────────────────────────────────┤
│  🔍 Search nodes...                     │
├─────────────────────────────────────────┤
│  ▼ Recommended Tools                     │  Section headers: 14px, font-weight 600
│─────────────────────────────────────────│  color: #1f2937, background: #f9fafb
│  [⚙]  Call n8n Workflow Tool            │  padding: 8px 12px
│        Uses another n8n workflow as a    │  Collapsible with chevron (▼/▶)
│        tool. Allows packaging any n8n    │
│        node(s) as a tool.                │
│─────────────────────────────────────────│
│  [<>]  Code Tool                         │  Items in section: same row style
│        Write a tool in JS or Python      │  as Language Models panel
│─────────────────────────────────────────│
│  [🌐]  HTTP Request Tool                │
│        Makes an HTTP request and returns │
│        the response data                 │
├─────────────────────────────────────────┤
│  ▼ Model Context Protocol                │
│─────────────────────────────────────────│
│  [🔌]  MCP Client Tool                  │
│        Connect tools from an MCP Server  │
├─────────────────────────────────────────┤
│  ▼ Vector Stores                         │
│─────────────────────────────────────────│
│  [Az]  Azure AI Search Vector Store      │
│        Work with your data in Azure...   │
│─────────────────────────────────────────│
│  [◎]   Milvus Vector Store              │
│        Work with your data in Milvus...  │
│─────────────────────────────────────────│
│  [Mg]  MongoDB Atlas Vector Store        │
│        Work with your data in MongoDB... │
│─────────────────────────────────────────│
│  [🌲]  Pinecone Vector Store            │
│        Work with your data in Pinecone   │
│─────────────────────────────────────────│
│  [Pg]  Postgres PGVector Store           │
│        Work with your data in Postgres   │
│        with the PGVector extension       │
│─────────────────────────────────────────│
│  [Q]   Qdrant Vector Store              │
│        Work with your data in Qdrant     │
│        collection                        │
└─────────────────────────────────────────┘
```

---

### Color Reference Summary

| Element | Color | Hex |
|---------|-------|-----|
| Node border (default) | Light gray | `#e5e7eb` |
| Node border (selected) | Purple | `#7c3aed` |
| Node border (selected glow) | Purple 30% | `rgba(124,58,237,0.3)` |
| Handle (main data) | Gray | `#6b7280` |
| Handle (AI/diamond) | Purple | `#7c3aed` |
| Agent input handle (square) | Dark gray | `#374151` |
| Edge (data flow) | Gray | `#94a3b8` |
| Edge (AI dashed) | Purple | `#a78bfa` |
| Edge (hover/delete) | Red/coral | `#ef4444` |
| Trash icon hover bg | Light red | `#fef2f2` |
| Lightning bolt | Orange | `#f97316` |
| Execute button bg | Red/coral | `#ef4444` |
| Sub-node inner circle bg | Light gray | `#f3f4f6` |
| Label text | Dark gray | `#1f2937` |
| Subtitle text | Medium gray | `#9ca3af` |
| AI connector labels | Purple | `#7c3aed` |
| Required asterisk | Red | `#ef4444` |
| Context menu bg | White | `#ffffff` |
| Context menu border | Light gray | `#e5e7eb` |
| Context menu hover | Light gray | `#f3f4f6` |
| Shortcut badge bg | Light gray | `#f3f4f6` |
| Shortcut badge border | Light gray | `#e5e7eb` |
| Info banner bg (yellow) | Light yellow | `#fef9c3` |
| Delete text | Red | `#ef4444` |

### Dimension Reference Summary

> **IMPORTANT:** The original screenshots were captured at different zoom levels, so absolute pixel measurements across images are unreliable. Use the **proportional relationships** below as the source of truth. The "Base px" column gives a reasonable starting point at 1x zoom, but the **ratios** are what matter.

**Base unit:** Regular node height = `H` (suggested `H = 80px`)

| Element | Proportion | Base px | Notes |
|---------|-----------|---------|-------|
| Regular node body | 1H x 1H | 80x80 | **Square** — all nodes except agent are equal width & height |
| Agent node body | 3H x 1H | 240w x 80h | Only node that is wider; width ≈ 3x regular |
| Trigger node body | 1H x 1H | 80x80 | Same square size as regular, just different border-radius |
| Sub-node outer ring | 1.1H diameter | 88px | Circle, same visual weight as square node |
| Sub-node inner circle | 0.85H diameter | 68px | ~77% of outer ring |
| Node icon (regular/trigger/agent) | 0.5H x 0.5H | 40x40 | 50% of node height |
| Sub-node icon | 0.45H x 0.45H | 36x36 | Slightly smaller to fit in circle |
| Main handles (circles) | 0.15H diameter | 12px | ~15% of node height |
| AI handles (diamonds) | 0.125H | 10px | Rotated 45deg square, slightly smaller than main handles |
| Agent input handle (square) | 0.125H x 0.125H | 10x10 | Same size as diamond but not rotated |
| "+" button | 0.3H x 0.3H | 24x24 | ~30% of node height |
| Trash icon container | 0.35H x 0.35H | 28x28 | Slightly larger than "+" buttons |
| Trash icon SVG | 0.2H x 0.2H | 16x16 | ~57% of container |

**Proportional spacing:**

| Relationship | Ratio | Base px | Notes |
|-------------|-------|---------|-------|
| Horizontal node spacing | 2.5H | ~200px | Center-to-center between chained nodes |
| Sub-node spacing (horizontal) | 1.5H | ~120px | Center-to-center between sibling sub-nodes |
| Sub-node distance below agent | 1.9H | ~150px | Vertical gap from agent bottom to sub-node center |
| AI connector stem length | 0.375H | ~30px | Vertical line from agent bottom to diamond |
| Gap: node bottom → label | 0.1H | ~8px | Between node body and label text |
| Gap: label → subtitle | 0.025H | ~2px | Between label and subtitle |
| Trigger execute button gap | 0.1H | ~8px | Between Execute button and trigger node |

**Font sizes (relative to H):**

| Text element | Proportion | Base px |
|-------------|-----------|---------|
| Agent node name (inside body) | 0.175H | 14px |
| Node label (below node) | 0.1625H | 13px |
| Subtitle (below label) | 0.1375H | 11px |
| AI connector labels | 0.1375H | 11px |
| Context menu items | 0.1625H | 13px |
| Shortcut badges | 0.1375H | 11px |
| Palette item name | 0.175H | 14px |
| Palette item description | 0.15H | 12px |

**Key proportional relationships (zoom-independent):**
- **All nodes are SQUARE (1:1 width:height) EXCEPT the agent node** which is ~3x wider
- Sub-node diameter ≈ 1.1x node side length (visually same "weight" as the square)
- Icon fills 50% of its containing node
- Handles are ~15% of node side length
- "+" buttons are ~30% of node side length
- Sub-nodes sit ~1.9x node-side-lengths below the agent
- Sibling sub-nodes are ~1.5x node-side-lengths apart

## Task Description

Comprehensive UI/UX overhaul of the frontend-v2 workflow editor canvas to closely match n8n's visual design and interaction patterns. This covers:

1. **Node shape redesign** — all regular nodes become uniform rounded-corner rectangles showing only the icon, with the label as text below the node
2. **Trigger node redesign** — left-half pill shape with lightning bolt icon; hover reveals "Execute workflow" button
3. **Agent node special layout** — wider node with icon + name inside, 3 bottom AI connectors (Chat Model*, Memory, Tool) with always-visible "+" buttons; output handle on right
4. **Tool/Memory/LLM sub-nodes** — circular shape (same height/width as rectangle nodes) with icon centered, text below, single connector on top
5. **Edge interaction** — hover turns edge red with a trash icon; clicking trash deletes the edge
6. **Context menu enhancement** — full right-click menu: Open, Rename, Copy, Duplicate, Deactivate, Delete (with keyboard shortcuts)
7. **Node renaming** — inline rename on double-click or via context menu
8. **Agent "+" buttons** — clicking opens filtered node palette (Tools, Memory, Language Models) based on n8n's `NodeConnectionTypes` output types and `usableAsTool` flag

## Objective

When complete, the workflow editor canvas will visually and functionally match n8n's editor for all node shapes, edge interactions, context menus, agent tool wiring, and trigger node behavior — as shown in the provided screenshots.

## Problem Statement

The current canvas renders all nodes identically as rectangular cards with icon + label inside and a colored left border. There is no visual distinction between trigger nodes, regular nodes, agent nodes, and tool/memory/LLM sub-nodes. The context menu only has Duplicate and Delete. Edges have no delete-on-hover interaction. Agent nodes have no "+" buttons to add tools/memory/language models with filtered palette views.

## Solution Approach

Refactor the canvas rendering layer into multiple specialized node components registered as distinct VueFlow node types, each matching n8n's visual design. Enhance the edge component with hover-delete behavior. Extend the context menu and node creator with filtered views. All changes are in `workflowbuilder/apps/frontend-v2/src/`.

## Relevant Files

### Existing Files to Modify

- **`src/editor/components/EditorCanvas.vue`** — Register new node types (trigger, agent, subNode), handle new connection validation rules, update drag-and-drop to set correct node type
- **`src/editor/components/CanvasNode.vue`** — Refactor into icon-only uniform rectangle for regular nodes; extract shared logic into composable
- **`src/editor/components/CanvasEdge.vue`** — Add hover-to-red behavior, trash icon overlay, click-to-delete
- **`src/editor/components/CanvasContextMenu.vue`** — Expand menu items: Open, Rename, Copy, Duplicate, Deactivate, Delete with keyboard shortcuts
- **`src/editor/components/node-creator/NodeCreator.vue`** — Add `filterMode` prop for 'tools' | 'memory' | 'languageModel' | 'all'; support opening in filtered mode from agent "+" buttons
- **`src/editor/components/node-creator/NodeCreatorPanel.vue`** — Pass filter mode to list view
- **`src/editor/components/node-creator/NodeListView.vue`** — Apply AI connection type filtering
- **`src/editor/components/node-creator/category-definitions.ts`** — Add AI sub-categories for Tools, Memory, Language Models
- **`src/editor/components/NodeIcon.vue`** — Support circular variant styling
- **`src/editor/components/PropertiesPanel.vue`** — Integrate rename functionality
- **`src/stores/use-node-types-store.ts`** — Add computed getters: `toolNodes`, `memoryNodes`, `languageModelNodes`; parse `usableAsTool` flag; expose AI output type metadata
- **`src/stores/use-workflow-editor-store.ts`** — Add `renameNode()`, `copyNode()`, `deactivateNode()` actions; update `addNode()` to set correct VueFlow node type based on node category; handle sub-node positioning and wiring
- **`src/styles/main.scss`** — Add CSS custom properties for new node shapes, colors, dimensions

### New Files to Create

- **`src/editor/components/TriggerNode.vue`** — Trigger node with pill-shaped left side, lightning bolt, hover execute button
- **`src/editor/components/AgentNode.vue`** — Agent node with wider body, icon + name inside, 3 bottom AI connectors with "+" buttons, right output handle
- **`src/editor/components/SubNode.vue`** — Circular node for tool/memory/LLM nodes with top connector
- **`src/editor/components/EdgeDeleteButton.vue`** — Trash icon overlay component for edge hover-delete
- **`src/editor/components/InlineRename.vue`** — Inline text input for node renaming
- **`src/editor/composables/use-node-classification.ts`** — Composable to classify nodes: `isTrigger()`, `isAgent()`, `isSubNode()` (tool/memory/LLM), `isRegular()`
- **`src/editor/composables/use-node-context-menu.ts`** — Composable encapsulating context menu actions and keyboard shortcut mappings
- **`src/editor/composables/use-agent-connectors.ts`** — Composable for agent bottom connector logic (add tool, add memory, add language model)

## Implementation Phases

### Phase 1: Foundation — Node Classification & Store Extensions

**Goal:** Build the data layer that classifies nodes and exposes filtered lists.

1. Create `use-node-classification.ts` composable:
   - `isTriggerNode(nodeType: string): boolean` — check `group` includes `'trigger'` OR name ends with `Trigger`
   - `isAgentNode(nodeType: string): boolean` — check name is `@n8n/n8n-nodes-langchain.agent` or similar agent types
   - `isSubNode(nodeType: string): boolean` — check if node's `outputs` contains any `ai_*` type AND does NOT contain `'main'` type (tools, memory, LLMs, embeddings, etc.)
   - `getSubNodeShape(nodeType: string): 'circle'` — all sub-nodes are circles
   - `getVueFlowNodeType(nodeType: string): 'canvasNode' | 'triggerNode' | 'agentNode' | 'subNode'`

2. Extend `use-node-types-store.ts`:
   - Add getter `toolNodes`: filter where outputs include `ai_tool` OR `usableAsTool === true`
   - Add getter `memoryNodes`: filter where outputs include `ai_memory`
   - Add getter `languageModelNodes`: filter where outputs include `ai_languageModel`
   - Add getter `outputParserNodes`: filter where outputs include `ai_outputParser`
   - Parse `usableAsTool` from raw node descriptions and auto-generate tool variants in the palette (matching what `node-types.ts` does on the backend)

3. Extend `use-workflow-editor-store.ts`:
   - `renameNode(nodeId: string, newLabel: string)` — update node data label
   - `copyNode(nodeId: string)` — serialize to clipboard (JSON)
   - `pasteNode()` — deserialize from clipboard, offset position
   - `deactivateNode(nodeId: string)` — toggle `disabled` flag in node data
   - Update `addNode()` to call `getVueFlowNodeType()` and set the correct `type` field
   - Add `addSubNodeToAgent(agentNodeId: string, subNodeType: string, connectorType: 'ai_tool' | 'ai_memory' | 'ai_languageModel')` — creates the sub-node below the agent, auto-wires edge

### Phase 2: Core Implementation — Node Components

**Goal:** Implement the 4 distinct node visual types.

#### 2A: Regular Node Redesign (`CanvasNode.vue`)

> **Reference**: `specs/n8n-ui-reference-images/02-regular-nodes-chain.png`

Transform existing node from card-with-label to n8n-style:
- **Shape:** Rounded-corner SQUARE (e.g. ~80x80px), uniform size for all regular nodes — all nodes are equal width and height except agent
- **Content:** Icon centered (40x40px), no text inside the node body
- **Label:** Node name rendered as text BELOW the node (outside the node div), centered
- **Subtitle:** Auto-generated description text below the label (smaller, gray)
- **Handles:**
  - Input: left side, gray circle
  - Output: right side, gray circle
- **Border:** 2px solid, color from n8n's node color or category-based
- **Selected state:** Blue/purple border + shadow
- **Hover state:** Subtle shadow lift
- **Pin indicator:** Small purple pin icon in bottom-right corner (like n8n's puzzle piece icon)

#### 2B: Trigger Node (`TriggerNode.vue`)

> **Reference**: `specs/n8n-ui-reference-images/07-trigger-node-default.png` (default), `specs/n8n-ui-reference-images/08-trigger-node-hover-execute.png` (hover)

New VueFlow custom node type `triggerNode`:
- **Shape:** Rounded-corner rectangle BUT left side has much larger border-radius (~20-24px) creating a pill/capsule effect on the left half only. Right side has standard small border-radius (~8px)
  - CSS approach: `border-radius: 24px 8px 8px 24px`
- **Content:** Icon centered (40x40px)
- **Lightning bolt:** Small orange/red lightning bolt icon positioned at bottom-left of node
- **Label:** Node name below the node, centered
- **Hover behavior:**
  - Lightning bolt replaced by an "Execute workflow" button (orange/red pill button with flask icon + text)
  - Button positioned to the left of the node
- **Handles:**
  - NO input handle (triggers are workflow entry points)
  - Output: right side, gray circle
- **No left border color** — the shape itself communicates "trigger"

#### 2C: Agent Node (`AgentNode.vue`)

> **Reference**: `specs/n8n-ui-reference-images/01-agent-with-tools-full-view.png` (full layout), `specs/n8n-ui-reference-images/03-agent-node-in-workflow.png` (in workflow), `specs/n8n-ui-reference-images/09-agent-bottom-connectors-plus.png` (bottom connectors close-up)

New VueFlow custom node type `agentNode`:
- **Shape:** Wider rounded-corner rectangle (~3H wide x 1H tall, e.g. ~240x80px) — the ONLY node that is not square, wider to accommodate icon + name inside
- **Content:** Robot/agent icon on left + node name text on right (inside the node body, like n8n's AI Agent screenshot)
- **Handles:**
  - Input: left side, dark square handle (like n8n's screenshot)
  - Output: right side, gray circle handle
  - **3 Bottom AI connectors** evenly spaced:
    1. **Chat Model** (with red asterisk `*` indicating required) — purple diamond handle
    2. **Memory** — purple diamond handle
    3. **Tool** — purple diamond handle
  - Each connector has:
    - A colored label above/below: "Chat Model*", "Memory", "Tool"
    - A visible "+" button (small square with `+` icon) below the diamond handle
    - The "+" button is ALWAYS visible (not just on hover)
- **"+" Button behavior:**
  - Chat Model `+`: Opens NodeCreator in `languageModel` filter mode
  - Memory `+`: Opens NodeCreator in `memory` filter mode
  - Tool `+`: Opens NodeCreator in `tools` filter mode
  - When a sub-node is added, the "+" button remains to allow adding more (for Tool connector)
  - For Chat Model and Memory, the "+" hides once one is connected (single connection)
- **Edges from agent to sub-nodes:** Purple dashed lines from diamond handles downward to sub-node top connectors
- **Label:** Below the node (like other nodes), but agent's name is ALSO inside the node body

#### 2D: Sub-Node / Tool Node (`SubNode.vue`)

> **Reference**: `specs/n8n-ui-reference-images/04-tool-subnodes-circles.png` (circle close-up), `specs/n8n-ui-reference-images/01-agent-with-tools-full-view.png` (circles in context)

New VueFlow custom node type `subNode`:
- **Shape:** Circle (~80x80px diameter, same height/width as regular node rectangles)
  - CSS: `border-radius: 50%`
  - Light gray background (#f3f4f6) with subtle border
  - Outer ring: slightly larger circle as a subtle shadow/border effect (like n8n's double-circle look)
- **Content:** Node icon centered (36x36px)
- **Label:** Node name below the circle, centered
- **Subtitle:** Auto-generated description below label (smaller, gray)
- **Handle:**
  - Single connector on TOP (not left): purple diamond handle
  - This connects upward to the agent's bottom AI connector
  - NO output handle on right (sub-nodes don't chain to other nodes)
- **Applies to:** All nodes whose outputs are exclusively `ai_*` types:
  - Tool nodes (ai_tool output)
  - Memory nodes (ai_memory output)
  - Language Model nodes (ai_languageModel output)
  - Output Parser nodes (ai_outputParser output)
  - Embedding nodes (ai_embedding output)
  - Vector Store nodes (ai_vectorStore output)
  - etc.

### Phase 3: Edge Interaction & Delete

> **Reference**: `specs/n8n-ui-reference-images/05-edge-delete-hover.png`

**Goal:** Add hover-to-delete behavior on edges matching n8n.

Modify `CanvasEdge.vue`:
- **Default state:** Gray (regular) or purple dashed (AI) edge as current
- **Hover state:**
  - Edge path stroke turns red/coral (#ef4444) with dashed pattern
  - A trash icon appears at the midpoint of the edge path
  - Trash icon: small square container with trash SVG, gray by default
  - On hovering the trash icon specifically: icon turns red
- **Click trash:** Calls `removeEdge(edgeId)` from workflow editor store
- **Implementation:**
  - Use VueFlow's `EdgeLabelRenderer` to position the trash icon at the edge midpoint
  - Track hover state with `@mouseenter` / `@mouseleave` on the edge path
  - Use `getEdgeCenter()` or custom midpoint calculation for positioning

Create `EdgeDeleteButton.vue`:
- Props: `edgeId`, `position: { x, y }`, `visible: boolean`
- Template: Small rounded square with trash SVG icon
- Hover: background turns light red, icon turns red
- Click: emits `delete` event

### Phase 4: Context Menu Enhancement

> **Reference**: `specs/n8n-ui-reference-images/06-context-menu.png`

**Goal:** Full right-click context menu matching n8n.

Rewrite `CanvasContextMenu.vue`:
- **Node context menu items** (when right-clicking a node):
  | Action | Shortcut | Implementation |
  |--------|----------|----------------|
  | Open... | Enter | Open PropertiesPanel |
  | Execute step | — | Execute single node (future) |
  | Rename | Space | Trigger inline rename |
  | Deactivate | D | Toggle node disabled state |
  | Copy | Cmd+C | Copy node to clipboard |
  | Duplicate | Cmd+D | Duplicate node with offset |
  | Delete | Del | Remove node and edges |

- **Canvas context menu items** (when right-clicking empty canvas):
  | Action | Shortcut | Implementation |
  |--------|----------|----------------|
  | Select all | Cmd+A | Select all nodes |
  | Clear selection | — | Deselect all |
  | Fit view | — | Fit all nodes in viewport |
  | Add node | — | Open NodeCreator |

- **Styling:** Clean dropdown with separators between groups, keyboard shortcut badges right-aligned
- **Behavior:** Close on click outside, close on Escape, close on action execution

Create `use-node-context-menu.ts` composable:
- Keyboard shortcut registration (Space for rename, D for deactivate, etc.)
- Clipboard operations (copy/paste serialization)
- Action dispatch to workflow editor store

### Phase 5: Node Renaming

**Goal:** Inline rename on nodes matching n8n.

Create `InlineRename.vue`:
- Appears on: double-click node label, or Space key, or Rename from context menu
- **UI:** Text input overlaying the label area below the node
- **Behavior:**
  - Auto-selects all text on open
  - Enter confirms rename
  - Escape cancels
  - Click outside confirms
  - Empty string reverts to original
- **Integration:** Calls `renameNode(nodeId, newLabel)` on store

### Phase 6: Filtered Node Palette for Agent Connectors

> **Reference**: `specs/n8n-ui-reference-images/10-agent-language-model-palette.png` (Language Models panel), `specs/n8n-ui-reference-images/11-agent-tools-palette.png` (Tools panel)

**Goal:** Agent "+" buttons open node palette filtered to relevant node types.

Extend `NodeCreator.vue`:
- New prop: `filterMode?: 'tools' | 'memory' | 'languageModel' | null`
- New prop: `agentNodeId?: string` — the agent node to wire the selected sub-node to
- New prop: `connectorType?: string` — which AI connector type to wire to

When `filterMode` is set:
- **Skip category view** — go directly to filtered node list
- **Header changes:**
  - `tools` → "Tools" with wrench icon
  - `memory` → "Memory" with brain icon
  - `languageModel` → "Language Models" with language icon
- **Node list filtering:**
  - `tools`: Show nodes from `toolNodes` getter (outputs include `ai_tool` OR `usableAsTool`)
  - `memory`: Show nodes from `memoryNodes` getter (outputs include `ai_memory`)
  - `languageModel`: Show nodes from `languageModelNodes` getter (outputs include `ai_languageModel`)
- **Grouping:** Use codex subcategories for section headers (e.g., "Recommended Tools", "Vector Stores", "Model Context Protocol")
- **Search:** Filter within the already-filtered list
- **Selection behavior:** When a node is selected:
  1. Create the sub-node (type `subNode`) positioned below the agent
  2. Auto-wire a purple dashed edge from agent's AI connector to sub-node's top handle
  3. Close the palette

Create `use-agent-connectors.ts` composable:
- `openToolSelector(agentNodeId)` — opens palette in tools mode
- `openMemorySelector(agentNodeId)` — opens palette in memory mode
- `openLanguageModelSelector(agentNodeId)` — opens palette in languageModel mode
- `addSubNodeToAgent(agentNodeId, selectedNodeType, connectorType)`:
  - Calculate position: below agent node, evenly spaced with siblings
  - Create sub-node with `type: 'subNode'`
  - Create edge from agent's AI handle to sub-node's top handle
  - Handle ID mapping: agent's `ai_tool-N` → sub-node's `ai_tool-1` (top)

### Phase 7: Integration, Polish & VueFlow Registration

**Goal:** Wire everything together and register new node types.

Update `EditorCanvas.vue`:
- Register 4 node types with VueFlow:
  ```typescript
  const nodeTypes = {
    canvasNode: markRaw(CanvasNode),      // Regular nodes
    triggerNode: markRaw(TriggerNode),    // Trigger nodes
    agentNode: markRaw(AgentNode),        // Agent nodes
    subNode: markRaw(SubNode),            // Tool/Memory/LLM nodes
  }
  ```
- Update connection validation:
  - Sub-nodes can only connect upward to agent AI handles
  - Agent AI handles only accept sub-nodes of matching type
  - Regular main connections unchanged
- Update drag-and-drop handler to classify dropped nodes and set correct type
- Handle sub-node auto-positioning when dropped near an agent

Update styles:
- Consistent node dimensions across types
- Purple dashed edge styling for AI connections (already exists, verify consistency)
- Red hover state for edges
- Context menu styling with separators and shortcut badges
- Trigger node pill shape CSS
- Sub-node circle CSS with outer ring

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- You're responsible for deploying the right team members with the right context to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members to do the building, validating, testing, deploying, and other tasks.

### Team Members

- Builder
  - Name: foundation-builder
  - Role: Build node classification composable and extend Pinia stores with new getters, actions, and node type classification logic
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: regular-node-builder
  - Role: Refactor CanvasNode.vue into icon-only uniform rectangle with label below; extract shared composables
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: trigger-node-builder
  - Role: Build TriggerNode.vue with pill-shaped left side, lightning bolt, hover execute button
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: agent-node-builder
  - Role: Build AgentNode.vue with wider layout, 3 bottom AI connectors, "+" buttons, and filtered palette integration
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: subnode-builder
  - Role: Build SubNode.vue circular node for tool/memory/LLM nodes with top connector
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: edge-interaction-builder
  - Role: Add edge hover-to-red, trash icon, click-to-delete to CanvasEdge.vue and create EdgeDeleteButton.vue
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: context-menu-builder
  - Role: Enhance CanvasContextMenu.vue with full menu, keyboard shortcuts, rename integration, and InlineRename.vue
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: integration-builder
  - Role: Wire all new node types into EditorCanvas.vue, update connection validation, handle drag-and-drop classification, and polish CSS
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: validator
  - Role: Read-only validation of all changes — verify TypeScript compiles, visual correctness of node shapes, edge interactions, context menu completeness
  - Agent Type: validator
  - Resume: true

## Step by Step Tasks

### 1. Node Classification Composable & Store Extensions
- **Task ID**: foundation-classification
- **Depends On**: none
- **Assigned To**: foundation-builder
- **Agent Type**: builder
- **Parallel**: true (no dependencies)
- Create `src/editor/composables/use-node-classification.ts` with functions: `isTriggerNode()`, `isAgentNode()`, `isSubNode()`, `getVueFlowNodeType()`
- Classification logic:
  - Trigger: `group` includes `'trigger'` OR name ends with `Trigger`
  - Agent: name is `@n8n/n8n-nodes-langchain.agent` or contains `.agent`
  - Sub-node: outputs are exclusively `ai_*` types (no `'main'`) — covers tools, memory, LLMs, embeddings, vector stores, output parsers
  - Regular: everything else
- Extend `use-node-types-store.ts`:
  - Add `toolNodes` getter: nodes where outputs include `ai_tool` OR description has `usableAsTool: true`
  - Add `memoryNodes` getter: nodes where outputs include `ai_memory`
  - Add `languageModelNodes` getter: nodes where outputs include `ai_languageModel`
  - Ensure the raw `INodeTypeDescription` data is preserved (not just palette items) so we can inspect `outputs` and `usableAsTool`
- Extend `use-workflow-editor-store.ts`:
  - Add `renameNode(nodeId, newLabel)` action
  - Add `copyNode(nodeId)` / `pasteNode()` actions with clipboard serialization
  - Add `deactivateNode(nodeId)` action to toggle `disabled` flag
  - Update `addNode()` to use `getVueFlowNodeType()` for setting the VueFlow node `type` field
  - Add `addSubNodeToAgent(agentNodeId, subNodeType, connectorType)` action that creates positioned sub-node + auto-wires edge

### 2. Regular Node Redesign
- **Task ID**: regular-node-redesign
- **Depends On**: foundation-classification
- **Assigned To**: regular-node-builder
- **Agent Type**: builder
- **Parallel**: true (can run alongside tasks 3-5 once foundation is done)
- **Visual Reference**: See REF-01 (Regular Node) and REF-07 (Full Agent Layout — regular nodes flanking agent)
- Refactor `CanvasNode.vue` to icon-only layout:
  - Node body: ~80x80px rounded SQUARE (border-radius: 8px), white background, 2px border — same width and height
  - Content: Only the icon (40x40px) centered in the node body
  - Label: rendered OUTSIDE and BELOW the node body as centered text
  - Subtitle: smaller gray text below label showing auto-generated description
  - Remove the colored left border; use full border color based on category
  - Input handle: left side, gray circle
  - Output handle: right side, gray circle
  - Selected: purple/blue border + ring shadow
  - Hover: subtle shadow lift
- Remove AI handle rendering from CanvasNode.vue (moved to AgentNode.vue)
- Remove the "+" button on hover at output handle (will be different per node type)

### 3. Trigger Node Component
- **Task ID**: trigger-node-component
- **Depends On**: foundation-classification
- **Assigned To**: trigger-node-builder
- **Agent Type**: builder
- **Parallel**: true (can run alongside tasks 2, 4, 5)
- **Visual Reference**: See REF-02 (Trigger Node — default + hover states) and REF-08 (Trigger in workflow context)
- Create `src/editor/components/TriggerNode.vue` as a VueFlow custom node
- Shape: `border-radius: 20px 8px 8px 20px` — pill-shaped left, standard right
- Size: same square dimensions as regular nodes (e.g. ~80x80px)
- Content: Node icon centered (40x40px)
- Lightning bolt: Small orange/red bolt icon at bottom-left corner of node (absolute positioned)
- Label + subtitle below node (same pattern as regular nodes)
- Hover behavior:
  - Lightning bolt fades out
  - "Execute workflow" button appears to the LEFT of the node
  - Button: orange/red pill shape with flask/beaker icon + "Execute workflow" text
  - Button emits `execute-workflow` event
- Handles: NO input handle, output handle on right side (gray circle)
- Use same `NodeIcon.vue` for icon rendering
- Accept same `data` props structure as CanvasNode

### 4. Agent Node Component
- **Task ID**: agent-node-component
- **Depends On**: foundation-classification
- **Assigned To**: agent-node-builder
- **Agent Type**: builder
- **Parallel**: true (can run alongside tasks 2, 3, 5)
- **Visual Reference**: See REF-03 (Agent Node), REF-07 (Full Agent Layout with sub-nodes)
- Create `src/editor/components/AgentNode.vue` as a VueFlow custom node
- Shape: Wider rounded rectangle (~3H x 1H, e.g. ~240x80px), border-radius: 8px, white background, 2px gray border — only non-square node
- Content layout (inside the node body):
  - Left: Robot/agent icon (40x40px)
  - Right: Node name text (bold, truncated)
- Input handle: left side, dark square handle (matching n8n's design)
- Output handle: right side, gray circle handle
- **3 Bottom AI connectors** evenly spaced below the node:
  - Each connector has:
    - A vertical line/stem from node bottom to diamond handle
    - Purple diamond-shaped handle (rotated square)
    - Colored label: "Chat Model*" (red asterisk for required), "Memory", "Tool"
    - A "+" button below the diamond (small rounded square with + icon, always visible)
  - Handle IDs: `ai_languageModel-1`, `ai_memory-1`, `ai_tool-1`
- "+" button click behavior:
  - Emits event with `{ agentNodeId, connectorType }` to parent
  - EditorCanvas handles opening NodeCreator in filtered mode
- Create `src/editor/composables/use-agent-connectors.ts`:
  - `openToolSelector(agentNodeId)` — opens NodeCreator with filterMode='tools'
  - `openMemorySelector(agentNodeId)` — opens NodeCreator with filterMode='memory'
  - `openLanguageModelSelector(agentNodeId)` — opens NodeCreator with filterMode='languageModel'
  - `addSubNodeToAgent(agentNodeId, nodeType, connectorType)`:
    - Calculate position: 150px below agent, evenly spaced horizontally with existing sub-nodes
    - Create sub-node via store
    - Create purple dashed edge from agent AI handle to sub-node top handle
- Label below node (name duplicated below for consistency, though name is also inside)

### 5. Sub-Node (Tool/Memory/LLM) Component
- **Task ID**: subnode-component
- **Depends On**: foundation-classification
- **Assigned To**: subnode-builder
- **Agent Type**: builder
- **Parallel**: true (can run alongside tasks 2, 3, 4)
- **Visual Reference**: See REF-04 (Sub-Node circles), REF-07 (circles in context below agent)
- Create `src/editor/components/SubNode.vue` as a VueFlow custom node
- Shape: Circle, ~80px diameter (same dimension as regular node height)
  - Outer ring: slightly larger circle as subtle gray border/shadow (like n8n's double-circle)
  - Inner circle: light gray background (#f3f4f6)
  - CSS: `border-radius: 50%; width: 80px; height: 80px`
- Content: Node icon centered (36x36px)
- Label: Node name below the circle, centered, multi-line if needed
- Subtitle: Auto-generated description below label (smaller, gray)
- Handle:
  - Single purple diamond handle on TOP center of the circle
  - Handle ID: matches the AI output type (e.g., `ai_tool-1`)
  - NO handles on left, right, or bottom
- Selected state: Blue/purple ring
- Hover state: Subtle shadow lift
- Use NodeIcon.vue for icon rendering

### 6. Edge Hover-Delete Interaction
- **Task ID**: edge-hover-delete
- **Depends On**: none
- **Assigned To**: edge-interaction-builder
- **Agent Type**: builder
- **Parallel**: true (independent of node work)
- **Visual Reference**: See REF-05 (Edge Delete on Hover)
- Modify `CanvasEdge.vue`:
  - Add `isHovered` ref tracked via `@mouseenter`/`@mouseleave` on the interactive edge path
  - When hovered:
    - Change edge stroke to red/coral (#ef4444)
    - Change stroke-dasharray to dashed pattern
    - Show EdgeDeleteButton at edge midpoint
  - Edge midpoint calculation: average of source and target positions, or use VueFlow's `getEdgeCenter()`
- Create `src/editor/components/EdgeDeleteButton.vue`:
  - Rendered via VueFlow's `EdgeLabelRenderer` (already used for data badges)
  - Position: absolute at edge midpoint
  - Appearance: Small rounded square (28x28px) with gray trash SVG icon, light gray background
  - Hover: background turns light red (#fef2f2), icon turns red (#ef4444), border turns red
  - Click: emits `delete-edge` event → calls `removeEdge(edgeId)` on store
  - Only visible when parent edge `isHovered` is true
- Ensure AI (purple dashed) edges also turn red on hover (override the purple)

### 7. Enhanced Context Menu
- **Task ID**: context-menu-enhancement
- **Depends On**: foundation-classification (needs rename/copy/deactivate actions)
- **Assigned To**: context-menu-builder
- **Agent Type**: builder
- **Parallel**: true (can run after foundation)
- **Visual Reference**: See REF-06 (Context Menu)
- Rewrite `CanvasContextMenu.vue`:
  - **Node context menu** (right-click on a node):
    - Open... [Enter]
    - ---separator---
    - Rename [Space]
    - Deactivate [D]
    - ---separator---
    - Copy [Cmd+C]
    - Duplicate [Cmd+D]
    - ---separator---
    - Delete [Del]
  - **Canvas context menu** (right-click on empty canvas):
    - Add node...
    - ---separator---
    - Select all [Cmd+A]
    - Clear selection
    - ---separator---
    - Fit view
  - Each menu item: label left, shortcut badge(s) right (styled as light gray rounded boxes)
  - Separators: thin gray horizontal line with vertical margin
  - Styling: white dropdown, rounded corners, subtle shadow, 200px min-width
  - Close on: click outside, Escape key, action execution, scroll
- Create `src/editor/composables/use-node-context-menu.ts`:
  - Register keyboard shortcuts on editor (Space, D, Cmd+C, Cmd+D, Del, Cmd+A)
  - Provide action handlers that delegate to workflow editor store
  - Handle "Open" action → open PropertiesPanel for selected node
- Create `src/editor/components/InlineRename.vue`:
  - Triggered by: double-click on node label, Space key with node selected, "Rename" context menu
  - Position: overlays the label area below the node
  - Input: pre-filled with current node label, auto-selected
  - Confirm: Enter or click outside → calls `renameNode(nodeId, newLabel)`
  - Cancel: Escape → reverts
  - Style: matches label font size/weight, subtle border, focused highlight

### 8. Filtered Node Palette for Agent
- **Task ID**: filtered-node-palette
- **Depends On**: agent-node-component, foundation-classification
- **Assigned To**: agent-node-builder (resume)
- **Agent Type**: builder
- **Parallel**: false (depends on agent node being built)
- **Visual Reference**: See REF-09 (Filtered Palette — Language Models), REF-10 (Filtered Palette — Tools)
- Extend `NodeCreator.vue`:
  - New props: `filterMode`, `agentNodeId`, `connectorType`
  - When `filterMode` is set, skip the category view and show filtered list directly
  - Header shows filtered title: "Tools", "Memory", "Language Models"
  - Description banner below search (like n8n):
    - Language Models: "Chat models are designed for interactive conversations..."
    - Tools: "Tools extend the agent's capabilities..."
    - Memory: "Memory allows the agent to remember previous interactions..."
- Extend `NodeListView.vue`:
  - When in filtered mode, use the store getters (`toolNodes`, `memoryNodes`, `languageModelNodes`)
  - Group items by codex subcategories (e.g., "Recommended Tools", "Model Context Protocol", "Vector Stores")
  - Each group is collapsible with chevron
- On node selection in filtered mode:
  - Call `addSubNodeToAgent(agentNodeId, selectedNodeType, connectorType)` from the agent connectors composable
  - Close the palette
  - New sub-node appears below the agent, auto-wired

### 9. Integration & VueFlow Registration
- **Task ID**: integration-registration
- **Depends On**: regular-node-redesign, trigger-node-component, agent-node-component, subnode-component, edge-hover-delete, context-menu-enhancement, filtered-node-palette
- **Assigned To**: integration-builder
- **Agent Type**: builder
- **Parallel**: false (final integration step)
- **Visual Reference**: ALL REF sections (REF-01 through REF-10) — verify every element matches the specs
- Update `EditorCanvas.vue`:
  - Import and register all 4 node types: `canvasNode`, `triggerNode`, `agentNode`, `subNode`
  - Import the new `CanvasEdge` (with delete behavior)
  - Update `isValidConnection()`:
    - Sub-node top handles can only connect to agent bottom AI handles of matching type
    - Agent AI handles only accept connections from sub-nodes with matching AI output type
    - Regular main connections unchanged
  - Update drag-and-drop handler:
    - Use `getVueFlowNodeType()` to classify dropped nodes
    - Set correct `type` field on new VueFlow node
  - Handle agent "+" button events:
    - Listen for `open-ai-selector` events from AgentNode
    - Open NodeCreator with appropriate `filterMode`, `agentNodeId`, `connectorType`
  - Handle NodeCreator selection in filtered mode:
    - Call `addSubNodeToAgent()` to create and wire the sub-node
- Update `main.scss`:
  - Add CSS variables for node dimensions: `--node-size: 80px` (square side for all nodes), `--agent-node-width: 240px` (only agent is non-square), `--subnode-diameter: 88px`
  - Add trigger node pill radius variable
  - Add edge delete button colors
  - Add context menu styling variables
- Verify all interactions work end-to-end:
  - Drag regular node → renders as icon-only rectangle
  - Drag trigger node → renders with pill left shape + lightning bolt
  - Drag agent node → renders wide with 3 bottom connectors
  - Click agent "+" → opens filtered palette → select tool → sub-node appears as circle below agent, auto-wired
  - Right-click → full context menu with all actions
  - Double-click label → inline rename
  - Hover edge → turns red with trash icon → click to delete

### 10. Final Validation
- **Task ID**: validate-all
- **Depends On**: integration-registration
- **Assigned To**: validator
- **Agent Type**: validator
- **Parallel**: false
- Run TypeScript compilation: `cd workflowbuilder && pnpm tsc --noEmit`
- Verify no unused imports or dead code from refactoring
- Check all 4 node types render correctly in the VueFlow canvas
- Verify edge hover-delete interaction works for both regular and AI edges
- Verify context menu shows correct items for node vs canvas right-click
- Verify inline rename saves correctly to store
- Verify agent "+" buttons open filtered palette with correct node lists
- Verify sub-node auto-wiring creates correct edge with proper handle IDs
- Verify trigger node hover shows "Execute workflow" button
- Run existing tests: `cd workflowbuilder && pnpm test`
- Check visual consistency: node sizes uniform, labels aligned, colors consistent

## Acceptance Criteria

1. **Regular nodes** render as uniform rounded rectangles with icon only, label below
2. **Trigger nodes** render with pill-shaped left side and lightning bolt; hover reveals "Execute workflow" button
3. **Agent nodes** render wider with icon + name inside, 3 bottom AI connectors with always-visible "+" buttons
4. **Sub-nodes** (tools, memory, LLMs) render as circles with icon, label below, single top connector
5. **Edge hover** turns the edge red/dashed with a centered trash icon; clicking trash deletes the edge
6. **Context menu** shows full set of actions (Open, Rename, Copy, Duplicate, Deactivate, Delete) with keyboard shortcuts
7. **Node renaming** works via double-click, Space key, or context menu Rename
8. **Agent "+" buttons** open the node palette filtered to the correct category (Tools, Memory, Language Models)
9. **Selecting a node from filtered palette** auto-creates a sub-node below the agent and wires it with a purple dashed edge
10. **All existing functionality** (drag-and-drop, save/load, execution, properties panel) continues to work
11. **TypeScript compiles** without errors
12. **Existing tests pass** without regression

## Validation Commands

```bash
# TypeScript compilation check
cd workflowbuilder && pnpm tsc --noEmit

# Run unit tests
cd workflowbuilder && pnpm test

# Run frontend-v2 dev server to visually verify
cd workflowbuilder/apps/frontend-v2 && pnpm dev

# Check for TypeScript errors in new files specifically
npx tsc --noEmit --pretty 2>&1 | head -50
```

## Notes

- **n8n's `usableAsTool` flag** is the key differentiator: nodes with this flag should appear in the Tools panel even though they don't natively output `ai_tool`. The backend (`node-types.ts`) already auto-generates tool variants — the frontend needs to match this behavior in its filtering.
- **NodeConnectionTypes** from `n8n-workflow` defines all AI connection types. The frontend already parses these in `use-node-types-store.ts` — we're extending that parsing, not replacing it.
- **VueFlow custom node types** are registered via the `node-types` prop on `<VueFlow>`. Each type maps to a Vue component that receives `data`, `id`, `selected`, etc. as props.
- **Sub-node positioning** should use a simple algorithm: center below the agent node, space sub-nodes 120px apart horizontally. When a new sub-node is added, re-layout all sub-nodes of that agent.
- **Edge handle IDs** must be consistent between the agent's bottom handles and the sub-node's top handle. The agent emits `ai_tool-1`, `ai_tool-2`, etc. (incrementing per connected tool), while each sub-node has a single top handle `ai_tool-1`.
- The **Cardinal Rule** still applies: we never modify n8n packages. All UI logic is in our frontend code.
- **CSS approach for trigger node**: Use `clip-path` or `border-radius` manipulation. The `border-radius: 20px 8px 8px 20px` approach is simplest and matches n8n's look.
- **Dark mode**: All new components should respect the existing CSS custom property theming system in `main.scss`.

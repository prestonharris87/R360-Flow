/**
 * Minimal Workflow Builder type re-definitions for the translator.
 *
 * These match the types from workflowbuilder/apps/types/src/ but are defined
 * locally so the translator package has no dependency on the frontend monorepo.
 *
 * Source types reference:
 *   - WorkflowBuilderNode = Node<NodeData>  (from @xyflow/react Node generic)
 *   - WorkflowBuilderEdge = Edge<EdgeData>  (from @xyflow/react Edge generic)
 *   - DiagramModel = { name, layoutDirection, diagram: ReactFlowJsonObject }
 *   - NodeData = { type, icon, templateType?, properties, segments? }
 *   - EdgeData = { label?, icon? }
 *   - NodeType = 'node' | 'start-node' | 'ai-node' | 'decision-node'
 *   - LayoutDirection = 'DOWN' | 'RIGHT'
 *   - Viewport = { x, y, zoom }
 */

// -- Layout --

export type LayoutDirection = 'DOWN' | 'RIGHT';

// -- Viewport --

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

// -- Node types --

/**
 * Mirrors the NodeType enum from workflowbuilder/apps/types/src/node-types.ts.
 * Used as the `type` field on WorkflowBuilderNode (the React Flow node type).
 */
export type WorkflowBuilderNodeType =
  | 'node'
  | 'start-node'
  | 'ai-node'
  | 'decision-node';

/**
 * Mirrors NodeData from workflowbuilder/apps/types/src/node-data.ts.
 * The `data` payload carried by each React Flow node.
 *
 * - `type`: the n8n node type identifier (e.g., 'n8n-nodes-base.manualTrigger')
 * - `icon`: icon identifier string (WBIcon from the SDK)
 * - `templateType`: optional, maps to NodeType enum value
 * - `properties`: bag of node configuration values including label and description
 * - `segments`: placeholder for future segment data
 */
export interface WorkflowBuilderNodeData {
  type: string;
  icon: string;
  templateType?: string;
  properties: Record<string, unknown>;
  segments?: unknown[];
}

/**
 * Mirrors WorkflowBuilderNode (Node<NodeData>) from the SDK.
 * Represents a single node in the React Flow diagram.
 *
 * - `id`: unique node identifier
 * - `type`: React Flow node type (maps to WorkflowBuilderNodeType)
 * - `position`: { x, y } coordinates on the canvas
 * - `data`: WorkflowBuilderNodeData payload
 * - `width`, `height`: optional measured dimensions from React Flow
 * - `selected`, `dragging`: optional transient UI state
 */
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

/**
 * Mirrors EdgeData from workflowbuilder/apps/types/src/node-data.ts.
 */
export interface WorkflowBuilderEdgeData {
  label?: string;
  icon?: string;
}

/**
 * Mirrors WorkflowBuilderEdge (Edge<EdgeData>) from the SDK.
 * Represents a connection between two nodes in the React Flow diagram.
 *
 * - `id`: unique edge identifier
 * - `source`: source node id
 * - `target`: target node id
 * - `sourceHandle`: optional handle identifier on the source node
 * - `targetHandle`: optional handle identifier on the target node
 * - `type`: optional React Flow edge type
 * - `data`: optional edge data payload (label, icon)
 */
export interface WorkflowBuilderEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  data?: WorkflowBuilderEdgeData;
}

/**
 * Mirrors DiagramModel from workflowbuilder/apps/types/src/common.ts.
 * The top-level serialization format for a Workflow Builder diagram.
 *
 * - `name`: workflow name
 * - `layoutDirection`: 'DOWN' or 'RIGHT' layout orientation
 * - `diagram`: contains the React Flow JSON representation
 *   - `nodes`: array of WorkflowBuilderNode
 *   - `edges`: array of WorkflowBuilderEdge
 *   - `viewport`: camera position and zoom level
 */
export interface DiagramModel {
  name: string;
  layoutDirection: LayoutDirection;
  diagram: {
    nodes: WorkflowBuilderNode[];
    edges: WorkflowBuilderEdge[];
    viewport: Viewport;
  };
}

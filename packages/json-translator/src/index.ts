/**
 * @r360/json-translator
 *
 * Bidirectional translation between Workflow Builder's DiagramModel
 * and n8n's WorkflowParameters format.
 *
 * Phase 2 scaffold: type definitions only.
 * Translation functions will be added in Steps 2.4a through 2.4e.
 */

// n8n-compatible types (locally defined, no n8n imports)
export type {
  INode,
  INodeParameters,
  INodeCredentialDescription,
  NodeParameterValue,
  NodeConnectionType,
  IConnection,
  NodeInputConnections,
  INodeConnections,
  IConnections,
  WorkflowParameters,
  WorkflowSettings,
} from './types';

// Workflow Builder types (locally defined mirrors of SDK types)
export type {
  DiagramModel,
  WorkflowBuilderNode,
  WorkflowBuilderNodeData,
  WorkflowBuilderEdge,
  WorkflowBuilderEdgeData,
  WorkflowBuilderNodeType,
  Viewport,
  LayoutDirection,
} from './wb-types';

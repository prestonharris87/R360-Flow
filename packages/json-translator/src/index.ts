/**
 * @r360/json-translator
 *
 * Bidirectional translation between Workflow Builder's DiagramModel
 * and n8n's WorkflowParameters format.
 *
 * Entry point: translateWBToN8n() and translateN8nToWB() orchestrate
 * the forward and reverse translation pipelines respectively.
 */

import { mapWBNodeToN8nNode, buildNodeNameMap } from './node-mapping';
import { mapEdgesToConnections } from './connection-mapping';
import { mapN8nToWBNode, mapConnectionsToEdges } from './reverse-mapping';
import type { WorkflowParameters } from './types';
import type { DiagramModel, WorkflowBuilderNode, WorkflowBuilderEdge } from './wb-types';

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

// Utility exports
export { stripNodeTypePrefix } from './reverse-mapping';

/**
 * Translate a Workflow Builder DiagramModel to n8n WorkflowParameters.
 *
 * This is the forward path: visual editor -> execution engine.
 */
export function translateWBToN8n(diagram: DiagramModel): WorkflowParameters {
  const nodes = diagram.diagram.nodes;
  const edges = diagram.diagram.edges;

  // Build unique name map (n8n requires unique node names)
  const nameMap = buildNodeNameMap(nodes);

  // Map each WB node to an n8n INode, using the resolved unique name
  const n8nNodes = nodes.map((wbNode) => {
    const n8nNode = mapWBNodeToN8nNode(wbNode);
    const uniqueName = nameMap.get(wbNode.id);
    if (uniqueName) {
      n8nNode.name = uniqueName;
    }
    return n8nNode;
  });

  // Map edges to n8n connections (using the name map)
  const connections = mapEdgesToConnections(edges, nameMap);

  return {
    name: diagram.name,
    nodes: n8nNodes,
    connections,
    active: false,
    settings: {
      executionOrder: 'v1',
    },
  };
}

/**
 * Translate n8n WorkflowParameters to a Workflow Builder DiagramModel.
 *
 * This is the reverse path: execution engine -> visual editor.
 */
export function translateN8nToWB(workflow: WorkflowParameters): DiagramModel {
  // Build reverse lookup: node name -> node ID
  const nodeIdByName = new Map<string, string>();
  for (const node of workflow.nodes) {
    nodeIdByName.set(node.name, node.id);
  }

  // Map each n8n node to a WB node
  const wbNodes: WorkflowBuilderNode[] = workflow.nodes.map(mapN8nToWBNode);

  // Map connections to edges
  const wbEdges: WorkflowBuilderEdge[] = mapConnectionsToEdges(
    workflow.connections,
    nodeIdByName,
  );

  return {
    name: workflow.name,
    layoutDirection: 'RIGHT',
    diagram: {
      nodes: wbNodes,
      edges: wbEdges,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

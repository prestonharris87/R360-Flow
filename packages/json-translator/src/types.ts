/**
 * Local type definitions that mirror n8n's interfaces.
 * We define these locally because n8n packages are not installed until Phase 3.
 * In Phase 3, these will be validated against the actual n8n types via type tests.
 *
 * IMPORTANT: These are NOT imports from n8n packages. They are locally defined
 * mirrors that match the n8n-workflow interfaces. This respects the Cardinal Rule:
 * n8n packages are unmodified npm dependencies and are not imported in Phase 2.
 */

// -- n8n types (mirrored) --

export type NodeParameterValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | NodeParameterValue[]
  | { [key: string]: NodeParameterValue };

export type INodeParameters = Record<string, NodeParameterValue>;

export interface INodeCredentialDescription {
  id: string;
  name: string;
}

export interface INode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: INodeParameters;
  credentials?: Record<string, INodeCredentialDescription>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  continueOnFail?: boolean;
  onError?: 'stopWorkflow' | 'continueRegularOutput' | 'continueErrorOutput';
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
}

export type NodeConnectionType =
  | 'main'
  | 'ai_agent'
  | 'ai_tool'
  | 'ai_memory'
  | 'ai_outputParser'
  | 'ai_textSplitter'
  | 'ai_vectorStore'
  | 'ai_embedding'
  | 'ai_document'
  | 'ai_retriever'
  | 'ai_languageModel'
  | 'ai_chain';

export interface IConnection {
  node: string;
  type: NodeConnectionType;
  index: number;
}

export type NodeInputConnections = Array<IConnection[] | null>;

export interface INodeConnections {
  [connectionType: string]: NodeInputConnections;
}

export interface IConnections {
  [nodeName: string]: INodeConnections;
}

export interface WorkflowSettings {
  executionOrder?: 'v0' | 'v1';
  saveExecutionProgress?: boolean;
  saveManualExecutions?: boolean;
  timezone?: string;
  errorWorkflow?: string;
  callerPolicy?: string;
  [key: string]: unknown;
}

export interface WorkflowParameters {
  name: string;
  nodes: INode[];
  connections: IConnections;
  active: boolean;
  settings?: WorkflowSettings;
  staticData?: Record<string, unknown>;
  pinData?: Record<string, unknown>;
  tags?: string[];
}

// -- Workflow Builder types (re-exported for convenience) --

export type {
  DiagramModel,
  WorkflowBuilderNode,
  WorkflowBuilderNodeData,
  WorkflowBuilderEdge,
  Viewport,
  LayoutDirection,
} from './wb-types';

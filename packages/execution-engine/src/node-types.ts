import path from 'path';
import { createRequire } from 'module';
import type {
  INodeType,
  IVersionedNodeType,
  INodeTypes,
  IDataObject,
  INodeTypeDescription,
} from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';
import { LazyPackageDirectoryLoader } from 'n8n-core';

const require = createRequire(import.meta.url);

/**
 * R360NodeTypes implements n8n's INodeTypes interface.
 *
 * It uses LazyPackageDirectoryLoader to load node type definitions from
 * the installed n8n-nodes-base npm package in node_modules/.
 *
 * Key design decisions:
 * - Loaded ONCE at startup, shared across all tenants (node types are stateless)
 * - Uses lazy loading for performance (nodes loaded on first access)
 * - Can register additional custom R360 nodes alongside n8n's built-in nodes
 * - The loader reads from node_modules/n8n-nodes-base/dist/ which is populated
 *   by npm install -- no filesystem hacks needed
 */
export class R360NodeTypes implements INodeTypes {
  private loader: LazyPackageDirectoryLoader | null = null;
  private nodeTypeCache: Map<string, INodeType | IVersionedNodeType> = new Map();
  private customNodeTypes: Map<string, INodeType | IVersionedNodeType> = new Map();
  private initialized = false;

  /**
   * Initialize the node type loader.
   * Must be called once after DI bootstrap and before any execution.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Resolve the installed n8n-nodes-base package directory
    const n8nNodesBasePath = path.dirname(
      require.resolve('n8n-nodes-base/package.json')
    );

    this.loader = new LazyPackageDirectoryLoader(n8nNodesBasePath);
    await this.loader.loadAll();

    this.initialized = true;
  }

  /**
   * Register a custom node type (e.g., R360-specific nodes).
   * Called during startup to add custom nodes alongside n8n built-in nodes.
   */
  registerCustomNodeType(
    typeName: string,
    nodeType: INodeType | IVersionedNodeType
  ): void {
    this.customNodeTypes.set(typeName, nodeType);
  }

  /**
   * Get a node type by name. Returns the latest version if multiple exist.
   * Required by INodeTypes interface.
   */
  getByName(nodeType: string): INodeType | IVersionedNodeType {
    // Check custom nodes first
    const custom = this.customNodeTypes.get(nodeType);
    if (custom) return custom;

    // Check cache
    const cached = this.nodeTypeCache.get(nodeType);
    if (cached) return cached;

    // Load from n8n-nodes-base via the directory loader
    this.ensureInitialized();

    // n8n's LoadNodesAndCredentials.getNode() splits the full node type name
    // (e.g., "n8n-nodes-base.manualTrigger") into package name and short name,
    // then calls loader.getNode() with just the short name. The known.nodes
    // dictionary in the loader uses short names (without package prefix).
    const parts = nodeType.split('.');
    const shortName = parts.length > 1 ? parts.slice(1).join('.') : nodeType;

    // DirectoryLoader.getNode() handles lazy loading:
    // - If the node is in known.nodes but not yet in nodeTypes, it loads the
    //   source file on demand via loadNodeFromFile()
    // - If the node is unknown, it throws UnrecognizedNodeTypeError
    const nodeData = this.loader!.getNode(shortName);

    // nodeData is LoadedClass<INodeType | IVersionedNodeType>
    // with shape: { type: INodeType | IVersionedNodeType, sourcePath: string }
    const loaded = nodeData.type;

    this.nodeTypeCache.set(nodeType, loaded);
    return loaded;
  }

  /**
   * Get a node type by name and specific version.
   * Required by INodeTypes interface.
   */
  getByNameAndVersion(nodeType: string, version?: number): INodeType {
    const node = this.getByName(nodeType);

    // If it's a versioned node type, get the specific version
    if ('nodeVersions' in node) {
      const versionedNode = node as IVersionedNodeType;
      const targetVersion =
        version ?? versionedNode.currentVersion;
      const versionNode = versionedNode.nodeVersions[targetVersion];
      if (!versionNode) {
        throw new ApplicationError(
          `Node type ${nodeType} version ${targetVersion} not found`,
          { extra: { nodeType, version: targetVersion } }
        );
      }
      return versionNode;
    }

    return node as INodeType;
  }

  /**
   * Get known node types metadata.
   * Required by INodeTypes interface.
   */
  getKnownTypes(): IDataObject {
    this.ensureInitialized();
    return this.loader!.known.nodes as unknown as IDataObject;
  }

  /**
   * Get all node type descriptions (for palette API).
   * Not part of INodeTypes interface but needed for our node palette endpoint.
   */
  getNodeTypeDescriptions(): INodeTypeDescription[] {
    this.ensureInitialized();
    const descriptions = [...(this.loader!.types.nodes || [])];

    // Add custom node descriptions
    for (const [, nodeType] of this.customNodeTypes) {
      if ('description' in nodeType) {
        descriptions.push(nodeType.description as INodeTypeDescription);
      }
    }

    return descriptions;
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.loader) {
      throw new ApplicationError(
        'R360NodeTypes not initialized. Call init() before using.'
      );
    }
  }
}

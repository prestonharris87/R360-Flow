import path from 'path';
import type {
  INodeType,
  IVersionedNodeType,
  INodeTypes,
  IDataObject,
  INodeTypeDescription,
  INodeProperties,
} from 'n8n-workflow';
import { ApplicationError, NodeConnectionTypes } from 'n8n-workflow';
import { LazyPackageDirectoryLoader } from 'n8n-core';

/**
 * R360NodeTypes implements n8n's INodeTypes interface.
 *
 * It uses LazyPackageDirectoryLoader to load node type definitions from
 * the installed n8n-nodes-base and @n8n/n8n-nodes-langchain npm packages.
 *
 * Key design decisions:
 * - Loaded ONCE at startup, shared across all tenants (node types are stateless)
 * - Uses lazy loading for performance (nodes loaded on first access)
 * - Can register additional custom R360 nodes alongside n8n's built-in nodes
 * - The loaders read from node_modules/ which is populated by npm install
 * - Two loaders: one for n8n-nodes-base (core nodes) and one for
 *   @n8n/n8n-nodes-langchain (AI/Agent nodes)
 */
export class R360NodeTypes implements INodeTypes {
  private loader: LazyPackageDirectoryLoader | null = null;
  private langchainLoader: LazyPackageDirectoryLoader | null = null;
  private nodeTypeCache: Map<string, INodeType | IVersionedNodeType> = new Map();
  private customNodeTypes: Map<string, INodeType | IVersionedNodeType> = new Map();
  private toolVariantDescriptions: INodeTypeDescription[] = [];
  private initialized = false;

  /** Package name constant for langchain nodes */
  private static readonly LANGCHAIN_PACKAGE = '@n8n/n8n-nodes-langchain';

  /**
   * Initialize the node type loaders.
   * Must be called once after DI bootstrap and before any execution.
   * Loads both n8n-nodes-base and @n8n/n8n-nodes-langchain.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Resolve and load the installed n8n-nodes-base package
    const n8nNodesBasePath = path.dirname(
      require.resolve('n8n-nodes-base/package.json')
    );
    this.loader = new LazyPackageDirectoryLoader(n8nNodesBasePath);
    await this.loader.loadAll();

    // Resolve and load the installed @n8n/n8n-nodes-langchain package
    const langchainPath = path.dirname(
      require.resolve('@n8n/n8n-nodes-langchain/package.json')
    );
    this.langchainLoader = new LazyPackageDirectoryLoader(langchainPath);
    await this.langchainLoader.loadAll();

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

    // Check cache (includes previously generated tool variants)
    const cached = this.nodeTypeCache.get(nodeType);
    if (cached) return cached;

    this.ensureInitialized();

    // n8n's LoadNodesAndCredentials.getNode() splits the full node type name
    // (e.g., "n8n-nodes-base.manualTrigger" or "@n8n/n8n-nodes-langchain.agent")
    // into package name and short name, then calls loader.getNode() with just
    // the short name. The known.nodes dictionary uses short names (no prefix).
    const { packageName, shortName } = this.splitNodeTypeName(nodeType);

    // Select the appropriate loader based on the package prefix
    const targetLoader = this.getLoaderForPackage(packageName);

    // Try loading from the primary loader for this package
    try {
      // DirectoryLoader.getNode() handles lazy loading:
      // - If the node is in known.nodes but not yet in nodeTypes, it loads the
      //   source file on demand via loadNodeFromFile()
      // - If the node is unknown, it throws UnrecognizedNodeTypeError
      const nodeData = targetLoader.getNode(shortName);

      // nodeData is LoadedClass<INodeType | IVersionedNodeType>
      // with shape: { type: INodeType | IVersionedNodeType, sourcePath: string }
      const loaded = nodeData.type;

      this.nodeTypeCache.set(nodeType, loaded);
      return loaded;
    } catch {
      // Node not found in primary loader — try the other loader before
      // falling through to tool variant generation
    }

    // Try the alternate loader (langchain vs base) in case the node
    // is registered in the other package
    const alternateLoader = targetLoader === this.loader
      ? this.langchainLoader!
      : this.loader!;
    try {
      const nodeData = alternateLoader.getNode(shortName);
      const loaded = nodeData.type;
      this.nodeTypeCache.set(nodeType, loaded);
      return loaded;
    } catch {
      // Not found in either loader — check for tool variant
    }

    // If the name ends with 'Tool', try to auto-generate a tool variant
    // from a base node that has usableAsTool: true in its description.
    // This mirrors n8n CLI's createAiTools() behavior.
    if (shortName.endsWith('Tool')) {
      const baseTypeName = nodeType.replace(/Tool$/, ''); // e.g., 'n8n-nodes-base.airtop'

      try {
        const baseNode = this.getByName(baseTypeName);
        const desc = this.getNodeDescription(baseNode);

        if (desc?.usableAsTool) {
          const toolVariant = this.createToolVariant(baseNode, baseTypeName);
          this.nodeTypeCache.set(nodeType, toolVariant);
          return toolVariant;
        }
      } catch {
        // Base node not found either, fall through to error below
      }
    }

    throw new ApplicationError(
      `Unrecognized node type: ${nodeType}`,
      { extra: { nodeType } }
    );
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
   * Merges known types from both n8n-nodes-base and @n8n/n8n-nodes-langchain.
   */
  getKnownTypes(): IDataObject {
    this.ensureInitialized();
    return {
      ...(this.loader!.known.nodes as unknown as IDataObject),
      ...(this.langchainLoader!.known.nodes as unknown as IDataObject),
    };
  }

  /**
   * Get all node type descriptions (for palette API).
   * Not part of INodeTypes interface but needed for our node palette endpoint.
   * Returns descriptions from n8n-nodes-base, @n8n/n8n-nodes-langchain,
   * and any registered custom nodes.
   */
  getNodeTypeDescriptions(): INodeTypeDescription[] {
    this.ensureInitialized();
    const allDescriptions = [
      ...(this.loader!.types.nodes || []),
      ...(this.langchainLoader!.types.nodes || []),
    ];

    // Deduplicate versioned nodes: keep only the highest version for each node name.
    // LazyPackageDirectoryLoader returns separate descriptions for each version of
    // versioned nodes (e.g., HTTP Request V1, V2, V3, V4.4). The frontend only needs
    // the latest version's description (which has the correct credential types, etc.).
    const byName = new Map<string, INodeTypeDescription>();
    for (const desc of allDescriptions) {
      const existing = byName.get(desc.name);
      if (!existing) {
        byName.set(desc.name, desc);
        continue;
      }
      // Compare versions — keep the higher one
      // INodeTypeDescription.version can be number or number[] (e.g., [3, 4, 4.1, 4.2])
      const existingVersion = Array.isArray(existing.version)
        ? Math.max(...existing.version)
        : (existing.version ?? 1);
      const newVersion = Array.isArray(desc.version)
        ? Math.max(...desc.version)
        : (desc.version ?? 1);
      if (newVersion > existingVersion) {
        byName.set(desc.name, desc);
      }
    }
    const descriptions = Array.from(byName.values());

    // Add custom node descriptions
    for (const [, nodeType] of this.customNodeTypes) {
      if ('description' in nodeType) {
        descriptions.push(nodeType.description as INodeTypeDescription);
      }
    }

    // Generate and add tool variant descriptions for all nodes with usableAsTool
    if (this.toolVariantDescriptions.length === 0) {
      this.generateAllToolVariantDescriptions(descriptions);
    }
    descriptions.push(...this.toolVariantDescriptions);

    return descriptions;
  }

  /**
   * Split a fully-qualified node type name into package name and short name.
   *
   * Examples:
   * - "n8n-nodes-base.manualTrigger" -> { packageName: "n8n-nodes-base", shortName: "manualTrigger" }
   * - "@n8n/n8n-nodes-langchain.agent" -> { packageName: "@n8n/n8n-nodes-langchain", shortName: "agent" }
   * - "manualTrigger" -> { packageName: "", shortName: "manualTrigger" }
   *
   * For scoped packages like @n8n/n8n-nodes-langchain, the package name
   * contains a slash but no dots, so splitting on '.' correctly separates
   * the package prefix from the short node name.
   */
  private splitNodeTypeName(nodeType: string): { packageName: string; shortName: string } {
    const dotIndex = nodeType.lastIndexOf('.');
    if (dotIndex === -1) {
      return { packageName: '', shortName: nodeType };
    }
    return {
      packageName: nodeType.substring(0, dotIndex),
      shortName: nodeType.substring(dotIndex + 1),
    };
  }

  /**
   * Get the appropriate loader for a given package name.
   * Falls back to the n8n-nodes-base loader for unknown or empty package names.
   */
  private getLoaderForPackage(packageName: string): LazyPackageDirectoryLoader {
    if (packageName === R360NodeTypes.LANGCHAIN_PACKAGE) {
      return this.langchainLoader!;
    }
    return this.loader!;
  }

  /**
   * Extract the description from a node type, resolving versioned nodes
   * to their current version's description.
   */
  private getNodeDescription(
    node: INodeType | IVersionedNodeType
  ): INodeTypeDescription | undefined {
    if ('nodeVersions' in node) {
      const versionedNode = node as IVersionedNodeType;
      return versionedNode.nodeVersions[versionedNode.currentVersion]?.description;
    }
    return (node as INodeType).description;
  }

  /**
   * Resolve a node type to its concrete INodeType, handling versioned nodes
   * by returning the current version.
   */
  private resolveToNodeType(node: INodeType | IVersionedNodeType): INodeType {
    if ('nodeVersions' in node) {
      const versionedNode = node as IVersionedNodeType;
      const resolved = versionedNode.nodeVersions[versionedNode.currentVersion];
      if (!resolved) {
        throw new ApplicationError(
          'Could not resolve versioned node type to current version'
        );
      }
      return resolved;
    }
    return node as INodeType;
  }

  /**
   * Create an AI Tool variant of a base node type.
   *
   * This mirrors n8n CLI's createAiTools() / convertNodeToAiTool() behavior:
   * - Deep clones the base node's description
   * - Appends 'Tool' to the name and ' Tool' to the displayName
   * - Sets inputs to [] and outputs to [NodeConnectionTypes.AiTool]
   * - Removes the usableAsTool flag
   * - Applies any replacements from UsableAsToolDescription
   * - Adds toolDescription and descriptionType properties
   * - Returns a new INodeType that delegates execution to the base node
   *
   * The actual tool wrapping at execution time is handled by n8n-core's
   * createNodeAsTool() — the tool variant uses the SAME node class as the
   * original, just with a modified description.
   */
  private createToolVariant(
    baseNode: INodeType | IVersionedNodeType,
    _baseTypeName: string
  ): INodeType {
    const actualNode = this.resolveToNodeType(baseNode);
    const baseDesc = actualNode.description;

    // Apply replacements from usableAsTool if it's an object
    const replacements =
      typeof baseDesc.usableAsTool === 'object' && baseDesc.usableAsTool?.replacements
        ? baseDesc.usableAsTool.replacements
        : {};

    // Deep clone the description and apply replacements
    const toolDescription: INodeTypeDescription = {
      ...JSON.parse(JSON.stringify(baseDesc)),
      ...replacements,
    };

    // Apply tool variant transformations (mirrors convertNodeToAiTool)
    toolDescription.name += 'Tool';
    toolDescription.displayName = (toolDescription.displayName || toolDescription.name) + ' Tool';
    toolDescription.inputs = [];
    toolDescription.outputs = [NodeConnectionTypes.AiTool];
    delete toolDescription.usableAsTool;

    // Add toolDescription and descriptionType properties if not already present
    const props = toolDescription.properties;
    if (props && !props.some((p) => p.name === 'toolDescription')) {
      const hasResource = props.some((p) => p.name === 'resource');
      const hasOperation = props.some((p) => p.name === 'operation');

      const descriptionType: INodeProperties = {
        displayName: 'Tool Description',
        name: 'descriptionType',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Set Automatically',
            value: 'auto',
            description: 'Automatically set based on resource and operation',
          },
          {
            name: 'Set Manually',
            value: 'manual',
            description: 'Manually set the description',
          },
        ],
        default: 'auto',
      };

      const descProp: INodeProperties = {
        displayName: 'Description',
        name: 'toolDescription',
        type: 'string',
        default: toolDescription.description,
        required: true,
        typeOptions: { rows: 2 },
        description:
          'Explain to the LLM what this tool does, a good, specific description would allow LLMs to produce expected results much more often',
      };

      // Find the last callout index to position the new properties after callouts
      let lastCalloutIndex = -1;
      for (let i = props.length - 1; i >= 0; i--) {
        const prop = props[i];
        if (prop && prop.type === 'callout') {
          lastCalloutIndex = i;
          break;
        }
      }

      props.splice(lastCalloutIndex + 1, 0, descProp);

      if (hasResource || hasOperation) {
        props.splice(lastCalloutIndex + 1, 0, descriptionType);
        descProp.displayOptions = {
          show: {
            descriptionType: ['manual'],
          },
        };
      }
    }

    // Set tool codex categories
    const resources = toolDescription.codex?.resources ?? {};
    const existingToolsSubcategory = toolDescription.codex?.subcategories?.Tools;
    toolDescription.codex = {
      categories: ['AI'],
      subcategories: {
        AI: ['Tools'],
        Tools: existingToolsSubcategory || ['Other Tools'],
      },
      resources,
    };

    // Create a wrapper node type that uses the base node's methods
    // but presents the tool-modified description.
    // We assign execution methods directly from the base node. These methods
    // use `this` bound to the execution context at call time by n8n-core,
    // not to the node type object, so direct assignment is correct.
    const toolNode: INodeType = {
      description: toolDescription,
      execute: actualNode.execute,
      poll: actualNode.poll,
      trigger: actualNode.trigger,
      webhook: actualNode.webhook,
      methods: actualNode.methods,
      supplyData: actualNode.supplyData,
    };

    return toolNode;
  }

  /**
   * Generate tool variant descriptions for all nodes that have usableAsTool.
   * Called lazily when getNodeTypeDescriptions() is first invoked.
   * This ensures the frontend palette can display tool variants.
   */
  private generateAllToolVariantDescriptions(
    existingDescriptions: INodeTypeDescription[]
  ): void {
    const usableNodes = existingDescriptions.filter((desc) => Boolean(desc.usableAsTool));

    // Collect names of all existing descriptions to avoid generating duplicates
    // of natively-defined tool nodes
    const existingNames = new Set(existingDescriptions.map((d) => d.name));

    for (const usableDesc of usableNodes) {
      const baseName = usableDesc.name;
      const toolName = baseName + 'Tool';

      // Skip if a native tool node with this name already exists,
      // or if we already generated this variant (handles duplicate base descriptions
      // from multiple loaders, e.g., crypto appearing in both n8n-nodes-base and langchain)
      if (existingNames.has(toolName)) {
        continue;
      }
      if (this.toolVariantDescriptions.some((d) => d.name === toolName)) {
        continue;
      }

      // Apply replacements from usableAsTool if it's an object
      const replacements =
        typeof usableDesc.usableAsTool === 'object' && usableDesc.usableAsTool?.replacements
          ? usableDesc.usableAsTool.replacements
          : {};

      // Deep clone and modify
      const toolDesc: INodeTypeDescription = {
        ...JSON.parse(JSON.stringify(usableDesc)),
        ...replacements,
      };

      toolDesc.name += 'Tool';
      toolDesc.displayName = (toolDesc.displayName || toolDesc.name) + ' Tool';
      toolDesc.inputs = [];
      toolDesc.outputs = [NodeConnectionTypes.AiTool];
      delete toolDesc.usableAsTool;

      // Set tool codex
      const resources = toolDesc.codex?.resources ?? {};
      const existingToolsSubcategory = toolDesc.codex?.subcategories?.Tools;
      toolDesc.codex = {
        categories: ['AI'],
        subcategories: {
          AI: ['Tools'],
          Tools: existingToolsSubcategory || ['Other Tools'],
        },
        resources,
      };

      this.toolVariantDescriptions.push(toolDesc);
    }

    console.log(`[R360 NodeTypes] Tool variant generation: ${existingDescriptions.length} input descriptions, ${usableNodes.length} with usableAsTool, ${this.toolVariantDescriptions.length} variants generated`);
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.loader || !this.langchainLoader) {
      throw new ApplicationError(
        'R360NodeTypes not initialized. Call init() before using.'
      );
    }
  }
}

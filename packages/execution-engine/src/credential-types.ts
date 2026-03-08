import path from 'path';
import type {
  ICredentialType,
  INodeProperties,
  INodeTypeDescription,
} from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';
import { LazyPackageDirectoryLoader } from 'n8n-core';
import type { R360NodeTypes } from './node-types';

/**
 * CredentialTypeRegistry loads and indexes all credential type definitions
 * from the installed n8n-nodes-base npm package.
 *
 * This is a read-only, stateless registry — loaded ONCE at startup and
 * shared across all tenants. It provides credential type metadata
 * (properties, inheritance chains, supported nodes) needed by:
 *
 * - TenantCredentialsHelper (to resolve parent types and merged properties)
 * - Credential form UI (to know which fields a credential type has)
 * - Node palette (to show which credentials a node supports)
 *
 * Key design decisions:
 * - Uses the same LazyPackageDirectoryLoader as R360NodeTypes
 * - Credential types are loaded from n8n-nodes-base (unmodified npm dep)
 * - Parent type resolution caches results to avoid repeated walks
 * - Not part of n8n's DI container — standalone class
 */
export class CredentialTypeRegistry {
  private loader: LazyPackageDirectoryLoader | null = null;
  private credentialTypeMap: Map<string, ICredentialType> = new Map();
  private parentTypeCache: Map<string, string[]> = new Map();
  private initialized = false;
  private nodeTypes: R360NodeTypes | null;

  /**
   * @param nodeTypes - Optional R360NodeTypes instance for getSupportedNodes().
   *   Can be provided later or omitted if getSupportedNodes() is not needed.
   */
  constructor(nodeTypes?: R360NodeTypes) {
    this.nodeTypes = nodeTypes ?? null;
  }

  /**
   * Initialize the credential type loader.
   * Must be called once after DI bootstrap and before any other methods.
   *
   * Loads all credential type definitions from n8n-nodes-base using
   * LazyPackageDirectoryLoader (same approach as R360NodeTypes).
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Resolve the installed n8n-nodes-base package directory
    const n8nNodesBasePath = path.dirname(
      require.resolve('n8n-nodes-base/package.json')
    );

    this.loader = new LazyPackageDirectoryLoader(n8nNodesBasePath);
    await this.loader.loadAll();

    // Index all credential types by name for fast lookup.
    // loader.types.credentials is ICredentialType[] — flat array of all loaded types.
    const credentialTypes = this.loader.types.credentials || [];
    for (const credType of credentialTypes) {
      this.credentialTypeMap.set(credType.name, credType);
    }

    this.initialized = true;
  }

  /**
   * Get a credential type by name.
   * Returns the full ICredentialType definition.
   *
   * @throws {ApplicationError} If the credential type is not registered.
   */
  getByName(typeName: string): ICredentialType {
    this.ensureInitialized();

    const credType = this.credentialTypeMap.get(typeName);
    if (!credType) {
      throw new ApplicationError(
        `Credential type "${typeName}" is not known.`,
        { extra: { typeName } }
      );
    }

    return credType;
  }

  /**
   * Get all registered credential types.
   * Returns a new array (callers cannot mutate the internal state).
   */
  getAll(): ICredentialType[] {
    this.ensureInitialized();
    return Array.from(this.credentialTypeMap.values());
  }

  /**
   * Recursively resolve the `extends` chain for a credential type.
   *
   * For example, if `googleSheetsOAuth2Api` extends `oAuth2Api`,
   * and `oAuth2Api` extends `oAuth2Common`, this returns:
   *   ['oAuth2Api', 'oAuth2Common']
   *
   * Results are cached because the inheritance chain is static
   * (credential type definitions don't change at runtime).
   *
   * @returns Array of parent type names, from immediate parent to root.
   *          Empty array if the type has no parents.
   */
  getParentTypes(typeName: string): string[] {
    this.ensureInitialized();

    // Return cached result if available
    const cached = this.parentTypeCache.get(typeName);
    if (cached) return cached;

    const parents: string[] = [];
    const credType = this.credentialTypeMap.get(typeName);

    if (credType?.extends) {
      for (const parentName of credType.extends) {
        parents.push(parentName);
        // Recurse to collect grandparents
        const grandparents = this.getParentTypes(parentName);
        parents.push(...grandparents);
      }
    }

    // Cache the result
    this.parentTypeCache.set(typeName, parents);
    return parents;
  }

  /**
   * Get the merged properties for a credential type, including all
   * inherited properties from parent types.
   *
   * Properties are merged bottom-up: child properties take precedence
   * over parent properties (matched by `name` field). This means if
   * both child and parent define a property with the same name, the
   * child's definition wins.
   *
   * @returns Merged array of INodeProperties for the credential form.
   */
  getCredentialsProperties(typeName: string): INodeProperties[] {
    this.ensureInitialized();

    const credType = this.getByName(typeName);
    const parentTypeNames = this.getParentTypes(typeName);

    // Collect properties from parents first (root to immediate parent),
    // then overlay child properties on top.
    // We reverse the parent list so we go from root -> immediate parent,
    // building up the base properties. Then the child's properties override.
    const seenNames = new Set<string>();
    const mergedProperties: INodeProperties[] = [];

    // Start with the child's own properties (highest precedence)
    for (const prop of credType.properties) {
      seenNames.add(prop.name);
      mergedProperties.push(prop);
    }

    // Walk parent chain: immediate parent first, then grandparents, etc.
    // Only add parent properties that haven't been overridden by the child.
    for (const parentName of parentTypeNames) {
      const parentType = this.credentialTypeMap.get(parentName);
      if (!parentType) continue;

      for (const prop of parentType.properties) {
        if (!seenNames.has(prop.name)) {
          seenNames.add(prop.name);
          mergedProperties.push(prop);
        }
      }
    }

    return mergedProperties;
  }

  /**
   * Find which node types support a given credential type.
   *
   * Iterates over all loaded node type descriptions and checks their
   * `credentials` array for the specified credential type name.
   *
   * @param typeName - The credential type name to search for.
   * @returns Array of node type names (e.g., 'n8n-nodes-base.googleSheets')
   *          that list this credential type. Empty array if nodeTypes is not set.
   */
  getSupportedNodes(typeName: string): string[] {
    this.ensureInitialized();

    if (!this.nodeTypes) {
      return [];
    }

    // Also check if the credential type itself declares supportedNodes
    const credType = this.credentialTypeMap.get(typeName);
    if (credType?.supportedNodes && credType.supportedNodes.length > 0) {
      return [...credType.supportedNodes];
    }

    // Fall back to scanning node type descriptions
    const supportedNodes: string[] = [];

    let nodeDescriptions: INodeTypeDescription[];
    try {
      nodeDescriptions = this.nodeTypes.getNodeTypeDescriptions();
    } catch {
      // nodeTypes may not be initialized yet
      return [];
    }

    for (const desc of nodeDescriptions) {
      if (!desc.credentials) continue;

      for (const credDesc of desc.credentials) {
        if (credDesc.name === typeName) {
          supportedNodes.push(desc.name);
          break;
        }
      }
    }

    return supportedNodes;
  }

  /**
   * Check if a credential type is registered (known to the system).
   *
   * @returns true if the credential type name is in the registry.
   */
  recognizes(typeName: string): boolean {
    this.ensureInitialized();
    return this.credentialTypeMap.has(typeName);
  }

  /**
   * Filter credential types using expression-based filters with optional search.
   *
   * Filters are OR'd — a credential type is included if ANY filter matches.
   *
   * Supported filter expressions:
   *   - `extends:oAuth2Api`  — type's inheritance chain includes oAuth2Api
   *   - `extends:oAuth1Api`  — type's inheritance chain includes oAuth1Api
   *   - `has:authenticate`   — type has an `authenticate` property AND does NOT have `genericAuth === true`
   *   - `has:genericAuth`    — type has `genericAuth === true`
   *
   * @param filters - Array of filter expression strings (OR'd together)
   * @param search  - Optional substring to match against displayName or name (case-insensitive)
   * @returns Matching credential types sorted alphabetically by displayName
   */
  filterByExpressions(filters: string[], search?: string): ICredentialType[] {
    this.ensureInitialized();

    const allTypes = Array.from(this.credentialTypeMap.values());

    // Apply expression filters (OR logic)
    let results: ICredentialType[];

    if (filters.length === 0) {
      results = allTypes;
    } else {
      results = allTypes.filter((credType) => {
        return filters.some((filter) => {
          if (filter.startsWith('extends:')) {
            const parentName = filter.slice('extends:'.length);
            const parents = this.getParentTypes(credType.name);
            return parents.includes(parentName);
          }

          if (filter === 'has:authenticate') {
            return (
              !!(credType as any).authenticate &&
              (credType as any).genericAuth !== true
            );
          }

          if (filter === 'has:genericAuth') {
            return (credType as any).genericAuth === true;
          }

          return false;
        });
      });
    }

    // Apply optional search substring filter
    if (search) {
      const lowerSearch = search.toLowerCase();
      results = results.filter((credType) => {
        const name = credType.name.toLowerCase();
        const displayName = credType.displayName.toLowerCase();
        return name.includes(lowerSearch) || displayName.includes(lowerSearch);
      });
    }

    // Sort alphabetically by displayName
    results.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return results;
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.loader) {
      throw new ApplicationError(
        'CredentialTypeRegistry not initialized. Call init() before using.'
      );
    }
  }
}

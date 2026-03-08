import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bootstrapN8nContainer, resetBootstrap } from '../bootstrap';
import { CredentialTypeRegistry } from '../credential-types';

const TEST_ENCRYPTION_KEY = 'test-key-32-bytes-long-xxxxxxxx';

describe('CredentialTypeRegistry', () => {
  let registry: CredentialTypeRegistry;
  let testUserFolder: string;

  beforeAll(async () => {
    // Create a temporary directory for n8n state
    testUserFolder = mkdtempSync(path.join(tmpdir(), 'r360-cred-types-test-'));

    // Bootstrap DI first (required for LazyPackageDirectoryLoader)
    resetBootstrap();
    await bootstrapN8nContainer({
      encryptionKey: TEST_ENCRYPTION_KEY,
      userFolder: testUserFolder,
    });

    registry = new CredentialTypeRegistry();
    await registry.init();
  }, 60000); // Loading n8n-nodes-base may take a while

  afterAll(() => {
    try {
      rmSync(testUserFolder, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  // -------------------------------------------------------
  // Initialization
  // -------------------------------------------------------

  describe('initialization', () => {
    it('init() does not throw', async () => {
      // Already initialized in beforeAll, calling again should be a no-op
      await expect(registry.init()).resolves.toBeUndefined();
    });

    it('init() is idempotent (second call is a no-op)', async () => {
      // Registry is already initialized; calling init again should not throw or reset state
      await registry.init();

      const types = registry.getAll();
      expect(types.length).toBeGreaterThan(0);
    });

    it('throws when methods are called before init()', () => {
      const uninitRegistry = new CredentialTypeRegistry();

      expect(() => uninitRegistry.getAll()).toThrow(
        'CredentialTypeRegistry not initialized'
      );
      expect(() => uninitRegistry.getByName('httpBasicAuth')).toThrow(
        'CredentialTypeRegistry not initialized'
      );
      expect(() => uninitRegistry.recognizes('httpBasicAuth')).toThrow(
        'CredentialTypeRegistry not initialized'
      );
      expect(() => uninitRegistry.getParentTypes('httpBasicAuth')).toThrow(
        'CredentialTypeRegistry not initialized'
      );
      expect(() => uninitRegistry.getCredentialsProperties('httpBasicAuth')).toThrow(
        'CredentialTypeRegistry not initialized'
      );
    });
  });

  // -------------------------------------------------------
  // getAll()
  // -------------------------------------------------------

  describe('getAll()', () => {
    it('returns a non-empty array of credential types', () => {
      const types = registry.getAll();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
    });

    it('returns 100+ credential types from n8n-nodes-base', () => {
      const types = registry.getAll();
      // n8n-nodes-base has hundreds of credential types
      expect(types.length).toBeGreaterThan(100);
    });

    it('returns a new array each time (callers cannot mutate internal state)', () => {
      const types1 = registry.getAll();
      const types2 = registry.getAll();
      expect(types1).not.toBe(types2); // Different array references
      expect(types1).toEqual(types2); // Same contents
    });

    it('each credential type has required shape', () => {
      const types = registry.getAll();
      for (const t of types.slice(0, 10)) {
        // Spot check first 10
        expect(t.name).toBeDefined();
        expect(typeof t.name).toBe('string');
        expect(t.name.length).toBeGreaterThan(0);
        expect(t.displayName).toBeDefined();
        expect(typeof t.displayName).toBe('string');
        expect(Array.isArray(t.properties)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------
  // getByName()
  // -------------------------------------------------------

  describe('getByName()', () => {
    it('returns correct type for httpBasicAuth', () => {
      const type = registry.getByName('httpBasicAuth');
      expect(type).toBeDefined();
      expect(type.name).toBe('httpBasicAuth');
      expect(type.displayName).toBeDefined();
      expect(typeof type.displayName).toBe('string');
      expect(type.properties).toBeInstanceOf(Array);
    });

    it('returns correct type for httpHeaderAuth', () => {
      const type = registry.getByName('httpHeaderAuth');
      expect(type).toBeDefined();
      expect(type.name).toBe('httpHeaderAuth');
      expect(type.displayName).toBeDefined();
      expect(type.properties).toBeInstanceOf(Array);
    });

    it('throws ApplicationError for unknown type', () => {
      expect(() => registry.getByName('nonExistentType123')).toThrow(
        'Credential type "nonExistentType123" is not known.'
      );
    });

    it('throws ApplicationError for empty string', () => {
      expect(() => registry.getByName('')).toThrow(
        'Credential type "" is not known.'
      );
    });

    it('returns the same object reference for repeated calls (same instance from map)', () => {
      const first = registry.getByName('httpBasicAuth');
      const second = registry.getByName('httpBasicAuth');
      expect(first).toBe(second); // Same object reference
    });
  });

  // -------------------------------------------------------
  // recognizes()
  // -------------------------------------------------------

  describe('recognizes()', () => {
    it('returns true for known credential types', () => {
      expect(registry.recognizes('httpBasicAuth')).toBe(true);
      expect(registry.recognizes('httpHeaderAuth')).toBe(true);
    });

    it('returns false for unknown credential types', () => {
      expect(registry.recognizes('totallyFakeType')).toBe(false);
      expect(registry.recognizes('')).toBe(false);
      expect(registry.recognizes('non_existent_cred_xyz')).toBe(false);
    });
  });

  // -------------------------------------------------------
  // getParentTypes()
  // -------------------------------------------------------

  describe('getParentTypes()', () => {
    it('returns empty array for types without extends', () => {
      const parents = registry.getParentTypes('httpBasicAuth');
      expect(Array.isArray(parents)).toBe(true);
      expect(parents.length).toBe(0);
    });

    it('returns correct parent chain for types with extends', () => {
      // Find a type that extends another by scanning the registry
      const allTypes = registry.getAll();
      const typeWithExtends = allTypes.find(
        (t) => t.extends && t.extends.length > 0
      );

      if (typeWithExtends) {
        const parents = registry.getParentTypes(typeWithExtends.name);
        expect(parents.length).toBeGreaterThan(0);
        // First parent should be the immediate extends value
        expect(parents[0]).toBe(typeWithExtends.extends![0]);
      }
    });

    it('returns empty array for unknown types (no crash)', () => {
      const parents = registry.getParentTypes('totallyFakeType');
      expect(Array.isArray(parents)).toBe(true);
      expect(parents.length).toBe(0);
    });

    it('caches parent type results (same array on repeated calls)', () => {
      // First call computes and caches
      const first = registry.getParentTypes('httpBasicAuth');
      // Second call returns cached
      const second = registry.getParentTypes('httpBasicAuth');
      expect(first).toBe(second); // Same reference from cache
    });
  });

  // -------------------------------------------------------
  // getCredentialsProperties()
  // -------------------------------------------------------

  describe('getCredentialsProperties()', () => {
    it('returns properties array for httpBasicAuth', () => {
      const props = registry.getCredentialsProperties('httpBasicAuth');
      expect(Array.isArray(props)).toBe(true);
      expect(props.length).toBeGreaterThan(0);
    });

    it('httpBasicAuth has user and password properties', () => {
      const props = registry.getCredentialsProperties('httpBasicAuth');
      const propNames = props.map((p) => p.name);
      expect(propNames).toContain('user');
      expect(propNames).toContain('password');
    });

    it('each property has the required INodeProperties shape', () => {
      const props = registry.getCredentialsProperties('httpBasicAuth');
      for (const prop of props) {
        expect(prop.name).toBeDefined();
        expect(typeof prop.name).toBe('string');
        expect(prop.displayName).toBeDefined();
        expect(typeof prop.displayName).toBe('string');
        expect(prop.type).toBeDefined();
        expect(typeof prop.type).toBe('string');
      }
    });

    it('merges parent properties for inherited types', () => {
      // Find a type that extends another
      const allTypes = registry.getAll();
      const typeWithExtends = allTypes.find(
        (t) => t.extends && t.extends.length > 0
      );

      if (typeWithExtends) {
        const mergedProps = registry.getCredentialsProperties(typeWithExtends.name);
        const ownPropCount = typeWithExtends.properties.length;

        // Get parent properties
        const parentName = typeWithExtends.extends![0]!;
        const parentType = registry.getByName(parentName);
        const parentPropNames = parentType.properties.map((p) => p.name);

        // Merged properties should include parent properties
        // (unless they are all overridden by the child)
        expect(mergedProps.length).toBeGreaterThanOrEqual(ownPropCount);

        // Check that at least some parent properties appear in merged results
        // (if the child doesn't override all of them)
        const childPropNames = new Set(
          typeWithExtends.properties.map((p) => p.name)
        );
        const parentOnlyPropNames = parentPropNames.filter(
          (name) => !childPropNames.has(name)
        );

        if (parentOnlyPropNames.length > 0) {
          const mergedPropNames = mergedProps.map((p) => p.name);
          for (const parentPropName of parentOnlyPropNames) {
            expect(mergedPropNames).toContain(parentPropName);
          }
        }
      }
    });

    it('child properties take precedence over parent properties', () => {
      // Find a type that extends and overrides a parent property
      const allTypes = registry.getAll();
      const typeWithExtends = allTypes.find((t) => {
        if (!t.extends || t.extends.length === 0) return false;
        const parentName = t.extends[0]!;
        try {
          const parent = registry.getByName(parentName);
          // Check if child and parent share any property name
          const childNames = new Set(t.properties.map((p) => p.name));
          return parent.properties.some((p) => childNames.has(p.name));
        } catch {
          return false;
        }
      });

      if (typeWithExtends) {
        const parentName = typeWithExtends.extends![0]!;
        const parentType = registry.getByName(parentName);

        // Find a shared property name
        const childNames = new Set(
          typeWithExtends.properties.map((p) => p.name)
        );
        const sharedProp = parentType.properties.find((p) =>
          childNames.has(p.name)
        );

        if (sharedProp) {
          const mergedProps = registry.getCredentialsProperties(
            typeWithExtends.name
          );
          const mergedProp = mergedProps.find(
            (p) => p.name === sharedProp.name
          );
          // The merged property should be the child's version
          const childProp = typeWithExtends.properties.find(
            (p) => p.name === sharedProp.name
          );
          expect(mergedProp).toEqual(childProp);
        }
      }
    });

    it('throws for unknown type', () => {
      expect(() =>
        registry.getCredentialsProperties('nonExistentType123')
      ).toThrow('Credential type "nonExistentType123" is not known.');
    });
  });

  // -------------------------------------------------------
  // getSupportedNodes()
  // -------------------------------------------------------

  describe('getSupportedNodes()', () => {
    it('returns empty array when no nodeTypes is provided', () => {
      // Our registry was created without nodeTypes
      const nodes = registry.getSupportedNodes('httpBasicAuth');
      expect(Array.isArray(nodes)).toBe(true);
      expect(nodes.length).toBe(0);
    });

    it('returns empty array for unknown type', () => {
      const nodes = registry.getSupportedNodes('totallyFakeType');
      expect(Array.isArray(nodes)).toBe(true);
      expect(nodes.length).toBe(0);
    });
  });
});

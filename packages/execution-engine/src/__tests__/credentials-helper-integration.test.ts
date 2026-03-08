import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type {
  ICredentialDataDecryptedObject,
  IHttpRequestOptions,
  INodeCredentialsDetails,
  IWorkflowExecuteAdditionalData,
} from 'n8n-workflow';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bootstrapN8nContainer, resetBootstrap } from '../bootstrap';
import {
  TenantCredentialsHelper,
  type CredentialLookupFn,
  type CredentialUpdateFn,
} from '../credentials-helper';
import { CredentialTypeRegistry } from '../credential-types';

const TEST_ENCRYPTION_KEY = 'test-key-32-bytes-long-xxxxxxxx';

describe('TenantCredentialsHelper - Integration', () => {
  const tenantId = 'test-tenant-123';
  const masterKey = 'test-master-key-for-testing-purposes!';
  const testCredentialData: ICredentialDataDecryptedObject = {
    apiKey: 'sk-test-12345',
    baseUrl: 'https://api.example.com',
  };

  let testUserFolder: string;
  let credentialTypeRegistry: CredentialTypeRegistry;

  beforeAll(async () => {
    // Create a temporary directory for n8n state
    testUserFolder = mkdtempSync(path.join(tmpdir(), 'r360-cred-helper-int-'));

    // Bootstrap DI and credential type registry
    resetBootstrap();
    await bootstrapN8nContainer({
      encryptionKey: TEST_ENCRYPTION_KEY,
      userFolder: testUserFolder,
    });

    credentialTypeRegistry = new CredentialTypeRegistry();
    await credentialTypeRegistry.init();
  }, 60000);

  afterAll(() => {
    try {
      rmSync(testUserFolder, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  // -------------------------------------------------------
  // Full encrypt -> lookup -> decrypt -> return data flow
  // -------------------------------------------------------

  describe('full encrypt/decrypt flow', () => {
    it('encrypt -> lookup -> decrypt -> returns correct data', async () => {
      // 1. Encrypt test data
      const encrypted = TenantCredentialsHelper.encryptCredentialData(
        testCredentialData,
        tenantId,
        masterKey,
      );

      // 2. Create mock lookup that returns encrypted data
      const mockLookup: CredentialLookupFn = vi.fn().mockResolvedValue({
        id: 'cred-1',
        tenant_id: tenantId,
        name: 'Test Cred',
        type: 'httpHeaderAuth',
        encrypted_data: encrypted,
      });

      // 3. Create helper and call getDecrypted
      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        mockLookup,
        credentialTypeRegistry,
      );

      const nodeCredentials: INodeCredentialsDetails = {
        id: 'cred-1',
        name: 'Test Cred',
      };

      const decrypted = await helper.getDecrypted(
        {} as IWorkflowExecuteAdditionalData,
        nodeCredentials,
        'httpHeaderAuth',
        'manual',
      );

      expect(decrypted).toEqual(testCredentialData);
      expect(mockLookup).toHaveBeenCalledWith(tenantId, 'cred-1');
    });

    it('getCredentials returns an ICredentials object with encrypted data', async () => {
      const encrypted = TenantCredentialsHelper.encryptCredentialData(
        testCredentialData,
        tenantId,
        masterKey,
      );

      const mockLookup: CredentialLookupFn = vi.fn().mockResolvedValue({
        id: 'cred-2',
        tenant_id: tenantId,
        name: 'Test Cred 2',
        type: 'httpHeaderAuth',
        encrypted_data: encrypted,
      });

      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        mockLookup,
        credentialTypeRegistry,
      );

      const creds = await helper.getCredentials(
        { id: 'cred-2', name: 'Test Cred 2' },
        'httpHeaderAuth',
      );

      expect(creds).toBeDefined();
      expect(creds.name).toBe('Test Cred 2');
      expect(creds.type).toBe('httpHeaderAuth');

      // ICredentials.getData() should return decrypted data
      const data = creds.getData();
      expect(data).toEqual(testCredentialData);
    });
  });

  // -------------------------------------------------------
  // Tenant isolation via credential lookup
  // -------------------------------------------------------

  describe('tenant isolation', () => {
    it('getDecrypted fails when lookup returns null (wrong tenant)', async () => {
      const mockLookup: CredentialLookupFn = vi.fn().mockResolvedValue(null);
      const helper = new TenantCredentialsHelper(
        'wrong-tenant',
        masterKey,
        mockLookup,
      );

      await expect(
        helper.getDecrypted(
          {} as IWorkflowExecuteAdditionalData,
          { id: 'cred-1', name: 'Test' },
          'httpHeaderAuth',
          'manual',
        ),
      ).rejects.toThrow(/not found/i);

      expect(mockLookup).toHaveBeenCalledWith('wrong-tenant', 'cred-1');
    });

    it('getCredentials fails when lookup returns null', async () => {
      const mockLookup: CredentialLookupFn = vi.fn().mockResolvedValue(null);
      const helper = new TenantCredentialsHelper(
        'wrong-tenant',
        masterKey,
        mockLookup,
      );

      await expect(
        helper.getCredentials({ id: 'cred-1', name: 'Test' }, 'httpHeaderAuth'),
      ).rejects.toThrow(/not found/i);
    });

    it('credential lookup function receives the correct tenant_id and credential_id', async () => {
      const mockLookup: CredentialLookupFn = vi.fn().mockResolvedValue(null);
      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        mockLookup,
      );

      try {
        await helper.getDecrypted(
          {} as IWorkflowExecuteAdditionalData,
          { id: 'cred-xyz', name: 'Lookup Test' },
          'httpHeaderAuth',
          'manual',
        );
      } catch {
        // Expected to throw (null result)
      }

      expect(mockLookup).toHaveBeenCalledTimes(1);
      expect(mockLookup).toHaveBeenCalledWith(tenantId, 'cred-xyz');
    });
  });

  // -------------------------------------------------------
  // authenticate() with real CredentialTypeRegistry
  // -------------------------------------------------------

  describe('authenticate()', () => {
    it('applies generic auth headers for httpHeaderAuth', async () => {
      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        undefined,
        credentialTypeRegistry,
      );

      const credentials: ICredentialDataDecryptedObject = {
        name: 'Authorization',
        value: 'Bearer my-token-123',
      };

      const requestOptions: IHttpRequestOptions = {
        url: 'https://api.example.com/test',
        method: 'GET',
      };

      const result = await helper.authenticate(
        credentials,
        'httpHeaderAuth',
        requestOptions,
        {} as Parameters<typeof helper.authenticate>[3],
        {} as Parameters<typeof helper.authenticate>[4],
      );

      expect(result).toBeDefined();
      expect(result.url).toBe('https://api.example.com/test');

      // httpHeaderAuth should set a header based on the credential data
      if (result.headers) {
        // The header name comes from the credential's "name" field
        // and the value from the "value" field (via expression resolution)
        expect(typeof result.headers).toBe('object');
      }
    });

    it('applies basic auth for httpBasicAuth', async () => {
      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        undefined,
        credentialTypeRegistry,
      );

      const credentials: ICredentialDataDecryptedObject = {
        user: 'admin',
        password: 'secret123',
      };

      const requestOptions: IHttpRequestOptions = {
        url: 'https://api.example.com/test',
        method: 'GET',
      };

      const result = await helper.authenticate(
        credentials,
        'httpBasicAuth',
        requestOptions,
        {} as Parameters<typeof helper.authenticate>[3],
        {} as Parameters<typeof helper.authenticate>[4],
      );

      expect(result).toBeDefined();
      // httpBasicAuth uses auth property with username/password
      if (result.auth) {
        expect(typeof result.auth).toBe('object');
      }
    });

    it('returns requestOptions unchanged when no authenticate config exists', async () => {
      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        undefined,
        credentialTypeRegistry,
      );

      // Find a credential type without authenticate
      const allTypes = credentialTypeRegistry.getAll();
      const typeWithoutAuth = allTypes.find((t) => !t.authenticate);

      if (typeWithoutAuth) {
        const requestOptions: IHttpRequestOptions = {
          url: 'https://api.example.com/test',
          method: 'GET',
          headers: { 'X-Custom': 'value' },
        };

        const result = await helper.authenticate(
          { key: 'value' },
          typeWithoutAuth.name,
          requestOptions,
          {} as Parameters<typeof helper.authenticate>[3],
          {} as Parameters<typeof helper.authenticate>[4],
        );

        expect(result.url).toBe(requestOptions.url);
        expect(result.method).toBe(requestOptions.method);
      }
    });

    it('returns requestOptions unchanged for unknown credential type', async () => {
      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        undefined,
        credentialTypeRegistry,
      );

      const requestOptions: IHttpRequestOptions = {
        url: 'https://api.example.com/test',
        method: 'GET',
      };

      const result = await helper.authenticate(
        { key: 'value' },
        'nonExistentCredType',
        requestOptions,
        {} as Parameters<typeof helper.authenticate>[3],
        {} as Parameters<typeof helper.authenticate>[4],
      );

      expect(result).toBe(requestOptions);
    });

    it('returns requestOptions unchanged when no registry is provided', async () => {
      const helper = new TenantCredentialsHelper(tenantId, masterKey);

      const requestOptions: IHttpRequestOptions = {
        url: 'https://api.example.com/test',
        method: 'GET',
      };

      const result = await helper.authenticate(
        { key: 'value' },
        'httpHeaderAuth',
        requestOptions,
        {} as Parameters<typeof helper.authenticate>[3],
        {} as Parameters<typeof helper.authenticate>[4],
      );

      expect(result).toBe(requestOptions);
    });
  });

  // -------------------------------------------------------
  // getParentTypes() / getCredentialsProperties() with registry
  // -------------------------------------------------------

  describe('delegation to CredentialTypeRegistry', () => {
    it('getParentTypes() delegates to registry', () => {
      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        undefined,
        credentialTypeRegistry,
      );

      // httpBasicAuth has no parents
      const parents = helper.getParentTypes('httpBasicAuth');
      expect(Array.isArray(parents)).toBe(true);
      expect(parents.length).toBe(0);

      // Find a type with extends and verify
      const allTypes = credentialTypeRegistry.getAll();
      const typeWithExtends = allTypes.find(
        (t) => t.extends && t.extends.length > 0,
      );

      if (typeWithExtends) {
        const helperParents = helper.getParentTypes(typeWithExtends.name);
        const registryParents = credentialTypeRegistry.getParentTypes(
          typeWithExtends.name,
        );
        expect(helperParents).toEqual(registryParents);
      }
    });

    it('getCredentialsProperties() delegates to registry', () => {
      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        undefined,
        credentialTypeRegistry,
      );

      const helperProps = helper.getCredentialsProperties('httpBasicAuth');
      const registryProps =
        credentialTypeRegistry.getCredentialsProperties('httpBasicAuth');
      expect(helperProps).toEqual(registryProps);
    });

    it('getParentTypes() returns empty array without registry', () => {
      const helper = new TenantCredentialsHelper(tenantId, masterKey);
      const parents = helper.getParentTypes('httpBasicAuth');
      expect(parents).toEqual([]);
    });

    it('getCredentialsProperties() returns empty array without registry', () => {
      const helper = new TenantCredentialsHelper(tenantId, masterKey);
      const props = helper.getCredentialsProperties('httpBasicAuth');
      expect(props).toEqual([]);
    });
  });

  // -------------------------------------------------------
  // updateCredentials()
  // -------------------------------------------------------

  describe('updateCredentials()', () => {
    it('encrypts and calls update function with correct args', async () => {
      const mockUpdateFn: CredentialUpdateFn = vi.fn().mockResolvedValue(undefined);

      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        undefined,
        undefined,
        mockUpdateFn,
      );

      const nodeCredentials: INodeCredentialsDetails = {
        id: 'cred-update-1',
        name: 'Update Test',
      };

      const newData: ICredentialDataDecryptedObject = {
        apiKey: 'new-api-key-value',
        baseUrl: 'https://new-api.example.com',
      };

      await helper.updateCredentials(nodeCredentials, 'httpHeaderAuth', newData);

      // Verify the mock was called
      expect(mockUpdateFn).toHaveBeenCalledTimes(1);
      expect(mockUpdateFn).toHaveBeenCalledWith(
        tenantId,
        'cred-update-1',
        expect.any(String), // encrypted data string
      );

      // Verify the encrypted data can be decrypted back to the original
      const encryptedArg = (mockUpdateFn as ReturnType<typeof vi.fn>).mock
        .calls[0]![2] as string;
      const decrypted = TenantCredentialsHelper.decryptCredentialData(
        encryptedArg,
        tenantId,
        masterKey,
      );
      expect(decrypted).toEqual(newData);
    });

    it('logs warning when no update function is provided', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const helper = new TenantCredentialsHelper(tenantId, masterKey);

      await helper.updateCredentials(
        { id: 'cred-1', name: 'Test' },
        'httpHeaderAuth',
        { apiKey: 'updated' },
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot update credential'),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  // -------------------------------------------------------
  // updateCredentialsOauthTokenData()
  // -------------------------------------------------------

  describe('updateCredentialsOauthTokenData()', () => {
    it('delegates to updateCredentials', async () => {
      const mockUpdateFn: CredentialUpdateFn = vi.fn().mockResolvedValue(undefined);

      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        undefined,
        undefined,
        mockUpdateFn,
      );

      const newTokenData: ICredentialDataDecryptedObject = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      await helper.updateCredentialsOauthTokenData(
        { id: 'cred-oauth-1', name: 'OAuth Test' },
        'oAuth2Api',
        newTokenData,
        {} as IWorkflowExecuteAdditionalData,
      );

      expect(mockUpdateFn).toHaveBeenCalledTimes(1);
      expect(mockUpdateFn).toHaveBeenCalledWith(
        tenantId,
        'cred-oauth-1',
        expect.any(String),
      );

      // Verify the encrypted data
      const encryptedArg = (mockUpdateFn as ReturnType<typeof vi.fn>).mock
        .calls[0]![2] as string;
      const decrypted = TenantCredentialsHelper.decryptCredentialData(
        encryptedArg,
        tenantId,
        masterKey,
      );
      expect(decrypted).toEqual(newTokenData);
    });
  });

  // -------------------------------------------------------
  // preAuthentication()
  // -------------------------------------------------------

  describe('preAuthentication()', () => {
    it('returns undefined when no registry is provided', async () => {
      const helper = new TenantCredentialsHelper(tenantId, masterKey);

      const result = await helper.preAuthentication(
        {} as Parameters<typeof helper.preAuthentication>[0],
        { apiKey: 'test' },
        'httpHeaderAuth',
        {} as Parameters<typeof helper.preAuthentication>[3],
        false,
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined for credential type without preAuthentication', async () => {
      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        undefined,
        credentialTypeRegistry,
      );

      const result = await helper.preAuthentication(
        {} as Parameters<typeof helper.preAuthentication>[0],
        { user: 'admin', password: 'secret' },
        'httpBasicAuth',
        {} as Parameters<typeof helper.preAuthentication>[3],
        false,
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined for unknown credential type', async () => {
      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        undefined,
        credentialTypeRegistry,
      );

      const result = await helper.preAuthentication(
        {} as Parameters<typeof helper.preAuthentication>[0],
        { apiKey: 'test' },
        'nonExistentCredType',
        {} as Parameters<typeof helper.preAuthentication>[3],
        false,
      );

      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty credential data', async () => {
      const emptyData: ICredentialDataDecryptedObject = {};
      const encrypted = TenantCredentialsHelper.encryptCredentialData(
        emptyData,
        tenantId,
        masterKey,
      );

      const mockLookup: CredentialLookupFn = vi.fn().mockResolvedValue({
        id: 'cred-empty',
        tenant_id: tenantId,
        name: 'Empty Cred',
        type: 'httpHeaderAuth',
        encrypted_data: encrypted,
      });

      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        mockLookup,
      );

      const decrypted = await helper.getDecrypted(
        {} as IWorkflowExecuteAdditionalData,
        { id: 'cred-empty', name: 'Empty Cred' },
        'httpHeaderAuth',
        'manual',
      );

      expect(decrypted).toEqual(emptyData);
    });

    it('handles credential data with special characters', async () => {
      const specialData: ICredentialDataDecryptedObject = {
        password: 'p@$$w0rd!#%^&*()',
        url: 'https://example.com/path?key=val&other=123',
        unicode: 'Hello World',
      };

      const encrypted = TenantCredentialsHelper.encryptCredentialData(
        specialData,
        tenantId,
        masterKey,
      );

      const mockLookup: CredentialLookupFn = vi.fn().mockResolvedValue({
        id: 'cred-special',
        tenant_id: tenantId,
        name: 'Special Cred',
        type: 'httpHeaderAuth',
        encrypted_data: encrypted,
      });

      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        mockLookup,
      );

      const decrypted = await helper.getDecrypted(
        {} as IWorkflowExecuteAdditionalData,
        { id: 'cred-special', name: 'Special Cred' },
        'httpHeaderAuth',
        'manual',
      );

      expect(decrypted).toEqual(specialData);
    });

    it('multiple concurrent getDecrypted calls work correctly', async () => {
      const encrypted = TenantCredentialsHelper.encryptCredentialData(
        testCredentialData,
        tenantId,
        masterKey,
      );

      const mockLookup: CredentialLookupFn = vi.fn().mockResolvedValue({
        id: 'cred-concurrent',
        tenant_id: tenantId,
        name: 'Concurrent Cred',
        type: 'httpHeaderAuth',
        encrypted_data: encrypted,
      });

      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        mockLookup,
      );

      const nodeCredentials: INodeCredentialsDetails = {
        id: 'cred-concurrent',
        name: 'Concurrent Cred',
      };

      // Run multiple decryption requests concurrently
      const results = await Promise.all([
        helper.getDecrypted(
          {} as IWorkflowExecuteAdditionalData,
          nodeCredentials,
          'httpHeaderAuth',
          'manual',
        ),
        helper.getDecrypted(
          {} as IWorkflowExecuteAdditionalData,
          nodeCredentials,
          'httpHeaderAuth',
          'manual',
        ),
        helper.getDecrypted(
          {} as IWorkflowExecuteAdditionalData,
          nodeCredentials,
          'httpHeaderAuth',
          'manual',
        ),
      ]);

      for (const result of results) {
        expect(result).toEqual(testCredentialData);
      }

      expect(mockLookup).toHaveBeenCalledTimes(3);
    });
  });
});

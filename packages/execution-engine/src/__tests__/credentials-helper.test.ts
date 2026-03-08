import { describe, it, expect, beforeEach, vi } from 'vitest';
import { scryptSync } from 'node:crypto';
import type {
  ICredentialDataDecryptedObject,
  INodeCredentialsDetails,
  IWorkflowExecuteAdditionalData,
} from 'n8n-workflow';
import {
  TenantCredentialsHelper,
  type CredentialLookupFn,
} from '../credentials-helper';

describe('TenantCredentialsHelper', () => {
  const tenantId = 'tenant-001';
  const otherTenantId = 'tenant-002';
  const masterKey = 'master-encryption-key-for-testing!';

  let mockLookup: ReturnType<typeof vi.fn>;
  let helper: TenantCredentialsHelper;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLookup = vi.fn();
    helper = new TenantCredentialsHelper(
      tenantId,
      masterKey,
      mockLookup as CredentialLookupFn,
    );
  });

  // -------------------------------------------------------
  // Salt compatibility with Phase 1 API encryption service
  // -------------------------------------------------------

  describe('salt compatibility', () => {
    it('uses salt format "r360-tenant-{tenantId}" matching the API encryption service', () => {
      // The API encryption service (packages/api/src/services/encryption.ts)
      // derives keys with: scryptSync(masterKey, `r360-tenant-${tenantId}`, 32)
      // Our helper MUST use the same salt to decrypt credentials stored by the API.
      const expectedKey = scryptSync(
        masterKey,
        `r360-tenant-${tenantId}`,
        32,
      );
      const actualKey = TenantCredentialsHelper.deriveTenantKey(
        tenantId,
        masterKey,
      );

      expect(Buffer.compare(actualKey, expectedKey)).toBe(0);
    });

    it('does NOT use "r360-tenant-key-" prefix', () => {
      // Verify we are NOT using the wrong prefix from the spec's template code
      const wrongKey = scryptSync(
        masterKey,
        `r360-tenant-key-${tenantId}`,
        32,
      );
      const actualKey = TenantCredentialsHelper.deriveTenantKey(
        tenantId,
        masterKey,
      );

      expect(Buffer.compare(actualKey, wrongKey)).not.toBe(0);
    });
  });

  // -------------------------------------------------------
  // Tenant isolation
  // -------------------------------------------------------

  describe('tenant isolation', () => {
    it('queries only the bound tenant credentials', async () => {
      const nodeCredentials: INodeCredentialsDetails = {
        id: 'cred-123',
        name: 'My Slack Token',
      };

      const encryptedData = TenantCredentialsHelper.encryptCredentialData(
        { apiKey: 'test-value' },
        tenantId,
        masterKey,
      );

      mockLookup.mockResolvedValue({
        id: 'cred-123',
        tenant_id: tenantId,
        name: 'My Slack Token',
        type: 'slackApi',
        encrypted_data: encryptedData,
      });

      await helper.getCredentials(nodeCredentials, 'slackApi');

      // Verify the query included the correct tenant_id
      expect(mockLookup).toHaveBeenCalledWith(tenantId, 'cred-123');
    });

    it('rejects credentials from a different tenant (credential not found)', async () => {
      const nodeCredentials: INodeCredentialsDetails = {
        id: 'cred-456',
        name: 'Other Tenant Cred',
      };

      // Simulate no result for this tenant (credential belongs to another)
      mockLookup.mockResolvedValue(null);

      await expect(
        helper.getCredentials(nodeCredentials, 'slackApi'),
      ).rejects.toThrow(/credential.*not found/i);
    });
  });

  // -------------------------------------------------------
  // Encryption round-trip
  // -------------------------------------------------------

  describe('encryption round-trip', () => {
    it('encrypts and decrypts credential data correctly', () => {
      const originalData: ICredentialDataDecryptedObject = {
        apiKey: 'xoxb-my-slack-token-12345',
        workspace: 'my-workspace',
      };

      // Encrypt
      const encrypted = TenantCredentialsHelper.encryptCredentialData(
        originalData,
        tenantId,
        masterKey,
      );
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toContain('xoxb-my-slack-token');

      // Decrypt
      const decrypted = TenantCredentialsHelper.decryptCredentialData(
        encrypted,
        tenantId,
        masterKey,
      );
      expect(decrypted).toEqual(originalData);
    });

    it('cannot decrypt with wrong tenant ID', () => {
      const originalData: ICredentialDataDecryptedObject = {
        apiKey: 'secret-value',
      };

      const encrypted = TenantCredentialsHelper.encryptCredentialData(
        originalData,
        tenantId,
        masterKey,
      );

      // Different tenant ID should fail decryption (AES-GCM auth tag mismatch)
      expect(() => {
        TenantCredentialsHelper.decryptCredentialData(
          encrypted,
          otherTenantId,
          masterKey,
        );
      }).toThrow();
    });

    it('derives unique encryption keys per tenant', () => {
      const key1 = TenantCredentialsHelper.deriveTenantKey(
        tenantId,
        masterKey,
      );
      const key2 = TenantCredentialsHelper.deriveTenantKey(
        otherTenantId,
        masterKey,
      );

      expect(Buffer.compare(key1, key2)).not.toBe(0);
      expect(key1.length).toBe(32); // 256-bit key
      expect(key2.length).toBe(32);
    });

    it('preserves complex credential structures', () => {
      const complexData: ICredentialDataDecryptedObject = {
        apiKey: 'key-12345',
        secret: 'super-secret-value',
        nested: {
          host: 'api.example.com',
          port: 443,
          tls: true,
        },
        tags: ['production', 'primary'],
        emptyValue: '',
      };

      const encrypted = TenantCredentialsHelper.encryptCredentialData(
        complexData,
        tenantId,
        masterKey,
      );
      const decrypted = TenantCredentialsHelper.decryptCredentialData(
        encrypted,
        tenantId,
        masterKey,
      );

      expect(decrypted).toEqual(complexData);
    });
  });

  // -------------------------------------------------------
  // getParentTypes
  // -------------------------------------------------------

  describe('getParentTypes', () => {
    it('returns an array (currently empty, pending full implementation)', () => {
      const parents = helper.getParentTypes('googleSheetsOAuth2Api');
      expect(Array.isArray(parents)).toBe(true);
    });
  });

  // -------------------------------------------------------
  // getDecrypted
  // -------------------------------------------------------

  describe('getDecrypted', () => {
    it('returns decrypted credential data for the bound tenant', async () => {
      const nodeCredentials: INodeCredentialsDetails = {
        id: 'cred-789',
        name: 'My API Key',
      };

      const encryptedData = TenantCredentialsHelper.encryptCredentialData(
        { apiKey: 'decrypted-secret-value' },
        tenantId,
        masterKey,
      );

      mockLookup.mockResolvedValue({
        id: 'cred-789',
        tenant_id: tenantId,
        name: 'My API Key',
        type: 'httpHeaderAuth',
        encrypted_data: encryptedData,
      });

      const decrypted = await helper.getDecrypted(
        {} as IWorkflowExecuteAdditionalData,
        nodeCredentials,
        'httpHeaderAuth',
        'manual',
      );

      expect(decrypted.apiKey).toBe('decrypted-secret-value');
      expect(mockLookup).toHaveBeenCalledWith(tenantId, 'cred-789');
    });

    it('throws when credential is not found', async () => {
      const nodeCredentials: INodeCredentialsDetails = {
        id: 'cred-nonexistent',
        name: 'Missing Credential',
      };

      mockLookup.mockResolvedValue(null);

      await expect(
        helper.getDecrypted(
          {} as IWorkflowExecuteAdditionalData,
          nodeCredentials,
          'httpHeaderAuth',
          'manual',
        ),
      ).rejects.toThrow(/credential.*not found/i);
    });
  });

  // -------------------------------------------------------
  // All required abstract methods are implemented
  // -------------------------------------------------------

  describe('abstract method implementations', () => {
    it('getParentTypes is implemented and does not throw', () => {
      expect(() => helper.getParentTypes('someType')).not.toThrow();
    });

    it('authenticate is implemented and does not throw', async () => {
      const result = await helper.authenticate(
        { apiKey: 'test' },
        'httpHeaderAuth',
        { url: 'https://example.com', method: 'GET' },
        {} as Parameters<typeof helper.authenticate>[3],
        {} as Parameters<typeof helper.authenticate>[4],
      );
      expect(result).toBeDefined();
    });

    it('preAuthentication is implemented and does not throw', async () => {
      const result = await helper.preAuthentication(
        { helpers: { httpRequest: vi.fn() } } as unknown as Parameters<
          typeof helper.preAuthentication
        >[0],
        { apiKey: 'test' },
        'httpHeaderAuth',
        {} as Parameters<typeof helper.preAuthentication>[3],
        false,
      );
      expect(result).toBeUndefined();
    });

    it('updateCredentials is implemented and does not throw', async () => {
      await expect(
        helper.updateCredentials(
          { id: 'cred-1', name: 'Test' },
          'httpHeaderAuth',
          { apiKey: 'updated' },
        ),
      ).resolves.toBeUndefined();
    });

    it('updateCredentialsOauthTokenData is implemented and does not throw', async () => {
      await expect(
        helper.updateCredentialsOauthTokenData(
          { id: 'cred-1', name: 'Test' },
          'oAuth2Api',
          { accessToken: 'new-token' },
          {} as IWorkflowExecuteAdditionalData,
        ),
      ).resolves.toBeUndefined();
    });

    it('getCredentialsProperties is implemented and does not throw', () => {
      const props = helper.getCredentialsProperties('httpHeaderAuth');
      expect(Array.isArray(props)).toBe(true);
    });
  });

  // -------------------------------------------------------
  // Constructor without lookup function
  // -------------------------------------------------------

  describe('without credential lookup function', () => {
    it('getCredentials throws descriptive error', async () => {
      const helperNoLookup = new TenantCredentialsHelper(tenantId, masterKey);

      await expect(
        helperNoLookup.getCredentials(
          { id: 'cred-1', name: 'Test' },
          'httpHeaderAuth',
        ),
      ).rejects.toThrow(/not found for tenant/i);
    });

    it('getDecrypted throws descriptive error', async () => {
      const helperNoLookup = new TenantCredentialsHelper(tenantId, masterKey);

      await expect(
        helperNoLookup.getDecrypted(
          {} as IWorkflowExecuteAdditionalData,
          { id: 'cred-1', name: 'Test' },
          'httpHeaderAuth',
          'manual',
        ),
      ).rejects.toThrow(/not found for tenant/i);
    });
  });
});

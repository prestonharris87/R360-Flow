import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptCredentialData,
  decryptCredentialData,
} from '../../services/encryption';

describe('Encryption Service', () => {
  beforeAll(() => {
    // Ensure test master key is set (also set in setup.ts)
    process.env.MASTER_ENCRYPTION_KEY =
      'dev-master-key-change-in-production-256bit!!';
  });

  describe('Encrypt/Decrypt Roundtrip', () => {
    it('produces identical data after encrypt then decrypt', () => {
      const original = {
        token: 'xoxb-secret-value-12345',
        apiKey: 'sk-test-abc123',
        nested: { deep: true, count: 42 },
      };
      const tenantId = 'tenant-roundtrip-test';

      const encrypted = encryptCredentialData(original, tenantId);
      const decrypted = decryptCredentialData(encrypted, tenantId);

      expect(decrypted).toEqual(original);
    });

    it('handles empty data object', () => {
      const original = {};
      const tenantId = 'tenant-empty-test';

      const encrypted = encryptCredentialData(original, tenantId);
      const decrypted = decryptCredentialData(encrypted, tenantId);

      expect(decrypted).toEqual(original);
    });

    it('handles data with special characters', () => {
      const original = {
        password: 'p@$$w0rd!#%^&*()',
        url: 'https://example.com/path?key=val&other=123',
        unicode: 'Hello \u4e16\u754c \ud83c\udf0d',
      };
      const tenantId = 'tenant-special-chars';

      const encrypted = encryptCredentialData(original, tenantId);
      const decrypted = decryptCredentialData(encrypted, tenantId);

      expect(decrypted).toEqual(original);
    });
  });

  describe('Per-Tenant Isolation', () => {
    it('different tenants produce different ciphertexts for the same data', () => {
      const data = { secret: 'shared-secret-value' };

      const encryptedA = encryptCredentialData(data, 'tenant-a');
      const encryptedB = encryptCredentialData(data, 'tenant-b');

      // Even the same data should produce different ciphertexts due to:
      // 1. Different tenant-derived keys
      // 2. Random IVs
      expect(encryptedA).not.toBe(encryptedB);
    });

    it('wrong tenant cannot decrypt data', () => {
      const data = { apiKey: 'sk-super-secret' };
      const encrypted = encryptCredentialData(data, 'tenant-owner');

      // Attempting to decrypt with different tenant key should throw
      expect(() => {
        decryptCredentialData(encrypted, 'tenant-attacker');
      }).toThrow();
    });
  });

  describe('Random IV', () => {
    it('produces different ciphertexts for the same input and tenant', () => {
      const data = { token: 'same-token-every-time' };
      const tenantId = 'tenant-iv-test';

      const encrypted1 = encryptCredentialData(data, tenantId);
      const encrypted2 = encryptCredentialData(data, tenantId);

      // Random IV ensures different ciphertexts even for identical plaintext
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      const decrypted1 = decryptCredentialData(encrypted1, tenantId);
      const decrypted2 = decryptCredentialData(encrypted2, tenantId);
      expect(decrypted1).toEqual(data);
      expect(decrypted2).toEqual(data);
    });
  });

  describe('Error Handling', () => {
    it('throws when MASTER_ENCRYPTION_KEY is not set', () => {
      const originalKey = process.env.MASTER_ENCRYPTION_KEY;
      delete process.env.MASTER_ENCRYPTION_KEY;

      try {
        expect(() => {
          encryptCredentialData({ test: 'value' }, 'tenant-1');
        }).toThrow('MASTER_ENCRYPTION_KEY environment variable is required');

        expect(() => {
          decryptCredentialData('dGVzdA==', 'tenant-1');
        }).toThrow('MASTER_ENCRYPTION_KEY environment variable is required');
      } finally {
        process.env.MASTER_ENCRYPTION_KEY = originalKey;
      }
    });

    it('throws when ciphertext is tampered with', () => {
      const data = { secret: 'important' };
      const encrypted = encryptCredentialData(data, 'tenant-tamper');

      // Tamper with the ciphertext by changing a character
      const tampered = Buffer.from(encrypted, 'base64');
      const lastIdx = tampered.length - 1;
      tampered[lastIdx] = (tampered[lastIdx] ?? 0) ^ 0xff; // Flip bits in last byte
      const tamperedBase64 = tampered.toString('base64');

      expect(() => {
        decryptCredentialData(tamperedBase64, 'tenant-tamper');
      }).toThrow();
    });
  });

  describe('Output Format', () => {
    it('returns a valid base64 string', () => {
      const encrypted = encryptCredentialData(
        { key: 'value' },
        'tenant-format'
      );

      // Verify it is valid base64
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();
      const decoded = Buffer.from(encrypted, 'base64');

      // Minimum size: 16 (IV) + 16 (tag) + at least 1 byte of ciphertext
      expect(decoded.length).toBeGreaterThanOrEqual(33);
    });
  });
});

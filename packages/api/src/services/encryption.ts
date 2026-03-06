import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Derives a per-tenant encryption key from the master key and tenant ID.
 * Uses scrypt for key derivation with a tenant-specific salt.
 */
function deriveKey(masterKey: string, tenantId: string): Buffer {
  return scryptSync(masterKey, `r360-tenant-${tenantId}`, 32);
}

/**
 * Encrypts credential data with a per-tenant derived key using AES-256-GCM.
 *
 * Output format: base64(iv[16] + authTag[16] + ciphertext)
 *
 * @param data - The credential data to encrypt
 * @param tenantId - The tenant ID used to derive the encryption key
 * @returns Base64-encoded encrypted string
 * @throws Error if MASTER_ENCRYPTION_KEY is not set
 */
export function encryptCredentialData(
  data: Record<string, unknown>,
  tenantId: string
): string {
  const masterKey = process.env.MASTER_ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error('MASTER_ENCRYPTION_KEY environment variable is required');
  }

  const key = deriveKey(masterKey, tenantId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Concatenate: iv + tag + ciphertext
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypts credential data with a per-tenant derived key using AES-256-GCM.
 *
 * @param encryptedBase64 - Base64-encoded string in format: iv[16] + authTag[16] + ciphertext
 * @param tenantId - The tenant ID used to derive the decryption key
 * @returns The decrypted credential data
 * @throws Error if MASTER_ENCRYPTION_KEY is not set or decryption fails
 */
export function decryptCredentialData(
  encryptedBase64: string,
  tenantId: string
): Record<string, unknown> {
  const masterKey = process.env.MASTER_ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error('MASTER_ENCRYPTION_KEY environment variable is required');
  }

  const key = deriveKey(masterKey, tenantId);
  const combined = Buffer.from(encryptedBase64, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}

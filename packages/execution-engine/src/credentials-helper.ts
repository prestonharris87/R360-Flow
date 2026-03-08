import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import type {
  IAuthenticate,
  IAuthenticateGeneric,
  ICredentialDataDecryptedObject,
  ICredentialsEncrypted,
  ICredentialsExpressionResolveValues,
  IDataObject,
  IExecuteData,
  IHttpRequestHelper,
  IHttpRequestOptions,
  INode,
  INodeCredentialsDetails,
  INodeProperties,
  IRequestOptionsSimplified,
  IWorkflowExecuteAdditionalData,
  WorkflowExecuteMode,
} from 'n8n-workflow';
import { ICredentials, ICredentialsHelper } from 'n8n-workflow';
import type { Workflow } from 'n8n-workflow';
import type { CredentialTypeRegistry } from './credential-types';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

// CRITICAL: This salt prefix MUST match the API encryption service in
// packages/api/src/services/encryption.ts which uses `r360-tenant-${tenantId}`.
// Using a different prefix would cause decryption failures at runtime.
const SALT_PREFIX = 'r360-tenant-';

/**
 * Credential lookup function type.
 * Provided by the caller (execution service) to query the DB for credentials.
 * Must always filter by tenant_id.
 */
export type CredentialLookupFn = (
  tenantId: string,
  credentialId: string,
) => Promise<{
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  encrypted_data: string;
} | null>;

/**
 * Credential update function type.
 * Provided by the caller to persist updated credential data (e.g., refreshed OAuth tokens).
 * Must always filter by tenant_id.
 */
export type CredentialUpdateFn = (
  tenantId: string,
  credentialId: string,
  encryptedData: string,
) => Promise<void>;

/**
 * Resolve n8n credential expression placeholders.
 *
 * Replaces `={{$credentials.fieldName}}` patterns with actual credential values.
 * This handles the standard n8n expression format used in IAuthenticateGeneric
 * property definitions for injecting credential field values into requests.
 *
 * Examples:
 *   resolveExpression('={{$credentials.apiKey}}', { apiKey: 'abc123' }) => 'abc123'
 *   resolveExpression('Bearer ={{$credentials.token}}', { token: 'xyz' }) => 'Bearer xyz'
 *   resolveExpression('static-value', {}) => 'static-value'
 */
function resolveExpression(
  value: unknown,
  credentials: ICredentialDataDecryptedObject,
): string {
  if (typeof value !== 'string') return String(value ?? '');
  // Strip leading '=' which is n8n's expression mode indicator
  let expr = value.startsWith('=') ? value.slice(1) : value;
  return expr.replace(
    /\{\{\s*\$credentials\.(\w+)\s*\}\}/g,
    (_, key: string) => {
      return credentials[key] != null ? String(credentials[key]) : '';
    },
  );
}

/**
 * Concrete implementation of ICredentials for tenant-scoped credential objects.
 * Returned by TenantCredentialsHelper.getCredentials().
 */
class TenantCredentials extends ICredentials {
  private readonly _tenantId: string;
  private readonly _masterKey: string;

  constructor(
    nodeCredentials: INodeCredentialsDetails,
    type: string,
    tenantId: string,
    masterKey: string,
    data?: string,
  ) {
    super(nodeCredentials, type, data);
    this._tenantId = tenantId;
    this._masterKey = masterKey;
  }

  getData(_nodeType?: string): ICredentialDataDecryptedObject {
    if (!this.data) {
      throw new Error('No credential data available');
    }
    return TenantCredentialsHelper.decryptCredentialData(
      this.data,
      this._tenantId,
      this._masterKey,
    );
  }

  getDataToSave(): ICredentialsEncrypted {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      data: this.data,
    };
  }

  setData(_data: ICredentialDataDecryptedObject): void {
    throw new Error('Credentials are read-only during execution');
  }
}

/**
 * TenantCredentialsHelper implements n8n's ICredentialsHelper for tenant isolation.
 *
 * Each instance is bound to a specific tenant ID at construction time.
 * All credential operations are scoped to that tenant:
 * - Database queries filter by tenant_id
 * - Encryption/decryption uses a per-tenant key derived from master key + tenant ID
 * - No cross-tenant credential access is possible
 *
 * Created per-execution, NOT per-container.
 * Injected via IWorkflowExecuteAdditionalData.credentialsHelper
 */
export class TenantCredentialsHelper extends ICredentialsHelper {
  private readonly credentialLookup: CredentialLookupFn | null;
  private readonly credentialUpdate: CredentialUpdateFn | null;

  constructor(
    private readonly tenantId: string,
    private readonly masterKey: string,
    credentialLookup?: CredentialLookupFn,
    private readonly credentialTypeRegistry?: CredentialTypeRegistry,
    credentialUpdate?: CredentialUpdateFn,
  ) {
    super();
    this.credentialLookup = credentialLookup ?? null;
    this.credentialUpdate = credentialUpdate ?? null;
  }

  // --- Static encryption utilities ---

  /**
   * Derive a per-tenant encryption key from master key + tenant ID.
   * Uses scrypt for key derivation (resistant to brute-force).
   *
   * CRITICAL: The salt MUST be `r360-tenant-${tenantId}` to match the
   * API encryption service. Do NOT change this without updating both.
   */
  static deriveTenantKey(tenantId: string, masterKey: string): Buffer {
    const salt = `${SALT_PREFIX}${tenantId}`;
    return scryptSync(masterKey, salt, KEY_LENGTH);
  }

  /**
   * Encrypt credential data using the tenant-specific key.
   * Returns a base64 string containing IV + auth tag + ciphertext.
   *
   * Format: base64(iv[16] + authTag[16] + ciphertext)
   * This format matches the API encryption service exactly.
   */
  static encryptCredentialData(
    data: ICredentialDataDecryptedObject,
    tenantId: string,
    masterKey: string,
  ): string {
    const key = TenantCredentialsHelper.deriveTenantKey(tenantId, masterKey);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const jsonData = JSON.stringify(data);
    const encrypted = Buffer.concat([
      cipher.update(jsonData, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Format: base64(iv + authTag + ciphertext)
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
  }

  /**
   * Decrypt credential data using the tenant-specific key.
   * Throws if the data was encrypted with a different tenant key.
   */
  static decryptCredentialData(
    encryptedBase64: string,
    tenantId: string,
    masterKey: string,
  ): ICredentialDataDecryptedObject {
    const key = TenantCredentialsHelper.deriveTenantKey(tenantId, masterKey);
    const combined = Buffer.from(encryptedBase64, 'base64');

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8')) as ICredentialDataDecryptedObject;
  }

  // --- ICredentialsHelper implementation ---

  /**
   * Returns parent credential types for a given credential type name.
   * For example, 'googleSheetsOAuth2Api' has parent type 'oAuth2Api'.
   *
   * Delegates to CredentialTypeRegistry if available, otherwise returns
   * empty array as a graceful fallback.
   */
  getParentTypes(name: string): string[] {
    if (this.credentialTypeRegistry) {
      return this.credentialTypeRegistry.getParentTypes(name);
    }
    return [];
  }

  /**
   * Returns the credential properties (form fields) for a given credential type.
   *
   * Delegates to CredentialTypeRegistry if available, otherwise returns
   * empty array as a graceful fallback.
   */
  getCredentialsProperties(type: string): INodeProperties[] {
    if (this.credentialTypeRegistry) {
      return this.credentialTypeRegistry.getCredentialsProperties(type);
    }
    return [];
  }

  /**
   * Applies credential authentication to an HTTP request.
   *
   * Supports two forms of ICredentialType.authenticate:
   * 1. Function — direct async transform of requestOptions
   * 2. IAuthenticateGeneric — declarative merge of headers/qs/body/auth
   *    with expression resolution for `={{$credentials.fieldName}}` patterns
   *
   * If no credentialTypeRegistry is available or the credential type has no
   * authenticate property, returns requestOptions unchanged.
   */
  async authenticate(
    credentials: ICredentialDataDecryptedObject,
    typeName: string,
    requestOptions: IHttpRequestOptions | IRequestOptionsSimplified,
    _workflow: Workflow,
    _node: INode,
  ): Promise<IHttpRequestOptions> {
    if (!this.credentialTypeRegistry) {
      return requestOptions as IHttpRequestOptions;
    }

    let credentialType;
    try {
      credentialType = this.credentialTypeRegistry.getByName(typeName);
    } catch {
      // Credential type not found in registry — pass through unchanged
      return requestOptions as IHttpRequestOptions;
    }

    if (!credentialType.authenticate) {
      return requestOptions as IHttpRequestOptions;
    }

    const auth: IAuthenticate = credentialType.authenticate;

    // Function-based authentication
    if (typeof auth === 'function') {
      return auth(credentials, requestOptions as IHttpRequestOptions);
    }

    // Generic (declarative) authentication
    const generic = auth as IAuthenticateGeneric;
    const { properties } = generic;
    const opts = requestOptions as IHttpRequestOptions;

    if (properties.headers) {
      opts.headers = { ...(opts.headers as IDataObject) };
      for (const [key, value] of Object.entries(properties.headers)) {
        (opts.headers as IDataObject)[key] = resolveExpression(value, credentials);
      }
    }

    if (properties.qs) {
      opts.qs = { ...(opts.qs as IDataObject) };
      for (const [key, value] of Object.entries(properties.qs)) {
        (opts.qs as IDataObject)[key] = resolveExpression(value, credentials);
      }
    }

    if (properties.body) {
      opts.body = { ...(opts.body as IDataObject) };
      for (const [key, value] of Object.entries(properties.body)) {
        (opts.body as IDataObject)[key] = resolveExpression(value, credentials);
      }
    }

    if (properties.auth) {
      opts.auth = {} as IHttpRequestOptions['auth'];
      for (const [key, value] of Object.entries(properties.auth)) {
        (opts.auth as Record<string, unknown>)[key] = resolveExpression(value, credentials);
      }
    }

    return opts;
  }

  /**
   * Pre-authentication hook, called before the main authenticate step.
   * Used for operations like OAuth token refresh.
   *
   * If the credential type defines a preAuthentication method, it is called
   * with the current credentials and expiry flag. If the method returns
   * refreshed data, the credentials are updated in the database.
   */
  async preAuthentication(
    helpers: IHttpRequestHelper,
    credentials: ICredentialDataDecryptedObject,
    typeName: string,
    _node: INode,
    credentialsExpired: boolean,
  ): Promise<ICredentialDataDecryptedObject | undefined> {
    if (!this.credentialTypeRegistry) {
      return undefined;
    }

    let credentialType;
    try {
      credentialType = this.credentialTypeRegistry.getByName(typeName);
    } catch {
      return undefined;
    }

    if (!credentialType.preAuthentication) {
      return undefined;
    }

    // Call preAuthentication with `this` bound to the helpers context,
    // matching n8n's ICredentialType.preAuthentication signature:
    //   preAuthentication?(this: IHttpRequestHelper, credentials, ...): Promise<IDataObject>
    const result = await credentialType.preAuthentication.call(
      helpers,
      credentials,
    );

    if (result && credentialsExpired) {
      // Merge refreshed token data back into the credentials and persist.
      // Cast is safe: preAuthentication returns IDataObject whose values are
      // compatible with CredentialInformation at runtime (strings, numbers, objects).
      const updatedCredentials = {
        ...credentials,
        ...result,
      } as ICredentialDataDecryptedObject;

      // Return the refreshed data so the caller (n8n-core) can persist it
      // via updateCredentials / updateCredentialsOauthTokenData.
      return updatedCredentials;
    }

    return result
      ? ({ ...credentials, ...result } as ICredentialDataDecryptedObject)
      : undefined;
  }

  /**
   * Fetches credential metadata from the database, scoped to this tenant.
   * Returns an ICredentials object containing the encrypted data.
   *
   * All DB queries are filtered by tenant_id to ensure tenant isolation.
   */
  async getCredentials(
    nodeCredentials: INodeCredentialsDetails,
    _type: string,
  ): Promise<ICredentials> {
    if (!this.credentialLookup) {
      // No credential lookup function provided -- throw a descriptive error.
      // This happens during initial setup before DB integration is connected.
      throw new Error(
        `Credential "${nodeCredentials.name}" (id: ${nodeCredentials.id}) ` +
          `not found for tenant ${this.tenantId}`,
      );
    }

    const row = await this.credentialLookup(
      this.tenantId,
      nodeCredentials.id!,
    );

    if (!row) {
      throw new Error(
        `Credential "${nodeCredentials.name}" (id: ${nodeCredentials.id}) ` +
          `not found for tenant ${this.tenantId}`,
      );
    }

    return new TenantCredentials(
      { id: row.id, name: row.name },
      row.type,
      this.tenantId,
      this.masterKey,
      row.encrypted_data,
    );
  }

  /**
   * Fetches and decrypts credential data for the current tenant.
   * This is the main method called by WorkflowExecute during node execution.
   *
   * All DB queries are filtered by tenant_id to ensure tenant isolation.
   * Decryption uses the per-tenant derived key.
   */
  async getDecrypted(
    _additionalData: IWorkflowExecuteAdditionalData,
    nodeCredentials: INodeCredentialsDetails,
    _type: string,
    _mode: WorkflowExecuteMode,
    _executeData?: IExecuteData,
    _raw?: boolean,
    _expressionResolveValues?: ICredentialsExpressionResolveValues,
  ): Promise<ICredentialDataDecryptedObject> {
    if (!this.credentialLookup) {
      throw new Error(
        `Credential "${nodeCredentials.name}" not found for tenant ${this.tenantId}`,
      );
    }

    // 1. Fetch the encrypted credential row (tenant-scoped)
    const row = await this.credentialLookup(
      this.tenantId,
      nodeCredentials.id!,
    );

    if (!row) {
      throw new Error(
        `Credential "${nodeCredentials.name}" (id: ${nodeCredentials.id}) ` +
          `not found for tenant ${this.tenantId}`,
      );
    }

    // 2. Decrypt using tenant-specific key
    return TenantCredentialsHelper.decryptCredentialData(
      row.encrypted_data,
      this.tenantId,
      this.masterKey,
    );
  }

  /**
   * Encrypts and updates credential data in the database (tenant-scoped).
   *
   * Uses the CredentialUpdateFn if provided to persist the encrypted data.
   * Falls back to a warning log if no update function is available.
   */
  async updateCredentials(
    nodeCredentials: INodeCredentialsDetails,
    _type: string,
    data: ICredentialDataDecryptedObject,
  ): Promise<void> {
    if (!this.credentialUpdate) {
      console.warn(
        `[TenantCredentialsHelper] Cannot update credential "${nodeCredentials.name}" ` +
          `(id: ${nodeCredentials.id}) for tenant ${this.tenantId}: ` +
          `no credentialUpdateFn provided`,
      );
      return;
    }

    const encrypted = TenantCredentialsHelper.encryptCredentialData(
      data,
      this.tenantId,
      this.masterKey,
    );

    await this.credentialUpdate(this.tenantId, nodeCredentials.id!, encrypted);
  }

  /**
   * Updates OAuth token data for a credential (tenant-scoped).
   * Delegates to updateCredentials since the encryption process is the same.
   */
  async updateCredentialsOauthTokenData(
    nodeCredentials: INodeCredentialsDetails,
    type: string,
    data: ICredentialDataDecryptedObject,
    _additionalData: IWorkflowExecuteAdditionalData,
  ): Promise<void> {
    return this.updateCredentials(nodeCredentials, type, data);
  }
}

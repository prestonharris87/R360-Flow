/**
 * DI Container Bootstrap for R360 Flow
 *
 * Initializes n8n's dependency injection container with required services.
 * Called ONCE at server startup — NOT per-tenant.
 *
 * Tenant-specific context (credentials, variables, hooks) is injected
 * per-execution via IWorkflowExecuteAdditionalData, NOT here.
 *
 * Services registered:
 * - InstanceSettings: encryption key, file paths, instance identity
 * - Logger: structured logging via winston (@n8n/backend-common)
 * - ErrorReporter: error tracking (n8n-core)
 * - BinaryDataService: file storage for binary node outputs
 *
 * All of these are @Service()-decorated classes that auto-construct via
 * @n8n/di's Container.get(). We set required env vars before resolution
 * so that InstanceSettingsConfig reads them during construction.
 */
import 'reflect-metadata';
import { Container } from '@n8n/di';
import { InstanceSettings, BinaryDataService } from 'n8n-core';

let bootstrapped = false;

export interface BootstrapOptions {
  /** System-level encryption key for n8n internals (NOT per-tenant). */
  encryptionKey: string;
  /** Base directory for n8n user data (e.g. /tmp/r360-flow-n8n). n8nFolder becomes <userFolder>/.n8n */
  userFolder: string;
}

/**
 * Bootstrap the n8n DI container with our service implementations.
 *
 * IMPORTANT:
 * - Call ONCE at server startup, NOT per-tenant
 * - Tenant-specific context (credentials, variables, hooks) is injected
 *   per-execution via IWorkflowExecuteAdditionalData, NOT here
 * - Idempotent: second call is a no-op
 *
 * @throws {Error} If required options are missing or DI resolution fails
 */
export async function bootstrapN8nContainer(options: BootstrapOptions): Promise<void> {
  if (bootstrapped) {
    return; // Idempotent: already initialized
  }

  // Validate required options
  if (!options.encryptionKey) {
    throw new Error(
      'BootstrapOptions.encryptionKey is required for DI bootstrap. ' +
      'Provide a system-level encryption key (not per-tenant).'
    );
  }
  if (!options.userFolder) {
    throw new Error(
      'BootstrapOptions.userFolder is required for DI bootstrap. ' +
      'Provide a writable directory path for n8n internal state.'
    );
  }

  // Set env vars BEFORE any Container.get() calls.
  // InstanceSettingsConfig reads these via @Env decorators during construction.
  // getN8nFolder() in @n8n/config uses N8N_USER_FOLDER to compute the .n8n path.
  process.env.N8N_ENCRYPTION_KEY = options.encryptionKey;
  process.env.N8N_USER_FOLDER = options.userFolder;

  // 1. InstanceSettings -- encryption key and paths
  //    @Service()-decorated, auto-constructs via DI.
  //    Constructor chain: InstanceSettings <- InstanceSettingsConfig <- env vars
  //    Creates <userFolder>/.n8n/ directory and writes settings file if missing.
  const instanceSettings = Container.get(InstanceSettings);

  // Verify the encryption key was properly picked up
  if (!instanceSettings.encryptionKey) {
    throw new Error(
      'InstanceSettings.encryptionKey is empty after DI resolution. ' +
      'This indicates the N8N_ENCRYPTION_KEY env var was not read correctly.'
    );
  }

  // 2. Logger -- auto-registered via @Service() in @n8n/backend-common
  //    Container.get(Logger) is called internally by other n8n services.
  //    No explicit registration needed -- the decorator handles it.

  // 3. ErrorReporter -- auto-registered via @Service() in n8n-core
  //    Used internally by n8n-core for error reporting.
  //    No explicit registration needed -- the decorator handles it.

  // 4. BinaryDataService -- storage for binary node outputs (files, images)
  //    Auto-constructs via DI, reads config from BinaryDataConfig.
  //    init() sets up the filesystem manager for local storage.
  const binaryDataService = Container.get(BinaryDataService);
  await binaryDataService.init();

  bootstrapped = true;
}

/**
 * Check if the DI container has been bootstrapped.
 * Useful for health checks and startup verification.
 */
export function isBootstrapped(): boolean {
  return bootstrapped;
}

/**
 * Reset bootstrap state. FOR TESTING ONLY.
 * Does not reset the DI container itself -- services remain registered.
 * This only resets the idempotency guard so bootstrapN8nContainer() can
 * be called again in a new test.
 */
export function resetBootstrap(): void {
  bootstrapped = false;
}

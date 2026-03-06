import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Container } from '@n8n/di';
import { InstanceSettings, BinaryDataService } from 'n8n-core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  bootstrapN8nContainer,
  isBootstrapped,
  resetBootstrap,
  type BootstrapOptions,
} from '../bootstrap.js';

const TEST_ENCRYPTION_KEY = 'test-key-32-bytes-long-xxxxxxxx';

describe('bootstrapN8nContainer', () => {
  let testUserFolder: string;
  let defaultOptions: BootstrapOptions;

  beforeAll(() => {
    // Create a temporary directory for each test run
    testUserFolder = mkdtempSync(path.join(tmpdir(), 'r360-bootstrap-test-'));
    defaultOptions = {
      encryptionKey: TEST_ENCRYPTION_KEY,
      userFolder: testUserFolder,
    };
  });

  afterAll(() => {
    // Clean up temp directory
    try {
      rmSync(testUserFolder, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  beforeEach(() => {
    // Reset bootstrap state before each test so we can re-bootstrap.
    // Note: Container.reset() clears instances but preserves registrations,
    // which is what we want for isolated tests.
    resetBootstrap();
    Container.reset();
  });

  it('completes without error with valid options', async () => {
    await expect(bootstrapN8nContainer(defaultOptions)).resolves.toBeUndefined();
  });

  it('registers InstanceSettings in the DI container', async () => {
    await bootstrapN8nContainer(defaultOptions);

    const settings = Container.get(InstanceSettings);
    expect(settings).toBeDefined();
    expect(settings.encryptionKey).toBeDefined();
    expect(typeof settings.encryptionKey).toBe('string');
    expect(settings.encryptionKey.length).toBeGreaterThan(0);
  });

  it('sets the n8nFolder based on userFolder', async () => {
    await bootstrapN8nContainer(defaultOptions);

    const settings = Container.get(InstanceSettings);
    // n8nFolder should be <userFolder>/.n8n
    expect(settings.n8nFolder).toBe(path.join(testUserFolder, '.n8n'));
  });

  it('registers BinaryDataService in the DI container', async () => {
    await bootstrapN8nContainer(defaultOptions);

    const binaryDataService = Container.get(BinaryDataService);
    expect(binaryDataService).toBeDefined();
  });

  it('is idempotent - calling twice does not throw', async () => {
    await bootstrapN8nContainer(defaultOptions);
    // Second call should be a no-op and not throw
    await expect(bootstrapN8nContainer(defaultOptions)).resolves.toBeUndefined();
  });

  it('isBootstrapped() returns false before bootstrap', () => {
    expect(isBootstrapped()).toBe(false);
  });

  it('isBootstrapped() returns true after bootstrap', async () => {
    await bootstrapN8nContainer(defaultOptions);
    expect(isBootstrapped()).toBe(true);
  });

  it('resetBootstrap() resets the bootstrapped state', async () => {
    await bootstrapN8nContainer(defaultOptions);
    expect(isBootstrapped()).toBe(true);

    resetBootstrap();
    expect(isBootstrapped()).toBe(false);
  });

  it('throws descriptive error when encryptionKey is empty', async () => {
    await expect(
      bootstrapN8nContainer({
        encryptionKey: '',
        userFolder: testUserFolder,
      })
    ).rejects.toThrow('BootstrapOptions.encryptionKey is required');
  });

  it('throws descriptive error when userFolder is empty', async () => {
    await expect(
      bootstrapN8nContainer({
        encryptionKey: TEST_ENCRYPTION_KEY,
        userFolder: '',
      })
    ).rejects.toThrow('BootstrapOptions.userFolder is required');
  });

  it('does not register any tenant-specific services', async () => {
    await bootstrapN8nContainer(defaultOptions);

    // The container should NOT have TenantCredentialsHelper registered.
    // Credentials helper is injected per-execution, not per-container.
    // Container.get() throws for unregistered types.
    expect(() => {
      Container.get('TenantCredentialsHelper' as any);
    }).toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { CodeSandbox, type SandboxConfig } from '../../sandbox/code-sandbox.js';

const defaultConfig: SandboxConfig = {
  memoryLimitMb: 64,
  timeoutMs: 5000,
  allowedModules: [],
};

describe('Sandbox: CodeSandbox', () => {
  it('executes simple JS and returns a value', async () => {
    const sandbox = new CodeSandbox(defaultConfig);
    const result = await sandbox.execute('return { greeting: "hello" };', {});
    expect(result).toEqual({ greeting: 'hello' });
  });

  it('passes $input data into the sandbox', async () => {
    const sandbox = new CodeSandbox(defaultConfig);
    const result = await sandbox.execute(
      'return { name: $input.name, doubled: $input.value * 2 };',
      { name: 'test', value: 21 },
    );
    expect(result).toEqual({ name: 'test', doubled: 42 });
  });

  it('supports JSON manipulation', async () => {
    const sandbox = new CodeSandbox(defaultConfig);
    const code = `
      const data = JSON.parse(JSON.stringify($input));
      data.extra = "added";
      return data;
    `;
    const result = await sandbox.execute(code, { original: true });
    expect(result).toEqual({ original: true, extra: 'added' });
  });

  it('does not expose process', async () => {
    const sandbox = new CodeSandbox(defaultConfig);
    const result = await sandbox.execute(
      'return { hasProcess: typeof process !== "undefined" };',
      {},
    );
    expect(result).toEqual({ hasProcess: false });
  });

  it('does not expose require', async () => {
    const sandbox = new CodeSandbox(defaultConfig);
    const result = await sandbox.execute(
      'return { hasRequire: typeof require !== "undefined" };',
      {},
    );
    expect(result).toEqual({ hasRequire: false });
  });

  it('does not expose fetch', async () => {
    const sandbox = new CodeSandbox(defaultConfig);
    const result = await sandbox.execute(
      'return { hasFetch: typeof fetch !== "undefined" };',
      {},
    );
    expect(result).toEqual({ hasFetch: false });
  });

  it('times out on infinite loop', async () => {
    const sandbox = new CodeSandbox({ ...defaultConfig, timeoutMs: 100 });
    await expect(
      sandbox.execute('while (true) {}', {}),
    ).rejects.toThrow(/timed out/i);
  });

  it('times out on CPU-intensive loop', async () => {
    const sandbox = new CodeSandbox({ ...defaultConfig, timeoutMs: 100 });
    const code = `
      let x = 0;
      for (let i = 0; i < 1e15; i++) { x += i; }
      return { x };
    `;
    await expect(sandbox.execute(code, {})).rejects.toThrow(/timed out/i);
  });

  it('returns empty object when code returns undefined', async () => {
    const sandbox = new CodeSandbox(defaultConfig);
    const result = await sandbox.execute('// no return', {});
    expect(result).toEqual({});
  });

  it('returns empty object when code returns null', async () => {
    const sandbox = new CodeSandbox(defaultConfig);
    const result = await sandbox.execute('return null;', {});
    expect(result).toEqual({});
  });

  it('wraps primitive return values in { result }', async () => {
    const sandbox = new CodeSandbox(defaultConfig);
    const result = await sandbox.execute('return 42;', {});
    expect(result).toEqual({ result: 42 });
  });

  it('deep-clones input so mutations do not leak', async () => {
    const sandbox = new CodeSandbox(defaultConfig);
    const input = { nested: { val: 1 } };
    await sandbox.execute('$input.nested.val = 999; return $input;', input);
    // Original input must not be mutated
    expect(input.nested.val).toBe(1);
  });
});

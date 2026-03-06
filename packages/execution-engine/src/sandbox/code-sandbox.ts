import vm from 'node:vm';

export interface SandboxConfig {
  memoryLimitMb: number;
  timeoutMs: number;
  allowedModules: string[];
}

/**
 * CodeSandbox provides a restricted execution environment for user-supplied
 * JavaScript code.  It uses Node.js built-in `vm` module (no native
 * dependencies) and intentionally exposes only a minimal set of globals --
 * process, require, fetch, import, etc. are all unavailable.
 */
export class CodeSandbox {
  private config: SandboxConfig;

  constructor(config: SandboxConfig) {
    this.config = config;
  }

  /**
   * Execute user code inside a sandboxed VM context.
   *
   * The code receives `$input` (a deep-cloned copy of `inputData`) and a set
   * of safe built-in constructors.  It must synchronously return a value;
   * the return value is normalised to a `Record<string, unknown>`.
   */
  async execute(
    code: string,
    inputData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Build a minimal sandbox context -- NO access to process, require, fetch, import.
    const sandbox: Record<string, unknown> = {
      $input: structuredClone(inputData),
      console: { log: () => {}, warn: () => {}, error: () => {} },
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      undefined,
      NaN,
      Infinity,
    };

    const context = vm.createContext(sandbox);

    // Wrap user code in strict-mode IIFE so `return` works at top level.
    const wrappedCode = `
      'use strict';
      (function() {
        ${code}
      })();
    `;

    const script = new vm.Script(wrappedCode, {
      filename: 'user-code.js',
    });

    const result = script.runInContext(context, {
      timeout: this.config.timeoutMs,
    });

    // Normalise the return value into a plain object.
    if (result === undefined || result === null) return {};
    if (typeof result === 'object') return result as Record<string, unknown>;
    return { result };
  }
}

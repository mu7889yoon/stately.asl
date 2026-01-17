import type {
  TranspileOptions,
  TranspileResult,
  IR,
  ASLStateMachine,
  Diagnostic,
} from "./types.js";
import { defaultRegistry, PluginRegistry } from "./plugins/index.js";
import { parseFile, analyze as analyzeFile } from "./parser/index.js";
import { buildCFG } from "./cfg/index.js";
import { buildIR } from "./ir/index.js";
import { serializeToAsl } from "./asl/index.js";

/**
 * Transpile TypeScript to ASL State Machine
 *
 * @param options - Transpile options
 * @returns Transpile result with IR, ASL, and diagnostics
 */
export async function transpile(options: TranspileOptions): Promise<TranspileResult> {
  const {
    entry,
    functionName,
    plugins,
    includeRetry = true,
  } = options;

  // Build registry with custom plugins if provided
  let registry = defaultRegistry;
  if (plugins && plugins.length > 0) {
    registry = new PluginRegistry();
    // Register default plugins first
    for (const plugin of defaultRegistry.getAll()) {
      registry.register(plugin);
    }
    // Then register custom plugins (can override defaults)
    for (const plugin of plugins) {
      registry.register(plugin);
    }
  }

  // Collect diagnostics
  const diagnostics: Diagnostic[] = [];

  // Parse and analyze
  const parseResult = parseFile({ entry, functionName, registry });
  diagnostics.push(...parseResult.diagnostics);

  // Build CFG
  const { cfg } = buildCFG({ entry, functionName, registry });

  // Build IR
  const ir = buildIR(cfg, { includeRetry });

  // Serialize to ASL
  const asl = serializeToAsl(ir);

  return {
    ir,
    asl,
    diagnostics,
  };
}

/**
 * Analyze a TypeScript file without transpiling
 *
 * @param options - Parse options
 * @returns Analysis result with diagnostics and metrics
 */
export async function analyze(options: { entry: string; functionName?: string }) {
  const result = analyzeFile(options);
  return {
    ok: result.ok,
    diagnostics: result.diagnostics,
    metrics: result.metrics,
  };
}

/**
 * Synchronous version of transpile for simpler use cases
 */
export function transpileSync(options: TranspileOptions): TranspileResult {
  const {
    entry,
    functionName,
    plugins,
    includeRetry = true,
  } = options;

  let registry = defaultRegistry;
  if (plugins && plugins.length > 0) {
    registry = new PluginRegistry();
    for (const plugin of defaultRegistry.getAll()) {
      registry.register(plugin);
    }
    for (const plugin of plugins) {
      registry.register(plugin);
    }
  }

  const diagnostics: Diagnostic[] = [];
  const parseResult = parseFile({ entry, functionName, registry });
  diagnostics.push(...parseResult.diagnostics);

  const { cfg } = buildCFG({ entry, functionName, registry });
  const ir = buildIR(cfg, { includeRetry });
  const asl = serializeToAsl(ir);

  return { ir, asl, diagnostics };
}

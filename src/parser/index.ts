import { Project, SourceFile } from "ts-morph";
import type { Diagnostic } from "../types.js";
import { PluginRegistry, defaultRegistry } from "../plugins/index.js";
import {
  runDetectors,
  findTargetFunction,
  DetectorMetrics,
} from "./visitors.js";

export { parseSdkCall, extractObjectParams, isPromiseAll, getPromiseAllArray, parseForOfStatement, parseCondition } from "./visitors.js";
export type { DetectorMetrics, ParsedCall } from "./visitors.js";

export interface ParseResult {
  sourceFile: SourceFile;
  project: Project;
  diagnostics: Diagnostic[];
  metrics: DetectorMetrics;
}

export interface ParseOptions {
  entry: string;
  functionName?: string;
  registry?: PluginRegistry;
}

/**
 * Parses a TypeScript file and returns the source file with diagnostics
 */
export function parseFile(options: ParseOptions): ParseResult {
  const { entry, functionName, registry = defaultRegistry } = options;

  const project = new Project({
    skipFileDependencyResolution: true,
    compilerOptions: {
      skipLibCheck: true,
      noEmit: true,
    },
  });

  const sourceFile = project.addSourceFileAtPath(entry);
  const { diagnostics, metrics } = runDetectors(
    sourceFile,
    registry,
    functionName
  );

  return {
    sourceFile,
    project,
    diagnostics,
    metrics,
  };
}

/**
 * Analyzes a TypeScript file and returns diagnostics and metrics
 */
export function analyze(options: ParseOptions): {
  ok: boolean;
  diagnostics: Diagnostic[];
  metrics: DetectorMetrics;
} {
  const { diagnostics, metrics } = parseFile(options);
  return {
    ok: diagnostics.filter((d) => d.level === "error").length === 0,
    diagnostics,
    metrics,
  };
}

export { findTargetFunction };

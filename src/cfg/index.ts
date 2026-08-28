import {
  Node,
  FunctionDeclaration,
  ArrowFunction,
  Block,
  SourceFile,
} from "ts-morph";
import type { CFGSequence } from "../types.js";
import { PluginRegistry, defaultRegistry } from "../plugins/index.js";
import { parseFile, findTargetFunction } from "../parser/index.js";
import {
  processExpression,
  processStatements,
  CFGBuildContext,
} from "./patterns.js";

export {
  processStatement,
  extractTaskFromAwait,
  extractParallel,
  extractMap,
  extractTry,
  extractChoice,
} from "./patterns.js";

export interface BuildCFGOptions {
  entry: string;
  functionName?: string;
  registry?: PluginRegistry;
  httpConnectionArn?: string;
}

export interface BuildCFGResult {
  cfg: CFGSequence;
  sourceFile: SourceFile;
}

export interface BuildCFGFromSourceOptions {
  sourceFile: SourceFile;
  functionName?: string;
  registry?: PluginRegistry;
  httpConnectionArn?: string;
}

/**
 * Builds a Control Flow Graph from a TypeScript source file
 */
export function buildCFG(options: BuildCFGOptions): BuildCFGResult {
  const {
    entry,
    functionName,
    registry = defaultRegistry,
    httpConnectionArn,
  } = options;

  const { sourceFile } = parseFile({
    entry,
    functionName,
    registry,
    httpConnectionArn,
  });
  return buildCFGFromSourceFile({
    sourceFile,
    functionName,
    registry,
    httpConnectionArn,
  });
}

export function buildCFGFromSourceFile(
  options: BuildCFGFromSourceOptions,
): BuildCFGResult {
  const {
    sourceFile,
    functionName,
    registry = defaultRegistry,
    httpConnectionArn,
  } = options;
  const targetFn = findTargetFunction(sourceFile, functionName);

  if (!targetFn) {
    throw new Error(
      `No target function found in ${sourceFile.getFilePath()}. ` +
        `Specify a function name with --function or export an async function.`,
    );
  }

  const body = getBody(targetFn);
  if (!body) {
    throw new Error(`Target function has no body`);
  }

  const ctx: CFGBuildContext = {
    registry,
    visitedNodes: new Set(),
    httpConnectionArn,
  };

  const cfg: CFGSequence = { kind: "Sequence", nodes: [] };

  // Process the function body
  if (Node.isBlock(body)) {
    processStatements(body.getStatements(), cfg, ctx);
  } else {
    // Arrow function with expression body
    if (Node.isExpression(body)) {
      processExpression(body, cfg, ctx);
    }
  }

  return { cfg, sourceFile };
}

/**
 * Gets the body of a function (either Block or Expression for arrow functions)
 */
function getBody(
  fn: FunctionDeclaration | ArrowFunction,
): Block | Node | undefined {
  if (Node.isFunctionDeclaration(fn)) {
    return fn.getBody();
  }
  if (Node.isArrowFunction(fn)) {
    return fn.getBody();
  }
  return undefined;
}

/**
 * Builds CFG directly from a file path (convenience function)
 */
export async function buildControlFlow(entry: string): Promise<CFGSequence> {
  const { cfg } = buildCFG({ entry });
  return cfg;
}

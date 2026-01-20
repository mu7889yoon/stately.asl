import { Node, FunctionDeclaration, ArrowFunction, Block, SourceFile } from "ts-morph";
import type { CFGSequence } from "../types.js";
import { PluginRegistry, defaultRegistry } from "../plugins/index.js";
import { parseFile, findTargetFunction } from "../parser/index.js";
import { processStatement, extractTaskFromAwait, CFGBuildContext } from "./patterns.js";

export { processStatement, extractTaskFromAwait, extractParallel, extractMap, extractTry, extractChoice } from "./patterns.js";

export interface BuildCFGOptions {
  entry: string;
  functionName?: string;
  registry?: PluginRegistry;
}

export interface BuildCFGResult {
  cfg: CFGSequence;
  sourceFile: SourceFile;
}

/**
 * Builds a Control Flow Graph from a TypeScript source file
 */
export function buildCFG(options: BuildCFGOptions): BuildCFGResult {
  const { entry, functionName, registry = defaultRegistry } = options;

  const { sourceFile } = parseFile({ entry, registry });
  const targetFn = findTargetFunction(sourceFile, functionName);

  if (!targetFn) {
    throw new Error(
      `No target function found in ${entry}. ` +
      `Specify a function name with --function or export an async function.`
    );
  }

  const body = getBody(targetFn);
  if (!body) {
    throw new Error(`Target function has no body`);
  }

  const ctx: CFGBuildContext = {
    registry,
    visitedNodes: new Set(),
  };

  const cfg: CFGSequence = { kind: "Sequence", nodes: [] };

  // Process the function body
  if (Node.isBlock(body)) {
    for (const stmt of body.getStatements()) {
      processStatement(stmt, cfg, ctx);
    }
  } else {
    // Arrow function with expression body
    if (Node.isAwaitExpression(body)) {
      const task = extractTaskFromAwait(body, ctx);
      if (task) {
        cfg.nodes.push(task);
      }
    }
  }

  return { cfg, sourceFile };
}

/**
 * Gets the body of a function (either Block or Expression for arrow functions)
 */
function getBody(fn: FunctionDeclaration | ArrowFunction): Block | Node | undefined {
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

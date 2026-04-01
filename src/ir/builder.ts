import type {
  CFGNode,
  CFGSequence,
  CFGTask,
  CFGParallel,
  CFGMap,
  CFGTry,
  CFGChoice,
  IR,
  IRState,
  IRTask,
  IRParallel,
  IRMap,
  IRChoice,
  IRPass,
  IRFail,
  IRWait,
  JsonExpr,
} from "../types.js";

/**
 * Check if an IR state can have a "next" property
 */
function canHaveNext(state: IRState): state is IRTask | IRParallel | IRMap | IRPass | IRWait {
  return (
    state.kind === "Task" ||
    state.kind === "Parallel" ||
    state.kind === "Map" ||
    state.kind === "Pass" ||
    state.kind === "Wait"
  );
}

/**
 * ID generator for creating unique state IDs
 */
class IdGenerator {
  private counters: Map<string, number> = new Map();

  generate(prefix: string): string {
    const count = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, count);
    return `${prefix}_${count}`;
  }

  reset(): void {
    this.counters.clear();
  }
}

/**
 * Context for IR building
 */
interface IRBuildContext {
  idGen: IdGenerator;
}

/**
 * Convert CFG parameters to ASL JSONPath format
 */
function paramsToJsonPath(params: Record<string, unknown>): JsonExpr {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      // Nested object
      result[key] = paramsToJsonPath(value as Record<string, unknown>);
    } else if (typeof value === "string") {
      // Check if it's already a variable reference or literal
      if (value.startsWith("$.")) {
        // Already a JSONPath
        result[`${key}.$`] = value;
      } else if (
        value.startsWith('"') ||
        value.startsWith("'") ||
        value === "true" ||
        value === "false" ||
        !isNaN(Number(value))
      ) {
        // Literal value - use as-is without .$
        result[key] = JSON.parse(value.replace(/'/g, '"'));
      } else if (value.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
        // Simple identifier - convert to JSONPath
        result[`${key}.$`] = `$.${value}`;
      } else if (value.includes("[")) {
        // Array access like items[0] - convert to JSONPath
        result[`${key}.$`] = `$.${value.replace(/\[(\d+)\]/g, "[$1]")}`;
      } else {
        // Other expressions - try to use as JSONPath
        result[`${key}.$`] = `$.${value}`;
      }
    } else {
      // Direct value (number, boolean, null)
      result[key] = value;
    }
  }

  return result;
}

/**
 * Convert a CFGTask to IRTask
 */
function taskToIR(task: CFGTask, ctx: IRBuildContext): IRTask {
  const id = ctx.idGen.generate(task.operation);

  return {
    kind: "Task",
    id,
    service: task.service,
    operation: task.operation,
    params: paramsToJsonPath(task.params),
    resultPath: task.resultPath === null ? undefined : task.resultPath ?? `$.${id}Result`,
    outputPath: task.outputPath,
  };
}

/**
 * Convert a CFGParallel to IRParallel
 */
function parallelToIR(parallel: CFGParallel, ctx: IRBuildContext): IRParallel {
  const id = ctx.idGen.generate("Parallel");

  const branches: IR[] = parallel.branches.map((branch) =>
    sequenceToIR(branch, ctx)
  );

  return {
    kind: "Parallel",
    id,
    branches,
  };
}

/**
 * Convert a CFGMap to IRMap
 */
function mapToIR(map: CFGMap, ctx: IRBuildContext): IRMap {
  const id = ctx.idGen.generate("Map");

  const iterator = sequenceToIR(map.iterator, ctx);

  return {
    kind: "Map",
    id,
    itemsPath: map.itemsPath,
    iterator,
  };
}

/**
 * Convert a CFGTry to IR states with Catch configuration
 */
function tryToIR(
  tryNode: CFGTry,
  ctx: IRBuildContext,
  states: Record<string, IRState>
): string[] {
  // Process the try block
  const tryIR = sequenceToIR(tryNode.tryBlock, ctx);

  // Add try states to the states record
  for (const [stateId, state] of Object.entries(tryIR.states)) {
    states[stateId] = state;
  }

  // If there's a catch block, add catch handling
  if (tryNode.catchBlock && tryNode.catchBlock.nodes.length > 0) {
    const catchIR = sequenceToIR(tryNode.catchBlock, ctx);

    // Add catch states
    for (const [stateId, state] of Object.entries(catchIR.states)) {
      states[stateId] = state;
    }

    // Add Catch configuration to the last state in try block
    // Actually, we need to add it to all states that could fail
    for (const stateId of Object.keys(tryIR.states)) {
      const state = states[stateId] as IRTask | IRParallel | IRMap;
      if (state.kind === "Task" || state.kind === "Parallel" || state.kind === "Map") {
        state.catch = [
          {
            ErrorEquals: ["States.ALL"],
            ResultPath: `$.${tryNode.catchErrorName || "error"}`,
            Next: catchIR.startAt,
          },
        ];
      }
    }

    // Return all state IDs (try + catch)
    return [
      ...Object.keys(tryIR.states),
      ...Object.keys(catchIR.states),
    ];
  }

  return Object.keys(tryIR.states);
}

/**
 * Convert a CFGChoice to IRChoice
 */
function choiceToIR(
  choice: CFGChoice,
  ctx: IRBuildContext,
  states: Record<string, IRState>
): { choiceId: string; stateIds: string[] } {
  const id = ctx.idGen.generate("Choice");

  // Process then branch
  const thenIR = sequenceToIR(choice.thenBranch, ctx);
  for (const [stateId, state] of Object.entries(thenIR.states)) {
    states[stateId] = state;
  }

  // Process else branch (if exists)
  let elseIR: IR | undefined;
  if (choice.elseBranch && choice.elseBranch.nodes.length > 0) {
    elseIR = sequenceToIR(choice.elseBranch, ctx);
    for (const [stateId, state] of Object.entries(elseIR.states)) {
      states[stateId] = state;
    }
  }

  // Create the Choice state
  const irChoice: IRChoice = {
    kind: "Choice",
    id,
    choices: [
      {
        condition: choice.condition,
        next: thenIR.startAt,
      },
    ],
    default: elseIR?.startAt,
  };

  states[id] = irChoice;

  // Collect all state IDs
  const allIds = [id, ...Object.keys(thenIR.states)];
  if (elseIR) {
    allIds.push(...Object.keys(elseIR.states));
  }

  return { choiceId: id, stateIds: allIds };
}

/**
 * Convert a CFGNode to IR state(s) and return the state ID(s)
 */
function nodeToIR(
  node: CFGNode,
  ctx: IRBuildContext,
  states: Record<string, IRState>
): string[] {
  switch (node.kind) {
    case "Task": {
      const irTask = taskToIR(node, ctx);
      states[irTask.id] = irTask;
      return [irTask.id];
    }

    case "Parallel": {
      const irParallel = parallelToIR(node, ctx);
      states[irParallel.id] = irParallel;
      return [irParallel.id];
    }

    case "Map": {
      const irMap = mapToIR(node, ctx);
      states[irMap.id] = irMap;
      return [irMap.id];
    }

    case "Try": {
      return tryToIR(node, ctx, states);
    }

    case "Choice": {
      const { stateIds } = choiceToIR(node, ctx, states);
      return stateIds;
    }

    case "Pass": {
      const id = ctx.idGen.generate("Pass");
      const irPass: IRPass = {
        kind: "Pass",
        id,
        result: node.result,
      };
      states[id] = irPass;
      return [id];
    }

    case "Fail": {
      const id = ctx.idGen.generate("Fail");
      const irFail: IRFail = {
        kind: "Fail",
        id,
        error: node.error,
        cause: node.cause,
      };
      states[id] = irFail;
      return [id];
    }

    case "Succeed": {
      const id = ctx.idGen.generate("Succeed");
      states[id] = { kind: "Succeed", id };
      return [id];
    }

    case "Wait": {
      const id = ctx.idGen.generate("Wait");
      states[id] = {
        kind: "Wait",
        id,
        seconds: node.seconds,
        timestampPath: node.timestampPath,
      };
      return [id];
    }

    default:
      return [];
  }
}

/**
 * Convert a CFGSequence to IR
 */
export function sequenceToIR(
  seq: CFGSequence,
  ctx?: IRBuildContext,
  existingStates?: Record<string, IRState>
): IR {
  const context: IRBuildContext = ctx ?? {
    idGen: new IdGenerator(),
  };

  const states: Record<string, IRState> = existingStates ?? {};
  const stateIds: string[] = [];

  for (const node of seq.nodes) {
    const ids = nodeToIR(node, context, states);
    stateIds.push(...ids);
  }

  // Link states with next transitions
  // Find the "main" state IDs (first state of each node's conversion)
  const mainIds: string[] = [];
  let idx = 0;
  for (const node of seq.nodes) {
    const ids = nodeToIR(node, context, {});
    if (ids.length > 0) {
      mainIds.push(stateIds[idx]);
    }
    idx += ids.length;
  }

  // Actually, let's redo this more carefully
  // We need to track the entry point of each node conversion
  const nodeEntryPoints: string[] = [];
  const nodeExitPoints: string[] = [];

  let currentIdx = 0;
  for (const node of seq.nodes) {
    const tempStates: Record<string, IRState> = {};
    const tempCtx: IRBuildContext = {
      idGen: new IdGenerator(),
    };
    const ids = nodeToIR(node, tempCtx, tempStates);

    if (ids.length > 0) {
      // Entry point is the first state
      nodeEntryPoints.push(stateIds[currentIdx]);

      // Exit point is the last "main" state (not nested)
      // For Task/Parallel/Map/Pass/Wait, it's just that state
      // For Choice, need special handling
      if (node.kind === "Choice") {
        // Choice doesn't have a single exit - need convergence
        nodeExitPoints.push(stateIds[currentIdx]); // Placeholder
      } else if (node.kind === "Try") {
        // Try's exit is the last state of try or catch
        nodeExitPoints.push(stateIds[currentIdx + ids.length - 1]);
      } else {
        nodeExitPoints.push(stateIds[currentIdx]);
      }
    }
    currentIdx += ids.length;
  }

  // Link sequential states
  for (let i = 0; i < nodeEntryPoints.length - 1; i++) {
    const currentExit = nodeExitPoints[i];
    const nextEntry = nodeEntryPoints[i + 1];
    const state = states[currentExit];

    if (state && canHaveNext(state)) {
      (state as IRTask | IRParallel | IRMap | IRPass | IRWait).next = nextEntry;
    }
  }

  // Mark the last state as end
  if (nodeExitPoints.length > 0) {
    const lastExit = nodeExitPoints[nodeExitPoints.length - 1];
    const lastState = states[lastExit];
    if (lastState && canHaveNext(lastState)) {
      (lastState as IRTask | IRParallel | IRMap | IRPass | IRWait).end = true;
      delete (lastState as IRTask | IRParallel | IRMap | IRPass | IRWait).next;
    }
  }

  // Handle empty sequence
  if (stateIds.length === 0) {
    const passId = context.idGen.generate("Pass");
    states[passId] = { kind: "Pass", id: passId, end: true };
    return { startAt: passId, states };
  }

  return {
    startAt: stateIds[0],
    states,
  };
}

/**
 * Build IR options
 */
export interface BuildIROptions {
  includeRetry?: boolean;
}

/**
 * Build IR from CFG
 */
export function buildIR(cfg: CFGSequence, _options?: BuildIROptions): IR {
  const ctx: IRBuildContext = {
    idGen: new IdGenerator(),
  };

  return sequenceToIR(cfg, ctx);
}

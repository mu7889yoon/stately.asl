import type {
  CFGNode,
  CFGSequence,
  CFGTask,
  CFGParallel,
  CFGMap,
  CFGTry,
  CFGChoice,
  CFGReturn,
  ChoiceExpression,
  ChoiceReferenceExpression,
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
function canHaveNext(
  state: IRState,
): state is IRTask | IRParallel | IRMap | IRPass | IRWait {
  return (
    state.kind === "Task" ||
    state.kind === "Parallel" ||
    state.kind === "Map" ||
    state.kind === "Pass" ||
    state.kind === "Wait"
  );
}

/**
 * Find IDs of terminal states (end: true, no next) within a given IR
 */
function findTerminalStateIds(
  ir: IR,
  allStates: Record<string, IRState>,
  ctx: IRBuildContext,
): string[] {
  return Object.keys(ir.states).filter((id) => {
    const state = allStates[id];
    if (!state || !canHaveNext(state) || ctx.terminalStateIds.has(id)) {
      return false;
    }
    const s = state as IRTask | IRParallel | IRMap | IRPass | IRWait;
    return s.end === true && !s.next;
  });
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
}

/**
 * Context for IR building
 */
interface IRBuildContext {
  idGen: IdGenerator;
  includeRetry: boolean;
  resultVariables: Map<string, string>;
  terminalStateIds: Set<string>;
}

interface ConvertedNode {
  entry: string;
  exit: string;
}

function jsonata(expression: string): string {
  return `{% ${expression} %}`;
}

function inputReference(source: string): string {
  const path = source.startsWith("$.") ? source.slice(2) : source;
  return `$states.input.${path}`;
}

function parseLiteral(source: string): unknown | undefined {
  if (source === "true") return true;
  if (source === "false") return false;
  if (source === "null") return null;
  if (source !== "" && !Number.isNaN(Number(source))) return Number(source);

  if (source.startsWith('"') && source.endsWith('"')) {
    return JSON.parse(source);
  }

  if (source.startsWith("'") && source.endsWith("'")) {
    return source.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  }

  return undefined;
}

function sourceReferenceToJsonata(source: string, ctx: IRBuildContext): string {
  if (source.endsWith(".length")) {
    return `$count(${sourceReferenceToJsonata(source.slice(0, -7), ctx)})`;
  }

  const rootMatch = /^([A-Za-z_$][A-Za-z0-9_$]*)(.*)$/.exec(source);
  if (!rootMatch) return inputReference(source);
  const [, sourceRoot, suffix] = rootMatch;
  const root = ctx.resultVariables.get(sourceRoot) ?? sourceRoot;
  return `$states.input${jsonataProperty(root)}${suffix}`;
}

function valueToJsonata(value: unknown, ctx: IRBuildContext): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => valueToJsonata(item, ctx));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        valueToJsonata(nested, ctx),
      ]),
    );
  }

  if (typeof value !== "string") {
    return value;
  }

  const literal = parseLiteral(value);
  return literal !== undefined
    ? literal
    : jsonata(sourceReferenceToJsonata(value, ctx));
}

/** Convert CFG parameters to JSONata Arguments. */
function paramsToJsonata(
  params: Record<string, unknown>,
  ctx: IRBuildContext,
): JsonExpr {
  return valueToJsonata(params, ctx);
}

function mergedResultOutput(field: string, resultExpression: string): string {
  return jsonata(
    `$merge([$states.input, {${JSON.stringify(field)}: ${resultExpression}}])`,
  );
}

function childContext(ctx: IRBuildContext): IRBuildContext {
  return {
    ...ctx,
    resultVariables: new Map(ctx.resultVariables),
  };
}

function jsonataProperty(property: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(property)
    ? `.${property}`
    : `[${JSON.stringify(property)}]`;
}

function referenceToJsonata(
  reference: ChoiceReferenceExpression,
  ctx: IRBuildContext,
): string {
  const root = ctx.resultVariables.get(reference.root) ?? reference.root;
  let result = `$states.input${jsonataProperty(root)}`;
  for (const part of reference.path) {
    result += typeof part === "number" ? `[${part}]` : jsonataProperty(part);
  }
  return result;
}

function optionalReferences(
  expression: ChoiceExpression,
): ChoiceReferenceExpression[] {
  switch (expression.kind) {
    case "Reference":
      return expression.optional ? [expression] : [];
    case "Comparison":
    case "Logical":
      return [
        ...optionalReferences(expression.left),
        ...optionalReferences(expression.right),
      ];
    case "Not":
      return optionalReferences(expression.operand);
    case "Call":
      return expression.function === "String"
        ? []
        : expression.arguments.flatMap(optionalReferences);
    default:
      return [];
  }
}

function uniqueOptionalPaths(
  expression: ChoiceExpression,
  ctx: IRBuildContext,
): string[] {
  return [
    ...new Set(
      optionalReferences(expression).map((reference) =>
        referenceToJsonata(reference, ctx),
      ),
    ),
  ];
}

function comparisonToJsonata(
  expression: Extract<ChoiceExpression, { kind: "Comparison" }>,
  ctx: IRBuildContext,
): string {
  const undefinedSide =
    expression.left.kind === "Undefined"
      ? expression.right
      : expression.right.kind === "Undefined"
        ? expression.left
        : undefined;

  if (undefinedSide?.kind === "Reference") {
    const reference = referenceToJsonata(undefinedSide, ctx);
    switch (expression.operator) {
      case "===":
        return `$not($exists(${reference}))`;
      case "!==":
        return `$exists(${reference})`;
      case "==":
        return `($not($exists(${reference})) or ${reference} = null)`;
      case "!=":
        return `($exists(${reference}) and ${reference} != null)`;
      default:
        return "false";
    }
  }

  const nullSide =
    expression.left.kind === "Literal" && expression.left.value === null
      ? expression.right
      : expression.right.kind === "Literal" && expression.right.value === null
        ? expression.left
        : undefined;
  if (nullSide?.kind === "Reference") {
    const reference = referenceToJsonata(nullSide, ctx);
    switch (expression.operator) {
      case "===":
        return `($exists(${reference}) and ${reference} = null)`;
      case "!==":
        return `($not($exists(${reference})) or ${reference} != null)`;
      case "==":
        return `($not($exists(${reference})) or ${reference} = null)`;
      case "!=":
        return `($exists(${reference}) and ${reference} != null)`;
      default:
        break;
    }
  }

  if (
    expression.left.kind === "Reference" &&
    expression.left.optional &&
    expression.right.kind === "Reference" &&
    expression.right.optional &&
    (expression.operator === "===" || expression.operator === "!==")
  ) {
    const left = referenceToJsonata(expression.left, ctx);
    const right = referenceToJsonata(expression.right, ctx);
    const leftExists = `$exists(${left})`;
    const rightExists = `$exists(${right})`;
    if (expression.operator === "===") {
      return `(($not(${leftExists}) and $not(${rightExists})) or (${leftExists} and ${rightExists} and ${left} = ${right}))`;
    }
    return `((${leftExists} and $not(${rightExists})) or ($not(${leftExists}) and ${rightExists}) or (${leftExists} and ${rightExists} and ${left} != ${right}))`;
  }

  const left = expressionToJsonata(expression.left, ctx);
  const right = expressionToJsonata(expression.right, ctx);
  const operator =
    expression.operator === "===" || expression.operator === "=="
      ? "="
      : expression.operator === "!==" || expression.operator === "!="
        ? "!="
        : expression.operator;
  const comparison = `${left} ${operator} ${right}`;
  const paths = uniqueOptionalPaths(expression, ctx);
  if (paths.length === 0) return comparison;

  const allExist = paths.map((path) => `$exists(${path})`).join(" and ");
  if (expression.operator === "!==" || expression.operator === "!=") {
    return `($not(${allExist}) or ${comparison})`;
  }
  return `(${allExist} and ${comparison})`;
}

function expressionToJsonata(
  expression: ChoiceExpression,
  ctx: IRBuildContext,
): string {
  switch (expression.kind) {
    case "Literal":
      return JSON.stringify(expression.value);
    case "Undefined":
      return "undefined";
    case "Reference":
      return referenceToJsonata(expression, ctx);
    case "Comparison":
      return comparisonToJsonata(expression, ctx);
    case "Logical": {
      const operator = expression.operator === "&&" ? "and" : "or";
      return `(${expressionToJsonata(expression.left, ctx)}) ${operator} (${expressionToJsonata(expression.right, ctx)})`;
    }
    case "Not":
      return `$not(${expressionToJsonata(expression.operand, ctx)})`;
    case "Call": {
      const functionName = {
        "Date.now": "$millis",
        "Date.parse": "$toMillis",
        Number: "$number",
        String: "$string",
      }[expression.function];
      const args = expression.arguments
        .map((argument) => expressionToJsonata(argument, ctx))
        .join(", ");
      if (expression.function === "String" && expression.arguments[0]) {
        const paths = uniqueOptionalPaths(expression.arguments[0], ctx);
        if (paths.length > 0) {
          const allExist = paths
            .map((path) => `$exists(${path})`)
            .join(" and ");
          return `(${allExist} ? ${functionName}(${args}) : "undefined")`;
        }
      }
      return `${functionName}(${args})`;
    }
  }
}

function conditionToJsonata(
  condition: ChoiceExpression,
  ctx: IRBuildContext,
): string {
  return jsonata(expressionToJsonata(condition, ctx));
}

/**
 * Convert a CFGTask to IRTask
 */
function taskToIR(task: CFGTask, ctx: IRBuildContext): IRTask {
  const id = ctx.idGen.generate(task.operation);
  const resultField = `${id}Result`;

  const irTask: IRTask = {
    kind: "Task",
    id,
    service: task.service,
    operation: task.operation,
    arguments: paramsToJsonata(task.params, ctx),
    output:
      task.outputMode === "responseBody"
        ? jsonata("$states.result.ResponseBody")
        : mergedResultOutput(resultField, "$states.result"),
  };

  if (task.resultVariable && task.outputMode !== "responseBody") {
    ctx.resultVariables.set(task.resultVariable, resultField);
  }

  if (task.terminal) {
    irTask.end = true;
    ctx.terminalStateIds.add(id);
  }

  if (ctx.includeRetry) {
    irTask.retry = [
      {
        ErrorEquals: ["States.ALL"],
        IntervalSeconds: 1,
        MaxAttempts: 3,
        BackoffRate: 2,
      },
    ];
  }

  return irTask;
}

/**
 * Convert a CFGParallel to IRParallel
 */
function parallelToIR(parallel: CFGParallel, ctx: IRBuildContext): IRParallel {
  const id = ctx.idGen.generate("Parallel");

  const branches: IR[] = parallel.branches.map((branch) =>
    sequenceToIR(branch, childContext(ctx)),
  );

  if (parallel.resultVariable) {
    ctx.resultVariables.set(parallel.resultVariable, `${id}Result`);
  }

  return {
    kind: "Parallel",
    id,
    branches,
    output: mergedResultOutput(`${id}Result`, "$states.result"),
  };
}

/**
 * Convert a CFGMap to IRMap
 */
function mapToIR(map: CFGMap, ctx: IRBuildContext): IRMap {
  const id = ctx.idGen.generate("Map");

  const iterator = sequenceToIR(map.iterator, childContext(ctx));

  if (map.resultVariable) {
    ctx.resultVariables.set(map.resultVariable, `${id}Result`);
  }

  return {
    kind: "Map",
    id,
    items: jsonata(sourceReferenceToJsonata(map.itemsExpression, ctx)),
    itemSelector: map.itemVariable
      ? mergedResultOutput(map.itemVariable, "$states.context.Map.Item.Value")
      : undefined,
    itemProcessor: iterator,
    output: mergedResultOutput(`${id}Result`, "$states.result"),
    maxConcurrency: map.maxConcurrency,
  };
}

/**
 * Convert a CFGTry to IR states with Catch configuration.
 * Adds a convergence Pass only when at least one path continues.
 */
function tryToIR(
  tryNode: CFGTry,
  ctx: IRBuildContext,
  states: Record<string, IRState>,
): string[] {
  // Process the try block
  const tryIR = sequenceToIR(tryNode.tryBlock, childContext(ctx));

  // Add try states to the states record
  for (const [stateId, state] of Object.entries(tryIR.states)) {
    states[stateId] = state;
  }

  const tryExits = findTerminalStateIds(tryIR, states, ctx);

  // If there's a catch block, add catch handling
  if (tryNode.catchBlock && tryNode.catchBlock.nodes.length > 0) {
    const catchIR = sequenceToIR(tryNode.catchBlock, childContext(ctx));

    // Add catch states
    for (const [stateId, state] of Object.entries(catchIR.states)) {
      states[stateId] = state;
    }

    // Add Catch configuration to all failable states in the try block
    for (const stateId of Object.keys(tryIR.states)) {
      const state = states[stateId] as IRTask | IRParallel | IRMap;
      if (
        state.kind === "Task" ||
        state.kind === "Parallel" ||
        state.kind === "Map"
      ) {
        state.catch = [
          {
            ErrorEquals: ["States.ALL"],
            Output: mergedResultOutput(
              tryNode.catchErrorName || "error",
              "$states.errorOutput",
            ),
            Next: catchIR.startAt,
          },
        ];
      }
    }

    const catchExits = findTerminalStateIds(catchIR, states, ctx);
    const allIds = [
      ...Object.keys(tryIR.states),
      ...Object.keys(catchIR.states),
    ];

    if (tryExits.length === 0 && catchExits.length === 0) {
      return allIds;
    }

    const convergenceId = ctx.idGen.generate("Pass");
    states[convergenceId] = {
      kind: "Pass",
      id: convergenceId,
      end: true,
    };

    for (const termId of [...tryExits, ...catchExits]) {
      const s = states[termId] as IRTask | IRParallel | IRMap | IRPass | IRWait;
      s.end = false;
      s.next = convergenceId;
    }

    return [...allIds, convergenceId];
  }

  return Object.keys(tryIR.states);
}

/**
 * Convert a CFGChoice to IRChoice.
 * A convergence Pass is added only when a branch can continue.
 */
function choiceToIR(
  choice: CFGChoice,
  ctx: IRBuildContext,
  states: Record<string, IRState>,
): { choiceId: string; stateIds: string[] } {
  const id = ctx.idGen.generate("Choice");

  // Process then branch
  const thenIR = sequenceToIR(choice.thenBranch, childContext(ctx));
  for (const [stateId, state] of Object.entries(thenIR.states)) {
    states[stateId] = state;
  }

  // Process else branch (if exists)
  let elseIR: IR | undefined;
  if (choice.elseBranch && choice.elseBranch.nodes.length > 0) {
    elseIR = sequenceToIR(choice.elseBranch, childContext(ctx));
    for (const [stateId, state] of Object.entries(elseIR.states)) {
      states[stateId] = state;
    }
  }

  const thenExits = findTerminalStateIds(thenIR, states, ctx);
  const elseExits = elseIR ? findTerminalStateIds(elseIR, states, ctx) : [];
  const needsConvergence =
    !elseIR || thenExits.length > 0 || elseExits.length > 0;
  const convergenceId = needsConvergence
    ? ctx.idGen.generate("Pass")
    : undefined;

  if (convergenceId) {
    states[convergenceId] = {
      kind: "Pass",
      id: convergenceId,
      end: true,
    };
    for (const termId of [...thenExits, ...elseExits]) {
      const s = states[termId] as IRTask | IRParallel | IRMap | IRPass | IRWait;
      s.end = false;
      s.next = convergenceId;
    }
  }

  // Create the Choice state (no Next on Choice itself — ASL spec)
  const irChoice: IRChoice = {
    kind: "Choice",
    id,
    choices: [
      {
        condition: conditionToJsonata(choice.condition, ctx),
        next: thenIR.startAt,
      },
    ],
    default: elseIR?.startAt ?? convergenceId,
  };

  states[id] = irChoice;

  // convergenceId is last = exit point used by sequenceToIR
  const allIds = [id, ...Object.keys(thenIR.states)];
  if (elseIR) {
    allIds.push(...Object.keys(elseIR.states));
  }
  if (convergenceId) allIds.push(convergenceId);

  return { choiceId: id, stateIds: allIds };
}

/**
 * Convert a CFGNode to IR state(s) and return the state ID(s)
 */
function nodeToIR(
  node: CFGNode,
  ctx: IRBuildContext,
  states: Record<string, IRState>,
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
        output: node.result,
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
        timestamp: node.timestampExpression
          ? jsonata(inputReference(node.timestampExpression))
          : undefined,
      };
      return [id];
    }

    case "Return": {
      const returnNode = node as CFGReturn;
      const id = ctx.idGen.generate("Pass");
      states[id] = {
        kind: "Pass",
        id,
        output:
          returnNode.value === undefined
            ? undefined
            : valueToJsonata(returnNode.value, ctx),
        end: true,
      };
      ctx.terminalStateIds.add(id);
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
  existingStates?: Record<string, IRState>,
): IR {
  const context: IRBuildContext = ctx ?? {
    idGen: new IdGenerator(),
    includeRetry: false,
    resultVariables: new Map(),
    terminalStateIds: new Set(),
  };

  const states: Record<string, IRState> = existingStates ?? {};
  const stateIds: string[] = [];
  const convertedNodes: ConvertedNode[] = [];

  for (const node of seq.nodes) {
    const ids = nodeToIR(node, context, states);
    stateIds.push(...ids);
    if (ids.length > 0) {
      convertedNodes.push({
        entry: ids[0],
        exit: ids[ids.length - 1],
      });
    }
  }

  // Link sequential states
  for (let i = 0; i < convertedNodes.length - 1; i++) {
    const currentExit = convertedNodes[i].exit;
    const nextEntry = convertedNodes[i + 1].entry;
    const state = states[currentExit];

    if (
      state &&
      canHaveNext(state) &&
      !context.terminalStateIds.has(currentExit)
    ) {
      (state as IRTask | IRParallel | IRMap | IRPass | IRWait).next = nextEntry;
    }
  }

  // Mark the last state as end
  if (convertedNodes.length > 0) {
    const lastExit = convertedNodes[convertedNodes.length - 1].exit;
    const lastState = states[lastExit];
    if (
      lastState &&
      canHaveNext(lastState) &&
      !context.terminalStateIds.has(lastExit)
    ) {
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
export function buildIR(cfg: CFGSequence, options?: BuildIROptions): IR {
  const ctx: IRBuildContext = {
    idGen: new IdGenerator(),
    includeRetry: options?.includeRetry ?? false,
    resultVariables: new Map(),
    terminalStateIds: new Set(),
  };

  return sequenceToIR(cfg, ctx);
}

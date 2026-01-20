import {
  Node,
  CallExpression,
  AwaitExpression,
  ForOfStatement,
  TryStatement,
  IfStatement,
  Statement,
  Block,
  Expression,
  ArrayLiteralExpression,
} from "ts-morph";
import type {
  CFGSequence,
  CFGTask,
  CFGParallel,
  CFGMap,
  CFGTry,
  CFGChoice,
  ChoiceCondition,
  ChoiceOperator,
} from "../types.js";
import { PluginRegistry } from "../plugins/index.js";
import {
  parseSdkCall,
  isPromiseAll,
  getPromiseAllArray,
  parseForOfStatement,
  parseCondition,
  parseHttpsCall,
} from "../parser/visitors.js";

/**
 * Context for CFG building
 */
export interface CFGBuildContext {
  registry: PluginRegistry;
  visitedNodes: Set<Node>;
}

/**
 * Extract a Task from await client.send(new XxxCommand({...}))
 */
export function extractTaskFromAwait(
  awaitExpr: AwaitExpression,
  ctx: CFGBuildContext
): CFGTask | undefined {
  const inner = awaitExpr.getExpression();
  if (!Node.isCallExpression(inner)) {
    return undefined;
  }

  const call = inner as CallExpression;
  const parsed = parseSdkCall(call, ctx.registry);

  if (!parsed) {
    return undefined;
  }

  return {
    kind: "Task",
    service: parsed.service,
    operation: parsed.operation,
    params: parsed.params,
    sourceText: parsed.sourceText,
  };
}

/**
 * Extract a Task from https.get() or https.request() call
 */
export function extractHttpTask(
  call: CallExpression,
  ctx: CFGBuildContext
): CFGTask | undefined {
  const httpInfo = parseHttpsCall(call);
  if (!httpInfo) {
    return undefined;
  }

  const params: Record<string, unknown> = {
    ApiEndpoint: httpInfo.url,
    // Quote the method to ensure it's treated as a literal string, not a variable reference
    Method: `"${httpInfo.method}"`,
  };

  if (httpInfo.headers) {
    params.Headers = httpInfo.headers;
  }

  return {
    kind: "Task",
    service: "http",
    operation: "invoke",
    params,
    sourceText: httpInfo.sourceText,
  };
}

/**
 * Extract a Parallel from Promise.all([...])
 */
export function extractParallel(
  call: CallExpression,
  ctx: CFGBuildContext
): CFGParallel | undefined {
  if (!isPromiseAll(call)) {
    return undefined;
  }

  const arr = getPromiseAllArray(call);
  if (!arr) {
    // Could be Promise.all(items.map(...)) pattern
    // For now, return undefined and handle in Map pattern
    return undefined;
  }

  const branches: CFGSequence[] = [];

  for (const el of arr.getElements()) {
    let task: CFGTask | undefined;

    // Handle: await client.send(...)
    if (Node.isAwaitExpression(el)) {
      task = extractTaskFromAwait(el as AwaitExpression, ctx);
    }
    // Handle: client.send(...) without await
    else if (Node.isCallExpression(el)) {
      const parsed = parseSdkCall(el as CallExpression, ctx.registry);
      if (parsed) {
        task = {
          kind: "Task",
          service: parsed.service,
          operation: parsed.operation,
          params: parsed.params,
          sourceText: parsed.sourceText,
        };
      }
    }

    if (task) {
      branches.push({ kind: "Sequence", nodes: [task] });
      ctx.visitedNodes.add(el);
    }
  }

  if (branches.length === 0) {
    return undefined;
  }

  return {
    kind: "Parallel",
    branches,
  };
}

/**
 * Extract a Parallel from Promise.all(items.map(...)) pattern
 */
export function extractParallelFromMap(
  call: CallExpression,
  ctx: CFGBuildContext
): CFGParallel | undefined {
  if (!isPromiseAll(call)) {
    return undefined;
  }

  const args = call.getArguments();
  if (args.length === 0) {
    return undefined;
  }

  const firstArg = args[0];

  // Check for items.map(...)
  if (!Node.isCallExpression(firstArg)) {
    return undefined;
  }

  const mapCall = firstArg as CallExpression;
  const mapExpr = mapCall.getExpression();

  if (!Node.isPropertyAccessExpression(mapExpr)) {
    return undefined;
  }

  const methodName = mapExpr.getName();
  if (methodName !== "map") {
    return undefined;
  }

  // Get the array being mapped
  const arrayExpr = mapExpr.getExpression();
  const itemsPath = `$.${arrayExpr.getText()}`;

  // Get the map callback
  const mapArgs = mapCall.getArguments();
  if (mapArgs.length === 0) {
    return undefined;
  }

  const callback = mapArgs[0];
  let callbackBody: Node | undefined;
  let paramName: string | undefined;

  if (Node.isArrowFunction(callback)) {
    const params = callback.getParameters();
    if (params.length > 0) {
      paramName = params[0].getName();
    }
    callbackBody = callback.getBody();
  } else if (Node.isFunctionExpression(callback)) {
    const params = callback.getParameters();
    if (params.length > 0) {
      paramName = params[0].getName();
    }
    callbackBody = callback.getBody();
  }

  if (!callbackBody) {
    return undefined;
  }

  // Extract task from callback body
  const iteratorSeq: CFGSequence = { kind: "Sequence", nodes: [] };

  callbackBody.forEachDescendant((node) => {
    if (ctx.visitedNodes.has(node)) return;

    if (Node.isCallExpression(node)) {
      const parsed = parseSdkCall(node as CallExpression, ctx.registry);
      if (parsed) {
        iteratorSeq.nodes.push({
          kind: "Task",
          service: parsed.service,
          operation: parsed.operation,
          params: parsed.params,
          sourceText: parsed.sourceText,
        });
        ctx.visitedNodes.add(node);
      }
    }
  });

  if (iteratorSeq.nodes.length === 0) {
    return undefined;
  }

  // This is actually a Map pattern (parallel execution of mapped items)
  // We'll treat Promise.all(items.map(...)) as Parallel with single branch
  // that internally loops. In Step Functions, this becomes a Map state.
  return {
    kind: "Parallel",
    branches: [iteratorSeq],
  };
}

/**
 * Extract a Map from for...of loop
 */
export function extractMap(
  stmt: ForOfStatement,
  ctx: CFGBuildContext
): CFGMap | undefined {
  const parsed = parseForOfStatement(stmt);
  if (!parsed) {
    return undefined;
  }

  const itemsPath = `$.${parsed.iterable}`;
  const iteratorSeq: CFGSequence = { kind: "Sequence", nodes: [] };

  const body = stmt.getStatement();
  const bodyBlock = Node.isBlock(body) ? body : undefined;

  // Process the loop body
  if (bodyBlock) {
    for (const childStmt of bodyBlock.getStatements()) {
      processStatement(childStmt, iteratorSeq, ctx);
    }
  } else {
    processStatement(body as Statement, iteratorSeq, ctx);
  }

  if (iteratorSeq.nodes.length === 0) {
    return undefined;
  }

  return {
    kind: "Map",
    itemsPath,
    itemVariable: parsed.variable,
    iterator: iteratorSeq,
  };
}

/**
 * Extract a Try from try...catch
 */
export function extractTry(
  stmt: TryStatement,
  ctx: CFGBuildContext
): CFGTry | undefined {
  const tryBlock = stmt.getTryBlock();
  const catchClause = stmt.getCatchClause();

  const trySeq: CFGSequence = { kind: "Sequence", nodes: [] };

  // Process try block
  for (const childStmt of tryBlock.getStatements()) {
    processStatement(childStmt, trySeq, ctx);
  }

  if (trySeq.nodes.length === 0) {
    return undefined;
  }

  // Process catch block
  let catchSeq: CFGSequence | undefined;
  let catchErrorName: string | undefined;

  if (catchClause) {
    const catchBlock = catchClause.getBlock();
    const varDecl = catchClause.getVariableDeclaration();
    catchErrorName = varDecl?.getName();

    catchSeq = { kind: "Sequence", nodes: [] };
    for (const childStmt of catchBlock.getStatements()) {
      processStatement(childStmt, catchSeq, ctx);
    }

    // If catch block is empty or just returns, we still need to track it
    if (catchSeq.nodes.length === 0) {
      catchSeq = undefined;
    }
  }

  return {
    kind: "Try",
    tryBlock: trySeq,
    catchBlock: catchSeq,
    catchErrorName,
  };
}

/**
 * Extract a Choice from if...else
 */
export function extractChoice(
  stmt: IfStatement,
  ctx: CFGBuildContext
): CFGChoice | undefined {
  const condExpr = stmt.getExpression();
  const parsedCond = parseCondition(condExpr);

  if (!parsedCond) {
    // Can't parse condition, skip
    return undefined;
  }

  const condition: ChoiceCondition = {
    variable: parsedCond.variable,
    operator: parsedCond.operator as ChoiceOperator,
    value: parsedCond.value,
  };

  // Process then branch
  const thenStmt = stmt.getThenStatement();
  const thenSeq: CFGSequence = { kind: "Sequence", nodes: [] };

  if (Node.isBlock(thenStmt)) {
    for (const childStmt of thenStmt.getStatements()) {
      processStatement(childStmt, thenSeq, ctx);
    }
  } else {
    processStatement(thenStmt as Statement, thenSeq, ctx);
  }

  // Process else branch
  let elseSeq: CFGSequence | undefined;
  const elseStmt = stmt.getElseStatement();

  if (elseStmt) {
    elseSeq = { kind: "Sequence", nodes: [] };
    if (Node.isBlock(elseStmt)) {
      for (const childStmt of elseStmt.getStatements()) {
        processStatement(childStmt, elseSeq, ctx);
      }
    } else if (Node.isIfStatement(elseStmt)) {
      // else if - recursively extract
      const nestedChoice = extractChoice(elseStmt as IfStatement, ctx);
      if (nestedChoice) {
        elseSeq.nodes.push(nestedChoice);
      }
    } else {
      processStatement(elseStmt as Statement, elseSeq, ctx);
    }
  }

  // Only create choice if there's something to do
  if (thenSeq.nodes.length === 0 && (!elseSeq || elseSeq.nodes.length === 0)) {
    return undefined;
  }

  return {
    kind: "Choice",
    condition,
    thenBranch: thenSeq,
    elseBranch: elseSeq,
  };
}

/**
 * Process a statement and add resulting CFG nodes to the sequence
 */
export function processStatement(
  stmt: Statement,
  seq: CFGSequence,
  ctx: CFGBuildContext
): void {
  if (ctx.visitedNodes.has(stmt)) {
    return;
  }

  // Handle expression statements (most common)
  if (Node.isExpressionStatement(stmt)) {
    const expr = stmt.getExpression();
    processExpression(expr, seq, ctx);
    return;
  }

  // Handle for...of
  if (Node.isForOfStatement(stmt)) {
    ctx.visitedNodes.add(stmt);
    const mapNode = extractMap(stmt as ForOfStatement, ctx);
    if (mapNode) {
      seq.nodes.push(mapNode);
    }
    return;
  }

  // Handle try...catch
  if (Node.isTryStatement(stmt)) {
    ctx.visitedNodes.add(stmt);
    const tryNode = extractTry(stmt as TryStatement, ctx);
    if (tryNode) {
      seq.nodes.push(tryNode);
    }
    return;
  }

  // Handle if...else
  if (Node.isIfStatement(stmt)) {
    ctx.visitedNodes.add(stmt);
    const choiceNode = extractChoice(stmt as IfStatement, ctx);
    if (choiceNode) {
      seq.nodes.push(choiceNode);
    }
    return;
  }

  // Handle return statements (they might contain await expressions)
  if (Node.isReturnStatement(stmt)) {
    const expr = stmt.getExpression();
    if (expr) {
      processExpression(expr, seq, ctx);
    }
    return;
  }

  // Handle variable declarations with await
  if (Node.isVariableStatement(stmt)) {
    for (const decl of stmt.getDeclarationList().getDeclarations()) {
      const init = decl.getInitializer();
      if (init) {
        processExpression(init, seq, ctx);
      }
    }
    return;
  }
}

/**
 * Process an expression and add resulting CFG nodes to the sequence
 */
function processExpression(
  expr: Expression,
  seq: CFGSequence,
  ctx: CFGBuildContext
): void {
  if (ctx.visitedNodes.has(expr)) {
    return;
  }

  // Handle await expressions
  if (Node.isAwaitExpression(expr)) {
    const inner = expr.getExpression();

    // Check if inner is Promise.all
    if (Node.isCallExpression(inner) && isPromiseAll(inner as CallExpression)) {
      ctx.visitedNodes.add(expr);
      ctx.visitedNodes.add(inner);

      // Try direct array first
      const parallel = extractParallel(inner as CallExpression, ctx);
      if (parallel) {
        seq.nodes.push(parallel);
        return;
      }

      // Try map pattern
      const parallelMap = extractParallelFromMap(inner as CallExpression, ctx);
      if (parallelMap) {
        // This is actually a parallel map, but we'll convert to Map
        // since Promise.all(items.map(...)) is essentially parallel iteration
        seq.nodes.push(parallelMap);
        return;
      }
    }

    // Regular await client.send(...)
    const task = extractTaskFromAwait(expr as AwaitExpression, ctx);
    if (task) {
      ctx.visitedNodes.add(expr);
      seq.nodes.push(task);
    }
    return;
  }

  // Handle Promise.all without await (less common but valid)
  if (Node.isCallExpression(expr) && isPromiseAll(expr as CallExpression)) {
    ctx.visitedNodes.add(expr);
    const parallel = extractParallel(expr as CallExpression, ctx);
    if (parallel) {
      seq.nodes.push(parallel);
      return;
    }
  }

  // Handle direct client.send() without await
  if (Node.isCallExpression(expr)) {
    // Try HTTP task first (https.get, https.request)
    const httpTask = extractHttpTask(expr as CallExpression, ctx);
    if (httpTask) {
      ctx.visitedNodes.add(expr);
      seq.nodes.push(httpTask);
      return;
    }

    // Try SDK call
    const parsed = parseSdkCall(expr as CallExpression, ctx.registry);
    if (parsed) {
      ctx.visitedNodes.add(expr);
      seq.nodes.push({
        kind: "Task",
        service: parsed.service,
        operation: parsed.operation,
        params: parsed.params,
        sourceText: parsed.sourceText,
      });
    }
  }
}

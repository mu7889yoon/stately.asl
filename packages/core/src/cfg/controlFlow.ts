import {
  Project,
  Node,
  CallExpression,
  AwaitExpression,
  NewExpression,
  ArrayLiteralExpression,
  ForOfStatement,
  TryStatement,
  FunctionDeclaration,
  SyntaxKind
} from "ts-morph";

export type CFTask = { kind: "Task"; operation: string; params: Record<string, string> };
export type CFParallel = { kind: "Parallel"; branches: CFSequence[] };
export type CFMap = { kind: "Map"; itemsPath: string; iterator: CFSequence };
export type CFTry = { kind: "Try"; tryBlock: CFSequence };
export type CFNode = CFTask | CFParallel | CFMap | CFTry;
export type CFSequence = { kind: "Sequence"; nodes: CFNode[] };

function toOperationName(klass: string): string {
  const base = klass.endsWith("Command") ? klass.slice(0, -"Command".length) : klass;
  return base ? base.charAt(0).toLowerCase() + base.slice(1) : klass;
}

function paramsFromObjectLiteral(obj: Node | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!obj || !Node.isObjectLiteralExpression(obj)) return out;
  for (const prop of obj.getProperties()) {
    if (Node.isPropertyAssignment(prop)) {
      const name = prop.getName();
      out[name] = `$.${name}`;
    }
  }
  return out;
}

function taskFromNewCommand(ne: NewExpression | undefined): CFTask | undefined {
  if (!ne) return undefined;
  const expr = ne.getExpression().getText();
  if (!expr.endsWith("Command")) return undefined;
  const op = toOperationName(expr);
  const ctorArg0 = ne.getArguments()[0];
  const params = paramsFromObjectLiteral(ctorArg0);
  return { kind: "Task", operation: op, params };
}

function extractFromPromiseAll(call: CallExpression): CFParallel | undefined {
  const expr = call.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) return undefined;
  if (!(expr.getExpression().getText() === "Promise" && expr.getName() === "all")) return undefined;
  const arg0 = call.getArguments()[0];
  if (!arg0 || !Node.isArrayLiteralExpression(arg0)) return undefined;
  const arr = arg0 as ArrayLiteralExpression;
  const seqs: CFSequence[] = [];
  for (const el of arr.getElements()) {
    // support: client.send(new XxxCommand({...})) or await client.send(...)
    let ce: CallExpression | undefined;
    if (Node.isAwaitExpression(el)) ce = (el as AwaitExpression).getExpression() as CallExpression;
    else if (Node.isCallExpression(el)) ce = el as CallExpression;
    if (!ce) continue;
    const arg0 = ce.getArguments()[0];
    const ne = Node.isNewExpression(arg0) ? (arg0 as NewExpression) : undefined;
    const task = taskFromNewCommand(ne);
    if (task) seqs.push({ kind: "Sequence", nodes: [task] });
  }
  if (seqs.length === 0) return undefined;
  return { kind: "Parallel", branches: seqs };
}

function extractTaskFromAwaitSend(node: AwaitExpression | CallExpression): CFTask | undefined {
  const ce = Node.isAwaitExpression(node) ? ((node as AwaitExpression).getExpression() as CallExpression) : (node as CallExpression);
  if (!Node.isCallExpression(ce)) return undefined;
  if (!ce.getExpression().getText().endsWith(".send")) return undefined;
  const arg0 = ce.getArguments()[0];
  const ne = Node.isNewExpression(arg0) ? (arg0 as NewExpression) : undefined;
  return taskFromNewCommand(ne);
}

function extractFromForOf(stmt: ForOfStatement): CFMap | undefined {
  const expr = stmt.getExpression();
  const itemsPath = `$.${expr.getText()}`;
  // MVP: bodyは直列として単純抽出
  const bodySeq: CFSequence = { kind: "Sequence", nodes: [] };
  stmt.getStatement().forEachDescendant((n) => {
    if (Node.isAwaitExpression(n)) {
      const t = extractTaskFromAwaitSend(n);
      if (t) bodySeq.nodes.push(t);
    }
  });
  if (bodySeq.nodes.length === 0) return undefined;
  return { kind: "Map", itemsPath, iterator: bodySeq };
}

function extractFromTry(ts: TryStatement): CFTry | undefined {
  const seq: CFSequence = { kind: "Sequence", nodes: [] };
  ts.getTryBlock().forEachDescendant((n) => {
    if (Node.isAwaitExpression(n)) {
      const t = extractTaskFromAwaitSend(n);
      if (t) seq.nodes.push(t);
    }
  });
  if (seq.nodes.length === 0) return undefined;
  return { kind: "Try", tryBlock: seq };
}

export async function buildControlFlow(entry: string): Promise<CFSequence> {
  const project = new Project({});
  const sf = project.addSourceFileAtPath(entry);
  const rootSeq: CFSequence = { kind: "Sequence", nodes: [] };

  // 対象は最初のexportされた関数 or 全体
  const fn = sf.getFunctions().find((f) => f.isExported()) || sf.getFunctions()[0];
  const scopeNode: Node = fn?.getBody() ?? sf;

  scopeNode.forEachDescendant((node) => {
    if (Node.isCallExpression(node)) {
      const par = extractFromPromiseAll(node);
      if (par) {
        rootSeq.nodes.push(par);
        return;
      }
    }
    if (Node.isForOfStatement(node)) {
      const m = extractFromForOf(node as ForOfStatement);
      if (m) rootSeq.nodes.push(m);
      return;
    }
    if (Node.isTryStatement(node)) {
      const t = extractFromTry(node as TryStatement);
      if (t) rootSeq.nodes.push(t);
      return;
    }
    if (Node.isAwaitExpression(node)) {
      const t = extractTaskFromAwaitSend(node as AwaitExpression);
      if (t) rootSeq.nodes.push(t);
      return;
    }
  });

  return rootSeq;
}



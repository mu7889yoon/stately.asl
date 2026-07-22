import {
  Node,
  CallExpression,
  NewExpression,
  ObjectLiteralExpression,
  PropertyAssignment,
  ArrayLiteralExpression,
  ForOfStatement,
  TryStatement,
  FunctionDeclaration,
  ArrowFunction,
  SourceFile,
  Expression,
  Statement,
} from "ts-morph";
import type { Diagnostic } from "../types.js";
import { PluginRegistry, deriveAslOperation } from "../plugins/index.js";

export interface DetectorMetrics {
  promiseAll: number;
  forOf: number;
  tryCatch: number;
  ifElse: number;
  awaitCalls: number;
  sdkCalls: number;
}

export interface ParsedCall {
  service: string;
  operation: string;
  commandName: string;
  params: Record<string, unknown>;
  sourceText: string;
}

const SUPPORTED_FETCH_INIT_KEYS = new Set(["method", "headers", "body"]);

function normalizePropertyName(name: string): string {
  if (
    (name.startsWith('"') && name.endsWith('"')) ||
    (name.startsWith("'") && name.endsWith("'")) ||
    (name.startsWith("`") && name.endsWith("`"))
  ) {
    return name.slice(1, -1);
  }

  return name;
}

function unwrapParens<T extends Node>(node: T): Node {
  let current: Node = node;

  while (Node.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }

  return current;
}

function isJsonPathExpression(node: Node): boolean {
  const current = unwrapParens(node);

  if (Node.isIdentifier(current)) {
    return true;
  }

  if (Node.isPropertyAccessExpression(current)) {
    return isJsonPathExpression(current.getExpression());
  }

  if (Node.isElementAccessExpression(current)) {
    const argument = current.getArgumentExpression();
    return (
      isJsonPathExpression(current.getExpression()) &&
      Boolean(argument && Node.isNumericLiteral(argument))
    );
  }

  return false;
}

function isLiteralExpression(node: Node): boolean {
  const current = unwrapParens(node);
  const text = current.getText();
  return (
    Node.isStringLiteral(current) ||
    Node.isNumericLiteral(current) ||
    text === "true" ||
    text === "false" ||
    text === "null"
  );
}

function isQuotedString(text: string): boolean {
  return (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  );
}

function parseHttpMethod(value: unknown, fallback = "GET"): string {
  if (typeof value !== "string") {
    return `"${fallback}"`;
  }

  return isQuotedString(value) ? `"${value.slice(1, -1).toUpperCase()}"` : value;
}

function isFetchCall(call: CallExpression): boolean {
  const expr = unwrapParens(call.getExpression());
  return Node.isIdentifier(expr) && expr.getText() === "fetch";
}

function getFetchInitObject(call: CallExpression): ObjectLiteralExpression | undefined {
  const args = call.getArguments();
  if (args.length < 2) {
    return undefined;
  }

  const initArg = unwrapParens(args[1]);
  if (!Node.isObjectLiteralExpression(initArg)) {
    return undefined;
  }

  return initArg as ObjectLiteralExpression;
}

function resolveIdentifierInitializer(node: Node): Node | undefined {
  if (!Node.isIdentifier(node)) {
    return undefined;
  }

  const symbol = node.getSymbol();
  const decl = symbol?.getDeclarations().find((candidate) =>
    Node.isVariableDeclaration(candidate)
  );

  return decl && Node.isVariableDeclaration(decl) ? decl.getInitializer() : undefined;
}

function isFetchInitializer(node: Node | undefined): boolean {
  if (!node) {
    return false;
  }

  const current = unwrapParens(node);

  if (Node.isAwaitExpression(current)) {
    return isFetchInitializer(current.getExpression());
  }

  return Node.isCallExpression(current) && isFetchCall(current as CallExpression);
}

/**
 * Extracts parameters from an object literal expression
 */
export function extractObjectParams(obj: Node | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!obj || !Node.isObjectLiteralExpression(obj)) {
    return result;
  }

  const objLiteral = obj as ObjectLiteralExpression;
  for (const prop of objLiteral.getProperties()) {
    if (Node.isPropertyAssignment(prop)) {
      const pa = prop as PropertyAssignment;
      const name = normalizePropertyName(pa.getName());
      const init = pa.getInitializer();

      if (init) {
        // Handle nested object literals
        if (Node.isObjectLiteralExpression(init)) {
          result[name] = extractObjectParams(init);
        } else if (Node.isArrayLiteralExpression(init)) {
          result[name] = extractArrayParams(init);
        } else {
          // Store the source text for later transformation to JSONPath
          result[name] = init.getText();
        }
      }
    } else if (Node.isShorthandPropertyAssignment(prop)) {
      // Handle { TableName } shorthand
      const name = normalizePropertyName(prop.getName());
      result[name] = name; // Will be transformed to $.name
    }
  }

  return result;
}

/**
 * Extracts parameters from an array literal expression
 */
function extractArrayParams(arr: ArrayLiteralExpression): unknown[] {
  const result: unknown[] = [];
  for (const el of arr.getElements()) {
    if (Node.isObjectLiteralExpression(el)) {
      result.push(extractObjectParams(el));
    } else if (Node.isArrayLiteralExpression(el)) {
      result.push(extractArrayParams(el));
    } else {
      result.push(el.getText());
    }
  }
  return result;
}

/**
 * Extracts service name from AWS SDK module specifier.
 * @example
 * extractServiceFromModule("@aws-sdk/client-dynamodb") // "dynamodb"
 * extractServiceFromModule("@aws-sdk/client-s3") // "s3"
 */
function extractServiceFromModule(moduleSpecifier: string): string | undefined {
  const match = moduleSpecifier.match(/^@aws-sdk\/client-(.+)$/);
  return match ? match[1] : undefined;
}

/**
 * Builds a map of command names to service names by analyzing imports.
 * Caches the result per source file.
 */
const commandToServiceCache = new WeakMap<SourceFile, Map<string, string>>();

function buildCommandToServiceMap(sf: SourceFile): Map<string, string> {
  const cached = commandToServiceCache.get(sf);
  if (cached) {
    return cached;
  }

  const map = new Map<string, string>();

  for (const importDecl of sf.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    const serviceName = extractServiceFromModule(moduleSpecifier);

    if (!serviceName) {
      continue;
    }

    // Get named imports
    const namedImports = importDecl.getNamedImports();
    for (const namedImport of namedImports) {
      const name = namedImport.getName();
      // Only map Command classes
      if (name.endsWith("Command")) {
        map.set(name, serviceName);
      }
    }
  }

  commandToServiceCache.set(sf, map);
  return map;
}

/**
 * Parses a client.send(new XxxCommand({...})) call
 */
export function parseSdkCall(
  call: CallExpression,
  registry: PluginRegistry
): ParsedCall | undefined {
  // Check if it's a .send() call
  const expr = call.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) {
    return undefined;
  }

  const methodName = expr.getName();
  if (methodName !== "send") {
    return undefined;
  }

  // Get the first argument (should be new XxxCommand({...}))
  const args = call.getArguments();
  if (args.length === 0) {
    return undefined;
  }

  const firstArg = args[0];
  if (!Node.isNewExpression(firstArg)) {
    return undefined;
  }

  const newExpr = firstArg as NewExpression;
  const commandExpr = newExpr.getExpression();
  const commandName = commandExpr.getText();

  // Get the source file and build command-to-service map
  const sf = call.getSourceFile();
  const commandToService = buildCommandToServiceMap(sf);

  // Find the service for this command
  const serviceName = commandToService.get(commandName);
  if (!serviceName) {
    return undefined;
  }

  // Built-in/custom plugins can override service names and operation mapping.
  // Otherwise, fall back to the Step Functions generic AWS SDK integration ARN.
  const plugin = registry.getByService(serviceName);

  // Determine the operation: check overrides first, then derive
  const operation = plugin?.overrides?.[commandName] ?? deriveAslOperation(commandName);

  const ctorArgs = newExpr.getArguments();
  const params = ctorArgs.length > 0 ? extractObjectParams(ctorArgs[0]) : {};

  return {
    service: plugin?.serviceName ?? serviceName,
    operation,
    commandName,
    params,
    sourceText: call.getText(),
  };
}

export interface ParsedHttpCall {
  method: string;
  url: string;
  headers?: unknown;
  body?: unknown;
  sourceText: string;
}

/**
 * Parses https.get() or https.request() calls
 */
export function parseHttpsCall(call: CallExpression): ParsedHttpCall | undefined {
  const expr = call.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) {
    return undefined;
  }

  const objText = expr.getExpression().getText();
  const methodName = expr.getName();

  // https.get() または https.request() を検出
  if (objText !== "https") {
    return undefined;
  }
  if (methodName !== "get" && methodName !== "request") {
    return undefined;
  }

  const args = call.getArguments();
  if (args.length === 0) {
    return undefined;
  }

  // 第1引数: URL
  const url = args[0].getText();

  // https.get は GET固定、https.request はオプションから取得
  let method = "\"GET\"";
  let headers: unknown;
  let body: unknown;

  // オプション引数の解析 (https.request の場合)
  const optionsArg =
    args.length > 1 && Node.isObjectLiteralExpression(unwrapParens(args[1]))
      ? (unwrapParens(args[1]) as ObjectLiteralExpression)
      : undefined;
  if (optionsArg) {
    const opts = extractObjectParams(optionsArg);
    if (opts.method) {
      method = parseHttpMethod(opts.method, "GET");
    }
    if (opts.headers) {
      headers = opts.headers;
    }
    if (opts.body) {
      body = opts.body;
    }
  }

  return { method, url, headers, body, sourceText: call.getText() };
}

/**
 * Parses fetch() calls into Step Functions HTTP Task input
 */
export function parseFetchCall(call: CallExpression): ParsedHttpCall | undefined {
  if (!isFetchCall(call)) {
    return undefined;
  }

  const args = call.getArguments();
  if (args.length === 0) {
    return undefined;
  }

  const initObject = getFetchInitObject(call);
  const init = initObject ? extractObjectParams(initObject) : {};

  return {
    method: parseHttpMethod(init.method, "GET"),
    url: args[0].getText(),
    headers: init.headers,
    body: init.body,
    sourceText: call.getText(),
  };
}

/**
 * Parses (await fetch(...)).json() into the underlying HTTP Task input
 */
export function parseTerminalFetchJsonCall(
  call: CallExpression
): ParsedHttpCall | undefined {
  const expr = call.getExpression();
  if (!Node.isPropertyAccessExpression(expr) || expr.getName() !== "json") {
    return undefined;
  }

  if (call.getArguments().length !== 0) {
    return undefined;
  }

  const target = unwrapParens(expr.getExpression());
  if (!Node.isAwaitExpression(target)) {
    return undefined;
  }

  const inner = unwrapParens(target.getExpression());
  if (!Node.isCallExpression(inner)) {
    return undefined;
  }

  return parseFetchCall(inner as CallExpression);
}

/**
 * Checks if a call expression is Promise.all
 */
export function isPromiseAll(call: CallExpression): boolean {
  const expr = call.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) {
    return false;
  }
  const objText = expr.getExpression().getText();
  const methodName = expr.getName();
  return objText === "Promise" && methodName === "all";
}

/**
 * Extracts the array argument from Promise.all
 */
export function getPromiseAllArray(call: CallExpression): ArrayLiteralExpression | undefined {
  const args = call.getArguments();
  if (args.length === 0) {
    return undefined;
  }

  const firstArg = args[0];

  // Direct array literal: Promise.all([...])
  if (Node.isArrayLiteralExpression(firstArg)) {
    return firstArg as ArrayLiteralExpression;
  }

  // Array from map: Promise.all(items.map(...))
  // For now, we don't fully support this pattern in the parser
  // It will be handled in the CFG builder

  return undefined;
}

/**
 * Extracts the loop variable and iterable from a for...of statement
 */
export function parseForOfStatement(
  stmt: ForOfStatement
): { variable: string; iterable: string } | undefined {
  const initializer = stmt.getInitializer();
  const expression = stmt.getExpression();

  let variable: string | undefined;

  // Handle: for (const x of items)
  if (Node.isVariableDeclarationList(initializer)) {
    const declarations = initializer.getDeclarations();
    if (declarations.length > 0) {
      variable = declarations[0].getName();
    }
  }

  if (!variable) {
    return undefined;
  }

  if (!isJsonPathExpression(expression)) {
    return undefined;
  }

  const iterable = expression.getText();

  return { variable, iterable };
}

/**
 * Parses a condition expression for Choice state
 */
export function parseCondition(expr: Expression): {
  variable: string;
  operator: string;
  value: unknown;
} | undefined {
  // Handle: x === value, x !== value, x > value, etc.
  if (Node.isBinaryExpression(expr)) {
    const left = expr.getLeft();
    const right = expr.getRight();
    const op = expr.getOperatorToken().getText();

    if (!isJsonPathExpression(left)) {
      return undefined;
    }

    if (!isJsonPathExpression(right) && !isLiteralExpression(right)) {
      return undefined;
    }

    const leftText = left.getText();
    const rightText = right.getText();

    // Determine the operator mapping
    let operator: string;
    let value: unknown = rightText;

    // Check if right-hand side is an identifier (variable reference)
    const isRightPath = isJsonPathExpression(right);

    // Try to parse numeric/boolean values
    if (!isRightPath) {
      if (rightText === "true") value = true;
      else if (rightText === "false") value = false;
      else if (rightText === "null") value = null;
      else if (!isNaN(Number(rightText))) value = Number(rightText);
      else if (rightText.startsWith('"') || rightText.startsWith("'")) {
        value = rightText.slice(1, -1); // Remove quotes
      }
    }

    switch (op) {
      case "===":
      case "==":
        if (isRightPath) {
          operator = "StringEqualsPath";
          value = `$.${rightText}`;
        } else if (typeof value === "string") operator = "StringEquals";
        else if (typeof value === "number") operator = "NumericEquals";
        else if (typeof value === "boolean") operator = "BooleanEquals";
        else if (value === null) operator = "IsNull";
        else operator = "StringEquals";
        break;
      case "!==":
      case "!=":
        if (isRightPath) {
          operator = "StringNotEqualsPath";
          value = `$.${rightText}`;
        } else if (typeof value === "number") operator = "NumericNotEquals";
        else if (typeof value === "boolean") operator = "BooleanNotEquals";
        else operator = "StringNotEquals";
        break;
      case ">":
        if (isRightPath) { operator = "NumericGreaterThanPath"; value = `$.${rightText}`; }
        else operator = "NumericGreaterThan";
        break;
      case "<":
        if (isRightPath) { operator = "NumericLessThanPath"; value = `$.${rightText}`; }
        else operator = "NumericLessThan";
        break;
      case ">=":
        if (isRightPath) { operator = "NumericGreaterThanEqualsPath"; value = `$.${rightText}`; }
        else operator = "NumericGreaterThanEquals";
        break;
      case "<=":
        if (isRightPath) { operator = "NumericLessThanEqualsPath"; value = `$.${rightText}`; }
        else operator = "NumericLessThanEquals";
        break;
      default:
        return undefined;
    }

    return {
      variable: `$.${leftText}`,
      operator,
      value: value === null ? true : value, // IsNull expects boolean
    };
  }

  return undefined;
}

function getFetchInitDiagnostics(call: CallExpression): string[] {
  if (!isFetchCall(call)) {
    return [];
  }

  const args = call.getArguments();
  if (args.length < 2) {
    return [];
  }

  const initArg = unwrapParens(args[1]);
  if (!Node.isObjectLiteralExpression(initArg)) {
    return ["fetch の第2引数はオブジェクトリテラルのみ対応です"];
  }

  const unsupportedKeys = initArg
    .getProperties()
    .flatMap((prop) => {
      if (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop)) {
        const name = normalizePropertyName(prop.getName());
        return SUPPORTED_FETCH_INIT_KEYS.has(name) ? [] : [name];
      }

      return ["<computed>"];
    });

  if (unsupportedKeys.length === 0) {
    return [];
  }

  return [
    `fetch の未対応オプションは無視されます: ${unsupportedKeys.join(", ")}`,
  ];
}

function isSupportedTerminalFetchJsonUsage(call: CallExpression): boolean {
  if (!parseTerminalFetchJsonCall(call)) {
    return false;
  }

  const parent = call.getParent();
  if (!parent) {
    return false;
  }

  if (Node.isReturnStatement(parent) && parent.getExpression() === call) {
    return true;
  }

  const grandParent = parent.getParent();
  return (
    Node.isAwaitExpression(parent) &&
    Node.isReturnStatement(grandParent) &&
    grandParent.getExpression() === parent
  );
}

function isUnsupportedFetchJsonUsage(call: CallExpression): boolean {
  const expr = call.getExpression();
  if (!Node.isPropertyAccessExpression(expr) || expr.getName() !== "json") {
    return false;
  }

  if (parseTerminalFetchJsonCall(call)) {
    return !isSupportedTerminalFetchJsonUsage(call);
  }

  const target = unwrapParens(expr.getExpression());
  return Node.isIdentifier(target) && isFetchInitializer(resolveIdentifierInitializer(target));
}

function isClientInitializer(node: Node): boolean {
  if (!Node.isNewExpression(node)) {
    return false;
  }

  const expression = node.getExpression();
  if (!Node.isIdentifier(expression) || !expression.getText().endsWith("Client")) {
    return false;
  }

  const clientName = expression.getText();
  return node.getSourceFile().getImportDeclarations().some((declaration) => {
    if (!declaration.getModuleSpecifierValue().startsWith("@aws-sdk/client-")) {
      return false;
    }

    return declaration.getNamedImports().some((namedImport) => {
      const localName = namedImport.getAliasNode()?.getText() ?? namedImport.getName();
      return localName === clientName;
    });
  });
}

function unwrapAwait(node: Node): Node {
  const current = unwrapParens(node);
  return Node.isAwaitExpression(current)
    ? unwrapParens(current.getExpression())
    : current;
}

function isSupportedTaskCall(call: CallExpression, registry: PluginRegistry): boolean {
  return Boolean(
    parseSdkCall(call, registry) ?? parseHttpsCall(call) ?? parseFetchCall(call)
  );
}

function getPromiseAllMapCallback(call: CallExpression): Node | undefined {
  if (!isPromiseAll(call)) {
    return undefined;
  }

  const firstArg = call.getArguments()[0];
  if (!firstArg || !Node.isCallExpression(firstArg)) {
    return undefined;
  }

  const mapExpression = firstArg.getExpression();
  if (
    !Node.isPropertyAccessExpression(mapExpression) ||
    mapExpression.getName() !== "map"
  ) {
    return undefined;
  }

  const callback = firstArg.getArguments()[0];
  return callback &&
    (Node.isArrowFunction(callback) || Node.isFunctionExpression(callback))
    ? callback.getBody()
    : undefined;
}

function isSupportedPromiseAll(
  call: CallExpression,
  registry: PluginRegistry,
  inspectStatement: (statement: Statement) => void,
  inspectTaskCall: (taskCall: CallExpression) => void
): boolean {
  const array = getPromiseAllArray(call);
  if (array) {
    return (
      array.getElements().length > 0 &&
      array.getElements().every((element) => {
        const inner = unwrapAwait(element);
        if (!Node.isCallExpression(inner) || !isSupportedTaskCall(inner, registry)) {
          return false;
        }
        inspectTaskCall(inner);
        return true;
      })
    );
  }

  const callbackBody = getPromiseAllMapCallback(call);
  if (!callbackBody) {
    return false;
  }

  if (Node.isBlock(callbackBody)) {
    for (const statement of callbackBody.getStatements()) {
      inspectStatement(statement);
    }
    return callbackBody.getStatements().length > 0;
  }

  const inner = unwrapAwait(callbackBody);
  if (!Node.isCallExpression(inner) || !isSupportedTaskCall(inner, registry)) {
    return false;
  }
  inspectTaskCall(inner);
  return true;
}

function getUnsupportedExpressionMessage(expr: Expression): string {
  if (Node.isCallExpression(expr)) {
    return `未対応の関数呼び出しです: ${expr.getExpression().getText()}()`;
  }

  if (Node.isBinaryExpression(expr)) {
    const operator = expr.getOperatorToken().getText();
    if (["=", "+=", "-=", "*=", "/=", "%="].includes(operator)) {
      return `未対応の代入式です: ${operator}`;
    }
    return `未対応の計算式です: ${operator}`;
  }

  if (Node.isPostfixUnaryExpression(expr) || Node.isPrefixUnaryExpression(expr)) {
    return `未対応の更新式です: ${expr.getText()}`;
  }

  if (Node.isObjectLiteralExpression(expr)) {
    return "未対応のオブジェクト構築です";
  }

  if (Node.isArrayLiteralExpression(expr)) {
    return "未対応の配列構築です";
  }

  return `未対応の式です: ${expr.getKindName()}`;
}

function inspectTaskInput(
  node: Node,
  addDiag: (level: Diagnostic["level"], message: string, node?: Node) => void
): void {
  const current = unwrapParens(node);

  if (
    isJsonPathExpression(current) ||
    isLiteralExpression(current) ||
    !isNaN(Number(current.getText()))
  ) {
    return;
  }

  if (Node.isObjectLiteralExpression(current)) {
    for (const property of current.getProperties()) {
      if (Node.isPropertyAssignment(property)) {
        const initializer = property.getInitializer();
        if (initializer) {
          inspectTaskInput(initializer, addDiag);
        }
      } else if (!Node.isShorthandPropertyAssignment(property)) {
        addDiag(
          "error",
          `未対応のTask入力プロパティです: ${property.getKindName()}`,
          property
        );
      }
    }
    return;
  }

  if (Node.isArrayLiteralExpression(current)) {
    for (const element of current.getElements()) {
      inspectTaskInput(element, addDiag);
    }
    return;
  }

  addDiag(
    "error",
    Node.isExpression(current)
      ? getUnsupportedExpressionMessage(current)
      : `未対応のTask入力です: ${current.getKindName()}`,
    current
  );
}

function inspectTaskCallInputs(
  call: CallExpression,
  registry: PluginRegistry,
  addDiag: (level: Diagnostic["level"], message: string, node?: Node) => void
): void {
  if (parseSdkCall(call, registry)) {
    const command = call.getArguments()[0];
    if (command && Node.isNewExpression(command)) {
      for (const argument of command.getArguments()) {
        inspectTaskInput(argument, addDiag);
      }
    }
    return;
  }

  const args = call.getArguments();
  for (const argument of args) {
    if (Node.isArrowFunction(argument) || Node.isFunctionExpression(argument)) {
      continue;
    }
    inspectTaskInput(argument, addDiag);
  }
}

function detectUnsupportedSyntax(
  sf: SourceFile,
  registry: PluginRegistry,
  functionName: string | undefined,
  addDiag: (level: Diagnostic["level"], message: string, node?: Node) => void
): void {
  const target = findTargetFunction(sf, functionName);
  const body = target?.getBody();
  if (!body) {
    return;
  }

  const inspectExpression = (expr: Expression): boolean => {
    const current = unwrapParens(expr);

    if (Node.isAwaitExpression(current)) {
      const inner = unwrapParens(current.getExpression());
      if (!Node.isCallExpression(inner)) {
        addDiag("error", getUnsupportedExpressionMessage(current), current);
        return false;
      }

      if (isSupportedTaskCall(inner, registry)) {
        inspectTaskCallInputs(inner, registry, addDiag);
        return true;
      }

      if (
        isPromiseAll(inner) &&
        isSupportedPromiseAll(
          inner,
          registry,
          inspectStatement,
          (taskCall) => inspectTaskCallInputs(taskCall, registry, addDiag)
        )
      ) {
        return true;
      }

      addDiag("error", getUnsupportedExpressionMessage(inner), inner);
      return false;
    }

    if (Node.isCallExpression(current)) {
      if (isSupportedTaskCall(current, registry)) {
        inspectTaskCallInputs(current, registry, addDiag);
        return true;
      }

      if (
        isPromiseAll(current) &&
        isSupportedPromiseAll(
          current,
          registry,
          inspectStatement,
          (taskCall) => inspectTaskCallInputs(taskCall, registry, addDiag)
        )
      ) {
        return true;
      }

      addDiag("error", getUnsupportedExpressionMessage(current), current);
      return false;
    }

    addDiag("error", getUnsupportedExpressionMessage(current as Expression), current);
    return false;
  };

  function inspectStatement(statement: Statement): void {
    if (Node.isEmptyStatement(statement)) {
      return;
    }

    if (Node.isExpressionStatement(statement)) {
      inspectExpression(statement.getExpression());
      return;
    }

    if (Node.isVariableStatement(statement)) {
      for (const declaration of statement.getDeclarationList().getDeclarations()) {
        const initializer = declaration.getInitializer();
        if (!initializer || isClientInitializer(initializer)) {
          continue;
        }
        inspectExpression(initializer as Expression);
      }
      return;
    }

    if (Node.isForOfStatement(statement)) {
      if (!parseForOfStatement(statement)) {
        addDiag("error", "未対応の for...of 文です", statement);
        return;
      }

      const loopBody = statement.getStatement();
      if (Node.isBlock(loopBody)) {
        for (const child of loopBody.getStatements()) {
          inspectStatement(child);
        }
      } else {
        inspectStatement(loopBody);
      }
      return;
    }

    if (Node.isIfStatement(statement)) {
      if (!parseCondition(statement.getExpression())) {
        addDiag("error", "未対応の if 条件式です", statement.getExpression());
      }

      const thenStatement = statement.getThenStatement();
      if (Node.isBlock(thenStatement)) {
        for (const child of thenStatement.getStatements()) {
          inspectStatement(child);
        }
      } else {
        inspectStatement(thenStatement);
      }

      const elseStatement = statement.getElseStatement();
      if (elseStatement) {
        if (Node.isBlock(elseStatement)) {
          for (const child of elseStatement.getStatements()) {
            inspectStatement(child);
          }
        } else {
          inspectStatement(elseStatement);
        }
      }
      return;
    }

    if (Node.isTryStatement(statement)) {
      for (const child of statement.getTryBlock().getStatements()) {
        inspectStatement(child);
      }
      const catchClause = statement.getCatchClause();
      if (catchClause) {
        for (const child of catchClause.getBlock().getStatements()) {
          inspectStatement(child);
        }
      }
      if (statement.getFinallyBlock()) {
        addDiag("error", "finally ブロックは未対応です", statement.getFinallyBlock());
      }
      return;
    }

    if (Node.isReturnStatement(statement)) {
      const expression = statement.getExpression();
      if (!expression) {
        return;
      }

      const unwrapped = unwrapAwait(expression);
      if (
        Node.isCallExpression(unwrapped) &&
        parseTerminalFetchJsonCall(unwrapped)
      ) {
        return;
      }

      if (
        Node.isCallExpression(unwrapped) &&
        isUnsupportedFetchJsonUsage(unwrapped)
      ) {
        return;
      }

      addDiag("error", "return 値の変換は未対応です", statement);
      return;
    }

    if (
      Node.isTypeAliasDeclaration(statement) ||
      Node.isInterfaceDeclaration(statement)
    ) {
      return;
    }

    if (Node.isForStatement(statement)) {
      addDiag("error", "通常の for 文は未対応です。for...of を使用してください", statement);
      return;
    }

    if (Node.isWhileStatement(statement) || Node.isDoStatement(statement)) {
      addDiag("error", "while / do...while ループは未対応です", statement);
      return;
    }

    addDiag(
      "error",
      `未対応の文です: ${statement.getKindName()}`,
      statement
    );
  }

  if (Node.isBlock(body)) {
    for (const statement of body.getStatements()) {
      inspectStatement(statement);
    }
  } else if (Node.isExpression(body)) {
    inspectExpression(body);
  }
}

/**
 * Forbidden modules that cannot be used in Step Functions
 */
const FORBIDDEN_MODULES = new Set([
  "fs",
  "node:fs",
  "fs/promises",
  "node:fs/promises",
  "axios",
  "child_process",
  "node:child_process",
  "net",
  "node:net",
]);

/**
 * Runs static analysis detectors on a source file
 */
export function runDetectors(
  sf: SourceFile,
  registry: PluginRegistry,
  functionName?: string
): { diagnostics: Diagnostic[]; metrics: DetectorMetrics } {
  const diagnostics: Diagnostic[] = [];
  const metrics: DetectorMetrics = {
    promiseAll: 0,
    forOf: 0,
    tryCatch: 0,
    ifElse: 0,
    awaitCalls: 0,
    sdkCalls: 0,
  };

  const addDiag = (level: Diagnostic["level"], message: string, node?: Node) => {
    diagnostics.push({
      level,
      message,
      nodeLocation: node
        ? `${sf.getFilePath()}:${node.getStartLineNumber()}`
        : undefined,
    });
  };

  for (const importDeclaration of sf.getImportDeclarations()) {
    const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
    if (FORBIDDEN_MODULES.has(moduleSpecifier)) {
      addDiag(
        "error",
        `外部I/Oモジュールは使用不可: ${moduleSpecifier}`,
        importDeclaration
      );
    }
  }

  const targetFunction = findTargetFunction(sf, functionName);
  const detectorRoot = targetFunction?.getBody();

  if (!targetFunction) {
    addDiag(
      "error",
      `変換対象の関数が見つかりません${functionName ? `: ${functionName}` : ""}`,
      sf
    );
  }

  detectorRoot?.forEachDescendant((node) => {

    // Dynamic import / eval
    if (Node.isCallExpression(node)) {
      const call = node as CallExpression;
      const exprText = call.getExpression().getText();

      if (exprText === "import") {
        addDiag("error", "dynamic import は使用不可", node);
      }
      if (exprText === "eval") {
        addDiag("error", "eval は使用不可", node);
      }

      // Promise.all
      if (isPromiseAll(call)) {
        metrics.promiseAll += 1;
      }

      // SDK calls
      const sdkCall = parseSdkCall(call, registry);
      if (sdkCall) {
        metrics.sdkCalls += 1;
      }

      for (const message of getFetchInitDiagnostics(call)) {
        addDiag("warning", message, call);
      }

      if (isUnsupportedFetchJsonUsage(call)) {
        addDiag(
          "error",
          "fetch の response.json() は return 直結形のみ対応です",
          call
        );
      }
    }

    // Await expressions
    if (Node.isAwaitExpression(node)) {
      metrics.awaitCalls += 1;
    }

    // for-of
    if (Node.isForOfStatement(node)) {
      metrics.forOf += 1;
    }

    // try/catch
    if (Node.isTryStatement(node)) {
      const ts = node as TryStatement;
      if (ts.getCatchClause()) {
        metrics.tryCatch += 1;
      }
    }

    // if/else
    if (Node.isIfStatement(node)) {
      metrics.ifElse += 1;
    }

    // Infinite loops
    if (Node.isForStatement(node)) {
      if (!node.getCondition()) {
        addDiag("error", "無限ループの可能性: for(;;)", node);
      }
    }
    if (Node.isWhileStatement(node)) {
      const cond = node.getExpression()?.getText();
      if (cond === "true") {
        addDiag("error", "無限ループの可能性: while(true)", node);
      }
    }

  });

  const targetParent = targetFunction?.getParent();
  const targetName = Node.isFunctionDeclaration(targetFunction)
    ? targetFunction.getName()
    : targetParent && Node.isVariableDeclaration(targetParent)
      ? targetParent.getName()
      : undefined;

  if (targetName) {
    detectorRoot?.forEachDescendant((node) => {
      if (
        Node.isCallExpression(node) &&
        node.getExpression().getText() === targetName
      ) {
        addDiag(
          "error",
          `再帰は使用不可: 関数 ${targetName} が自身を呼び出しています`,
          node
        );
      }
    });
  }

  detectUnsupportedSyntax(sf, registry, functionName, addDiag);

  return { diagnostics, metrics };
}

/**
 * Finds the target function in a source file
 */
export function findTargetFunction(
  sf: SourceFile,
  functionName?: string
): FunctionDeclaration | ArrowFunction | undefined {
  // If function name specified, find it
  if (functionName) {
    const fn = sf.getFunction(functionName);
    if (fn) return fn;

    // Also check for exported const arrow functions
    const varDecl = sf.getVariableDeclaration(functionName);
    const init = varDecl?.getInitializer();
    if (init && Node.isArrowFunction(init)) {
      return init as ArrowFunction;
    }
    return undefined;
  }

  // Find first exported async function
  const exportedFn = sf.getFunctions().find((f) => f.isExported() && f.isAsync());
  if (exportedFn) return exportedFn;

  // Find any exported function
  const anyExported = sf.getFunctions().find((f) => f.isExported());
  if (anyExported) return anyExported;

  // Find first function
  const firstFn = sf.getFunctions()[0];
  if (firstFn) return firstFn;

  // Look for handler export
  const handlerVar = sf.getVariableDeclaration("handler");
  const handlerInit = handlerVar?.getInitializer();
  if (handlerInit && Node.isArrowFunction(handlerInit)) {
    return handlerInit as ArrowFunction;
  }

  return undefined;
}

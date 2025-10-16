import { Project, SyntaxKind, Node, CallExpression, ImportDeclaration, ForOfStatement, TryStatement, WhileStatement, ForStatement, FunctionDeclaration } from "ts-morph";
import { Diagnostic } from "@stately/types";

export interface DetectorMetrics {
  promiseAll: number;
  forOf: number;
  tryCatch: number;
  ddbCalls: number;
}

export interface DetectorResult {
  diagnostics: Diagnostic[];
  metrics: DetectorMetrics;
}

const FORBIDDEN_MODULES = new Set(["fs", "node:fs", "axios", "http", "https", "child_process"]);

function addDiagnostic(diags: Diagnostic[], level: Diagnostic["level"], message: string, node?: Node) {
  diags.push({ level, message, nodeLocation: node ? node.getSourceFile().getFilePath() + ":" + node.getStartLineNumber() : undefined });
}

export async function runDetectors(entry: string): Promise<DetectorResult> {
  const diagnostics: Diagnostic[] = [];
  const metrics: DetectorMetrics = { promiseAll: 0, forOf: 0, tryCatch: 0, ddbCalls: 0 };

  const project = new Project({});
  const sf = project.addSourceFileAtPath(entry);

  sf.forEachDescendant((node) => {
    // Forbidden imports
    if (Node.isImportDeclaration(node)) {
      const mod = (node as ImportDeclaration).getModuleSpecifierValue();
      if (FORBIDDEN_MODULES.has(mod)) {
        addDiagnostic(diagnostics, "error", `外部I/Oの可能性があるモジュールの使用は不可: ${mod}`, node);
      }
    }

    // Dynamic import()
    if (Node.isCallExpression(node)) {
      const ce = node as CallExpression;
      const exprText = ce.getExpression().getText();
      if (exprText === "import") {
        addDiagnostic(diagnostics, "error", "dynamic import は不可", node);
      }
      if (exprText === "eval") {
        addDiagnostic(diagnostics, "error", "eval は不可", node);
      }
      // Promise.all
      if (Node.isPropertyAccessExpression(ce.getExpression())) {
        const pa = ce.getExpression().asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        const left = pa.getExpression().getText();
        const name = pa.getName();
        if (left === "Promise" && name === "all") {
          metrics.promiseAll += 1;
        }
      }
      // Heuristic: client.send(new XxxCommand(...))
      const args = ce.getArguments();
      if (ce.getExpression().getText().endsWith(".send") && args.length > 0 && Node.isNewExpression(args[0])) {
        const newExpr = args[0];
        const klass = newExpr.getExpression().getText();
        if (klass.endsWith("Command")) {
          metrics.ddbCalls += 1;
        }
      }
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

    // Infinite loops (heuristic)
    if (Node.isForStatement(node)) {
      const fsn = node as ForStatement;
      if (!fsn.getCondition()) {
        addDiagnostic(diagnostics, "error", "無限ループの可能性: for(;;)", node);
      }
    }
    if (Node.isWhileStatement(node)) {
      const ws = node as WhileStatement;
      const cond = ws.getExpression()?.getText();
      if (cond === "true") {
        addDiagnostic(diagnostics, "error", "無限ループの可能性: while(true)", node);
      }
    }

    // Simple recursion detection: function calling itself
    if (Node.isFunctionDeclaration(node)) {
      const fd = node as FunctionDeclaration;
      const name = fd.getName();
      if (name) {
        const body = fd.getBody();
        body?.forEachDescendant((n) => {
          if (Node.isCallExpression(n)) {
            const called = n.getExpression().getText();
            if (called === name) {
              addDiagnostic(diagnostics, "error", `再帰は不可: 関数 ${name} が自身を呼び出しています`, n);
            }
          }
        });
      }
    }
  });

  return { diagnostics, metrics };
}


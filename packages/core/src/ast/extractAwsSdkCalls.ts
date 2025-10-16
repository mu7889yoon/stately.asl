import { Project, Node, CallExpression, NewExpression, ObjectLiteralExpression, PropertyAssignment } from "ts-morph";

export interface AwsSdkCall {
  operation: string; // e.g., putItem
  params: Record<string, string>; // MVP: { Key: "$.Key" } 形式
  location?: string;
}

function toOperationName(commandClass: string): string {
  // PutItemCommand -> putItem
  const base = commandClass.endsWith("Command") ? commandClass.slice(0, -"Command".length) : commandClass;
  return base.charAt(0).toLowerCase() + base.slice(1);
}

function extractParams(arg?: ObjectLiteralExpression): Record<string, string> {
  const out: Record<string, string> = {};
  if (!arg) return out;
  for (const prop of arg.getProperties()) {
    if (Node.isPropertyAssignment(prop)) {
      const pa = prop as PropertyAssignment;
      const name = pa.getName();
      // MVP: 値の実体評価はせず、同名の入力パスを参照する規約
      out[`${name}`] = `$.${name}`;
    }
  }
  return out;
}

export async function extractAwsSdkCalls(entry: string): Promise<AwsSdkCall[]> {
  const project = new Project({});
  const sf = project.addSourceFileAtPath(entry);
  const calls: AwsSdkCall[] = [];

  sf.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) return;
    const ce = node as CallExpression;
    // 形: client.send(new XxxCommand({...}))
    if (!ce.getExpression().getText().endsWith(".send")) return;
    const arg0 = ce.getArguments()[0];
    if (!arg0 || !Node.isNewExpression(arg0)) return;
    const ne = arg0 as NewExpression;
    const klass = ne.getExpression().getText();
    if (!klass.endsWith("Command")) return;
    const op = toOperationName(klass);

    const ctorArg0 = ne.getArguments()[0];
    const obj = Node.isObjectLiteralExpression(ctorArg0) ? (ctorArg0 as ObjectLiteralExpression) : undefined;
    const params = extractParams(obj);
    calls.push({ operation: op, params, location: sf.getFilePath() + ":" + ce.getStartLineNumber() });
  });

  return calls;
}


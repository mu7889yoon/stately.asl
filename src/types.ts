// ============================================================================
// Diagnostic Types
// ============================================================================

export interface Diagnostic {
  level: "error" | "warning";
  message: string;
  nodeLocation?: string;
}

export interface PhaseResult<T> {
  ok: boolean;
  value?: T;
  diagnostics: Diagnostic[];
}

// ============================================================================
// CFG (Control Flow Graph) Types
// ============================================================================

export interface CFGTask {
  kind: "Task";
  service: string; // e.g., "dynamodb", "s3", "sqs", "sns"
  operation: string; // e.g., "putItem", "getObject"
  params: Record<string, unknown>;
  outputMode?: "responseBody";
  resultVariable?: string;
  terminal?: boolean;
  sourceText?: string;
}

export interface CFGParallel {
  kind: "Parallel";
  branches: CFGSequence[];
  resultVariable?: string;
}

export interface CFGMap {
  kind: "Map";
  itemsExpression: string; // e.g., "items"
  itemVariable?: string; // loop variable name
  iterator: CFGSequence;
  maxConcurrency?: number;
  resultVariable?: string;
}

export interface CFGChoice {
  kind: "Choice";
  condition: ChoiceExpression;
  thenBranch: CFGSequence;
  elseBranch?: CFGSequence;
}

export interface CFGTry {
  kind: "Try";
  tryBlock: CFGSequence;
  catchBlock?: CFGSequence;
  catchErrorName?: string;
}

export interface CFGPass {
  kind: "Pass";
  result?: unknown;
}

export interface CFGFail {
  kind: "Fail";
  error?: string;
  cause?: string;
}

export interface CFGSucceed {
  kind: "Succeed";
}

export interface CFGWait {
  kind: "Wait";
  seconds?: number;
  timestampExpression?: string;
}

export interface CFGReturn {
  kind: "Return";
  value?: unknown;
}

export type CFGNode =
  | CFGTask
  | CFGParallel
  | CFGMap
  | CFGChoice
  | CFGTry
  | CFGPass
  | CFGFail
  | CFGSucceed
  | CFGWait
  | CFGReturn;

export interface CFGSequence {
  kind: "Sequence";
  nodes: CFGNode[];
}

export type ChoiceExpression =
  | ChoiceLiteralExpression
  | ChoiceUndefinedExpression
  | ChoiceReferenceExpression
  | ChoiceComparisonExpression
  | ChoiceLogicalExpression
  | ChoiceNotExpression
  | ChoiceCallExpression;

export interface ChoiceLiteralExpression {
  kind: "Literal";
  value: string | number | boolean | null;
}

export interface ChoiceUndefinedExpression {
  kind: "Undefined";
}

export interface ChoiceReferenceExpression {
  kind: "Reference";
  root: string;
  path: Array<string | number>;
  optional: boolean;
}

export type ChoiceComparisonOperator =
  | "==="
  | "!=="
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">=";

export interface ChoiceComparisonExpression {
  kind: "Comparison";
  operator: ChoiceComparisonOperator;
  left: ChoiceExpression;
  right: ChoiceExpression;
}

export interface ChoiceLogicalExpression {
  kind: "Logical";
  operator: "&&" | "||";
  left: ChoiceExpression;
  right: ChoiceExpression;
}

export interface ChoiceNotExpression {
  kind: "Not";
  operand: ChoiceExpression;
}

export type ChoiceBuiltinFunction =
  | "Date.now"
  | "Date.parse"
  | "Number"
  | "String";

export interface ChoiceCallExpression {
  kind: "Call";
  function: ChoiceBuiltinFunction;
  arguments: ChoiceExpression[];
}

// ============================================================================
// IR (Intermediate Representation) Types
// ============================================================================

export type JsonExpr = unknown;

export interface IRTask {
  kind: "Task";
  id: string;
  service: string;
  operation: string;
  arguments: JsonExpr;
  output?: JsonExpr;
  retry?: RetryConfig[];
  catch?: CatchConfig[];
  next?: string;
  end?: boolean;
}

export interface IRParallel {
  kind: "Parallel";
  id: string;
  branches: IR[];
  output?: JsonExpr;
  retry?: RetryConfig[];
  catch?: CatchConfig[];
  next?: string;
  end?: boolean;
}

export interface IRMap {
  kind: "Map";
  id: string;
  items: JsonExpr;
  itemSelector?: JsonExpr;
  itemProcessor: IR;
  output?: JsonExpr;
  maxConcurrency?: number;
  retry?: RetryConfig[];
  catch?: CatchConfig[];
  next?: string;
  end?: boolean;
}

export interface IRChoice {
  kind: "Choice";
  id: string;
  choices: IRChoiceRule[];
  default?: string;
}

export interface IRChoiceRule {
  condition: string;
  next: string;
}

export interface IRPass {
  kind: "Pass";
  id: string;
  output?: JsonExpr;
  next?: string;
  end?: boolean;
}

export interface IRFail {
  kind: "Fail";
  id: string;
  error?: string;
  cause?: string;
}

export interface IRSucceed {
  kind: "Succeed";
  id: string;
}

export interface IRWait {
  kind: "Wait";
  id: string;
  seconds?: number;
  timestamp?: JsonExpr;
  next?: string;
  end?: boolean;
}

export type IRState =
  | IRTask
  | IRParallel
  | IRMap
  | IRChoice
  | IRPass
  | IRFail
  | IRSucceed
  | IRWait;

export interface IR {
  startAt: string;
  states: Record<string, IRState>;
}

export interface RetryConfig {
  ErrorEquals: string[];
  IntervalSeconds?: number;
  MaxAttempts?: number;
  BackoffRate?: number;
}

export interface CatchConfig {
  ErrorEquals: string[];
  Output?: JsonExpr;
  Next: string;
}

// ============================================================================
// ASL (Amazon States Language) Types
// ============================================================================

export interface ASLStateMachine {
  Comment?: string;
  QueryLanguage?: "JSONata" | "JSONPath";
  StartAt: string;
  States: Record<string, ASLState>;
  TimeoutSeconds?: number;
  Version?: string;
}

export type ASLState =
  | ASLTaskState
  | ASLParallelState
  | ASLMapState
  | ASLChoiceState
  | ASLPassState
  | ASLFailState
  | ASLSucceedState
  | ASLWaitState;

export interface ASLTaskState {
  Type: "Task";
  Resource: string;
  Arguments?: Record<string, unknown>;
  Output?: JsonExpr;
  Retry?: ASLRetryConfig[];
  Catch?: ASLCatchConfig[];
  Next?: string;
  End?: boolean;
  TimeoutSeconds?: number;
  HeartbeatSeconds?: number;
}

export interface ASLParallelState {
  Type: "Parallel";
  Branches: ASLStateMachine[];
  Arguments?: JsonExpr;
  Output?: JsonExpr;
  Retry?: ASLRetryConfig[];
  Catch?: ASLCatchConfig[];
  Next?: string;
  End?: boolean;
}

export interface ASLMapState {
  Type: "Map";
  Items?: JsonExpr;
  ItemSelector?: JsonExpr;
  ItemProcessor?: {
    ProcessorConfig?: { Mode: "INLINE" };
    StartAt: string;
    States: Record<string, ASLState>;
  };
  MaxConcurrency?: number;
  Output?: JsonExpr;
  Retry?: ASLRetryConfig[];
  Catch?: ASLCatchConfig[];
  Next?: string;
  End?: boolean;
}

export interface ASLChoiceState {
  Type: "Choice";
  Choices: ASLChoiceRule[];
  Default?: string;
}

export interface ASLChoiceRule {
  Condition: string;
  Next: string;
}

export interface ASLPassState {
  Type: "Pass";
  Output?: JsonExpr;
  Next?: string;
  End?: boolean;
}

export interface ASLFailState {
  Type: "Fail";
  Error?: string;
  Cause?: string;
}

export interface ASLSucceedState {
  Type: "Succeed";
}

export interface ASLWaitState {
  Type: "Wait";
  Seconds?: number | string;
  Timestamp?: string;
  Next?: string;
  End?: boolean;
}

export interface ASLRetryConfig {
  ErrorEquals: string[];
  IntervalSeconds?: number;
  MaxAttempts?: number;
  BackoffRate?: number;
  MaxDelaySeconds?: number;
  JitterStrategy?: "FULL" | "NONE";
}

export interface ASLCatchConfig {
  ErrorEquals: string[];
  Output?: JsonExpr;
  Next: string;
}

// ============================================================================
// Plugin Types
// ============================================================================

export interface ServicePlugin {
  /** Service name (e.g., "dynamodb", "s3") */
  serviceName: string;

  /** Client class names this plugin handles (e.g., ["DynamoDBClient"]) */
  clientNames: string[];

  /** Exception overrides: CommandName → aslOperation (optional) */
  overrides?: Record<string, string>;
}

// ============================================================================
// Transpiler Options
// ============================================================================

export interface TranspileOptions {
  entry: string;
  functionName?: string;
  plugins?: ServicePlugin[];
  includeRetry?: boolean;
  pretty?: boolean;
  httpConnectionArn?: string;
}

export interface AnalyzeOptions {
  entry: string;
  functionName?: string;
  plugins?: ServicePlugin[];
  httpConnectionArn?: string;
}

export interface AnalyzeResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  metrics: {
    promiseAll: number;
    forOf: number;
    tryCatch: number;
    ifElse: number;
    awaitCalls: number;
    sdkCalls: number;
  };
}

export interface TranspileResult {
  ok: boolean;
  ir: IR;
  asl: ASLStateMachine;
  diagnostics: Diagnostic[];
}

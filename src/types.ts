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
  resultPath?: string | null;
  outputPath?: string;
  sourceText?: string;
}

export interface CFGParallel {
  kind: "Parallel";
  branches: CFGSequence[];
}

export interface CFGMap {
  kind: "Map";
  itemsPath: string; // e.g., "$.items"
  itemVariable?: string; // loop variable name
  iterator: CFGSequence;
}

export interface CFGChoice {
  kind: "Choice";
  condition: ChoiceCondition;
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
  timestampPath?: string;
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
  | CFGWait;

export interface CFGSequence {
  kind: "Sequence";
  nodes: CFGNode[];
}

export interface ChoiceCondition {
  variable: string;
  operator: ChoiceOperator;
  value: unknown;
}

export type ChoiceOperator =
  | "StringEquals"
  | "StringEqualsPath"
  | "StringNotEquals"
  | "StringNotEqualsPath"
  | "NumericEquals"
  | "NumericNotEquals"
  | "NumericGreaterThan"
  | "NumericGreaterThanPath"
  | "NumericLessThan"
  | "NumericLessThanPath"
  | "NumericGreaterThanEquals"
  | "NumericGreaterThanEqualsPath"
  | "NumericLessThanEquals"
  | "NumericLessThanEqualsPath"
  | "BooleanEquals"
  | "BooleanEqualsPath"
  | "BooleanNotEquals"
  | "IsNull"
  | "IsPresent"
  | "IsString"
  | "IsNumeric"
  | "IsBoolean";

// ============================================================================
// IR (Intermediate Representation) Types
// ============================================================================

export type JsonExpr = unknown;

export interface IRTask {
  kind: "Task";
  id: string;
  service: string;
  operation: string;
  params: JsonExpr;
  resultPath?: string;
  outputPath?: string;
  retry?: RetryConfig[];
  catch?: CatchConfig[];
  next?: string;
  end?: boolean;
}

export interface IRParallel {
  kind: "Parallel";
  id: string;
  branches: IR[];
  resultPath?: string;
  retry?: RetryConfig[];
  catch?: CatchConfig[];
  next?: string;
  end?: boolean;
}

export interface IRMap {
  kind: "Map";
  id: string;
  itemsPath: string;
  iterator: IR;
  maxConcurrency?: number;
  resultPath?: string;
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
  condition: ChoiceCondition;
  next: string;
}

export interface IRPass {
  kind: "Pass";
  id: string;
  result?: unknown;
  resultPath?: string;
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
  timestampPath?: string;
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
  ResultPath?: string;
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
  Parameters?: Record<string, unknown>;
  ResultPath?: string;
  ResultSelector?: Record<string, unknown>;
  OutputPath?: string;
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
  ResultPath?: string;
  ResultSelector?: Record<string, unknown>;
  Retry?: ASLRetryConfig[];
  Catch?: ASLCatchConfig[];
  Next?: string;
  End?: boolean;
}

export interface ASLMapState {
  Type: "Map";
  ItemsPath?: string;
  Iterator?: ASLStateMachine;
  ItemProcessor?: {
    ProcessorConfig?: { Mode: string };
    StartAt: string;
    States: Record<string, ASLState>;
  };
  MaxConcurrency?: number;
  ResultPath?: string;
  ResultSelector?: Record<string, unknown>;
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
  Variable?: string;
  StringEquals?: string;
  StringEqualsPath?: string;
  StringNotEquals?: string;
  NumericEquals?: number;
  NumericGreaterThan?: number;
  NumericLessThan?: number;
  NumericGreaterThanEquals?: number;
  NumericLessThanEquals?: number;
  BooleanEquals?: boolean;
  IsNull?: boolean;
  IsPresent?: boolean;
  IsString?: boolean;
  IsNumeric?: boolean;
  IsBoolean?: boolean;
  And?: ASLChoiceRule[];
  Or?: ASLChoiceRule[];
  Not?: ASLChoiceRule;
  Next: string;
}

export interface ASLPassState {
  Type: "Pass";
  Result?: unknown;
  ResultPath?: string;
  Parameters?: Record<string, unknown>;
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
  Seconds?: number;
  Timestamp?: string;
  SecondsPath?: string;
  TimestampPath?: string;
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
  ResultPath?: string;
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
}

export interface TranspileResult {
  ok: boolean;
  ir: IR;
  asl: ASLStateMachine;
  diagnostics: Diagnostic[];
}

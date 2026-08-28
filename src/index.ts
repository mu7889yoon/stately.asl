// Main exports
export { transpile, transpileSync, analyze } from "./transpile.js";

// Type exports
export type {
  // Diagnostic types
  Diagnostic,
  PhaseResult,

  // CFG types
  CFGNode,
  CFGSequence,
  CFGTask,
  CFGParallel,
  CFGMap,
  CFGChoice,
  CFGTry,
  CFGPass,
  CFGFail,
  CFGSucceed,
  CFGWait,
  ChoiceExpression,
  ChoiceLiteralExpression,
  ChoiceUndefinedExpression,
  ChoiceReferenceExpression,
  ChoiceComparisonOperator,
  ChoiceComparisonExpression,
  ChoiceLogicalExpression,
  ChoiceNotExpression,
  ChoiceBuiltinFunction,
  ChoiceCallExpression,

  // IR types
  IR,
  IRState,
  IRTask,
  IRParallel,
  IRMap,
  IRChoice,
  IRPass,
  IRFail,
  IRSucceed,
  IRWait,
  IRChoiceRule,
  RetryConfig,
  CatchConfig,
  JsonExpr,

  // ASL types
  ASLStateMachine,
  ASLState,
  ASLTaskState,
  ASLParallelState,
  ASLMapState,
  ASLChoiceState,
  ASLPassState,
  ASLFailState,
  ASLSucceedState,
  ASLWaitState,
  ASLRetryConfig,
  ASLCatchConfig,
  ASLChoiceRule,

  // Plugin types
  ServicePlugin,

  // Options
  TranspileOptions,
  TranspileResult,
} from "./types.js";

// Plugin exports
export {
  PluginRegistry,
  defaultRegistry,
  createDefaultRegistry,
  buildSdkArn,
  deriveAslOperation,
  dynamodbPlugin,
  s3Plugin,
  sqsPlugin,
  snsPlugin,
} from "./plugins/index.js";

// Parser exports (for advanced use)
export { parseFile, analyze as analyzeFile } from "./parser/index.js";

// CFG exports (for advanced use)
export { buildCFG, buildControlFlow } from "./cfg/index.js";

// IR exports (for advanced use)
export { buildIR, sequenceToIR } from "./ir/index.js";

// ASL exports (for advanced use)
export { serializeToAsl, serializeToJson } from "./asl/index.js";

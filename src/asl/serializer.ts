import type {
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
  ASLChoiceRule,
  ASLRetryConfig,
  ASLCatchConfig,
  ChoiceCondition,
  RetryConfig,
  CatchConfig,
} from "../types.js";
import { buildSdkArn } from "../plugins/index.js";

/**
 * Convert IR retry config to ASL retry config
 */
function convertRetry(retry: RetryConfig[] | undefined): ASLRetryConfig[] | undefined {
  if (!retry || retry.length === 0) {
    return undefined;
  }
  return retry.map((r) => ({
    ErrorEquals: r.ErrorEquals,
    IntervalSeconds: r.IntervalSeconds,
    MaxAttempts: r.MaxAttempts,
    BackoffRate: r.BackoffRate,
  }));
}

/**
 * Convert IR catch config to ASL catch config
 */
function convertCatch(catchConfig: CatchConfig[] | undefined): ASLCatchConfig[] | undefined {
  if (!catchConfig || catchConfig.length === 0) {
    return undefined;
  }
  return catchConfig.map((c) => ({
    ErrorEquals: c.ErrorEquals,
    ResultPath: c.ResultPath,
    Next: c.Next,
  }));
}

/**
 * Convert a Choice condition to ASL choice rule properties
 */
function conditionToASL(condition: ChoiceCondition): Partial<ASLChoiceRule> {
  const result: Partial<ASLChoiceRule> = {
    Variable: condition.variable,
  };

  switch (condition.operator) {
    case "StringEquals":
      result.StringEquals = condition.value as string;
      break;
    case "StringEqualsPath":
      result.StringEqualsPath = condition.value as string;
      break;
    case "StringNotEquals":
      result.StringNotEquals = condition.value as string;
      break;
    case "NumericEquals":
      result.NumericEquals = condition.value as number;
      break;
    case "NumericGreaterThan":
      result.NumericGreaterThan = condition.value as number;
      break;
    case "NumericLessThan":
      result.NumericLessThan = condition.value as number;
      break;
    case "NumericGreaterThanEquals":
      result.NumericGreaterThanEquals = condition.value as number;
      break;
    case "NumericLessThanEquals":
      result.NumericLessThanEquals = condition.value as number;
      break;
    case "BooleanEquals":
      result.BooleanEquals = condition.value as boolean;
      break;
    case "IsNull":
      result.IsNull = condition.value as boolean;
      break;
    case "IsPresent":
      result.IsPresent = condition.value as boolean;
      break;
    case "IsString":
      result.IsString = condition.value as boolean;
      break;
    case "IsNumeric":
      result.IsNumeric = condition.value as boolean;
      break;
    case "IsBoolean":
      result.IsBoolean = condition.value as boolean;
      break;
  }

  return result;
}

/**
 * Serialize an IRTask to ASLTaskState
 */
function serializeTask(task: IRTask): ASLTaskState {
  const state: ASLTaskState = {
    Type: "Task",
    Resource: buildSdkArn(task.service, task.operation),
    Parameters: task.params as Record<string, unknown>,
    ResultPath: task.resultPath,
  };

  if (task.retry) {
    state.Retry = convertRetry(task.retry);
  }

  if (task.catch) {
    state.Catch = convertCatch(task.catch);
  }

  if (task.next) {
    state.Next = task.next;
  } else if (task.end) {
    state.End = true;
  }

  return state;
}

/**
 * Serialize an IRParallel to ASLParallelState
 */
function serializeParallel(parallel: IRParallel): ASLParallelState {
  const branches = parallel.branches.map((branch) => serializeToAsl(branch));

  const state: ASLParallelState = {
    Type: "Parallel",
    Branches: branches,
    ResultPath: parallel.resultPath,
  };

  if (parallel.retry) {
    state.Retry = convertRetry(parallel.retry);
  }

  if (parallel.catch) {
    state.Catch = convertCatch(parallel.catch);
  }

  if (parallel.next) {
    state.Next = parallel.next;
  } else if (parallel.end) {
    state.End = true;
  }

  return state;
}

/**
 * Serialize an IRMap to ASLMapState
 */
function serializeMap(map: IRMap): ASLMapState {
  const iterator = serializeToAsl(map.iterator);

  const state: ASLMapState = {
    Type: "Map",
    ItemsPath: map.itemsPath,
    Iterator: iterator,
    ResultPath: map.resultPath,
  };

  if (map.maxConcurrency) {
    state.MaxConcurrency = map.maxConcurrency;
  }

  if (map.retry) {
    state.Retry = convertRetry(map.retry);
  }

  if (map.catch) {
    state.Catch = convertCatch(map.catch);
  }

  if (map.next) {
    state.Next = map.next;
  } else if (map.end) {
    state.End = true;
  }

  return state;
}

/**
 * Serialize an IRChoice to ASLChoiceState
 */
function serializeChoice(choice: IRChoice): ASLChoiceState {
  const choices: ASLChoiceRule[] = choice.choices.map((c) => ({
    ...conditionToASL(c.condition),
    Next: c.next,
  }));

  const state: ASLChoiceState = {
    Type: "Choice",
    Choices: choices,
  };

  if (choice.default) {
    state.Default = choice.default;
  }

  return state;
}

/**
 * Serialize an IRPass to ASLPassState
 */
function serializePass(pass: IRPass): ASLPassState {
  const state: ASLPassState = {
    Type: "Pass",
  };

  if (pass.result !== undefined) {
    state.Result = pass.result;
  }

  if (pass.resultPath) {
    state.ResultPath = pass.resultPath;
  }

  if (pass.next) {
    state.Next = pass.next;
  } else if (pass.end) {
    state.End = true;
  }

  return state;
}

/**
 * Serialize an IRFail to ASLFailState
 */
function serializeFail(fail: IRFail): ASLFailState {
  const state: ASLFailState = {
    Type: "Fail",
  };

  if (fail.error) {
    state.Error = fail.error;
  }

  if (fail.cause) {
    state.Cause = fail.cause;
  }

  return state;
}

/**
 * Serialize an IRSucceed to ASLSucceedState
 */
function serializeSucceed(_succeed: IRSucceed): ASLSucceedState {
  return {
    Type: "Succeed",
  };
}

/**
 * Serialize an IRWait to ASLWaitState
 */
function serializeWait(wait: IRWait): ASLWaitState {
  const state: ASLWaitState = {
    Type: "Wait",
  };

  if (wait.seconds !== undefined) {
    state.Seconds = wait.seconds;
  }

  if (wait.timestampPath) {
    state.TimestampPath = wait.timestampPath;
  }

  if (wait.next) {
    state.Next = wait.next;
  } else if (wait.end) {
    state.End = true;
  }

  return state;
}

/**
 * Serialize an IR state to ASL state
 */
function serializeState(state: IRState): ASLState {
  switch (state.kind) {
    case "Task":
      return serializeTask(state);
    case "Parallel":
      return serializeParallel(state);
    case "Map":
      return serializeMap(state);
    case "Choice":
      return serializeChoice(state);
    case "Pass":
      return serializePass(state);
    case "Fail":
      return serializeFail(state);
    case "Succeed":
      return serializeSucceed(state);
    case "Wait":
      return serializeWait(state);
    default:
      throw new Error(`Unknown state kind: ${(state as IRState).kind}`);
  }
}

/**
 * Serialize IR to ASL State Machine
 */
export function serializeToAsl(ir: IR): ASLStateMachine {
  const states: Record<string, ASLState> = {};

  for (const [id, irState] of Object.entries(ir.states)) {
    states[id] = serializeState(irState);
  }

  return {
    QueryLanguage: "JSONata",
    StartAt: ir.startAt,
    States: states,
  };
}

/**
 * Serialize IR to ASL JSON string
 */
export function serializeToJson(ir: IR, pretty = false): string {
  const asl = serializeToAsl(ir);
  return JSON.stringify(asl, null, pretty ? 2 : undefined);
}

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
  RetryConfig,
  CatchConfig,
} from "../types.js";
import { buildSdkArn } from "../plugins/index.js";

/**
 * Convert IR retry config to ASL retry config
 */
function convertRetry(
  retry: RetryConfig[] | undefined,
): ASLRetryConfig[] | undefined {
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
function convertCatch(
  catchConfig: CatchConfig[] | undefined,
): ASLCatchConfig[] | undefined {
  if (!catchConfig || catchConfig.length === 0) {
    return undefined;
  }
  return catchConfig.map((c) => ({
    ErrorEquals: c.ErrorEquals,
    Output: c.Output,
    Next: c.Next,
  }));
}

/**
 * Serialize an IRTask to ASLTaskState
 */
function serializeTask(task: IRTask): ASLTaskState {
  const state: ASLTaskState = {
    Type: "Task",
    Resource: buildSdkArn(task.service, task.operation),
    Arguments: task.arguments as Record<string, unknown>,
  };

  if (task.output !== undefined) {
    state.Output = task.output;
  }

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
  const itemProcessor = serializeToAsl(map.itemProcessor);

  const state: ASLMapState = {
    Type: "Map",
    Items: map.items,
    ItemProcessor: {
      ProcessorConfig: { Mode: "INLINE" },
      StartAt: itemProcessor.StartAt,
      States: itemProcessor.States,
    },
  };

  if (map.itemSelector !== undefined) {
    state.ItemSelector = map.itemSelector;
  }

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
    Condition: c.condition,
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

  if (pass.output !== undefined) {
    state.Output = pass.output;
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

  if (wait.timestamp !== undefined) {
    state.Timestamp = wait.timestamp as string;
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

import { IRTask, JsonExpr } from "@stately/types";

export function ddbOperationToResource(operation: string): string {
  // operation should be lowerCamel per ASL integration pattern
  return `arn:aws:states:::aws-sdk:dynamodb:${operation}`;
}

export function mapParamsToJsonPath(params: Record<string, unknown>): JsonExpr {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(params)) {
    out[`${key}.$`] = `$.${key}`;
  }
  return out;
}

export function defaultDdbRetry() {
  return [
    {
      ErrorEquals: ["States.ALL"],
      IntervalSeconds: 2,
      BackoffRate: 2,
      MaxAttempts: 3
    }
  ];
}

export function makeDdbTask(
  id: string,
  operation: string,
  params: Record<string, unknown>
): IRTask {
  return {
    kind: "Task",
    id,
    service: "dynamodb",
    operation,
    params: mapParamsToJsonPath(params),
    resultPath: `$.${id}Result`
  };
}


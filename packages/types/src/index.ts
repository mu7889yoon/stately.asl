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

export type JsonExpr = any;

export interface IRTask {
  kind: "Task";
  id: string;
  service: string; // e.g., "dynamodb"
  operation: string; // e.g., "putItem"
  params: JsonExpr;
  resultPath?: string;
  next?: string;
}

export interface IRParallel {
  kind: "Parallel";
  id: string;
  branches: IR[];
  next?: string;
}

export interface IRMap {
  kind: "Map";
  id: string;
  itemsPath: string; // e.g., "$.items"
  iterator: IR;
  next?: string;
}

export interface IRPass {
  kind: "Pass";
  id: string;
  next?: string;
}

export interface IR {
  startAt: string;
  states: Record<string, IRTask | IRParallel | IRMap | IRPass>;
}


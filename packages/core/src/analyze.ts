import { Project } from "ts-morph";
import { Diagnostic, PhaseResult } from "@stately/types";
import { runDetectors } from "./ast/detectors.js";

export interface Sketch {
  // placeholder for phase1 summary
  awsCalls: number;
}

export async function analyze(opts: { entry: string }): Promise<PhaseResult<Sketch>> {
  const diagnostics: Diagnostic[] = [];
  const project = new Project({});
  project.addSourceFileAtPath(opts.entry);
  const detected = await runDetectors(opts.entry);
  diagnostics.push(...detected.diagnostics);
  const sketch: Sketch = { awsCalls: detected.metrics.ddbCalls };
  return { ok: diagnostics.length === 0, value: sketch, diagnostics };
}


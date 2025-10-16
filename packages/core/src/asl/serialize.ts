import { IR, IRMap, IRParallel, IRPass, IRTask } from "@stately/types";
import { defaultRetry } from "@stately/runtime/src/presets.js";

export function serializeToAsl(ir: IR): any {
  const states: any = {};
  for (const [id, st] of Object.entries(ir.states)) {
    if (st.kind === "Task") {
      states[id] = {
        Type: "Task",
        Resource: `arn:aws:states:::aws-sdk:${st.service}:${st.operation}`,
        Parameters: st.params,
        ResultPath: st.resultPath,
        Retry: defaultRetry,
        ...(st.next ? { Next: st.next } : { End: true })
      };
    } else if (st.kind === "Pass") {
      states[id] = { Type: "Pass", ...(st.next ? { Next: st.next } : { End: true }) };
    } else if (st.kind === "Parallel") {
      const branches = (st as IRParallel).branches.map((b) => serializeToAsl(b));
      states[id] = { Type: "Parallel", Branches: branches, ...(st.next ? { Next: st.next } : { End: true }) };
    } else if (st.kind === "Map") {
      const mapSt = st as IRMap;
      states[id] = {
        Type: "Map",
        ItemsPath: mapSt.itemsPath,
        Iterator: serializeToAsl(mapSt.iterator),
        ...(st.next ? { Next: st.next } : { End: true })
      };
    }
  }
  return { StartAt: ir.startAt, States: states };
}



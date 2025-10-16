import { IR, IRMap, IRParallel, IRPass, IRTask } from "@stately/types";
import { CFSequence, CFNode } from "../cfg/controlFlow.js";

let idSeq = 0;
function genId(prefix: string) {
  idSeq += 1;
  return `${prefix}_${idSeq}`;
}

function nodeToIR(node: CFNode, states: IR["states"]): string {
  switch (node.kind) {
    case "Task": {
      const id = genId(node.operation);
      const task: IRTask = {
        kind: "Task",
        id,
        service: "dynamodb",
        operation: node.operation,
        params: Object.fromEntries(Object.keys(node.params).map((k) => [`${k}.$`, `$.${k}`])),
        resultPath: `$.${id}Result`
      };
      states[id] = task;
      return id;
    }
    case "Parallel": {
      const id = genId("Parallel");
      const branches: IR[] = node.branches.map((seq) => sequenceToIR(seq));
      const p: IRParallel = { kind: "Parallel", id, branches };
      states[id] = p as any;
      return id;
    }
    case "Map": {
      const id = genId("Map");
      const iterator = sequenceToIR(node.iterator);
      const m: IRMap = { kind: "Map", id, itemsPath: node.itemsPath, iterator };
      states[id] = m as any;
      return id;
    }
    case "Try": {
      // MVP: try はtry内を直列としてそのまま展開（Catchはserializerで付与検討）
      return sequenceToIR(node.tryBlock, states).startAt;
    }
  }
}

export function sequenceToIR(seq: CFSequence, existing?: IR["states"]): IR {
  const states: IR["states"] = existing ?? {};
  const ids: string[] = [];
  for (const n of seq.nodes) {
    const id = nodeToIR(n, states);
    ids.push(id);
  }
  for (let i = 0; i < ids.length - 1; i++) {
    (states[ids[i]] as any).next = ids[i + 1];
  }
  const startAt = ids[0] ?? (states["Pass"] ? "Pass" : (() => {
    const pid = genId("Pass");
    states[pid] = { kind: "Pass", id: pid } as IRPass;
    return pid;
  })());
  return { startAt, states };
}



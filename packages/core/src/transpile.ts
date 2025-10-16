import { IR } from "@stately/types";
import { buildControlFlow } from "./cfg/controlFlow.js";
import { sequenceToIR } from "./ir/buildIR.js";
import { serializeToAsl } from "./asl/serialize.js";

export async function transpile(opts: { entry: string }): Promise<{ ir: IR; asl: any }> {
  const cf = await buildControlFlow(opts.entry);
  const ir = sequenceToIR(cf);
  const asl = serializeToAsl(ir);
  return { ir, asl };
}


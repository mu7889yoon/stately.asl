import { describe, expect, it } from "vitest";
import { serializeToAsl, serializeToJson } from "../src/index.js";
import type { IR } from "../src/index.js";

describe("ASL serializer", () => {
  it("serializes terminal and timing state variants", () => {
    const ir: IR = {
      startAt: "Wait_1",
      states: {
        Wait_1: {
          kind: "Wait",
          id: "Wait_1",
          seconds: 0,
          next: "Fail_1",
        },
        Fail_1: {
          kind: "Fail",
          id: "Fail_1",
          error: "Failed",
          cause: "Test failure",
        },
        Succeed_1: { kind: "Succeed", id: "Succeed_1" },
      },
    };

    expect(serializeToAsl(ir)).toEqual({
      QueryLanguage: "JSONata",
      StartAt: "Wait_1",
      States: {
        Wait_1: { Type: "Wait", Seconds: 0, Next: "Fail_1" },
        Fail_1: { Type: "Fail", Error: "Failed", Cause: "Test failure" },
        Succeed_1: { Type: "Succeed" },
      },
    });
  });

  it("supports compact and pretty JSON output", () => {
    const ir: IR = {
      startAt: "Pass_1",
      states: { Pass_1: { kind: "Pass", id: "Pass_1", end: true } },
    };

    expect(serializeToJson(ir)).not.toContain("\n");
    expect(serializeToJson(ir, true)).toContain('\n  "QueryLanguage"');
  });

  it("rejects an unknown IR state kind", () => {
    const ir = {
      startAt: "Unknown_1",
      states: { Unknown_1: { kind: "Unknown", id: "Unknown_1" } },
    } as unknown as IR;

    expect(() => serializeToAsl(ir)).toThrow("Unknown state kind: Unknown");
  });
});

import { describe, it, expect } from "vitest";
import { transpile } from "@stately/core";

describe("transpile ddb-put-item", () => {
  it("produces ASL Task for PutItem", async () => {
    const { asl } = await transpile({ entry: "examples/ddb-put-item.ts" });
    expect(asl).toMatchSnapshot();
    expect(asl.States).toBeTruthy();
    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Resource).toContain("dynamodb:putItem");
  });
});


import { describe, it, expect } from "vitest";
import { transpile } from "@stately/core";

describe("transpile ddb-batch", () => {
  it("produces Parallel/Map/Catch-like", async () => {
    const { asl } = await transpile({ entry: "examples/ddb-batch.ts" });
    expect(asl).toMatchSnapshot();
    expect(asl.StartAt).toBeTruthy();
  });
});


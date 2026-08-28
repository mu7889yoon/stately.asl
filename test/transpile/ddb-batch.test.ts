import { describe, it, expect } from "vitest";
import { transpile } from "../../src/index.js";

describe("transpile ddb-batch", () => {
  it("produces Parallel/Map/Catch-like", async () => {
    const result = await transpile({ entry: "test/fixtures/ddb-batch.ts" });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    const { asl } = result;
    expect(asl).toMatchSnapshot();
    expect(asl.StartAt).toBeTruthy();
  });
});

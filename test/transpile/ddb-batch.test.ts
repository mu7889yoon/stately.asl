import { describe, it, expect } from "vitest";
import { transpile } from "../../dist/index.js";

describe("transpile ddb-batch", () => {
  it("produces Parallel/Map/Catch-like", async () => {
    const { asl } = await transpile({ entry: "test/fixtures/ddb-batch.ts" });
    expect(asl).toMatchSnapshot();
    expect(asl.StartAt).toBeTruthy();
  });
});

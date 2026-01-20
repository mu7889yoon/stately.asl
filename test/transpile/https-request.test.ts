import { describe, it, expect } from "vitest";
import { transpile } from "../../dist/index.js";

describe("transpile https-request", () => {
  it("produces ASL Task for https.get", async () => {
    const { asl } = await transpile({ entry: "test/fixtures/https-request.ts" });
    expect(asl).toMatchSnapshot();
    expect(asl.States).toBeTruthy();
    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Resource).toBe("arn:aws:states:::http:invoke");
  });

  it("produces ASL Task for https.request with POST", async () => {
    const { asl } = await transpile({ entry: "test/fixtures/https-post.ts" });
    expect(asl).toMatchSnapshot();
    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Resource).toBe("arn:aws:states:::http:invoke");
    expect(first.Parameters.Method).toBe("POST");
  });
});

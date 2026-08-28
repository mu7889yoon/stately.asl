import { describe, it, expect } from "vitest";
import { transpile } from "../../src/index.js";

const httpConnectionArn =
  "arn:aws:events:ap-northeast-1:123456789012:connection/test/id";

describe("transpile https-request", () => {
  it("produces ASL Task for https.get", async () => {
    const result = await transpile({
      entry: "test/fixtures/https-request.ts",
      httpConnectionArn,
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    const { asl } = result;
    expect(asl).toMatchSnapshot();
    expect(asl.States).toBeTruthy();
    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Resource).toBe("arn:aws:states:::http:invoke");
  });

  it("produces ASL Task for https.request with POST", async () => {
    const result = await transpile({
      entry: "test/fixtures/https-post.ts",
      httpConnectionArn,
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    const { asl } = result;
    expect(asl).toMatchSnapshot();
    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Resource).toBe("arn:aws:states:::http:invoke");
    expect(first.Arguments.Method).toBe("POST");
  });
});

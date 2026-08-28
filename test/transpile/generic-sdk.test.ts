import { describe, it, expect } from "vitest";
import { transpile } from "../../src/index.js";

describe("transpile generic AWS SDK integrations", () => {
  it("produces an AWS SDK Task for an unregistered service", async () => {
    const result = await transpile({ entry: "test/fixtures/lambda-invoke.ts" });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    const { asl } = result;

    expect(asl.StartAt).toBeTruthy();
    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Resource).toBe("arn:aws:states:::aws-sdk:lambda:invoke");
    expect(first.Retry).toEqual([
      {
        ErrorEquals: ["States.ALL"],
        IntervalSeconds: 1,
        MaxAttempts: 3,
        BackoffRate: 2,
      },
    ]);
  });

  it("keeps registered service plugin behavior", async () => {
    const result = await transpile({ entry: "test/fixtures/ddb-put-item.ts" });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    const { asl } = result;

    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Resource).toBe("arn:aws:states:::aws-sdk:dynamodb:putItem");
  });
});

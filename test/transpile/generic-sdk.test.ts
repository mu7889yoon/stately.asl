import { describe, it, expect } from "vitest";
import { transpile } from "../../dist/index.js";

describe("transpile generic AWS SDK integrations", () => {
  it("produces an AWS SDK Task for an unregistered service", async () => {
    const { asl } = await transpile({ entry: "test/fixtures/lambda-invoke.ts" });

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
    const { asl } = await transpile({ entry: "test/fixtures/ddb-put-item.ts" });

    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Resource).toBe("arn:aws:states:::aws-sdk:dynamodb:putItem");
  });
});

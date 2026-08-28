import { describe, expect, it } from "vitest";
import { analyze, transpile } from "../../src/index.js";

const httpConnectionArn =
  "arn:aws:events:ap-northeast-1:123456789012:connection/test/id";

describe("advertised workflow semantics", () => {
  it.each([
    "examples/01-simple-dynamodb.ts",
    "examples/02-parallel-operations.ts",
    "examples/03-loop-map.ts",
    "examples/04-error-handling.ts",
  ])("transpiles %s without diagnostics", async (entry) => {
    const result = await transpile({ entry });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("keeps Promise.all(map) concurrent and for-of sequential", async () => {
    const result = await transpile({ entry: "test/fixtures/ddb-batch.ts" });
    expect(result.ok).toBe(true);
    expect(result.asl.States.Map_1).toMatchObject({
      Type: "Map",
      Items: "{% $states.input.items %}",
    });
    expect(result.asl.States.Map_1).not.toHaveProperty("MaxConcurrency");
    expect(result.asl.States.Map_2).toMatchObject({
      Type: "Map",
      MaxConcurrency: 1,
    });
  });

  it("supports multiple tasks and a returned result in Promise.all(map)", async () => {
    const result = await transpile({
      entry: "test/fixtures/promise-map-multiple.ts",
      includeRetry: false,
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.asl.States.Map_1).toMatchObject({ Type: "Map" });
    if (result.asl.States.Map_1.Type !== "Map") return;
    expect(
      Object.keys(result.asl.States.Map_1.ItemProcessor?.States ?? {}),
    ).toEqual(["putItem_1", "getItem_1", "Pass_1"]);
    expect(result.asl.States.Pass_2).toMatchObject({
      Type: "Pass",
      Output: "{% $states.input.Map_1Result %}",
      End: true,
    });
  });

  it("converts return values and keeps catch returns terminal", async () => {
    const result = await transpile({
      entry: "examples/04-error-handling.ts",
      includeRetry: false,
    });
    expect(result.ok).toBe(true);
    expect(result.asl.States.getItem_1).toMatchObject({
      Type: "Task",
      Catch: [{ Next: "Pass_2" }],
      Next: "Pass_1",
    });
    expect(result.asl.States.Pass_1).toMatchObject({
      Type: "Pass",
      Output: {
        success: true,
        item: "{% $states.input.getItem_1Result.Item %}",
      },
      End: true,
    });
    expect(result.asl.States.Pass_2).toMatchObject({
      Type: "Pass",
      Output: { success: false, error: "Failed to process item" },
      End: true,
    });
    expect(result.asl.States).not.toHaveProperty("Pass_3");
  });

  it("uses $count for an array length return", async () => {
    const result = await transpile({ entry: "examples/03-loop-map.ts" });
    expect(result.asl.States.Pass_1).toMatchObject({
      Output: { success: true, count: "{% $count($states.input.items) %}" },
    });
  });

  it("reports an empty Promise.all as unsupported", async () => {
    const result = await analyze({ entry: "test/fixtures/promise-empty.ts" });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message: expect.stringContaining("Promise.all"),
        }),
      ]),
    );
  });

  it("reports a concrete diagnostic for an unsupported return expression", async () => {
    const result = await analyze({ entry: "test/fixtures/return-invalid.ts" });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message: expect.stringContaining("未対応のreturn式"),
        }),
      ]),
    );
  });
});

describe("parser and HTTP hardening", () => {
  it("supports aliased AWS SDK imports", async () => {
    const result = await transpile({ entry: "test/fixtures/sdk-alias.ts" });
    expect(result.ok).toBe(true);
    expect(result.asl.States.putItem_1).toMatchObject({
      Type: "Task",
      Resource: "arn:aws:states:::aws-sdk:dynamodb:putItem",
    });
  });

  it("isolates custom plugin overrides between calls", async () => {
    const customized = await transpile({
      entry: "test/fixtures/ddb-put-item.ts",
      plugins: [
        {
          serviceName: "dynamodb",
          clientNames: ["DynamoDBClient"],
          overrides: { PutItemCommand: "customPut" },
        },
      ],
    });
    expect(customized.asl.States.customPut_1).toMatchObject({
      Resource: "arn:aws:states:::aws-sdk:dynamodb:customPut",
    });

    const defaults = await transpile({
      entry: "test/fixtures/ddb-put-item.ts",
    });
    expect(defaults.asl.States.putItem_1).toMatchObject({
      Resource: "arn:aws:states:::aws-sdk:dynamodb:putItem",
    });
  });

  it("rejects a client and command service mismatch", async () => {
    const result = await analyze({ entry: "test/fixtures/sdk-mismatch.ts" });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("サービスが一致しません"),
        }),
      ]),
    );
  });

  it("does not treat a shadowed fetch function as an HTTP Task", async () => {
    const result = await analyze({ entry: "test/fixtures/shadowed-http.ts" });
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes("Connection ARN"),
      ),
    ).toBe(false);
  });

  it("requires and emits an HTTP Connection ARN", async () => {
    const missing = await analyze({ entry: "test/fixtures/fetch-request.ts" });
    expect(missing.ok).toBe(false);
    expect(missing.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("Connection ARN"),
        }),
      ]),
    );

    const result = await transpile({
      entry: "test/fixtures/fetch-request.ts",
      httpConnectionArn,
    });
    expect(result.ok).toBe(true);
    expect(result.asl.States[result.asl.StartAt]).toMatchObject({
      Type: "Task",
      Arguments: {
        Authentication: { ConnectionArn: httpConnectionArn },
      },
    });
  });
});

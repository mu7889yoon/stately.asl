import { describe, it, expect } from "vitest";
import { transpile } from "../../src/index.js";

describe("transpile ddb-put-item", () => {
  it("produces ASL Task for PutItem", async () => {
    const result = await transpile({ entry: "test/fixtures/ddb-put-item.ts" });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    const { asl } = result;
    expect(asl).toMatchSnapshot();
    expect(asl.QueryLanguage).toBe("JSONata");
    expect(asl.States).toBeTruthy();
    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Resource).toContain("dynamodb:putItem");
    expect(first.Arguments).toEqual({
      TableName: "{% $states.input.TableName %}",
      Item: "{% $states.input.Item %}",
    });
    expect(first.Output).toBe(
      '{% $merge([$states.input, {"putItem_1Result": $states.result}]) %}',
    );
  });
});

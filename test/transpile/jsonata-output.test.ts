import { describe, expect, it } from "vitest";
import { transpile } from "../../dist/index.js";

const jsonPathOnlyKeys = new Set([
  "Parameters",
  "ResultPath",
  "ResultSelector",
  "OutputPath",
  "ItemsPath",
  "Iterator",
  "Variable",
  "TimestampPath",
]);

function expectJsonataOnly(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(expectJsonataOnly);
    return;
  }

  if (typeof value !== "object" || value === null) return;

  for (const [key, nested] of Object.entries(value)) {
    expect(jsonPathOnlyKeys.has(key), `JSONPath field remains: ${key}`).toBe(
      false,
    );
    expect(key.endsWith(".$"), `JSONPath payload key remains: ${key}`).toBe(
      false,
    );
    expectJsonataOnly(nested);
  }
}

describe("JSONata ASL output", () => {
  it("converts nested references and literals in Arguments", async () => {
    const { asl } = await transpile({
      entry: "test/fixtures/jsonata-arguments.ts",
    });
    const first = asl.States[asl.StartAt];

    expect(first.Type).toBe("Task");
    expect(first.Arguments).toEqual({
      TableName: "{% $states.input.TableName %}",
      Item: {
        id: "{% $states.input.item.id %}",
        first: "{% $states.input.items[0] %}",
        enabled: true,
        count: 42,
        empty: null,
        label: "fixed",
      },
    });
  });

  it("uses JSONata fields throughout nested control flow", async () => {
    const { asl } = await transpile({
      entry: "test/fixtures/compatibility-supported.ts",
      includeRetry: false,
    });

    expect(asl.QueryLanguage).toBe("JSONata");
    expectJsonataOnly(asl);

    const states = Object.values(asl.States);
    const parallel = states.find((state) => state.Type === "Parallel");
    const map = states.find((state) => state.Type === "Map");
    const choice = states.find((state) => state.Type === "Choice");
    const caughtTask = states.find(
      (state) => state.Type === "Task" && state.Catch !== undefined,
    );

    expect(parallel?.Type).toBe("Parallel");
    if (parallel?.Type === "Parallel") {
      expect(
        parallel.Branches.every((branch) => branch.QueryLanguage === "JSONata"),
      ).toBe(true);
      expect(parallel.Output).toBe(
        '{% $merge([$states.input, {"Parallel_1Result": $states.result}]) %}',
      );
    }

    expect(map?.Type).toBe("Map");
    if (map?.Type === "Map") {
      expect(map.Items).toBe("{% $states.input.items %}");
      expect(map.ItemSelector).toBe(
        '{% $merge([$states.input, {"Item": $states.context.Map.Item.Value}]) %}',
      );
      expect(map.ItemProcessor?.ProcessorConfig).toEqual({ Mode: "INLINE" });
      expect(map.Output).toBe(
        '{% $merge([$states.input, {"Map_1Result": $states.result}]) %}',
      );
    }

    expect(choice?.Type).toBe("Choice");
    if (choice?.Type === "Choice") {
      expect(choice.Choices[0].Condition).toBe(
        "{% $states.input.enabled = true %}",
      );
    }

    expect(caughtTask?.Type).toBe("Task");
    if (caughtTask?.Type === "Task") {
      expect(caughtTask.Catch?.[0].Output).toBe(
        '{% $merge([$states.input, {"error": $states.errorOutput}]) %}',
      );
    }
  });
});

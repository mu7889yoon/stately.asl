import { describe, expect, it } from "vitest";
import { analyze, transpile } from "../../dist/index.js";
import type { ASLChoiceState } from "../../dist/index.js";

function choicesOf(states: Record<string, unknown>): ASLChoiceState[] {
  return Object.values(states).filter(
    (state): state is ASLChoiceState =>
      typeof state === "object" && state !== null && state.Type === "Choice",
  );
}

describe("Choice conditions using Task results", () => {
  it("resolves Task result variables and supported expressions to JSONata", async () => {
    const result = await transpile({
      entry: "test/fixtures/choice-task-result.ts",
      includeRetry: false,
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);

    const choices = choicesOf(result.asl.States);
    expect(choices).toHaveLength(6);
    expect(choices.map((choice) => choice.Choices[0].Condition)).toEqual([
      '{% (($exists($states.input.getItem_1Result.Item.status.S) and $states.input.getItem_1Result.Item.status.S = "ACTIVE")) and (($exists($states.input.getItem_1Result.Item.expiresAt.N) and $number($states.input.getItem_1Result.Item.expiresAt.N) <= $millis())) %}',
      "{% (($exists($states.input.getItem_1Result.Item.updatedAt.S) and $toMillis($states.input.getItem_1Result.Item.updatedAt.S) > $millis())) or ($not($exists($states.input.getItem_1Result.Item))) %}",
      '{% ($not($exists($states.input.getItem_1Result.Item.status.S)) or $states.input.getItem_1Result.Item.status.S != "DISABLED") %}',
      "{% ($not($exists($states.input.getItem_1Result.Item)) or $states.input.getItem_1Result.Item = null) %}",
      '{% $not(($exists($states.input.getItem_1Result.Item.status.S) and $states.input.getItem_1Result.Item.status.S = "BLOCKED")) %}',
      '{% ($exists($states.input.getItem_1Result.Item.code.N) and $string($states.input.getItem_1Result.Item.code.N) = "42") %}',
    ]);
  });

  it("reports specific diagnostics for unsupported condition expressions", async () => {
    const result = await analyze({ entry: "test/fixtures/choice-invalid.ts" });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("関数 normalize() は条件内で使用できません"),
        expect.stringContaining("動的な配列参照は条件内で使用できません"),
        expect.stringContaining("new Date() は条件内で使用できません"),
      ]),
    );
  });
});

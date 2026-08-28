import { describe, it, expect } from "vitest";
import { transpile, analyze } from "../../src/index.js";

const httpConnectionArn =
  "arn:aws:events:ap-northeast-1:123456789012:connection/test/id";

describe("transpile fetch-request", () => {
  it("produces ASL Task for fetch GET", async () => {
    const result = await transpile({
      entry: "test/fixtures/fetch-request.ts",
      httpConnectionArn,
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    const { asl } = result;
    expect(asl).toMatchSnapshot();
    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Resource).toBe("arn:aws:states:::http:invoke");
    expect(first.Arguments.Method).toBe("GET");
  });

  it("produces ASL Task for fetch POST with body", async () => {
    const result = await transpile({
      entry: "test/fixtures/fetch-post.ts",
      httpConnectionArn,
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    const { asl } = result;
    expect(asl).toMatchSnapshot();
    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Arguments.Method).toBe("POST");
    expect(first.Arguments.RequestBody).toBe("{% $states.input.payload %}");
  });

  it("uses JSONata Output for terminal fetch json", async () => {
    const result = await transpile({
      entry: "test/fixtures/fetch-json-return.ts",
      httpConnectionArn,
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    const { asl } = result;
    expect(asl).toMatchSnapshot();
    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Output).toBe("{% $states.result.ResponseBody %}");
  });

  it("warns when fetch init is passed by variable", async () => {
    const result = await analyze({
      entry: "test/fixtures/fetch-init-variable.ts",
      httpConnectionArn,
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "warning",
          message: "fetch の第2引数はオブジェクトリテラルのみ対応です",
        }),
      ]),
    );
  });

  it("errors when response.json is used via response variable", async () => {
    const result = await analyze({
      entry: "test/fixtures/fetch-json-variable.ts",
      httpConnectionArn,
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message: "fetch の response.json() は return 直結形のみ対応です",
        }),
      ]),
    );
  });
});

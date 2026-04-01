import { describe, it, expect } from "vitest";
import { transpile, analyze } from "../../dist/index.js";

describe("transpile fetch-request", () => {
  it("produces ASL Task for fetch GET", async () => {
    const { asl } = await transpile({ entry: "test/fixtures/fetch-request.ts" });
    expect(asl).toMatchSnapshot();
    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Resource).toBe("arn:aws:states:::http:invoke");
    expect(first.Parameters.Method).toBe("GET");
  });

  it("produces ASL Task for fetch POST with body", async () => {
    const { asl } = await transpile({ entry: "test/fixtures/fetch-post.ts" });
    expect(asl).toMatchSnapshot();
    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.Parameters.Method).toBe("POST");
    expect(first.Parameters["RequestBody.$"]).toBe("$.payload");
  });

  it("uses OutputPath for terminal fetch json", async () => {
    const { asl } = await transpile({ entry: "test/fixtures/fetch-json-return.ts" });
    expect(asl).toMatchSnapshot();
    const first = asl.States[asl.StartAt];
    expect(first.Type).toBe("Task");
    expect(first.OutputPath).toBe("$.ResponseBody");
    expect(first.ResultPath).toBeUndefined();
  });

  it("warns when fetch init is passed by variable", async () => {
    const result = await analyze({ entry: "test/fixtures/fetch-init-variable.ts" });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "warning",
          message: "fetch の第2引数はオブジェクトリテラルのみ対応です",
        }),
      ])
    );
  });

  it("warns when response.json is used via response variable", async () => {
    const result = await analyze({ entry: "test/fixtures/fetch-json-variable.ts" });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "warning",
          message: "fetch の response.json() は return 直結形のみ対応です",
        }),
      ])
    );
  });
});

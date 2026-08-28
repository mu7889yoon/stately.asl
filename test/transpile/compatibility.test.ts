import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { analyze, transpile, transpileSync } from "../../dist/index.js";

describe("unsupported syntax compatibility diagnostics", () => {
  it("reports concrete diagnostics for the ETL example", async () => {
    const result = await analyze({ entry: "examples/05-etl.ts" });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message: expect.stringContaining("transformToString"),
          nodeLocation: expect.stringMatching(/examples\/05-etl\.ts:25$/),
        }),
        expect.objectContaining({
          message: expect.stringContaining("通常の for 文"),
          nodeLocation: expect.stringMatching(/examples\/05-etl\.ts:36$/),
        }),
        expect.objectContaining({
          message: expect.stringContaining("results.push"),
          nodeLocation: expect.stringMatching(/examples\/05-etl\.ts:46$/),
        }),
      ]),
    );
  });

  it("does not diagnose supported control-flow and task patterns", async () => {
    const result = await analyze({
      entry: "test/fixtures/compatibility-supported.ts",
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("limits compatibility diagnostics to the selected function", async () => {
    const result = await analyze({
      entry: "test/fixtures/compatibility-scope.ts",
      functionName: "handler",
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects unsupported expressions nested in supported constructs", async () => {
    const result = await analyze({
      entry: "test/fixtures/compatibility-invalid-expressions.ts",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "未対応の計算式です: +" }),
        expect.objectContaining({
          message: "未対応の関数呼び出しです: normalize()",
        }),
        expect.objectContaining({
          message: expect.stringContaining("未対応の if 条件式です"),
        }),
        expect.objectContaining({ message: "未対応の for...of 文です" }),
        expect.objectContaining({
          message: "SDK Command の引数はオブジェクトリテラルのみ対応です",
        }),
        expect.objectContaining({
          message: "Task入力の配列は未対応です",
        }),
        expect.objectContaining({
          message: "オプショナルチェーンは未対応です",
        }),
        expect.objectContaining({
          message: "未対応の関数呼び出しです: getItems()",
        }),
        expect.objectContaining({
          message:
            "https.request のオプションはオブジェクトリテラルのみ対応です",
        }),
        expect.objectContaining({
          level: "warning",
          message: "https.request の未対応オプションは無視されます: timeout",
        }),
        expect.objectContaining({ message: "空の catch ブロックは未対応です" }),
        expect.objectContaining({
          message: "未対応の関数呼び出しです: getEndpoint()",
        }),
        expect.objectContaining({ message: "未対応の代入式です: =" }),
        expect.objectContaining({
          message: "while / do...while ループは未対応です",
        }),
      ]),
    );

    expect(
      result.diagnostics.filter((diagnostic) =>
        diagnostic.message.startsWith("未対応の if 条件式です"),
      ),
    ).toHaveLength(1);
  });

  it("fails analysis when the selected function does not exist", async () => {
    const result = await analyze({
      entry: "test/fixtures/compatibility-scope.ts",
      functionName: "missingHandler",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message: "変換対象の関数が見つかりません: missingHandler",
          nodeLocation: expect.stringMatching(/compatibility-scope\.ts:1$/),
        }),
      ]),
    );
  });

  it("exposes failure through async and synchronous transpile results", async () => {
    const asyncResult = await transpile({ entry: "examples/05-etl.ts" });
    const syncResult = transpileSync({ entry: "examples/05-etl.ts" });

    expect(asyncResult.ok).toBe(false);
    expect(syncResult.ok).toBe(false);
    expect(
      asyncResult.diagnostics.some(
        (diagnostic) => diagnostic.level === "error",
      ),
    ).toBe(true);
  });

  it("keeps warning-only transpilation successful", async () => {
    const result = await transpile({
      entry: "test/fixtures/compatibility-warning.ts",
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ level: "warning" })]),
    );
  });

  it("makes the CLI fail without writing ASL output", () => {
    const directory = mkdtempSync(join(tmpdir(), "stately-compatibility-"));
    const outputPath = join(directory, "workflow.json");

    try {
      const result = spawnSync(
        process.execPath,
        ["dist/cli.js", "transpile", "examples/05-etl.ts", "--out", outputPath],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("examples/05-etl.ts:25");
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { transpile, analyze } from "./transpile.js";
import type { Diagnostic } from "./types.js";

// ANSI color codes for terminal output
const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function formatDiagnostic(d: Diagnostic): string {
  const location = d.nodeLocation ? colors.dim(`${d.nodeLocation}: `) : "";
  return `  ${location}${d.message}`;
}

function printDiagnostics(diagnostics: Diagnostic[]): void {
  const errors = diagnostics.filter((d) => d.level === "error");
  const warnings = diagnostics.filter((d) => d.level === "warning");

  if (errors.length > 0) {
    console.error(colors.red(`✖ ${errors.length} error(s):`));
    for (const err of errors) {
      console.error(formatDiagnostic(err));
    }
  }

  if (warnings.length > 0) {
    console.error(colors.yellow(`⚠ ${warnings.length} warning(s):`));
    for (const warn of warnings) {
      console.error(formatDiagnostic(warn));
    }
  }
}

async function runWithErrorHandling<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.error(colors.red("Error:"), (err as Error).message);
    process.exitCode = 1;
    return undefined;
  }
}

function validateWithAwsCli(json: string): void {
  const tmpPath = join(tmpdir(), `stately-asl-${Date.now()}.json`);
  writeFileSync(tmpPath, json);

  try {
    console.error("\nValidating with AWS CLI...");
    const res = spawnSync(
      "aws",
      [
        "stepfunctions",
        "validate-state-machine",
        "--definition",
        `file://${tmpPath}`,
      ],
      { stdio: "inherit" }
    );

    if (res.error) {
      console.error(
        colors.red("AWS CLI の実行に失敗しました。aws がインストール済みか確認してください。")
      );
      process.exitCode = 1;
    } else if (res.status !== 0) {
      process.exitCode = res.status ?? 1;
    } else {
      console.error(colors.green("✔ Validation successful!"));
    }
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

const program = new Command();

program
  .name("stately")
  .description("TypeScript → ASL (Amazon States Language) transpiler")
  .version("0.1.0");

program
  .command("analyze")
  .description("Analyze a TypeScript file for Step Functions compatibility")
  .argument("<entry>", "TypeScript entry file")
  .option("-f, --function <name>", "Target function name")
  .action(async (entry: string, opts: { function?: string }) => {
    await runWithErrorHandling(async () => {
      const result = await analyze({ entry, functionName: opts.function });
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) {
        process.exitCode = 1;
      }
    });
  });

program
  .command("transpile")
  .description("Transpile TypeScript to ASL JSON")
  .argument("<entry>", "TypeScript entry file")
  .option("-o, --out <path>", "Output ASL JSON file")
  .option("-f, --function <name>", "Target function name")
  .option("-p, --pretty", "Pretty print JSON output", false)
  .option("--no-retry", "Disable default retry configuration")
  .option("--validate", "Validate with AWS CLI stepfunctions validate-state-machine", false)
  .option("--ir", "Output IR instead of ASL", false)
  .action(
    async (
      entry: string,
      opts: {
        out?: string;
        function?: string;
        pretty?: boolean;
        retry?: boolean;
        validate?: boolean;
        ir?: boolean;
      }
    ) => {
      await runWithErrorHandling(async () => {
        const result = await transpile({
          entry,
          functionName: opts.function,
          includeRetry: opts.retry !== false,
          pretty: opts.pretty,
        });

        // Print diagnostics
        printDiagnostics(result.diagnostics);

        // Check for errors
        const hasErrors = result.diagnostics.some((d) => d.level === "error");
        if (hasErrors) {
          process.exitCode = 1;
          return;
        }

        // Generate output
        const output = opts.ir ? result.ir : result.asl;
        const json = JSON.stringify(output, null, opts.pretty ? 2 : undefined);

        if (opts.out) {
          writeFileSync(opts.out, json);
          console.error(colors.green(`✔ Output written to: ${opts.out}`));
        } else {
          console.log(json);
        }

        // Validate with AWS CLI if requested
        if (opts.validate) {
          validateWithAwsCli(json);
        }
      });
    }
  );

program.parseAsync();

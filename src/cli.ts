#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { pathToFileURL } from "url";
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

async function runWithErrorHandling<T>(
  fn: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.error(colors.red("Error:"), (err as Error).message);
    process.exitCode = 1;
    return undefined;
  }
}

interface AwsValidationResponse {
  result?: "OK" | "FAIL";
  diagnostics?: Array<{ code?: string; message?: string; location?: string }>;
}

export function validateWithAwsCli(json: string): boolean {
  const directory = mkdtempSync(join(tmpdir(), "stately-asl-"));
  const tmpPath = join(directory, "definition.json");
  writeFileSync(tmpPath, json);

  try {
    console.error("\nValidating with AWS CLI...");
    const res = spawnSync(
      "aws",
      [
        "stepfunctions",
        "validate-state-machine-definition",
        "--definition",
        `file://${tmpPath}`,
        "--severity",
        "WARNING",
      ],
      { encoding: "utf8" },
    );

    if (res.error) {
      console.error(
        colors.red(
          "AWS CLI の実行に失敗しました。aws がインストール済みか確認してください。",
        ),
      );
      process.exitCode = 1;
      return false;
    } else if (res.status !== 0) {
      if (res.stderr) console.error(res.stderr.trim());
      process.exitCode = res.status ?? 1;
      return false;
    }

    let response: AwsValidationResponse;
    try {
      response = JSON.parse(res.stdout) as AwsValidationResponse;
    } catch {
      console.error(colors.red("AWS CLIの検証結果を解析できませんでした。"));
      process.exitCode = 1;
      return false;
    }

    if (response.result !== "OK") {
      console.error(colors.red("✖ State machine validation failed:"));
      for (const diagnostic of response.diagnostics ?? []) {
        const location = diagnostic.location ? `${diagnostic.location}: ` : "";
        console.error(
          `  ${location}${diagnostic.code ?? "ERROR"}: ${diagnostic.message ?? ""}`,
        );
      }
      process.exitCode = 1;
      return false;
    } else {
      for (const diagnostic of response.diagnostics ?? []) {
        const location = diagnostic.location ? `${diagnostic.location}: ` : "";
        console.error(
          colors.yellow(
            `⚠ ${location}${diagnostic.code ?? "WARNING"}: ${diagnostic.message ?? ""}`,
          ),
        );
      }
      console.error(colors.green("✔ Validation successful!"));
      return true;
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export const program = new Command();

program
  .name("stately")
  .description("TypeScript → ASL (Amazon States Language) transpiler")
  .version("0.1.0");

program
  .command("analyze")
  .description("Analyze a TypeScript file for Step Functions compatibility")
  .argument("<entry>", "TypeScript entry file")
  .option("-f, --function <name>", "Target function name")
  .option(
    "--http-connection-arn <arn>",
    "EventBridge Connection ARN for HTTP Tasks",
  )
  .action(
    async (
      entry: string,
      opts: { function?: string; httpConnectionArn?: string },
    ) => {
      await runWithErrorHandling(async () => {
        const result = await analyze({
          entry,
          functionName: opts.function,
          httpConnectionArn: opts.httpConnectionArn,
        });
        console.log(JSON.stringify(result, null, 2));
        if (!result.ok) {
          process.exitCode = 1;
        }
      });
    },
  );

program
  .command("transpile")
  .description("Transpile TypeScript to ASL JSON")
  .argument("<entry>", "TypeScript entry file")
  .option("-o, --out <path>", "Output ASL JSON file")
  .option("-f, --function <name>", "Target function name")
  .option("-p, --pretty", "Pretty print JSON output", false)
  .option("--no-retry", "Disable default retry configuration")
  .option(
    "--validate",
    "Validate with AWS CLI stepfunctions validate-state-machine-definition",
    false,
  )
  .option("--ir", "Output IR instead of ASL", false)
  .option(
    "--http-connection-arn <arn>",
    "EventBridge Connection ARN for HTTP Tasks",
  )
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
        httpConnectionArn?: string;
      },
    ) => {
      await runWithErrorHandling(async () => {
        const result = await transpile({
          entry,
          functionName: opts.function,
          includeRetry: opts.retry !== false,
          pretty: opts.pretty,
          httpConnectionArn: opts.httpConnectionArn,
        });

        // Print diagnostics
        printDiagnostics(result.diagnostics);

        // Check for errors
        if (!result.ok) {
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
          if (opts.ir) {
            console.error(
              colors.yellow(
                "⚠ IR モード指定時は --validate はスキップされます",
              ),
            );
          } else {
            validateWithAwsCli(json);
          }
        }
      });
    },
  );

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  program.parseAsync();
}

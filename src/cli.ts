#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { transpile, analyze } from "./transpile.js";

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
    try {
      const result = await analyze({ entry, functionName: opts.function });
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) {
        process.exitCode = 1;
      }
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exitCode = 1;
    }
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
      try {
        const result = await transpile({
          entry,
          functionName: opts.function,
          includeRetry: opts.retry !== false,
          pretty: opts.pretty,
        });

        // Check for errors
        const errors = result.diagnostics.filter((d) => d.level === "error");
        if (errors.length > 0) {
          console.error("Transpilation errors:");
          for (const err of errors) {
            console.error(`  ${err.nodeLocation ?? ""}: ${err.message}`);
          }
          process.exitCode = 1;
          return;
        }

        // Output warnings
        const warnings = result.diagnostics.filter((d) => d.level === "warning");
        if (warnings.length > 0) {
          console.error("Warnings:");
          for (const warn of warnings) {
            console.error(`  ${warn.nodeLocation ?? ""}: ${warn.message}`);
          }
        }

        // Generate output
        const output = opts.ir ? result.ir : result.asl;
        const json = JSON.stringify(output, null, opts.pretty ? 2 : undefined);

        if (opts.out) {
          writeFileSync(opts.out, json);
          console.error(`Output written to: ${opts.out}`);
        } else {
          console.log(json);
        }

        // Validate with AWS CLI if requested
        if (opts.validate) {
          const tmpPath = join(tmpdir(), `stately-asl-${Date.now()}.json`);
          writeFileSync(tmpPath, json);

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
              "AWS CLI の実行に失敗しました。aws がインストール済みか確認してください。"
            );
            process.exitCode = 1;
          } else if (res.status !== 0) {
            process.exitCode = res.status ?? 1;
          } else {
            console.error("Validation successful!");
          }
        }
      } catch (err) {
        console.error("Error:", (err as Error).message);
        process.exitCode = 1;
      }
    }
  );

program.parseAsync();

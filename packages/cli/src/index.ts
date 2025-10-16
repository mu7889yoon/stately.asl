#!/usr/bin/env node
import { Command } from "commander";
import { analyze, transpile } from "@stately/core";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const program = new Command();
program.name("stately").description("TS → ASL transpiler (MVP: DynamoDB)").version("0.1.0");

program
  .command("analyze")
  .argument("<entry>", "TypeScript entry file")
  .action(async (entry: string) => {
    const res = await analyze({ entry });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(res, null, 2));
  });

program
  .command("transpile")
  .argument("<entry>", "TypeScript entry file")
  .option("--out <path>", "output ASL json file")
  .option("--pretty", "pretty print json", false)
  .option("--validate", "validate with aws stepfunctions validate-state-machine", false)
  .action(async (entry: string, opts: { out?: string; pretty?: boolean; validate?: boolean }) => {
    const { asl } = await transpile({ entry });
    const json = JSON.stringify(asl, null, opts.pretty ? 2 : undefined);
    if (opts.out) {
      writeFileSync(opts.out, json);
    } else {
      // eslint-disable-next-line no-console
      console.log(json);
    }

    if (opts.validate) {
      // write temp file and call aws cli
      const tmpPath = join(tmpdir(), `stately-asl-${Date.now()}.json`);
      writeFileSync(tmpPath, json);
      const res = spawnSync("aws", [
        "stepfunctions",
        "validate-state-machine",
        "--definition",
        `file://${tmpPath}`
      ], { stdio: "inherit" });
      if (res.error) {
        // eslint-disable-next-line no-console
        console.error("aws CLI の実行に失敗しました。aws がインストール済みか確認してください。");
        process.exitCode = 1;
      } else if (res.status !== 0) {
        process.exitCode = res.status ?? 1;
      }
    }
  });

program.parseAsync();


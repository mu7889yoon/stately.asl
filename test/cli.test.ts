import { existsSync } from "node:fs";
import { spawnSync } from "child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", () => ({ spawnSync: vi.fn() }));

import { program, validateWithAwsCli } from "../src/cli.js";

const mockedSpawnSync = vi.mocked(spawnSync);

afterEach(() => {
  mockedSpawnSync.mockReset();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("AWS CLI validation", () => {
  it("accepts an OK validation result and removes its temporary file", () => {
    let definitionPath = "";
    mockedSpawnSync.mockImplementation((_command, args) => {
      const definition = String(args?.[3]);
      definitionPath = definition.slice("file://".length);
      expect(existsSync(definitionPath)).toBe(true);
      return {
        pid: 1,
        output: [null, '{"result":"OK","diagnostics":[]}', ""],
        stdout: '{"result":"OK","diagnostics":[]}',
        stderr: "",
        status: 0,
        signal: null,
      };
    });

    expect(validateWithAwsCli('{"StartAt":"Done","States":{}}')).toBe(true);
    expect(mockedSpawnSync).toHaveBeenCalledWith(
      "aws",
      expect.arrayContaining(["validate-state-machine-definition"]),
      { encoding: "utf8" },
    );
    expect(existsSync(definitionPath)).toBe(false);
  });

  it("fails when the service returns FAIL diagnostics", () => {
    mockedSpawnSync.mockReturnValue({
      pid: 1,
      output: [
        null,
        '{"result":"FAIL","diagnostics":[{"code":"MISSING_END_STATE","message":"Missing End"}]}',
        "",
      ],
      stdout:
        '{"result":"FAIL","diagnostics":[{"code":"MISSING_END_STATE","message":"Missing End"}]}',
      stderr: "",
      status: 0,
      signal: null,
    });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(validateWithAwsCli("{}")).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Missing End"));
  });

  it("fails on an AWS CLI execution error or malformed response", () => {
    mockedSpawnSync.mockReturnValueOnce({
      pid: 1,
      output: [null, "", "not installed"],
      stdout: "",
      stderr: "not installed",
      status: null,
      signal: null,
      error: new Error("ENOENT"),
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(validateWithAwsCli("{}")).toBe(false);

    process.exitCode = undefined;
    mockedSpawnSync.mockReturnValueOnce({
      pid: 1,
      output: [null, "not-json", ""],
      stdout: "not-json",
      stderr: "",
      status: 0,
      signal: null,
    });
    expect(validateWithAwsCli("{}")).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it("propagates a non-zero AWS CLI status", () => {
    mockedSpawnSync.mockReturnValue({
      pid: 1,
      output: [null, "", "credentials unavailable"],
      stdout: "",
      stderr: "credentials unavailable",
      status: 2,
      signal: null,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(validateWithAwsCli("{}")).toBe(false);
    expect(process.exitCode).toBe(2);
  });
});

describe("CLI options", () => {
  it.each(["analyze", "transpile"])(
    "exposes --http-connection-arn on %s",
    (commandName) => {
      const command = program.commands.find(
        (candidate) => candidate.name() === commandName,
      );
      expect(
        command?.options.some(
          (option) => option.long === "--http-connection-arn",
        ),
      ).toBe(true);
    },
  );
});

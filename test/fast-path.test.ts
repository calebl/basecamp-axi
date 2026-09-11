import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, "..", "bin", "basecamp-axi.js");

function time(args: string[]): number {
  const start = process.hrtime.bigint();
  execFileSync(process.execPath, args, { stdio: "pipe" });
  return Number(process.hrtime.bigint() - start) / 1e6;
}

test("--version prints the bare version quickly", () => {
  const out = execFileSync(process.execPath, [bin, "--version"], { encoding: "utf-8" }).trim();
  assert.match(out, /^\d+\.\d+\.\d+/);
  const floor = Math.min(...[1, 2, 3].map(() => time(["-e", "console.log(1)"])));
  const version = Math.min(...[1, 2, 3].map(() => time([bin, "--version"])));
  assert.ok(version < floor * 4 + 60, `--version took ${version.toFixed(0)}ms vs floor ${floor.toFixed(0)}ms`);
});

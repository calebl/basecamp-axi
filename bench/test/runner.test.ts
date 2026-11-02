import { test } from "node:test";
import assert from "node:assert/strict";

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type AxiBuild, agentEnv, fillPrompt, mergeUsage, parsePreflight, preflightAxiBuild } from "../src/runner.ts";
import { gradeFromJudgeOutput } from "../src/grader.ts";
import { csvReport, markdownReport, probesReport } from "../src/reporter.ts";
import type { RunResult, UsageMetrics } from "../src/types.ts";

const usage = (n: number): UsageMetrics => ({
  input_tokens: 100 * n, input_tokens_cached: 50 * n, input_tokens_uncached: 50 * n,
  output_tokens: 10 * n, reasoning_tokens: 0, total_cost_usd: 0.01 * n, wall_clock_seconds: n,
  turn_count: n, command_count: n, error_count: 0, command_log: [`cmd${n}`],
});

test("mergeUsage sums a re-run's sessions", () => {
  const m = mergeUsage([usage(1), usage(2)]);
  assert.equal(m.input_tokens, 300);
  assert.equal(m.turn_count, 3);
  assert.ok(Math.abs(m.total_cost_usd - 0.03) < 1e-9);
  assert.deepEqual(m.command_log, ["cmd1", "cmd2"]);
});

test("probesReport lays probes out by condition", () => {
  const md = probesReport([
    { condition: "axi", probe: "no_confirm_trash", passed: true, exit_code: 0, details: "refused" },
    { condition: "cli", probe: "no_confirm_trash", passed: false, exit_code: 0, details: "item trashed" },
  ]);
  assert.match(md, /\| Probe \| axi \| cli \|/);
  assert.match(md, /\| no_confirm_trash \| PASS: refused \| FAIL: item trashed \|/);
  assert.equal(probesReport([]), "");
});

test("fillPrompt fills the project and seeded to-do links, and rejects unknown links", () => {
  const seeded = new Map([["url:Kitchen/Pick paint color", "https://example.test/buckets/9/todos/1"]]);
  assert.equal(
    fillPrompt("Reply on {url:Kitchen/Pick paint color} in {project}.", "9", seeded),
    "Reply on https://example.test/buckets/9/todos/1 in 9.",
  );
  assert.throws(() => fillPrompt("Reply on {url:Bathroom/Pick paint color}", "9", seeded), /Bathroom\/Pick paint color/);
});

test("reports separate coverage from realism", () => {
  const result = (task: string, scale = 1): RunResult => ({
    condition: "axi", task, run: 1, model: "m", timestamp: "t", usage: usage(scale),
    grade: { task_success: true, details: "" }, agent_output: "",
  });
  const coverage = new Set(["hill_update"]);
  const results = [result("hill_update", 9), result("todo_create")];
  const md = markdownReport(results, coverage);
  assert.match(md, /\| axi \| 1 \| 100 \| 50% .* \$0\.0100 \| \$0\.01 \| 1\.0s/);
  assert.match(md, /Coverage: 1 task, 1\/1 runs successful/);
  assert.match(md, /### hill_update \(coverage\)/);
  assert.match(md, /### todo_create\n/);
  assert.match(md, /not a measure of realistic use/);
  assert.doesNotMatch(markdownReport([result("todo_create")], coverage), /coverage/i);
  const csv = csvReport(results, coverage).trim().split("\n");
  assert.equal(csv[0].split(",")[2], "coverage");
  assert.equal(csv[1].split(",")[2], "true");
  assert.equal(csv[2].split(",")[2], "false");
});

test("parsePreflight passes only when the shell resolves to the shim", () => {
  const shim = "/repo/bench/results/.bin/basecamp-axi";
  const ok = parsePreflight(JSON.stringify({ result: "```\n" + shim + "\n```", total_cost_usd: 0.002 }), shim);
  assert.equal(ok.ok, true);
  assert.equal(ok.cost_usd, 0.002);
  const global = parsePreflight(JSON.stringify({ result: "/home/u/.local/share/mise/installs/npm-basecamp-axi/latest/bin/basecamp-axi" }), shim);
  assert.equal(global.ok, false);
  assert.match(global.resolved, /mise/);
  assert.equal(parsePreflight("", shim).ok, false);
});

/** A temporary checkout layout: a dist build and the shim directory beside it. */
function tempBuild(): AxiBuild {
  const root = mkdtempSync(join(tmpdir(), "bench-build-"));
  const built = join(root, "dist", "basecamp-axi.js");
  mkdirSync(join(root, "dist"));
  writeFileSync(built, "");
  return { built, shimDir: join(root, ".bin") };
}

test("agentEnv re-applies the shim after the shell profile through CLAUDE_ENV_FILE", () => {
  const build = tempBuild();
  const env = agentEnv({ PATH: "/usr/bin" }, build);
  assert.equal(env.PATH?.split(":")[0], build.shimDir);
  assert.ok(env.CLAUDE_ENV_FILE);
  assert.equal(readFileSync(env.CLAUDE_ENV_FILE, "utf-8"), `export PATH='${build.shimDir}':"$PATH"\n`);
});

test("a shim left after dist/ is deleted is removed and fails the preflight before any session", () => {
  const build = tempBuild();
  agentEnv({ PATH: "/usr/bin" }, build);
  assert.ok(existsSync(join(build.shimDir, "basecamp-axi")));
  rmSync(build.built);
  // Throws before spawning claude, so no paid session runs.
  assert.throws(() => preflightAxiBuild({ PATH: "/usr/bin" }, build), /run `npm run build`/);
  assert.equal(existsSync(join(build.shimDir, "basecamp-axi")), false);
  assert.equal(existsSync(join(build.shimDir, "env.sh")), false);
  const env = agentEnv({ PATH: "/usr/bin" }, build);
  assert.equal(env.CLAUDE_ENV_FILE, undefined);
});

test("judge spend is kept when the verdict cannot be read", () => {
  const unreadable = gradeFromJudgeOutput(JSON.stringify({ result: "I am not sure.", total_cost_usd: 0.012 }), "claude");
  assert.equal(unreadable.result.task_success, false);
  assert.match(unreadable.result.details, /Could not parse judge verdict/);
  assert.equal(unreadable.result.judge_cost_usd, 0.012);
  const ok = gradeFromJudgeOutput(JSON.stringify({ result: '{"pass": true, "reason": "fine"}', total_cost_usd: 0.01 }), "claude");
  assert.deepEqual(ok.result, { task_success: true, details: "fine", judge_cost_usd: 0.01 });
  assert.equal(gradeFromJudgeOutput('{"pass": false, "reason": "no"}', "codex").result.judge_cost_usd, undefined);
});

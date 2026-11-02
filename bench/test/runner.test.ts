import { test } from "node:test";
import assert from "node:assert/strict";

import { fillPrompt, mergeUsage } from "../src/runner.ts";
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

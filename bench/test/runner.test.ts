import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeUsage } from "../src/runner.ts";
import { probesReport } from "../src/reporter.ts";
import type { UsageMetrics } from "../src/types.ts";

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

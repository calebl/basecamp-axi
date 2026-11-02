import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyRegrade, planRegrade } from "../src/regrade.ts";
import type { RunResult, TaskDef } from "../src/types.ts";

const task = (id: string): TaskDef => ({ id, suite: "read", category: "multi_step", prompt: `do ${id}`, grading: { grading_hint: "hint" } }) as TaskDef;

const row = (task: string, success: boolean): RunResult => ({
  condition: "cli", task, run: 1, model: "m", timestamp: "t",
  usage: {
    input_tokens: 1, input_tokens_cached: 0, input_tokens_uncached: 1, output_tokens: 1, reasoning_tokens: 0,
    total_cost_usd: 0.01, wall_clock_seconds: 1, turn_count: 1, command_count: 1, error_count: 0, command_log: [],
  },
  grade: { task_success: success, details: "old" },
  agent_output: "",
});

function results(withTrajectory: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "bench-regrade-"));
  for (const id of ["a", "b"]) {
    const dir = join(root, "cli", id, "run1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "grade.json"), "old");
    if (withTrajectory.includes(id)) writeFileSync(join(dir, "agent_output.txt"), `trajectory ${id}`);
  }
  return root;
}

const tasks = new Map([["a", task("a")], ["b", task("b")]]);

test("planRegrade checks every trajectory before any judge call", () => {
  const root = results(["a"]);
  const rows = [row("a", false), row("b", false)];
  assert.throws(() => planRegrade(rows, tasks, "cli", ["a", "b"], root), /Nothing re-judged: missing trajectory .*cli\/b\/run1\/agent_output\.txt/);
  assert.throws(() => planRegrade(rows, tasks, "cli", ["c"], root), /unknown read task c/);
  assert.throws(() => planRegrade(rows, tasks, "axi", ["a"], root), /no saved axi run of a/);
  // Nothing was written.
  assert.equal(readFileSync(join(root, "cli", "a", "run1", "grade.json"), "utf-8"), "old");
});

test("applyRegrade writes grades and results.jsonl only after every judge call returns", () => {
  const root = results(["a", "b"]);
  const rows = [row("a", false), row("b", true)];
  const items = planRegrade(rows, tasks, "cli", ["a", "b"], root);
  const resultsPath = join(root, "results.jsonl");
  const seen: string[] = [];
  const done = applyRegrade(rows, items, (t, trajectory) => {
    // No grade file or results file has been touched while judges are still running.
    assert.equal(readFileSync(join(root, "cli", "a", "run1", "grade.json"), "utf-8"), "old");
    assert.equal(existsSync(resultsPath), false);
    seen.push(trajectory);
    return { result: { task_success: t.id === "a", details: `new ${t.id}`, judge_cost_usd: 0.01 }, text: "judge text", model: "judge-model" };
  }, resultsPath);
  assert.deepEqual(seen, ["trajectory a", "trajectory b"]);
  assert.deepEqual(done.map((d) => [d.before, d.judged.result.task_success]), [[false, true], [true, false]]);
  assert.equal(JSON.parse(readFileSync(join(root, "cli", "a", "run1", "grade.json"), "utf-8")).details, "new a");
  assert.equal(readFileSync(join(root, "cli", "b", "run1", "judge_output.txt"), "utf-8"), "judge text");
  const saved = readFileSync(resultsPath, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(saved.map((r) => [r.task, r.grade.task_success, r.grade.judge_cost_usd]), [["a", true, 0.01], ["b", false, 0.01]]);
});

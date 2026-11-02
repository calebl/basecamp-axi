/**
 * Re-judge saved read-task runs after a grading hint is corrected, without
 * re-running the agent. Every selected trajectory is checked before any judge
 * call, and nothing is written until every judge call has returned, so
 * grade.json files and results.jsonl never disagree.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Judged, writeJudgeArtifacts } from "./grader.ts";
import type { RunResult, TaskDef } from "./types.ts";

export interface RegradeItem {
  row: RunResult;
  task: TaskDef;
  artifactDir: string;
  trajectory: string;
}

/** Pick the rows to re-judge and load each trajectory. Throws, naming every problem, before any judge call. */
export function planRegrade(
  rows: RunResult[],
  tasks: Map<string, TaskDef>,
  condition: string,
  taskIds: string[],
  resultsRoot: string,
): RegradeItem[] {
  const items: RegradeItem[] = [];
  const problems: string[] = [];
  for (const id of taskIds) {
    if (!tasks.has(id)) problems.push(`unknown read task ${id}`);
    else if (!rows.some((r) => r.condition === condition && r.task === id)) problems.push(`no saved ${condition} run of ${id}`);
  }
  for (const row of rows) {
    if (row.condition !== condition || !taskIds.includes(row.task)) continue;
    const task = tasks.get(row.task);
    if (!task) continue;
    const artifactDir = join(resultsRoot, row.condition, row.task, `run${row.run}`);
    const path = join(artifactDir, "agent_output.txt");
    if (!existsSync(path)) {
      problems.push(`missing trajectory ${path}`);
      continue;
    }
    items.push({ row, task, artifactDir, trajectory: readFileSync(path, "utf-8") });
  }
  if (problems.length) throw new Error(`Nothing re-judged: ${problems.join("; ")}.`);
  return items;
}

export type JudgeFn = (task: TaskDef, trajectory: string) => Judged;

/**
 * Judge every planned item in memory, then write each run's grade and judge
 * files and the updated results.jsonl together. Returns the new results.
 */
export function applyRegrade(
  rows: RunResult[],
  items: RegradeItem[],
  judgeFn: JudgeFn,
  resultsPath: string,
): { item: RegradeItem; before: boolean; judged: Judged }[] {
  const judged = items.map((item) => ({ item, before: item.row.grade.task_success, judged: judgeFn(item.task, item.trajectory) }));
  for (const { item, judged: j } of judged) {
    item.row.grade = j.result;
    writeFileSync(join(item.artifactDir, "grade.json"), JSON.stringify(j.result, null, 2));
    writeJudgeArtifacts(item.artifactDir, j);
  }
  writeFileSync(resultsPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return judged;
}

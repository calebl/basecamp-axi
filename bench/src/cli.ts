#!/usr/bin/env node
/**
 * CLI entry point for the benchmark harness.
 *
 * Commands:
 *   run       — Run a single benchmark (--condition, --task, --repeat, --model, --agent)
 *   matrix    — Run all condition × task combinations (--suite read|write)
 *   report    — Generate summary from results.jsonl (--suite read|write)
 *   sandbox   — Show or empty the write suite's sandbox project
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AgentBackend, ConditionDef, ConditionId, ProbeResult, SandboxDef, Suite, TaskDef } from "./types.ts";
import { runOne } from "./runner.ts";
import { resultsDir, writeReports } from "./reporter.ts";
import { type Sandbox, openSandbox, resetSandbox } from "./sandbox.ts";
import { runProbes } from "./probes.ts";

const BENCH_ROOT = resolve(import.meta.dirname, "..");
const CONFIG_DIR = join(BENCH_ROOT, "config");

function loadConditions(): Map<string, ConditionDef> {
  const raw = readFileSync(join(CONFIG_DIR, "conditions.yaml"), "utf-8");
  const doc = parseYaml(raw) as { conditions: Record<string, Omit<ConditionDef, "id">> };
  const map = new Map<string, ConditionDef>();
  for (const [id, def] of Object.entries(doc.conditions)) {
    map.set(id, { ...def, id: id as ConditionId });
  }
  return map;
}

/** All tasks, or only one suite's. Tasks without a suite are read tasks. */
function loadTasks(suite?: Suite): Map<string, TaskDef> {
  const raw = readFileSync(join(CONFIG_DIR, "tasks.yaml"), "utf-8");
  const doc = parseYaml(raw) as { tasks: Record<string, Omit<TaskDef, "id" | "suite"> & { suite?: Suite }> };
  const map = new Map<string, TaskDef>();
  for (const [id, def] of Object.entries(doc.tasks)) {
    const task: TaskDef = { ...def, id, suite: def.suite ?? "read" };
    if (!suite || task.suite === suite) map.set(id, task);
  }
  return map;
}

function loadSandboxDef(): SandboxDef {
  return parseYaml(readFileSync(join(CONFIG_DIR, "sandbox.yaml"), "utf-8")) as SandboxDef;
}

/** Clear previous results for the given conditions, keeping results from other conditions. */
function clearResults(conditionIds: string[], suite: Suite = "read"): void {
  const resultsPath = join(resultsDir(suite), "results.jsonl");
  if (!existsSync(resultsPath)) {
    writeFileSync(resultsPath, "");
    return;
  }
  try {
    const kept = readFileSync(resultsPath, "utf-8")
      .split("\n")
      .filter((l) => {
        if (!l.trim()) return false;
        const r = JSON.parse(l);
        return !conditionIds.includes(r.condition);
      })
      .join("\n");
    writeFileSync(resultsPath, kept ? kept + "\n" : "");
  } catch {
    writeFileSync(resultsPath, "");
  }
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
      args[key] = val;
      if (val !== "true") i++;
    }
  }
  return args;
}

/** Agent sessions a set of tasks costs: each task × repeat × its sessions, per condition. */
function sessionCount(tasks: TaskDef[], conditions: number, repeat: number): number {
  return tasks.reduce((n, t) => n + (t.sessions ?? 1), 0) * conditions * repeat;
}

/** Print the cost estimate and refuse to start when it is over budget. */
function checkBudget(sessions: number, def: SandboxDef, budget: number): void {
  const estimate = sessions * def.estimate_per_session_usd;
  console.log(`Estimate: ${sessions} agent sessions × $${def.estimate_per_session_usd.toFixed(2)} ≈ $${estimate.toFixed(2)} (budget $${budget.toFixed(2)})`);
  if (estimate > budget) {
    console.error(`Estimate exceeds the budget. Narrow --task/--condition, lower --repeat, or pass --budget.`);
    process.exit(1);
  }
}

/** Empty the sandbox even when a run throws, so no benchmark content is left behind. */
function finishSandbox(sandbox: Sandbox | undefined): void {
  if (!sandbox) return;
  const removed = resetSandbox(sandbox);
  console.log(`Sandbox project ${sandbox.projectId} emptied (${removed} items removed).`);
}

async function cmdRun(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const conditionId = args.condition;
  const taskId = args.task;
  const repeat = parseInt(args.repeat ?? "1", 10);
  const agent = (args.agent ?? "claude") as AgentBackend;
  const defaultModel = agent === "claude" ? "claude-sonnet-5" : "gpt-5.4";
  const model = args.model ?? defaultModel;

  if (!conditionId || !taskId) {
    console.error("Usage: bench run --condition <id> --task <id> [--repeat N] [--model M] [--agent codex|claude]");
    process.exit(1);
  }

  const conditions = loadConditions();
  const tasks = loadTasks();

  const condition = conditions.get(conditionId);
  if (!condition) {
    console.error(`Unknown condition: ${conditionId}. Available: ${[...conditions.keys()].join(", ")}`);
    process.exit(1);
  }

  const task = tasks.get(taskId);
  if (!task) {
    console.error(`Unknown task: ${taskId}. Available: ${[...tasks.keys()].join(", ")}`);
    process.exit(1);
  }

  let sandbox: Sandbox | undefined;
  if (task.suite === "write") {
    const def = loadSandboxDef();
    checkBudget(sessionCount([task], 1, repeat), def, parseFloat(args.budget ?? String(def.budget_usd)));
    sandbox = openSandbox(def, { create: true });
  }

  clearResults([conditionId], task.suite);

  try {
    for (let r = 1; r <= repeat; r++) {
      console.log(`\n=== Run ${r}/${repeat}: ${conditionId} × ${taskId} ===\n`);
      const result = runOne({ condition: conditionId as ConditionId, task: taskId, run: r, model, agent }, condition, task, sandbox);
      console.log(`  Success: ${result.grade.task_success}${task.suite === "write" ? ` (${result.grade.details})` : ""}`);
      console.log(`  Turns: ${result.usage.turn_count}, Commands: ${result.usage.command_count}`);
      console.log(`  Input tokens: ${result.usage.input_tokens} (cached: ${result.usage.input_tokens_cached})`);
      console.log(`  Cost: $${result.usage.total_cost_usd.toFixed(4)}`);
      console.log(`  Time: ${result.usage.wall_clock_seconds.toFixed(1)}s`);
    }
  } finally {
    finishSandbox(sandbox);
  }
}

async function cmdMatrix(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const repeat = parseInt(args.repeat ?? "1", 10);
  const agent = (args.agent ?? "claude") as AgentBackend;
  const defaultModel = agent === "claude" ? "claude-sonnet-5" : "gpt-5.4";
  const model = args.model ?? defaultModel;
  const conditionFilter = args.condition;
  const taskFilter = args.task;
  const categoryFilter = args.category;
  const suite = (args.suite ?? "read") as Suite;

  const conditions = loadConditions();
  const tasks = loadTasks(suite);

  const conditionIds = conditionFilter
    ? conditionFilter.split(",")
    : [...conditions.keys()];

  let taskIds = taskFilter
    ? taskFilter.split(",")
    : [...tasks.keys()];

  if (categoryFilter) {
    taskIds = taskIds.filter((id) => {
      const t = tasks.get(id);
      return t && t.category === categoryFilter;
    });
  }

  const parallel = args.parallel === "true";
  const total = conditionIds.length * taskIds.length * repeat;

  if (suite === "write") {
    // All conditions share one sandbox project, so write runs are strictly sequential.
    if (parallel) {
      console.error("--parallel is not supported with --suite write: every run resets the same sandbox project.");
      process.exit(1);
    }
    const def = loadSandboxDef();
    const budget = parseFloat(args.budget ?? String(def.budget_usd));
    const selected = taskIds.map((id) => tasks.get(id)).filter((t): t is TaskDef => Boolean(t));
    checkBudget(sessionCount(selected, conditionIds.length, repeat), def, budget);
    const sandbox = openSandbox(def, { create: true });
    console.log(`Sandbox: "${def.project_name}" = project ${sandbox.projectId} in account ${def.account_id}`);
    clearResults(conditionIds, suite);

    let spent = 0;
    let stopped = false;
    try {
      // Interleave conditions per task so a budget stop leaves comparable pairs.
      outer: for (const taskId of taskIds) {
        const task = tasks.get(taskId);
        if (!task) {
          console.error(`Skipping unknown task: ${taskId}`);
          continue;
        }
        for (let r = 1; r <= repeat; r++) {
          for (const condId of conditionIds) {
            const condition = conditions.get(condId);
            if (!condition) continue;
            if (spent >= budget) {
              console.error(`\nBudget reached: $${spent.toFixed(2)} spent of $${budget.toFixed(2)}. Stopping.`);
              stopped = true;
              break outer;
            }
            console.log(`\n[${condId}] ${taskId} (run ${r})`);
            const result = runOne({ condition: condId as ConditionId, task: taskId, run: r, model, agent }, condition, task, sandbox);
            spent += result.usage.total_cost_usd;
            const status = result.grade.task_success ? "PASS" : "FAIL";
            console.log(`  ${status} | ${result.usage.turn_count} turns | $${result.usage.total_cost_usd.toFixed(4)} | ${result.usage.wall_clock_seconds.toFixed(1)}s | ${result.grade.details}`);
          }
        }
      }

      if (!stopped && args["skip-probes"] !== "true") {
        console.log(`\nSafety probes:`);
        const probes: ProbeResult[] = runProbes(sandbox, def.probes, conditionIds);
        writeFileSync(join(resultsDir(suite), "probes.json"), JSON.stringify(probes, null, 2));
      }
    } finally {
      finishSandbox(sandbox);
    }

    console.log(`\nWrite matrix ${stopped ? "stopped at budget" : "complete"}: $${spent.toFixed(2)} spent.`);
    writeReports(suite);
    return;
  }

  clearResults(conditionIds);

  const runCondition = (condId: string) => {
    const condition = conditions.get(condId);
    if (!condition) {
      console.error(`Skipping unknown condition: ${condId}`);
      return;
    }

    let condDone = 0;
    const condTotal = taskIds.length * repeat;

    for (const taskId of taskIds) {
      const task = tasks.get(taskId);
      if (!task) {
        console.error(`Skipping unknown task: ${taskId}`);
        continue;
      }

      for (let r = 1; r <= repeat; r++) {
        condDone++;
        console.log(`\n[${condId} ${condDone}/${condTotal}] ${taskId} (run ${r})`);
        const result = runOne(
          { condition: condId as ConditionId, task: taskId, run: r, model, agent },
          condition,
          task,
        );
        const status = result.grade.task_success ? "PASS" : "FAIL";
        console.log(`  ${status} | ${result.usage.turn_count} turns | $${result.usage.total_cost_usd.toFixed(4)} | ${result.usage.wall_clock_seconds.toFixed(1)}s`);
      }
    }
  };

  if (parallel && conditionIds.length > 1) {
    console.log(`Running ${conditionIds.length} conditions in parallel (${total} total runs)...`);
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const childArgs = [
      "--agent", agent,
      "--repeat", String(repeat),
      "--model", model,
      ...(taskFilter ? ["--task", taskFilter] : []),
      ...(categoryFilter ? ["--category", categoryFilter] : []),
    ];
    const promises = conditionIds.map(async (condId) => {
      console.log(`  Starting condition: ${condId}`);
      try {
        const result = await execFileAsync(
          process.execPath,
          ["--no-warnings", "src/cli.ts", "matrix", "--condition", condId, ...childArgs],
          { cwd: BENCH_ROOT, maxBuffer: 50 * 1024 * 1024, timeout: 0, env: process.env },
        );
        console.log(result.stdout);
        if (result.stderr) console.error(result.stderr);
      } catch (err: any) {
        console.log(err.stdout ?? "");
        console.error(err.stderr ?? err.message);
      }
    });
    await Promise.all(promises);
  } else {
    for (const condId of conditionIds) {
      runCondition(condId);
    }
  }

  console.log(`\nMatrix complete: ${total} runs.`);
  writeReports();
}

async function cmdSandbox(argv: string[]): Promise<void> {
  const [action] = argv;
  const def = loadSandboxDef();
  const sandbox = openSandbox(def, { create: false });
  console.log(`"${def.project_name}" = project ${sandbox.projectId} in account ${def.account_id} (profile ${process.env.BENCH_BASECAMP_PROFILE ?? def.profile})`);
  if (action === "reset") finishSandbox(sandbox);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "run":
      return cmdRun(rest);
    case "matrix":
      return cmdMatrix(rest);
    case "report":
      writeReports((parseArgs(rest).suite ?? "read") as Suite);
      return;
    case "sandbox":
      return cmdSandbox(rest);
    default:
      console.log(`basecamp-axi bench — benchmark harness for basecamp CLI vs basecamp-axi

Commands:
  run       Run a single benchmark
              --condition <cli|axi>
              --task <task_id>
              --repeat <N>  (default: 1)
              --model <M>   (default: claude-sonnet-5)
              --agent <claude|codex>  (default: claude)
              --budget <usd>  (write tasks; default from config/sandbox.yaml)

  matrix    Run all condition × task combinations
              --suite <read|write>  (default: read)
              --repeat <N>  (default: 1)
              --model <M>   (default: claude-sonnet-5)
              --agent <claude|codex>  (default: claude)
              --condition <id,id,...>  (filter conditions)
              --task <id,id,...>       (filter tasks)
              --category <single_step|multi_step|error_recovery|write|write_safety>
              --parallel          Run conditions in parallel (read suite only)
              --budget <usd>      Write suite spend cap (default from config/sandbox.yaml)
              --skip-probes       Write suite: skip the tool-level safety probes

  report    Generate summary from results.jsonl
              --suite <read|write>  (default: read)

  sandbox   Show the write suite's sandbox project (never creates it)
  sandbox reset   Empty the sandbox project
`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

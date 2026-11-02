/**
 * Benchmark runner — executes agent tasks and grades results.
 *
 * Per RunSpec:
 * 1. Create artifact dir: results/[write/]{condition}/{task}/{runN}/
 * 2. Write condition-specific AGENTS.md (and any task files) to the workspace;
 *    write tasks also empty and seed the sandbox project
 * 3. Run agent (codex or claude) in the workspace, once per session
 * 4. Parse JSONL output → usage metrics
 * 5. Grade → grade.json (LLM judge for read tasks, Basecamp read-back for write tasks)
 * 6. Append to results.jsonl
 */

import { execFileSync, execSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync, chmodSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";

import type { RunSpec, RunResult, ConditionDef, TaskDef, AgentBackend, UsageMetrics } from "./types.ts";
import { parseCodexJsonl, parseClaudeJsonl } from "./usage.ts";
import { grade } from "./grader.ts";
import { gradeWrite } from "./write-grader.ts";
import { resultsDir } from "./reporter.ts";
import { type RecordingState, type Sandbox, resetSandbox, seedSandbox, sandboxEnv, sandboxReader } from "./sandbox.ts";


const BENCH_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(BENCH_ROOT, "..");

const SHIM_DIR = join(BENCH_ROOT, "results", ".bin");
const BUILT_AXI = join(REPO_ROOT, "dist", "bin", "basecamp-axi.js");

/** Where the axi build and its shim live; tests point these at a temporary directory. */
export interface AxiBuild {
  built: string;
  shimDir: string;
}

const DEFAULT_BUILD: AxiBuild = { built: BUILT_AXI, shimDir: SHIM_DIR };

/**
 * Put this checkout's basecamp-axi build first on PATH so the axi condition
 * measures the code under test rather than whatever is installed globally.
 * Falls back to PATH as-is when the repo has not been built, and removes a
 * shim left from an earlier build so it cannot pass for the missing one.
 */
export function agentPath(build: AxiBuild = DEFAULT_BUILD): string {
  const shim = join(build.shimDir, "basecamp-axi");
  if (!existsSync(build.built)) {
    rmSync(shim, { force: true });
    rmSync(join(build.shimDir, "env.sh"), { force: true });
    return process.env.PATH ?? "";
  }
  mkdirSync(build.shimDir, { recursive: true });
  writeFileSync(shim, `#!/bin/sh\nexec node "${build.built}" "$@"\n`);
  chmodSync(shim, 0o755);
  return [build.shimDir, process.env.PATH ?? ""].join(delimiter);
}

/**
 * Environment for an agent session. PATH alone is not enough for Claude Code:
 * its Bash tool sources the user's shell profile, and a version manager there
 * (mise activate, for one) moves a globally installed basecamp-axi back ahead
 * of the shim. CLAUDE_ENV_FILE is sourced after the profile before every
 * command, so it puts the shim first again.
 */
export function agentEnv(base: NodeJS.ProcessEnv, build: AxiBuild = DEFAULT_BUILD): NodeJS.ProcessEnv {
  const path = agentPath(build);
  if (!existsSync(build.built)) return { ...base, PATH: path };
  const envFile = join(build.shimDir, "env.sh");
  writeFileSync(envFile, `export PATH=${shellQuote(build.shimDir)}:"$PATH"\n`);
  return { ...base, PATH: path, CLAUDE_ENV_FILE: envFile };
}

function shellQuote(s: string): string {
  return `'${s.replaceAll("'", `'\\''`)}'`;
}

export interface PreflightResult {
  ok: boolean;
  resolved: string;
  cost_usd: number;
}

/**
 * Before any axi session, check in a real Claude Code shell that `basecamp-axi`
 * resolves to this checkout's shim, not a global install. A run that skipped
 * this measured basecamp-axi 0.2.0 while the checkout held 0.3.0. One short
 * session on a small model (BENCH_PREFLIGHT_MODEL) costs well under a cent.
 */
export function preflightAxiBuild(base: NodeJS.ProcessEnv = process.env, build: AxiBuild = DEFAULT_BUILD): PreflightResult {
  const shim = join(build.shimDir, "basecamp-axi");
  // Check the build itself, not the shim: a shim can outlive the dist/ it points at.
  if (!existsSync(build.built)) {
    agentPath(build); // drops any stale shim
    throw new Error("No basecamp-axi build to benchmark: run `npm run build` in the repository root first.");
  }
  const env = { ...agentEnv(base, build), ENABLE_CLAUDEAI_MCP_SERVERS: "false" };
  const workspace = join(BENCH_ROOT, "results", "preflight");
  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });
  let out = "";
  try {
    out = execFileSync("claude", [
      "--setting-sources", "",
      "-p", "Run this exact Bash command once, then reply with only its output: command -v basecamp-axi",
      "--model", process.env.BENCH_PREFLIGHT_MODEL ?? "claude-haiku-5-5",
      "--output-format", "json",
      "--no-session-persistence", "--disable-slash-commands", "--strict-mcp-config",
      "--max-turns", "3",
      "--permission-mode", "dontAsk", "--allowedTools", "Bash(command:*)",
    ], { encoding: "utf-8", env, cwd: workspace, timeout: 2 * 60 * 1000, stdio: ["pipe", "pipe", "pipe"] });
  } catch (err: unknown) {
    out = (err as { stdout?: string }).stdout ?? "";
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
  return parsePreflight(out, shim);
}

/** Read a preflight session's JSON result: ok only when the answer names the shim. */
export function parsePreflight(output: string, shim: string): PreflightResult {
  let result = "";
  let cost = 0;
  try {
    const doc = JSON.parse(output) as { result?: string; total_cost_usd?: number };
    result = doc.result ?? "";
    cost = doc.total_cost_usd ?? 0;
  } catch {
    result = output.trim();
  }
  const resolved = result.split("\n").map((l) => l.trim()).find((l) => l.startsWith("/")) ?? result.trim();
  return { ok: resolved === shim, resolved, cost_usd: cost };
}

/**
 * Fill a write prompt: {project} becomes the sandbox project id and {url:List/Title} the web link
 * of a seeded to-do. A template with nothing seeded behind it is a task-definition error.
 */
export function fillPrompt(prompt: string, projectId: string, seeded: Map<string, string>): string {
  return prompt.replaceAll("{project}", projectId).replace(/\{url:([^}]+)\}/g, (_m, key: string) => {
    const url = seeded.get(`url:${key}`);
    if (!url) throw new Error(`Prompt names {url:${key}}, but the seed created no to-do "${key}" with a link.`);
    return url;
  });
}

/** Sum usage across the sessions of one trial. */
export function mergeUsage(parts: UsageMetrics[]): UsageMetrics {
  const total = (key: keyof UsageMetrics): number => parts.reduce((acc, u) => acc + (u[key] as number), 0);
  return {
    input_tokens: total("input_tokens"),
    input_tokens_cached: total("input_tokens_cached"),
    input_tokens_uncached: total("input_tokens_uncached"),
    output_tokens: total("output_tokens"),
    reasoning_tokens: total("reasoning_tokens"),
    total_cost_usd: total("total_cost_usd"),
    wall_clock_seconds: total("wall_clock_seconds"),
    turn_count: total("turn_count"),
    command_count: total("command_count"),
    error_count: total("error_count"),
    command_log: parts.flatMap((u) => u.command_log),
  };
}

export function runOne(
  spec: RunSpec,
  condition: ConditionDef,
  task: TaskDef,
  sandbox?: Sandbox,
): RunResult {
  if (task.suite === "write" && !sandbox) throw new Error(`Write task ${task.id} needs a sandbox project.`);

  // 1. Create artifact dir
  const artifactDir = join(resultsDir(task.suite), spec.condition, spec.task, `run${spec.run}`);
  mkdirSync(artifactDir, { recursive: true });

  // 2. Set up an empty workspace holding only the condition's CLAUDE.md and the task's files.
  // One fixed path per condition: the agent's system prompt names its working
  // directory, so a per-run path would defeat prompt caching across runs.
  // Runs within a condition are sequential, so the path is never shared.
  const workspaceDir = join(resultsDir(task.suite), spec.condition, "workspace");
  rmSync(workspaceDir, { recursive: true, force: true });

  try {
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, "CLAUDE.md"), condition.agents_md);
    writeFileSync(join(workspaceDir, "AGENTS.md"), condition.agents_md);
    for (const [name, contents] of Object.entries(task.files ?? {})) {
      writeFileSync(join(workspaceDir, name), contents);
    }

    let prompt = task.prompt;
    let env: NodeJS.ProcessEnv = agentEnv(process.env);
    const initialRecordings = new Map<string, RecordingState>();
    if (sandbox) {
      resetSandbox(sandbox);
      const seeded = seedSandbox(sandbox, task.seed);
      prompt = fillPrompt(prompt, sandbox.projectId, seeded);
      const reader = sandboxReader(sandbox);
      for (const list of task.seed?.todolists ?? []) {
        for (const entry of list.todos ?? []) {
          if (typeof entry === "string" || !entry.trashed) continue;
          const key = `${list.name}/${entry.title}`;
          const id = seeded.get(key);
          if (!id) throw new Error(`No seeded id for trashed to-do "${key}".`);
          initialRecordings.set(key, reader.recording(id));
        }
      }
      env = agentEnv(sandboxEnv(sandbox.def));
    }

    const agent = spec.agent ?? "codex";

    // 3. Run agent, once per session (a second session re-runs the same prompt to test idempotency)
    const outputs: string[] = [];
    const usages: UsageMetrics[] = [];
    const sessions = task.sessions ?? 1;
    for (let s = 1; s <= sessions; s++) {
      const { agentOutput, wallClockSeconds } = runAgent(spec, condition, prompt, env, artifactDir, workspaceDir);
      writeFileSync(join(artifactDir, sessions > 1 ? `agent_output.${s}.txt` : "agent_output.txt"), agentOutput);
      outputs.push(agentOutput);
      // 4. Parse usage
      usages.push(agent === "claude"
        ? parseClaudeJsonl(agentOutput, { model: spec.model, wallClockSeconds })
        : parseCodexJsonl(agentOutput, { model: spec.model, wallClockSeconds }));
    }
    const agentOutput = outputs[outputs.length - 1];
    const usage = mergeUsage(usages);

    // Extract final text output for the result record
    const finalOutput = agent === "claude"
      ? extractClaudeFinalOutput(agentOutput)
      : extractFinalOutput(agentOutput);

    // 5. Grade — write tasks read the sandbox back; read tasks pass raw JSONL so the judge sees the full trajectory
    const gradeResult = sandbox
      ? gradeWrite(task.grading, sandboxReader(sandbox), { initialRecordings })
      : grade(task.grading, task.prompt, agentOutput, agent, artifactDir);
    writeFileSync(join(artifactDir, "grade.json"), JSON.stringify(gradeResult, null, 2));

    // 6. Build result
    const result: RunResult = {
      condition: spec.condition,
      task: spec.task,
      run: spec.run,
      model: spec.model,
      timestamp: new Date().toISOString(),
      usage,
      grade: gradeResult,
      agent_output: finalOutput.slice(0, 2000), // Truncate for JSONL
    };

    // 7. Append to results.jsonl
    const resultsJsonl = join(resultsDir(task.suite), "results.jsonl");
    appendFileSync(resultsJsonl, JSON.stringify(result) + "\n");

    return result;
  } finally {
    // The workspace held only CLAUDE.md; drop it.
    if (existsSync(workspaceDir)) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }
}

/** Extract the agent's final text output from Codex JSONL stream. */
function extractFinalOutput(jsonl: string): string {
  const parts: string[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      // message events contain the agent's text output
      if (entry.type === "message" || entry.type === "response") {
        const content = entry.content ?? entry.text ?? "";
        if (typeof content === "string" && content) parts.push(content);
      }
      // item.completed with type "message" contains assistant text
      if (entry.type === "item.completed") {
        const item = (entry.item ?? {}) as Record<string, unknown>;
        if (item.type === "message" && typeof item.text === "string") {
          parts.push(item.text);
        }
      }
    } catch {
      continue;
    }
  }
  // If we couldn't extract structured output, fall back to the raw JSONL
  return parts.length > 0 ? parts.join("\n") : jsonl;
}

/** Extract the agent's final text output from Claude stream-json output. */
function extractClaudeFinalOutput(jsonl: string): string {
  const parts: string[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      // result event contains the final text
      if (entry.type === "result" && typeof entry.result === "string") {
        return entry.result;
      }
      // assistant message events with text content
      if (entry.type === "assistant") {
        const msg = entry.message as Record<string, unknown> | undefined;
        if (msg && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            const b = block as Record<string, unknown>;
            if (b.type === "text" && typeof b.text === "string") {
              parts.push(b.text);
            }
          }
        }
      }
    } catch {
      continue;
    }
  }
  return parts.length > 0 ? parts.join("\n") : jsonl;
}

function runAgent(
  spec: RunSpec,
  condition: ConditionDef,
  prompt: string,
  env: NodeJS.ProcessEnv,
  artifactDir: string,
  workspaceDir: string,
): { agentOutput: string; wallClockSeconds: number } {
  const agent = spec.agent ?? "codex";

  let cmd: string[];

  if (agent === "claude") {
    // Permissions: pre-approve only the two Basecamp binaries (plus read-only
    // helpers). Set BENCH_SKIP_PERMISSIONS=1 to fall back to the upstream
    // harness behaviour of bypassing the permission system entirely.
    const permissionArgs = process.env.BENCH_SKIP_PERMISSIONS === "1"
      ? ["--dangerously-skip-permissions"]
      : ["--permission-mode", "dontAsk", "--allowedTools", ...condition.allowed_tools];
    // Arguments are passed as an array (no shell), so backticks or quotes in the
    // prompt and instructions are never interpreted.
    cmd = [
      "claude", "--setting-sources", "",
      "-p", prompt,
      // --setting-sources '' also disables project CLAUDE.md loading, so the
      // condition's tool instructions are injected into the system prompt.
      "--append-system-prompt", condition.agents_md,
      "--model", spec.model,
      "--output-format", "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--disable-slash-commands",
      // No MCP servers: a claude.ai Basecamp connector would otherwise offer a
      // third route to Basecamp alongside the condition's binary.
      "--strict-mcp-config",
      "--max-turns", "15",
      ...permissionArgs,
    ];
    env = { ...env, ENABLE_CLAUDEAI_MCP_SERVERS: "false" };
  } else {
    cmd = [
      "codex", "exec", "--json",
      "--model", spec.model,
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      "-C", workspaceDir,
      "--ephemeral",
      prompt,
    ];
  }

  const startTime = Date.now();
  let agentOutput = "";
  try {
    agentOutput = execFileSync(cmd[0], cmd.slice(1), {
      encoding: "utf-8",
      timeout: 5 * 60 * 1000,
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
      env,
      cwd: workspaceDir,
    } as ExecFileSyncOptionsWithStringEncoding);
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string };
    agentOutput = execErr.stdout ?? "";
    const stderr = execErr.stderr ?? "";
    writeFileSync(join(artifactDir, "stderr.txt"), stderr);
  }
  return { agentOutput, wallClockSeconds: (Date.now() - startTime) / 1000 };
}

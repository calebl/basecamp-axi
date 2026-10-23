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
import { type Sandbox, resetSandbox, seedSandbox, sandboxEnv, sandboxReader } from "./sandbox.ts";


const BENCH_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(BENCH_ROOT, "..");

/**
 * Put this checkout's basecamp-axi build first on PATH so the axi condition
 * measures the code under test rather than whatever is installed globally.
 * Falls back to PATH as-is when the repo has not been built.
 */
export function agentPath(): string {
  const built = join(REPO_ROOT, "dist", "bin", "basecamp-axi.js");
  if (!existsSync(built)) return process.env.PATH ?? "";
  const shimDir = join(BENCH_ROOT, "results", ".bin");
  mkdirSync(shimDir, { recursive: true });
  const shim = join(shimDir, "basecamp-axi");
  writeFileSync(shim, `#!/bin/sh\nexec node "${built}" "$@"\n`);
  chmodSync(shim, 0o755);
  return [shimDir, process.env.PATH ?? ""].join(delimiter);
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
    let env: NodeJS.ProcessEnv = { ...process.env, PATH: agentPath() };
    if (sandbox) {
      resetSandbox(sandbox);
      seedSandbox(sandbox, task.seed);
      prompt = prompt.replaceAll("{project}", sandbox.projectId);
      env = { ...sandboxEnv(sandbox.def), PATH: env.PATH };
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
      ? gradeWrite(task.grading, sandboxReader(sandbox))
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

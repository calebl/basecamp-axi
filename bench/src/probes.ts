/**
 * Tool-level safety probes for the write suite.
 *
 * No model is involved: each probe seeds one to-do in the sandbox, runs the
 * condition's own command against it exactly as an agent would, and reads the
 * result back from Basecamp.
 *
 *   no_confirm_trash  — a trash command without a confirm flag must leave the item active.
 *   repeat_complete   — completing the same to-do twice must exit 0 both times and leave it completed.
 */

import type { ConditionId, ProbeResult, SandboxDef } from "./types.ts";
import { type Sandbox, recordingStatus, resetSandbox, runProbeCommand, sandboxEnv, sandboxReader, seedSandbox } from "./sandbox.ts";
import { agentPath } from "./runner.ts";

const PROBE_LIST = "Probe list";
const PROBE_TODO = "Probe to-do";

function fill(argv: string[], vars: Record<string, string>): string[] {
  return argv.map((a) => a.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m));
}

function firstLine(text: string): string {
  return (text.split("\n").find((l) => l.trim()) ?? "").trim().slice(0, 120);
}

export function runProbes(sb: Sandbox, probes: SandboxDef["probes"], conditionIds: ConditionId[]): ProbeResult[] {
  const env = { ...sandboxEnv(sb.def), PATH: agentPath() };
  const results: ProbeResult[] = [];

  for (const [probe, def] of Object.entries(probes)) {
    for (const condition of conditionIds) {
      const argv = def.commands[condition];
      if (!argv) continue;
      resetSandbox(sb);
      const ids = seedSandbox(sb, { todolists: [{ name: PROBE_LIST, todos: [PROBE_TODO] }] });
      const todoId = ids.get(PROBE_TODO)!;
      const cmd = fill(argv, { id: todoId, project: sb.projectId });

      let result: ProbeResult;
      if (probe === "no_confirm_trash") {
        const run = runProbeCommand(sb, cmd, env);
        const status = recordingStatus(sb, todoId);
        result = {
          condition, probe, exit_code: run.exitCode,
          passed: status === "active",
          details: status === "active" ? `refused, item still active (exit ${run.exitCode})` : `item ${status} without confirmation`,
        };
      } else if (probe === "repeat_complete") {
        const first = runProbeCommand(sb, cmd, env);
        const second = runProbeCommand(sb, cmd, env);
        const list = sandboxReader(sb).todolists().find((l) => l.name === PROBE_LIST);
        const todo = list ? sandboxReader(sb).todos(list.id).find((t) => t.id === todoId) : undefined;
        const passed = first.exitCode === 0 && second.exitCode === 0 && Boolean(todo?.completed);
        const noop = /no-op|already/i.test(second.output) ? ", reported as a no-op" : "";
        result = {
          condition, probe, exit_code: second.exitCode, passed,
          details: passed
            ? `second run exit 0, still completed${noop}`
            : `exits ${first.exitCode}/${second.exitCode}, completed=${Boolean(todo?.completed)}: ${firstLine(second.output)}`,
        };
      } else {
        throw new Error(`Unknown probe "${probe}"`);
      }
      console.log(`  [probe] ${probe} × ${condition}: ${result.passed ? "PASS" : "FAIL"} (${result.details})`);
      results.push(result);
    }
  }
  return results;
}

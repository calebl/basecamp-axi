/** Shared interfaces for the benchmark harness. */

export type ConditionId = string;
export type TaskCategory = "single_step" | "multi_step" | "error_recovery" | "write" | "write_safety";
export type AgentBackend = "codex" | "claude";
/** read tasks run against a live account and are judged by an LLM; write tasks run in the sandbox project and are graded by reading Basecamp back. */
export type Suite = "read" | "write";

export interface GradingSpec {
  /** Optional hint for the judge about what to look for. */
  grading_hint?: string;
  /** Write tasks: named state check in write-grader.ts plus its parameters. */
  check?: string;
  [param: string]: unknown;
}

/** Content created in the sandbox project before a write task runs. */
export interface SeedSpec {
  todolists?: { name: string; todos?: string[] }[];
  cards?: { title: string; column: string }[];
  messages?: { title: string; body?: string }[];
}

export interface TaskDef {
  id: string;
  category: TaskCategory;
  suite: Suite;
  prompt: string;
  grading: GradingSpec;
  seed?: SeedSpec;
  /** Files written into the agent's workspace (name → contents). */
  files?: Record<string, string>;
  /** Agent sessions per trial; 2 re-runs the same prompt to test idempotency. Default 1. */
  sessions?: number;
}

export interface SandboxDef {
  /** basecamp CLI profile and account the write suite uses; passed as BASECAMP_PROFILE / BASECAMP_ACCOUNT_ID. */
  profile: string;
  account_id: string;
  /** Exact name of the dedicated project; created when missing, emptied after every run. */
  project_name: string;
  /** Columns the card table must have besides the built-in ones. */
  columns: string[];
  /** Default agent model for write tasks; --model overrides. */
  model: string;
  budget_usd: number;
  /** Per agent session, used for the pre-run estimate. */
  estimate_per_session_usd: number;
  /** Tool-level probes run once per condition with no model involved. */
  probes: Record<string, { description: string; commands: Record<ConditionId, string[]> }>;
}

export interface ProbeResult {
  condition: ConditionId;
  probe: string;
  passed: boolean;
  exit_code: number;
  details: string;
}

export interface ConditionDef {
  id: ConditionId;
  name: string;
  tool: string;
  agents_md: string;
  /** Claude Code --allowedTools patterns for the scoped-permission run mode. */
  allowed_tools: string[];
  setup_commands?: string[];
}

export interface RunSpec {
  condition: ConditionId;
  task: string;
  run: number;
  model: string;
  agent: AgentBackend;
}

export interface UsageMetrics {
  input_tokens: number;
  input_tokens_cached: number;
  input_tokens_uncached: number;
  output_tokens: number;
  reasoning_tokens: number;
  total_cost_usd: number;
  wall_clock_seconds: number;
  turn_count: number;
  command_count: number;
  error_count: number;
  command_log: string[];
}

export interface GradeResult {
  task_success: boolean;
  details: string;
}

export interface RunResult {
  condition: ConditionId;
  task: string;
  run: number;
  model: string;
  timestamp: string;
  usage: UsageMetrics;
  grade: GradeResult;
  agent_output: string;
}

export interface ConditionSummary {
  condition: ConditionId;
  name: string;
  total_tasks: number;
  success_rate: number;
  avg_input_tokens: number;
  avg_cached_pct: number;
  avg_output_tokens: number;
  avg_cost_usd: number;
  total_cost_usd: number;
  avg_duration_seconds: number;
  avg_turns: number;
}

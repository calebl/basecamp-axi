import { bc, asList } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, int, type FlagSpec } from "../args.js";
import { projectFlag, type CliContext } from "../context.js";
import { countLine, names, renderDetail, renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { dueStatus } from "../text.js";

export const SUBTASK_HELP = `usage: basecamp-axi subtask <list|create|done|reopen> [args] [flags]
Subtasks are the checklist items under a to-do or a card, addressed by the parent's id or URL.
subcommands:
  list <todo|card id|url>           Subtasks in position order
    --limit <n>                     Default 100
  create <todo|card id|url> "<title>"  Add one subtask
  done <subtask id|url>...          Complete subtasks (idempotent)
  reopen <subtask id|url>...        Reopen subtasks (idempotent)
examples:
  basecamp-axi subtask list 10170015169
  basecamp-axi subtask create 10170015169 "Book venue"
  basecamp-axi subtask done 10170015201
`;

const LIST_FLAGS: FlagSpec[] = [{ name: "--limit", alias: "-n", value: true }];
const CREATE_FLAGS: FlagSpec[] = [];

const subtaskSchema = {
  id: (s: Row) => s.id,
  title: (s: Row) => s.title ?? s.content,
  status: (s: Row) => (s.completed ? "done" : "open"),
  due: (s: Row) => dueStatus(s.due_on),
  assignees: (s: Row) => names(s.assignees),
};

export async function subtaskCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { sub, rest } = pickSub(args, ["list", "create", "done", "reopen"], "list", "subtask");
  switch (sub) {
    case "create":
      return create(rest, ctx);
    case "done":
      return toggle(rest, ctx, "done");
    case "reopen":
      return toggle(rest, ctx, "reopen");
    default:
      return list(rest, ctx);
  }
}

async function fetchSubtasks(parent: string, ctx: CliContext | undefined, limit?: number): Promise<{ rows: Row[]; total: number | undefined }> {
  const bcArgs = ["subtasks", "list", parent];
  if (limit === undefined) bcArgs.push("--all");
  else bcArgs.push("--limit", String(limit));
  const result = await bc(bcArgs, { project: ctx?.project, account: ctx?.account });
  return { rows: asList<Row>(result.data), total: result.total };
}

async function list(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, LIST_FLAGS, { command: "subtask list", maxPositionals: 1 });
  const parent = requirePositional(parsed, 0, "todo|card id|url", "basecamp-axi subtask list <todo|card id|url>");
  const limit = int(parsed, "--limit", 100);
  const { rows, total } = await fetchSubtasks(parent, ctx, limit);
  const pf = projectFlag(ctx);
  if (rows.length === 0) {
    return renderOutput([
      `subtasks: 0 subtasks on ${parent}`,
      renderHelp([`Run \`basecamp-axi subtask create ${parent} "<title>"${pf}\` to add one`]),
    ]);
  }
  return renderOutput([
    countLine({ count: rows.length, total, limit }),
    renderList("subtasks", rows, subtaskSchema),
    renderHelp([
      `Run \`basecamp-axi subtask done <id>${pf}\` to complete a subtask`,
      `Run \`basecamp-axi subtask create ${parent} "<title>"${pf}\` to add another`,
      ...(total && total > rows.length ? [`Run \`basecamp-axi subtask list ${parent} --limit ${total}${pf}\` to see all ${total}`] : []),
    ]),
  ]);
}

async function create(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, CREATE_FLAGS, { command: "subtask create", maxPositionals: 2 });
  const usage = 'basecamp-axi subtask create <todo|card id|url> "<title>"';
  const parent = requirePositional(parsed, 0, "todo|card id|url", usage);
  const title = requirePositional(parsed, 1, "title", usage);
  const result = await bc<Row>(["subtasks", "create", parent, title], { project: ctx?.project, account: ctx?.account });
  const s = result.data ?? {};
  const pf = projectFlag(ctx);
  return renderOutput([
    renderDetail("created", s, { id: (r) => r.id, title: (r) => r.title ?? title }),
    renderHelp([`Run \`basecamp-axi subtask list ${parent}${pf}\` to confirm`, `Run \`basecamp-axi subtask done <id>${pf}\` when one is finished`]),
  ]);
}

async function toggle(args: string[], ctx: CliContext | undefined, action: "done" | "reopen"): Promise<string> {
  const parsed = parseArgs(args, [], { command: `subtask ${action}`, maxPositionals: Infinity });
  if (parsed.positionals.length === 0) requirePositional(parsed, 0, "subtask id|url", `basecamp-axi subtask ${action} <subtask id|url>...`);
  const ids = parsed.positionals.flatMap((p) => p.split(",")).filter(Boolean);
  const wantCompleted = action === "done";
  const rows: Row[] = [];
  for (const id of ids) {
    const before = await bc<Row>(["subtasks", "show", id], { project: ctx?.project, account: ctx?.account });
    const s = before.data ?? {};
    if (Boolean(s.completed) === wantCompleted) {
      rows.push({ id: s.id ?? id, title: s.title ?? "?", result: `already ${wantCompleted ? "done" : "open"} (no-op)` });
      continue;
    }
    await bc(["subtasks", wantCompleted ? "complete" : "uncomplete", id], { project: ctx?.project, account: ctx?.account });
    rows.push({ id: s.id ?? id, title: s.title ?? "?", result: wantCompleted ? "completed" : "reopened" });
  }
  return renderOutput([
    renderList("subtasks", rows, { id: (r) => r.id, title: (r) => r.title, result: (r) => r.result }),
    renderHelp([wantCompleted ? "Run `basecamp-axi subtask reopen <id>` to undo" : "Run `basecamp-axi subtask done <id>` to complete again"]),
  ]);
}

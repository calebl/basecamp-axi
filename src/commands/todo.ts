import { bc, asList } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, str, int, bool, list as listFlag, type FlagSpec } from "../args.js";
import { projectFlag, type CliContext } from "../context.js";
import { AxiError } from "../errors.js";
import { countLine, names, renderDetail, renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { dueStatus, htmlToText, preview, relativeTime, truncate } from "../text.js";

/** Titles are normally plain, but cards surfaced by reports carry HTML content. */
export function cleanTitle(value: unknown): string {
  const s = String(value ?? "");
  return /<[a-z][\s\S]*>/i.test(s) ? preview(htmlToText(s), 120) : s;
}
import { readBody } from "../body.js";

export const TODO_HELP = `usage: basecamp-axi todo <list|view|create|done|reopen|assign|unassign> [args] [flags]
Project scope: --in <project id|name> after the command, BASECAMP_PROJECT env, or .basecamp/config.json.
subcommands:
  list                              Todos in the project (default: open, first 50)
    --list <id|name>                Only one todolist
    --assignee <person|me>          Only todos assigned to a person
    --status <open|completed|all>   Default open
    --overdue                       Only overdue todos
    --limit <n>                     Default 50
  view <id|url>                     Todo details with description preview
    --full                          Complete description
  create "<content>"                Create a todo
    --list <id|name>                Todolist (required when the project has several)
    --to <person|me>                Assignee
    --due <date>                    e.g. 2026-09-30, tomorrow, +3
    --description <markdown>        Extended description
    --description-file <path>       Read description from a file
  done <id|url>...                  Complete todos (idempotent)
  reopen <id|url>...                Reopen todos
  assign <id>... --to <person>      Add an assignee
  unassign <id>... --from <person>  Remove an assignee
examples:
  basecamp-axi todo list --in 48189809 --assignee me
  basecamp-axi todo view 10170015169
  basecamp-axi todo create "Ship the fix" --in 48189809 --list "Sprint 4" --to me --due tomorrow
  basecamp-axi todo done 10170015169
`;

const LIST_FLAGS: FlagSpec[] = [
  { name: "--list", alias: "-l", value: true },
  { name: "--assignee", value: true },
  { name: "--status", value: true },
  { name: "--overdue" },
  { name: "--limit", alias: "-n", value: true },
];
const VIEW_FLAGS: FlagSpec[] = [{ name: "--full" }];
const CREATE_FLAGS: FlagSpec[] = [
  { name: "--list", alias: "-l", value: true },
  { name: "--to", value: true },
  { name: "--due", alias: "-d", value: true },
  { name: "--description", value: true },
  { name: "--description-file", value: true },
];
const ASSIGN_FLAGS: FlagSpec[] = [{ name: "--to", value: true }];
const UNASSIGN_FLAGS: FlagSpec[] = [{ name: "--from", value: true }];

export const todoListSchema = {
  id: (t: Row) => t.id,
  title: (t: Row) => cleanTitle(t.title ?? t.content),
  status: (t: Row) => (t.completed ? "done" : "open"),
  due: (t: Row) => dueStatus(t.due_on),
  assignees: (t: Row) => names(t.assignees),
};

export async function todoCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { sub, rest } = pickSub(args, ["list", "view", "create", "done", "reopen", "assign", "unassign"], "list", "todo");
  switch (sub) {
    case "view":
      return view(rest, ctx);
    case "create":
      return create(rest, ctx);
    case "done":
      return toggle(rest, ctx, "done");
    case "reopen":
      return toggle(rest, ctx, "reopen");
    case "assign":
      return assign(rest, ctx, "assign");
    case "unassign":
      return assign(rest, ctx, "unassign");
    default:
      return list(rest, ctx);
  }
}

export function requireProject(ctx: CliContext | undefined, command: string): NonNullable<CliContext["project"]> {
  if (!ctx?.project) {
    throw new AxiError(`\`${command}\` needs a project`, "VALIDATION_ERROR", [
      `Run \`basecamp-axi ${command} --in <project id|name>\``,
      "Run `basecamp-axi project list` to find project ids",
    ]);
  }
  return ctx.project;
}

async function list(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, LIST_FLAGS, { command: "todo list" });
  const project = requireProject(ctx, "todo list");
  const limit = int(parsed, "--limit", 50);
  const status = str(parsed, "--status") ?? "open";
  if (!["open", "completed", "all"].includes(status)) {
    throw new AxiError(`--status must be open, completed, or all (got ${status})`, "VALIDATION_ERROR");
  }
  const bcArgs = ["todos", "list"];
  const todolist = str(parsed, "--list");
  const assignee = str(parsed, "--assignee");
  if (todolist) bcArgs.push("--list", todolist);
  if (assignee) bcArgs.push("--assignee", assignee);
  if (bool(parsed, "--overdue")) bcArgs.push("--overdue");
  if (status === "completed") bcArgs.push("--status", "completed");
  if (status === "all") bcArgs.push("--all");
  else bcArgs.push("--limit", String(limit));

  const result = await bc(bcArgs, { project, account: ctx?.account });
  let todos = asList<Row>(result.data);
  if (status === "all") todos = todos; // basecamp returns incomplete by default; --all paginates everything requested
  const pf = projectFlag(ctx);
  const scope = [status === "all" ? "" : status, bool(parsed, "--overdue") ? "overdue" : "", assignee ? `assigned to ${assignee}` : ""].filter(Boolean).join(" ");
  if (todos.length === 0) {
    return renderOutput([
      `todos: 0 ${scope || "matching"} todos found in project ${project.value}`,
      renderHelp([
        `Run \`basecamp-axi todo create "<content>"${pf}\` to add a todo`,
        ...(status === "open" ? [`Run \`basecamp-axi todo list --status completed${pf}\` to see completed todos`] : []),
      ]),
    ]);
  }
  return renderOutput([
    countLine({ count: todos.length, total: result.total, limit: status === "all" ? undefined : limit }),
    renderList("todos", todos, todoListSchema),
    renderHelp([
      "Run `basecamp-axi todo view <id>` for description and comments count",
      `Run \`basecamp-axi todo done <id>\` to complete a todo`,
      `Run \`basecamp-axi comment create <id> "<text>"${pf}\` to comment`,
      ...(result.total && result.total > todos.length ? [`Run \`basecamp-axi todo list --limit ${result.total}${pf}\` to see all ${result.total}`] : []),
    ]),
  ]);
}

async function view(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, VIEW_FLAGS, { command: "todo view", maxPositionals: 1 });
  const id = requirePositional(parsed, 0, "id|url", "basecamp-axi todo view <id|url>");
  const result = await bc<Row>(["todos", "show", id], { project: ctx?.project, account: ctx?.account });
  const t = result.data;
  const description = htmlToText(t.description);
  const desc = bool(parsed, "--full") ? { text: description, truncated: false } : truncate(description, 1000);
  const detail = renderDetail("todo", t, {
    id: (x) => x.id,
    title: (x) => x.content,
    status: (x) => (x.completed ? "done" : "open"),
    due: (x) => dueStatus(x.due_on),
    assignees: (x) => names(x.assignees),
    list: (x) => x.parent?.title,
    project: (x) => x.bucket?.name,
    project_id: (x) => x.bucket?.id,
    creator: (x) => x.creator?.name,
    comments: (x) => x.comments_count ?? 0,
    created: (x) => relativeTime(x.created_at),
    updated: (x) => relativeTime(x.updated_at),
    url: (x) => x.app_url,
    description: () => desc.text || "none",
  });
  const inProject = t.bucket?.id ? ` --in ${t.bucket.id}` : projectFlag(ctx);
  return renderOutput([
    detail,
    renderHelp([
      ...(desc.truncated ? [`Run \`basecamp-axi todo view ${t.id} --full\` to see the complete description`] : []),
      ...((t.comments_count ?? 0) > 0 ? [`Run \`basecamp-axi comment list ${t.id}${inProject}\` to read ${t.comments_count} comments`] : []),
      ...(t.completed ? [`Run \`basecamp-axi todo reopen ${t.id}\` to reopen`] : [`Run \`basecamp-axi todo done ${t.id}\` to complete`]),
    ]),
  ]);
}

async function create(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, CREATE_FLAGS, { command: "todo create", maxPositionals: 1 });
  const project = requireProject(ctx, "todo create");
  const content = requirePositional(parsed, 0, "content", 'basecamp-axi todo create "<content>" --in <project>');
  const bcArgs = ["todos", "create", content];
  const todolist = str(parsed, "--list");
  const to = str(parsed, "--to");
  const due = str(parsed, "--due");
  const description = await readBody(str(parsed, "--description"), str(parsed, "--description-file"), "--description");
  if (todolist) bcArgs.push("--list", todolist);
  if (to) bcArgs.push("--to", to);
  if (due) bcArgs.push("--due", due);
  if (description) bcArgs.push("--description", description);
  const result = await bc<Row>(bcArgs, { project, account: ctx?.account });
  const t = result.data ?? {};
  return renderOutput([
    renderDetail("created", t, {
      id: (x) => x.id,
      title: (x) => x.content ?? content,
      due: (x) => dueStatus(x.due_on),
      assignees: (x) => names(x.assignees),
      url: (x) => x.app_url,
    }),
    renderHelp([
      ...(t.id ? [`Run \`basecamp-axi todo view ${t.id}\` to confirm`, `Run \`basecamp-axi todo done ${t.id}\` when finished`] : []),
    ]),
  ]);
}

async function toggle(args: string[], ctx: CliContext | undefined, action: "done" | "reopen"): Promise<string> {
  const parsed = parseArgs(args, [], { command: `todo ${action}`, maxPositionals: Infinity });
  if (parsed.positionals.length === 0) requirePositional(parsed, 0, "id|url", `basecamp-axi todo ${action} <id|url>...`);
  const ids = parsed.positionals.flatMap((p) => p.split(",")).filter(Boolean);
  const rows: Row[] = [];
  for (const id of ids) {
    const before = await bc<Row>(["todos", "show", id], { project: ctx?.project, account: ctx?.account }).catch(() => undefined);
    const wantCompleted = action === "done";
    if (before && Boolean(before.data.completed) === wantCompleted) {
      rows.push({ id: before.data.id, title: before.data.content, result: `already ${wantCompleted ? "done" : "open"} (no-op)` });
      continue;
    }
    await bc(["todos", action === "done" ? "complete" : "uncomplete", id], { project: ctx?.project, account: ctx?.account });
    rows.push({ id: before?.data.id ?? id, title: before?.data.content ?? "?", result: wantCompleted ? "completed" : "reopened" });
  }
  return renderOutput([
    renderList("todos", rows, { id: (r) => r.id, title: (r) => r.title, result: (r) => r.result }),
    renderHelp([action === "done" ? "Run `basecamp-axi todo reopen <id>` to undo" : "Run `basecamp-axi todo done <id>` to complete again"]),
  ]);
}

async function assign(args: string[], ctx: CliContext | undefined, action: "assign" | "unassign"): Promise<string> {
  const flags = action === "assign" ? ASSIGN_FLAGS : UNASSIGN_FLAGS;
  const who = action === "assign" ? "--to" : "--from";
  const parsed = parseArgs(args, flags, { command: `todo ${action}`, maxPositionals: Infinity });
  const project = requireProject(ctx, `todo ${action}`);
  if (parsed.positionals.length === 0) requirePositional(parsed, 0, "id", `basecamp-axi todo ${action} <id>... ${who} <person> --in <project>`);
  const person = str(parsed, who);
  if (!person) throw new AxiError(`${who} is required`, "VALIDATION_ERROR", [`Run \`basecamp-axi todo ${action} <id> ${who} <person|me> --in <project>\``]);
  const ids = parsed.positionals.flatMap((p) => p.split(",")).filter(Boolean);
  const bcArgs = [action, ...ids, who, person];
  await bc(bcArgs, { project, account: ctx?.account });
  const verified: Row[] = [];
  for (const id of ids) {
    const after = await bc<Row>(["todos", "show", id], { project, account: ctx?.account }).catch(() => undefined);
    verified.push({ id, title: after?.data.content ?? "?", assignees: names(after?.data.assignees) });
  }
  return renderOutput([
    renderList("todos", verified, { id: (r) => r.id, title: (r) => r.title, assignees: (r) => r.assignees }),
  ]);
}

export { listFlag };

import { bc, asList } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, str, int, bool, type FlagSpec } from "../args.js";
import { projectFlag, type CliContext } from "../context.js";
import { AxiError } from "../errors.js";
import { countLine, renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { htmlToText, preview, relativeTime } from "../text.js";
import { requireProject, cleanTitle } from "./todo.js";

export const RECORDING_HELP = `usage: basecamp-axi recording <list|trash|archive|restore> [args] [flags]
Status changes for any recording (todo, message, card, document, comment, upload).
trash, archive, and restore change what other people see, so they require --confirm.
subcommands:
  list --type <type>                Recordings of one type in the project
    --status <active|archived|trashed>   Default active
    --limit <n>                     Default 50
  trash <id|url>... --confirm       Move to trash (Basecamp keeps trashed items 30 days)
  archive <id|url>... --confirm     Archive
  restore <id|url>... --confirm     Restore an archived or trashed item to active
types: todos, messages, documents, comments, cards, uploads
examples:
  basecamp-axi recording list --type cards --status archived --in 48618032
  basecamp-axi recording archive 10295117789 --in 48618032 --confirm
  basecamp-axi recording restore 10295117789 --in 48618032 --confirm
`;

const TYPES = ["todos", "messages", "documents", "comments", "cards", "uploads"];
const LIST_FLAGS: FlagSpec[] = [
  { name: "--type", alias: "-t", value: true },
  { name: "--status", value: true },
  { name: "--limit", alias: "-n", value: true },
];
const MUTATE_FLAGS: FlagSpec[] = [{ name: "--confirm" }];

type Action = "trash" | "archive" | "restore";
const TARGET_STATUS: Record<Action, string> = { trash: "trashed", archive: "archived", restore: "active" };

export async function recordingCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { sub, rest } = pickSub(args, ["list", "trash", "archive", "restore"], "list", "recording");
  if (sub === "list") return list(rest, ctx);
  return mutate(rest, ctx, sub as Action);
}

async function list(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, LIST_FLAGS, { command: "recording list" });
  const project = requireProject(ctx, "recording list");
  const type = str(parsed, "--type");
  if (!type || !TYPES.includes(type)) {
    throw new AxiError(type ? `Unknown --type ${type}` : "--type is required", "VALIDATION_ERROR", [`valid types: ${TYPES.join(", ")}`]);
  }
  const status = str(parsed, "--status") ?? "active";
  if (!["active", "archived", "trashed"].includes(status)) {
    throw new AxiError(`--status must be active, archived, or trashed (got ${status})`, "VALIDATION_ERROR");
  }
  const limit = int(parsed, "--limit", 50);
  const result = await bc(["recordings", type, "--status", status, "--limit", String(limit)], { project, account: ctx?.account });
  const items = asList<Row>(result.data);
  const pf = projectFlag(ctx);
  if (items.length === 0) return `recordings: 0 ${status} ${type} found in project ${project.value}`;
  return renderOutput([
    countLine({ count: items.length, total: result.total, limit }),
    renderList("recordings", items, {
      id: (r) => r.id,
      title: (r) => cleanTitle(r.title ?? r.subject ?? r.content) || preview(htmlToText(r.content), 80),
      status: (r) => r.status,
      updated: (r) => relativeTime(r.updated_at),
    }),
    renderHelp(
      status === "active"
        ? [`Run \`basecamp-axi recording archive <id> --confirm${pf}\` to archive one`]
        : [`Run \`basecamp-axi recording restore <id> --confirm${pf}\` to bring one back`],
    ),
  ]);
}

async function mutate(args: string[], ctx: CliContext | undefined, action: Action): Promise<string> {
  const parsed = parseArgs(args, MUTATE_FLAGS, { command: `recording ${action}`, maxPositionals: Infinity });
  const project = requireProject(ctx, `recording ${action}`);
  if (parsed.positionals.length === 0) requirePositional(parsed, 0, "id|url", `basecamp-axi recording ${action} <id|url>... --in <project> --confirm`);
  const ids = parsed.positionals.flatMap((p) => p.split(",")).filter(Boolean);
  const target = TARGET_STATUS[action];

  // Look up current state first so the confirmation prompt names what changes and repeats are no-ops.
  const current: Row[] = [];
  for (const id of ids) {
    const shown = await bc<Row>(["show", id], { project, account: ctx?.account });
    if (!shown.data?.status) {
      throw new AxiError(`Recording ${id} not found in project ${project.value}`, "NOT_FOUND", [
        "Run `basecamp-axi url parse <url>` to get the recording id and project from a Basecamp link",
      ]);
    }
    current.push({ id, ...shown.data });
  }
  const pending = current.filter((r) => r.status !== target);

  if (!bool(parsed, "--confirm")) {
    const pf = projectFlag(ctx) || ` --in ${project.value}`;
    return renderOutput([
      `${action}: not applied (needs --confirm)`,
      renderList("would_change", pending, {
        id: (r) => r.id,
        title: (r) => cleanTitle(r.title ?? r.content) || "?",
        from: (r) => r.status ?? "unknown",
        to: () => target,
      }),
      ...(pending.length < current.length ? [`already_${target}: ${current.length - pending.length}`] : []),
      renderHelp([`Run \`basecamp-axi recording ${action} ${ids.join(" ")}${pf} --confirm\` to apply`]),
    ]);
  }

  const rows: Row[] = [];
  for (const r of current) {
    if (r.status === target) {
      rows.push({ id: r.id, title: cleanTitle(r.title ?? r.content) || "?", result: `already ${target} (no-op)` });
      continue;
    }
    await bc(["recordings", action, String(r.id)], { project, account: ctx?.account });
    rows.push({ id: r.id, title: cleanTitle(r.title ?? r.content) || "?", result: target });
  }
  const undo = action === "restore" ? "archive" : "restore";
  return renderOutput([
    renderList("recordings", rows, { id: (r) => r.id, title: (r) => r.title, result: (r) => r.result }),
    renderHelp([`Run \`basecamp-axi recording ${undo} <id>${projectFlag(ctx) || ` --in ${project.value}`} --confirm\` to undo`]),
  ]);
}

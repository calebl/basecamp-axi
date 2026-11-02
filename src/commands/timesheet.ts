import { bc, asList, requireCliVersion, type CallOptions } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, str, int, bool, type FlagSpec } from "../args.js";
import { projectFlag, type CliContext } from "../context.js";
import { AxiError } from "../errors.js";
import { countLine, renderDetail, renderHelp, renderList, renderOutput, type Row, type Schema } from "../toon.js";
import { preview, relativeTime } from "../text.js";
import { requireProject } from "./todo.js";

export const TIMESHEET_HELP = `usage: basecamp-axi timesheet <list|report|view|create|update|delete> [args] [flags]
Time logged against to-dos, messages, cards, documents, uploads, or schedule entries.
subcommands:
  list                              Entries in the project (needs --in), newest first
    --item <id>                     Only entries on one item (no --in needed)
    --limit <n>                     Default 50
  report                            Account-wide entries (default: the last month; ignores --in)
    --from <date> --to <date>       ISO 8601 range; pass both or neither
    --person <person id>            Only one person's time
    --limit <n>                     Default 50
  view <entry id|url>               One entry
  create <item id|url> --hours <h>  Log time against an item
    --hours <h>                     Decimal (1.5) or hours:minutes (1:30); required
    --date <date>                   ISO 8601 or relative (yesterday); default today
    --description <text>            Note about the work
    --person <id|name|email|me>     Whose time it is; default you
  update <entry id|url>             Change hours, date, description, or person (same flags as create)
  delete <entry id|url>... --confirm  Delete permanently (cannot be undone or restored)
examples:
  basecamp-axi timesheet list --in 48189809
  basecamp-axi timesheet create 10170015169 --hours 1:30 --description "Review"
  basecamp-axi timesheet update 1069480283 --hours 2
  basecamp-axi timesheet delete 1069480283 --confirm
`;

/** `timesheet entry` landed in basecamp CLI 0.22.0; older CLIs run the report instead of failing. */
const ENTRY_MIN_CLI = "0.22.0";

const LIST_FLAGS: FlagSpec[] = [
  { name: "--item", value: true },
  { name: "--limit", alias: "-n", value: true },
];
const REPORT_FLAGS: FlagSpec[] = [
  { name: "--from", value: true },
  { name: "--to", value: true },
  { name: "--person", value: true },
  { name: "--limit", alias: "-n", value: true },
];
const ENTRY_FLAGS: FlagSpec[] = [
  { name: "--hours", value: true },
  { name: "--date", alias: "-d", value: true },
  { name: "--description", value: true },
  { name: "--person", value: true },
];
const DELETE_FLAGS: FlagSpec[] = [{ name: "--confirm" }];

const entrySchema: Schema = {
  id: (e) => e.id,
  date: (e) => e.date,
  hours: (e) => e.hours,
  person: (e) => e.person?.name,
  item: (e) => itemLabel(e),
  description: (e) => preview(String(e.description ?? ""), 80),
};

function itemLabel(e: Row): string | undefined {
  const parent = e.parent;
  if (!parent) return undefined;
  if (parent.type === "Timesheet") return "(project)";
  return parent.title ?? `${parent.type ?? "item"} ${parent.id ?? ""}`.trim();
}

export async function timesheetCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { sub, rest } = pickSub(args, ["list", "report", "view", "create", "update", "delete"], "list", "timesheet");
  switch (sub) {
    case "report":
      return report(rest, ctx);
    case "view":
      return view(rest, ctx);
    case "create":
      return create(rest, ctx);
    case "update":
      return update(rest, ctx);
    case "delete":
      return remove(rest, ctx);
    default:
      return list(rest, ctx);
  }
}

/** Run a timesheet call, explaining the account-level reason behind a bare "access denied". */
async function ts<T = unknown>(args: string[], options: CallOptions) {
  try {
    return await bc<T>(["timesheet", ...args], options);
  } catch (error) {
    if (error instanceof AxiError && error.code === "FORBIDDEN") {
      throw new AxiError("Timesheet access denied", "FORBIDDEN", [
        "Timesheet may be turned off for this Basecamp account, or this person may not have access to it; ask an account admin",
        "Deleting or changing someone else's entry can also be refused",
      ]);
    }
    throw error;
  }
}

function totalHours(entries: Row[]): string {
  const minutes = entries.reduce((sum, e) => sum + (hoursToMinutes(e.hours) ?? 0), 0);
  return String(Math.round((minutes / 60) * 100) / 100);
}

/** Parse "1.5", "2.0", or "1:30" into minutes; undefined when unparseable. */
export function hoursToMinutes(value: unknown): number | undefined {
  const s = String(value ?? "").trim();
  const hm = /^(\d+):([0-5]?\d)$/.exec(s);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  if (/^\d*\.?\d+$/.test(s)) return Math.round(Number(s) * 60);
  return undefined;
}

function renderEntries(entries: Row[], limit: number, empty: string, hints: string[]): string {
  if (entries.length === 0) return renderOutput([`entries: 0 ${empty}`, renderHelp(hints)]);
  const shown = entries.slice(0, limit);
  return renderOutput([
    countLine({ count: shown.length, total: entries.length }),
    `total_hours: ${totalHours(entries)}`,
    renderList("entries", shown, entrySchema),
    renderHelp([
      "Run `basecamp-axi timesheet view <id>` for one entry",
      ...hints,
      ...(entries.length > shown.length ? [`Pass \`--limit ${entries.length}\` to see all ${entries.length}`] : []),
    ]),
  ]);
}

async function list(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, LIST_FLAGS, { command: "timesheet list" });
  const limit = int(parsed, "--limit", 50);
  const item = str(parsed, "--item");
  const pf = projectFlag(ctx);
  if (item) {
    if (!/^\d+$/.test(item)) {
      throw new AxiError("--item takes a numeric item id", "VALIDATION_ERROR", [
        "Run `basecamp-axi url parse <url>` to get the recording id from a Basecamp link",
      ]);
    }
    const result = await ts(["item", item], { project: ctx?.project, account: ctx?.account });
    return renderEntries(asList<Row>(result.data), limit, `timesheet entries on item ${item}`, [
      `Run \`basecamp-axi timesheet create ${item} --hours <h>\` to log time on it`,
    ]);
  }
  const project = requireProject(ctx, "timesheet list");
  const result = await ts(["project"], { project, account: ctx?.account });
  return renderEntries(asList<Row>(result.data), limit, `timesheet entries in project ${project.value}`, [
    `Run \`basecamp-axi timesheet create <item id> --hours <h>${pf}\` to log time`,
  ]);
}

async function report(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, REPORT_FLAGS, { command: "timesheet report" });
  const limit = int(parsed, "--limit", 50);
  const from = str(parsed, "--from");
  const to = str(parsed, "--to");
  if (Boolean(from) !== Boolean(to)) {
    throw new AxiError("--from and --to go together", "VALIDATION_ERROR", ["Run `basecamp-axi timesheet report --from 2026-10-01 --to 2026-10-31`"]);
  }
  const person = str(parsed, "--person");
  if (person && !/^\d+$/.test(person)) {
    throw new AxiError("--person on `timesheet report` takes a numeric person id", "VALIDATION_ERROR", ["Run `basecamp-axi people list` to find person ids"]);
  }
  const bcArgs = ["report"];
  if (from && to) bcArgs.push("--start", from, "--end", to);
  if (person) bcArgs.push("--person", person);
  const result = await ts(bcArgs, { account: ctx?.account });
  const range = from && to ? `from ${from} to ${to}` : "in the last month";
  return renderEntries(asList<Row>(result.data), limit, `timesheet entries ${range}${person ? ` for person ${person}` : ""}`, [
    ...(from ? [] : ["Pass `--from <date> --to <date>` for another range"]),
  ]);
}

async function show(id: string, ctx: CliContext | undefined): Promise<Row> {
  const result = await ts<Row>(["entry", "show", id], { project: ctx?.project, account: ctx?.account });
  return result.data ?? {};
}

function detailSchema(): Schema {
  return {
    id: (e) => e.id,
    date: (e) => e.date,
    hours: (e) => e.hours,
    person: (e) => e.person?.name,
    person_id: (e) => e.person?.id,
    item: (e) => itemLabel(e),
    item_id: (e) => e.parent?.id,
    item_type: (e) => e.parent?.type,
    project: (e) => e.bucket?.name,
    project_id: (e) => e.bucket?.id,
    description: (e) => e.description,
    creator: (e) => e.creator?.name,
    created: (e) => relativeTime(e.created_at),
    url: (e) => e.app_url,
  };
}

function entryHints(e: Row, ref?: string): string[] {
  const target = ref ?? e.app_url ?? e.id;
  if (!target) return [];
  return [
    `Run \`basecamp-axi timesheet update ${target} --hours <h>\` to change it`,
    `Run \`basecamp-axi timesheet delete ${target} --confirm\` to delete it permanently`,
  ];
}

async function view(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, [], { command: "timesheet view", maxPositionals: 1 });
  const id = requirePositional(parsed, 0, "entry id|url", "basecamp-axi timesheet view <entry id|url>");
  await requireCliVersion(ENTRY_MIN_CLI, "timesheet view");
  const e = await show(id, ctx);
  return renderOutput([renderDetail("entry", e, detailSchema()), renderHelp(entryHints(e, id))]);
}

function entryArgs(parsed: ReturnType<typeof parseArgs>): string[] {
  const out: string[] = [];
  for (const flag of ["--hours", "--date", "--description", "--person"]) {
    const v = str(parsed, flag);
    if (v !== undefined) out.push(flag, v);
  }
  return out;
}

function validateHours(hours: string | undefined): void {
  if (hours !== undefined && hoursToMinutes(hours) === undefined) {
    throw new AxiError(`--hours must be a decimal (1.5) or hours:minutes (1:30), got ${hours}`, "VALIDATION_ERROR");
  }
}

async function create(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, ENTRY_FLAGS, { command: "timesheet create", maxPositionals: 1 });
  const usage = "basecamp-axi timesheet create <item id|url> --hours <h>";
  const item = requirePositional(parsed, 0, "item id|url", usage);
  const hours = str(parsed, "--hours");
  if (!hours) throw new AxiError("--hours is required", "VALIDATION_ERROR", [`Run \`${usage}\``]);
  validateHours(hours);
  await requireCliVersion(ENTRY_MIN_CLI, "timesheet create");
  const result = await ts<Row>(["entry", "create", item, ...entryArgs(parsed)], { project: ctx?.project, account: ctx?.account });
  const e = result.data ?? {};
  return renderOutput([
    renderDetail("created", e, { id: (x) => x.id, date: (x) => x.date, hours: (x) => x.hours ?? hours, person: (x) => x.person?.name, item: (x) => itemLabel(x), url: (x) => x.app_url }),
    renderHelp(entryHints(e)),
  ]);
}

/** True when every flag passed already matches the entry, so an update would change nothing. */
export function entryUnchanged(entry: Row, parsed: ReturnType<typeof parseArgs>): boolean {
  const hours = str(parsed, "--hours");
  const date = str(parsed, "--date");
  const description = str(parsed, "--description");
  const person = str(parsed, "--person");
  if (hours !== undefined && (hoursToMinutes(hours) === undefined || hoursToMinutes(hours) !== hoursToMinutes(entry.hours))) return false;
  if (date !== undefined && date !== entry.date) return false;
  if (description !== undefined && description !== entry.description) return false;
  if (person !== undefined) {
    const p = entry.person ?? {};
    const same = person === String(p.id) || person.toLowerCase() === String(p.name ?? "").toLowerCase() || person.toLowerCase() === String(p.email_address ?? "").toLowerCase();
    if (!same) return false;
  }
  return true;
}

async function update(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, ENTRY_FLAGS, { command: "timesheet update", maxPositionals: 1 });
  const id = requirePositional(parsed, 0, "entry id|url", "basecamp-axi timesheet update <entry id|url> --hours <h>");
  const changes = entryArgs(parsed);
  if (changes.length === 0) {
    throw new AxiError("Nothing to update", "VALIDATION_ERROR", ["Pass at least one of --hours, --date, --description, --person"]);
  }
  validateHours(str(parsed, "--hours"));
  await requireCliVersion(ENTRY_MIN_CLI, "timesheet update");
  const before = await show(id, ctx);
  if (entryUnchanged(before, parsed)) {
    return renderOutput([
      renderDetail("entry", { ...before, result: "unchanged (no-op)" }, { id: (x) => x.id, date: (x) => x.date, hours: (x) => x.hours, person: (x) => x.person?.name, result: (x) => x.result }),
      renderHelp(entryHints(before, id)),
    ]);
  }
  const result = await ts<Row>(["entry", "update", id, ...changes], { project: ctx?.project, account: ctx?.account });
  const e = result.data ?? {};
  return renderOutput([
    renderDetail("updated", e, {
      id: (x) => x.id,
      date: (x) => x.date,
      hours: (x) => x.hours,
      person: (x) => x.person?.name,
      item: (x) => itemLabel(x),
      description: (x) => x.description,
    }),
    renderHelp(entryHints(e, id)),
  ]);
}

async function remove(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, DELETE_FLAGS, { command: "timesheet delete", maxPositionals: Infinity });
  if (parsed.positionals.length === 0) requirePositional(parsed, 0, "entry id|url", "basecamp-axi timesheet delete <entry id|url>... --confirm");
  const ids = parsed.positionals.flatMap((p) => p.split(",")).filter(Boolean);
  await requireCliVersion(ENTRY_MIN_CLI, "timesheet delete");

  // Look each entry up first: the dry run names what would go, and a missing id fails before anything is deleted.
  const entries: Row[] = [];
  for (const id of ids) {
    try {
      entries.push({ ...(await show(id, ctx)), ref: id });
    } catch (error) {
      if (error instanceof AxiError && error.code === "NOT_FOUND") {
        throw new AxiError(`Timesheet entry ${id} not found`, "NOT_FOUND", [
          "It may already be deleted; run `basecamp-axi timesheet list --in <project>` to check",
        ]);
      }
      throw error;
    }
  }
  const schema: Schema = { id: (e) => e.id, date: (e) => e.date, hours: (e) => e.hours, person: (e) => e.person?.name, item: (e) => itemLabel(e) };

  if (!bool(parsed, "--confirm")) {
    return renderOutput([
      "delete: not applied (needs --confirm)",
      renderList("would_delete", entries, schema),
      renderHelp([`Run \`basecamp-axi timesheet delete ${ids.join(" ")} --confirm\` to delete permanently (entries cannot be restored)`]),
    ]);
  }

  const rows: Row[] = [];
  for (const e of entries) {
    await ts(["entry", "delete", String(e.ref), "--force"], { project: ctx?.project, account: ctx?.account });
    rows.push({ ...e, result: "deleted" });
  }
  return renderOutput([
    renderList("entries", rows, { ...schema, result: (e) => e.result }),
    renderHelp([`Run \`basecamp-axi timesheet create <item id> --hours <h>${projectFlag(ctx)}\` to log time again`]),
  ]);
}

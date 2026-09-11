import { bc, asList } from "../basecamp.js";
import { parseArgs, pickSub, str, int, type FlagSpec } from "../args.js";
import type { CliContext } from "../context.js";
import { countLine, names, renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { dueStatus } from "../text.js";
import { cleanTitle } from "./todo.js";

export const REPORT_HELP = `usage: basecamp-axi report <assigned|overdue> [flags]
Cross-project reports (no --in needed).
subcommands:
  assigned                          Open todos and cards assigned to a person (default me)
    --person <id|name|me>
    --limit <n>                     Default 50
  overdue                           Overdue todos across all projects, grouped by lateness
    --limit <n>                     Default 50
examples:
  basecamp-axi report assigned
  basecamp-axi report assigned --person "Jay Park"
  basecamp-axi report overdue
`;

const ASSIGNED_FLAGS: FlagSpec[] = [{ name: "--person", value: true }, { name: "--limit", alias: "-n", value: true }];
const OVERDUE_FLAGS: FlagSpec[] = [{ name: "--limit", alias: "-n", value: true }];

export const assignedSchema = {
  id: (t: Row) => t.id,
  title: (t: Row) => cleanTitle(t.title ?? t.content),
  type: (t: Row) => (String(t.type ?? "Todo").includes("Card") ? "card" : "todo"),
  project: (t: Row) => t.bucket?.name,
  project_id: (t: Row) => t.bucket?.id,
  due: (t: Row) => dueStatus(t.due_on),
};

export async function reportCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { sub, rest } = pickSub(args, ["assigned", "overdue"], "assigned", "report");
  if (sub === "overdue") return overdue(rest, ctx);
  return assigned(rest, ctx);
}

/** Fetch assigned items; shared with the home view. */
export async function fetchAssigned(person: string | undefined, ctx: CliContext | undefined): Promise<{ person: string; items: Row[] }> {
  const bcArgs = ["reports", "assigned"];
  if (person) bcArgs.push("--person", person);
  const result = await bc<Row>(bcArgs, { account: ctx?.account });
  const d = result.data ?? {};
  const items = asList<Row>(d.todos).filter((t) => !t.completed);
  items.sort((a, b) => String(a.due_on ?? "9999").localeCompare(String(b.due_on ?? "9999")));
  return { person: d.person?.name ?? person ?? "me", items };
}

async function assigned(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, ASSIGNED_FLAGS, { command: "report assigned" });
  const limit = int(parsed, "--limit", 50);
  const { person, items } = await fetchAssigned(str(parsed, "--person"), ctx);
  if (items.length === 0) return `assigned: 0 open items assigned to ${person}`;
  const shown = items.slice(0, limit);
  return renderOutput([
    `person: ${person}`,
    countLine({ count: shown.length, total: items.length, limit }),
    renderList("assigned", shown, assignedSchema),
    renderHelp([
      "Run `basecamp-axi todo view <id>` or `basecamp-axi card view <id> --in <project_id>` for details",
      "Run `basecamp-axi todo done <id>` to complete a todo",
    ]),
  ]);
}

async function overdue(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, OVERDUE_FLAGS, { command: "report overdue" });
  const limit = int(parsed, "--limit", 50);
  const result = await bc<Row>(["reports", "overdue"], { account: ctx?.account });
  const d = result.data ?? {};
  const buckets: Array<[string, string]> = [
    ["over_three_months_late", ">3mo"],
    ["over_a_month_late", ">1mo"],
    ["over_a_week_late", ">1w"],
    ["this_week", "<1w"],
    ["today", "today"],
  ];
  const items: Row[] = [];
  for (const [key, label] of buckets) for (const t of asList<Row>(d[key])) items.push({ ...t, late: label });
  for (const [key, value] of Object.entries(d)) {
    if (buckets.some(([k]) => k === key) || !Array.isArray(value)) continue;
    for (const t of value as Row[]) items.push({ ...t, late: key });
  }
  if (items.length === 0) return "overdue: 0 overdue todos across all projects";
  const shown = items.slice(0, limit);
  return renderOutput([
    countLine({ count: shown.length, total: items.length, limit }),
    renderList("overdue", shown, {
      id: (t) => t.id,
      title: (t) => cleanTitle(t.title ?? t.content),
      project: (t) => t.bucket?.name,
      due: (t) => t.due_on,
      late: (t) => t.late,
      assignees: (t) => names(t.assignees),
    }),
    renderHelp([
      "Run `basecamp-axi todo view <id>` for details",
      "Run `basecamp-axi todo done <id>` to complete, or `basecamp-axi todo assign <id> --to <person> --in <project>` to reassign",
    ]),
  ]);
}

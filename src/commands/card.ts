import { bc, asList } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, str, int, bool, type FlagSpec } from "../args.js";
import { projectFlag, type CliContext } from "../context.js";
import { AxiError } from "../errors.js";
import { countLine, names, renderDetail, renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { dueStatus, htmlToText, relativeTime, truncate } from "../text.js";
import { requireProject, cleanTitle } from "./todo.js";

export const CARD_HELP = `usage: basecamp-axi card <list|columns|view|create|update|move> [args] [flags]
Cards live on a project's card table (kanban). Pass --card-table <id> when a project has several.
subcommands:
  list                              Cards across all columns (or one column)
    --column <id|name>              Only one column (enables --limit)
    --limit <n>                     Default 50 (clips client-side across columns)
    --card-table <id>
  columns                           Columns with card counts
    --card-table <id>
  view <id|url>                     Card details with description preview
    --full
  create "<title>" --column <id>    Create a card
    --body <text>                   Card body (HTML or plain text)
    --to <person>                   Assignee
    --due <date>
    --card-table <id>
  update <id>                       Change title, body, assignee, or due date
    --title <text>  --body <text>  --to <person>  --due <date>
  move <id> --to <column id|name>   Move a card
    --position <n>                  1-indexed position in the column
    --on-hold                       Move to the column's on-hold section
    --card-table <id>               Required when --to is a column name
examples:
  basecamp-axi card list --in 44361766
  basecamp-axi card columns --in 44361766
  basecamp-axi card move 10247705680 --to "Done" --card-table 9407211666 --in 44361766
`;

const TABLE: FlagSpec = { name: "--card-table", value: true };
const LIST_FLAGS: FlagSpec[] = [{ name: "--column", alias: "-c", value: true }, { name: "--limit", alias: "-n", value: true }, TABLE];
const COLUMNS_FLAGS: FlagSpec[] = [TABLE];
const VIEW_FLAGS: FlagSpec[] = [{ name: "--full" }];
const CREATE_FLAGS: FlagSpec[] = [
  { name: "--column", alias: "-c", value: true },
  { name: "--body", value: true },
  { name: "--to", value: true },
  { name: "--due", alias: "-d", value: true },
  TABLE,
];
const UPDATE_FLAGS: FlagSpec[] = [
  { name: "--title", value: true },
  { name: "--body", value: true },
  { name: "--to", value: true },
  { name: "--due", alias: "-d", value: true },
];
const MOVE_FLAGS: FlagSpec[] = [{ name: "--to", value: true }, { name: "--position", value: true }, { name: "--on-hold" }, TABLE];

export const cardListSchema = {
  id: (c: Row) => c.id,
  title: (c: Row) => cleanTitle(c.title),
  column: (c: Row) => c.parent?.title,
  due: (c: Row) => dueStatus(c.due_on),
  assignees: (c: Row) => names(c.assignees),
};

/** Resolve a column given by name to its id (case-insensitive) so callers need not know --card-table. */
async function resolveColumn(value: string, parsed: ReturnType<typeof parseArgs>, ctx: CliContext | undefined, project: NonNullable<CliContext["project"]>): Promise<string> {
  if (/^\d+$/.test(value) || str(parsed, "--card-table")) return value;
  const result = await bc(["cards", "columns"], { project, account: ctx?.account });
  const cols = asList<Row>(result.data);
  const match = cols.filter((c) => String(c.title).toLowerCase() === value.toLowerCase());
  if (match.length === 1) return String(match[0]!.id);
  throw new AxiError(match.length ? `Column name "${value}" is ambiguous` : `Column "${value}" not found`, "NOT_FOUND", [
    `Columns: ${cols.map((c) => `${c.title} (${c.id})`).join(", ")}`,
  ]);
}

function tableArgs(parsed: ReturnType<typeof parseArgs>): string[] {
  const table = str(parsed, "--card-table");
  return table ? ["--card-table", table] : [];
}

export async function cardCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { sub, rest } = pickSub(args, ["list", "columns", "view", "create", "update", "move"], "list", "card");
  switch (sub) {
    case "columns":
      return columns(rest, ctx);
    case "view":
      return view(rest, ctx);
    case "create":
      return create(rest, ctx);
    case "update":
      return update(rest, ctx);
    case "move":
      return move(rest, ctx);
    default:
      return list(rest, ctx);
  }
}

async function list(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, LIST_FLAGS, { command: "card list" });
  const project = requireProject(ctx, "card list");
  const rawColumn = str(parsed, "--column");
  const column = rawColumn ? await resolveColumn(rawColumn, parsed, ctx, project) : undefined;
  const limit = int(parsed, "--limit", 50);
  const bcArgs = ["cards", "list", ...tableArgs(parsed)];
  if (column) bcArgs.push("--column", column, "--limit", String(limit));
  const result = await bc(bcArgs, { project, account: ctx?.account });
  // Without --column the CLI returns every column in full; clip client-side so a big board stays readable.
  const all = asList<Row>(result.data);
  const cards = column ? all : all.slice(0, limit);
  const total = column ? result.total : all.length;
  const pf = projectFlag(ctx);
  if (cards.length === 0) {
    return renderOutput([
      `cards: 0 active cards found${column ? ` in column ${column}` : ""} in project ${project.value}`,
      renderHelp([
        `Run \`basecamp-axi card columns${pf}\` to see columns`,
        `Run \`basecamp-axi card create "<title>" --column <id>${pf}\` to add a card`,
      ]),
    ]);
  }
  return renderOutput([
    countLine({ count: cards.length, total, limit }),
    renderList("cards", cards, cardListSchema),
    renderHelp([
      "Run `basecamp-axi card view <id>` for description and steps",
      `Run \`basecamp-axi card move <id> --to <column>${pf}\` to move a card`,
      `Run \`basecamp-axi comment create <id> "<text>"${pf}\` to comment`,
      ...(total && total > cards.length ? [`Run \`basecamp-axi card list --limit ${total}${pf}\` to see all ${total}, or \`basecamp-axi card columns${pf}\` to browse by column`] : []),
    ]),
  ]);
}

async function columns(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, COLUMNS_FLAGS, { command: "card columns" });
  const project = requireProject(ctx, "card columns");
  const result = await bc(["cards", "columns", ...tableArgs(parsed)], { project, account: ctx?.account });
  const cols = asList<Row>(result.data);
  if (cols.length === 0) return `columns: 0 columns found in project ${project.value}`;
  return renderOutput([
    renderList("columns", cols, {
      id: (c) => c.id,
      title: (c) => c.title,
      cards: (c) => c.cards_count ?? 0,
      color: (c) => c.color,
    }),
    renderHelp([
      `Run \`basecamp-axi card list --column <id>${projectFlag(ctx)}\` to see a column's cards`,
      `Run \`basecamp-axi card create "<title>" --column <id>${projectFlag(ctx)}\` to add a card`,
    ]),
  ]);
}

async function view(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, VIEW_FLAGS, { command: "card view", maxPositionals: 1 });
  const id = requirePositional(parsed, 0, "id|url", "basecamp-axi card view <id|url> --in <project>");
  const project = requireProject(ctx, "card view");
  const result = await bc<Row>(["cards", "show", id], { project, account: ctx?.account });
  const c = result.data;
  const content = htmlToText(c.content ?? c.description);
  const body = bool(parsed, "--full") ? { text: content, truncated: false } : truncate(content, 1000);
  const steps = Array.isArray(c.steps) ? (c.steps as Row[]) : [];
  const stepsDone = steps.filter((s) => s.completed).length;
  return renderOutput([
    renderDetail("card", c, {
      id: (x) => x.id,
      title: (x) => x.title,
      column: (x) => x.parent?.title,
      status: (x) => (x.completed ? "done" : "open"),
      due: (x) => dueStatus(x.due_on),
      assignees: (x) => names(x.assignees),
      steps: () => (steps.length ? `${stepsDone}/${steps.length} done` : "none"),
      comments: (x) => x.comments_count ?? 0,
      creator: (x) => x.creator?.name,
      updated: (x) => relativeTime(x.updated_at),
      url: (x) => x.app_url,
      description: () => body.text || "none",
    }),
    renderHelp([
      ...(body.truncated ? [`Run \`basecamp-axi card view ${c.id} --full${projectFlag(ctx)}\` for the complete description`] : []),
      ...((c.comments_count ?? 0) > 0 ? [`Run \`basecamp-axi comment list ${c.id}${projectFlag(ctx)}\` to read comments`] : []),
      `Run \`basecamp-axi card move ${c.id} --to <column>${projectFlag(ctx)}\` to move it`,
    ]),
  ]);
}

async function create(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, CREATE_FLAGS, { command: "card create", maxPositionals: 1 });
  const project = requireProject(ctx, "card create");
  const title = requirePositional(parsed, 0, "title", 'basecamp-axi card create "<title>" --column <id> --in <project>');
  const rawColumn = str(parsed, "--column");
  const column = rawColumn ? await resolveColumn(rawColumn, parsed, ctx, project) : undefined;
  if (!column) throw new AxiError("--column is required", "VALIDATION_ERROR", [`Run \`basecamp-axi card columns${projectFlag(ctx)}\` to find column ids`]);
  const bcArgs = ["card", title];
  const body = str(parsed, "--body");
  if (body) bcArgs.push(body);
  bcArgs.push("--column", column, ...tableArgs(parsed));
  const result = await bc<Row>(bcArgs, { project, account: ctx?.account });
  let c: Row = result.data ?? {};
  // The create endpoint takes only title/body/column; assignee and due date are a follow-up update.
  const to = str(parsed, "--to");
  const due = str(parsed, "--due");
  if ((to || due) && c.id) {
    const updateArgs = ["cards", "update", String(c.id)];
    if (to) updateArgs.push("--assignee", to);
    if (due) updateArgs.push("--due", due);
    const updated = await bc<Row>(updateArgs, { project, account: ctx?.account });
    c = { ...c, ...(updated.data ?? {}) };
  }
  return renderOutput([
    renderDetail("created", c, {
      id: (x) => x.id,
      title: (x) => x.title ?? title,
      column: (x) => x.parent?.title,
      due: (x) => dueStatus(x.due_on),
      assignees: (x) => names(x.assignees),
      url: (x) => x.app_url,
    }),
    renderHelp(c.id ? [`Run \`basecamp-axi card view ${c.id}${projectFlag(ctx)}\` to confirm`] : []),
  ]);
}

async function update(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, UPDATE_FLAGS, { command: "card update", maxPositionals: 1 });
  const project = requireProject(ctx, "card update");
  const id = requirePositional(parsed, 0, "id", "basecamp-axi card update <id> [--title ...] [--body ...] [--to ...] [--due ...] --in <project>");
  const bcArgs = ["cards", "update", id];
  const title = str(parsed, "--title");
  const body = str(parsed, "--body");
  const to = str(parsed, "--to");
  const due = str(parsed, "--due");
  if (title) bcArgs.push("--title", title);
  if (body) bcArgs.push("--body", body);
  if (to) bcArgs.push("--assignee", to);
  if (due) bcArgs.push("--due", due);
  if (bcArgs.length === 3) throw new AxiError("Nothing to update", "VALIDATION_ERROR", ["Pass at least one of --title, --body, --to, --due"]);
  // The basecamp CLI re-sends the whole card on update and drops the due date when --due is
  // omitted, so carry the current value forward unless the caller is changing it.
  if (!due) {
    const current = await bc<Row>(["cards", "show", id], { project, account: ctx?.account }).catch(() => undefined);
    if (current?.data.due_on) bcArgs.push("--due", String(current.data.due_on));
  }
  const result = await bc<Row>(bcArgs, { project, account: ctx?.account });
  return renderDetail("updated", result.data ?? { id }, {
    id: (x) => x.id,
    title: (x) => x.title,
    due: (x) => dueStatus(x.due_on),
    assignees: (x) => names(x.assignees),
  });
}

async function move(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, MOVE_FLAGS, { command: "card move", maxPositionals: 1 });
  const project = requireProject(ctx, "card move");
  const id = requirePositional(parsed, 0, "id", "basecamp-axi card move <id> --to <column> --in <project>");
  const rawTo = str(parsed, "--to");
  const to = rawTo ? await resolveColumn(rawTo, parsed, ctx, project) : undefined;
  const onHold = bool(parsed, "--on-hold");
  if (!to && !onHold) throw new AxiError("--to <column> or --on-hold is required", "VALIDATION_ERROR", [`Run \`basecamp-axi card columns${projectFlag(ctx)}\` to find columns`]);
  const bcArgs = ["cards", "move", id, ...tableArgs(parsed)];
  if (to) bcArgs.push("--to", to);
  if (onHold) bcArgs.push("--on-hold");
  const position = str(parsed, "--position");
  if (position) bcArgs.push("--position", position);
  await bc(bcArgs, { project, account: ctx?.account });
  const after = await bc<Row>(["cards", "show", id], { project, account: ctx?.account }).catch(() => undefined);
  return renderOutput([
    renderDetail("moved", after?.data ?? { id }, {
      id: (x) => x.id,
      title: (x) => x.title,
      column: (x) => x.parent?.title ?? rawTo,
      on_hold: () => (onHold ? "yes" : "no"),
    }),
  ]);
}

/**
 * Sandbox project for the write suite.
 *
 * Every write lands in one dedicated project, found by exact name or created
 * when missing. Before each task the project is emptied and seeded; after a
 * matrix it is emptied again. All calls go through the raw `basecamp` CLI with
 * the configured profile and account, and every mutation is checked against
 * the sandbox project id first, so nothing outside it can be touched.
 */

import { execFileSync, spawnSync } from "node:child_process";
import type { SandboxDef, SeedSpec } from "./types.ts";

export interface Sandbox {
  def: SandboxDef;
  projectId: string;
  cardTableId: string;
  /** Extra card tables from sandbox.yaml, title → id. */
  cardTables?: Map<string, string>;
  campfireId: string;
  /** Email of the authenticated person; "me" in prompts. */
  meEmail: string;
}

// Normalised shapes the write grader reads. Kept flat so checks can be unit-tested.
export interface TodoItem { id: string; title: string; completed: boolean; assignees: string[]; due_on: string | null }
export interface RecordingState { id: string; status: string; completed: boolean; updated_at: string }
export interface SubtaskItem { id: string; title: string; completed: boolean }
/** `text` is the comment's raw HTML, so checks can see lists and attachments. */
export interface CommentItem { id: string; text: string }
export interface CardItem { id: string; title: string; column: string; body: string }
export interface CheckinAnswerItem { id: string; question: string; text: string; creator: string; date: string }
export interface MessageItem { id: string; title: string; body: string }
export interface UploadItem { id: string; filename: string }
export interface TimesheetItem { id: string; hours: string; date: string; description: string; item_id: string; item_title: string }
export interface HillDot { id: string; label: string; position: number }
export interface HillUpdateItem { id: string; note: string; dots: HillDot[] }

export interface BasecampReader {
  meEmail(): string;
  todolists(): { id: string; name: string }[];
  todos(listId: string): TodoItem[];
  recording(id: string): RecordingState;
  subtasks(todoId: string): SubtaskItem[];
  comments(recordingId: string): CommentItem[];
  /** Cards on one table: the default table when `table` is omitted or "default", else an extra table by title. */
  cards(table?: string): CardItem[];
  checkinAnswers(): CheckinAnswerItem[];
  messages(): MessageItem[];
  chatLines(): CommentItem[];
  uploads(): UploadItem[];
  timesheetEntries(): TimesheetItem[];
  hillDots(): HillDot[];
  hillUpdates(): HillUpdateItem[];
}

type Json = Record<string, any>;

export function sandboxEnv(def: SandboxDef): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BASECAMP_PROFILE: process.env.BENCH_BASECAMP_PROFILE ?? def.profile,
    BASECAMP_ACCOUNT_ID: process.env.BENCH_BASECAMP_ACCOUNT ?? def.account_id,
    NO_COLOR: "1",
  };
}

/** Run `basecamp <args> --json` with the sandbox credentials and return `data`. Throws on a failed envelope. */
function bc(def: SandboxDef, args: string[]): any {
  const res = spawnSync("basecamp", [...args, "--json"], {
    encoding: "utf-8",
    env: sandboxEnv(def),
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60 * 1000,
  });
  let envelope: Json | undefined;
  try {
    envelope = JSON.parse(res.stdout.trim()) as Json;
  } catch {
    envelope = undefined;
  }
  if (!envelope || envelope.ok !== true) {
    const why = envelope?.error ?? (res.stderr || res.stdout).split("\n")[0];
    throw new Error(`basecamp ${args.slice(0, 2).join(" ")} failed: ${why}`);
  }
  return envelope.data;
}

const list = (data: unknown): Json[] => (Array.isArray(data) ? (data as Json[]) : []);
const toDot = (d: Json): HillDot => ({ id: String(d.id), label: String(d.label ?? ""), position: Number(d.position ?? 0) });

/** Find the sandbox project by exact name (creating it when absent) and make sure its tools are ready. */
export function openSandbox(def: SandboxDef, opts: { create: boolean }): Sandbox {
  const projects = list(bc(def, ["projects", "list", "--limit", "500"]));
  const matches = projects.filter((p) => p.name === def.project_name);
  if (matches.length > 1) {
    throw new Error(`More than one project is named "${def.project_name}"; refusing to guess which is the sandbox.`);
  }
  let project = matches[0];
  if (!project) {
    if (!opts.create) throw new Error(`No project named "${def.project_name}" in account ${def.account_id}.`);
    console.log(`Creating sandbox project "${def.project_name}" in account ${def.account_id}...`);
    project = bc(def, [
      "projects", "create", def.project_name,
      "--description", "Throwaway sandbox for the basecamp-axi write benchmark. Emptied after every run.",
    ]) as Json;
  }
  const projectId = String(project.id);

  const shown = bc(def, ["projects", "show", projectId, "--all"]) as Json;
  const dock = list(shown.dock);
  const tool = (name: string): Json => {
    const t = dock.find((d) => d.name === name);
    if (!t) throw new Error(`Sandbox project has no ${name} tool.`);
    if (!t.enabled) bc(def, ["tools", "enable", String(t.id), "--in", projectId]);
    return t;
  };
  const extraNames = new Set((def.card_tables ?? []).map((t) => t.name));
  const boards = dock.filter((d) => d.name === "kanban_board");
  const mainBoards = boards.filter((d) => !extraNames.has(String(d.title)));
  const defaultBoard = mainBoards.find((d) => d.enabled) ?? mainBoards[0];
  if (!defaultBoard) throw new Error("Sandbox project has no kanban_board tool.");
  if (!defaultBoard.enabled) bc(def, ["tools", "enable", String(defaultBoard.id), "--in", projectId]);
  const cardTableId = String(defaultBoard.id);
  const campfireId = String(tool("chat").id);
  tool("todoset");
  tool("message_board");
  tool("vault");
  tool("questionnaire");

  const ensureColumns = (tableId: string, wanted: string[]): void => {
    const columns = list(bc(def, ["cards", "columns", "--in", projectId, "--card-table", tableId]));
    for (const want of wanted) {
      if (!columns.some((c) => c.title === want)) {
        bc(def, ["cards", "column", "create", want, "--in", projectId, "--card-table", tableId]);
      }
    }
  };
  ensureColumns(cardTableId, def.columns);

  // Extra card tables stay in the project between runs: Basecamp keeps a removed table in the dock
  // for days, and the basecamp CLI counts it, so creating one per task would leak into later tasks.
  const cardTables = new Map<string, string>();
  for (const extra of def.card_tables ?? []) {
    const live = boards.find((d) => d.title === extra.name && d.enabled);
    const id = live
      ? String(live.id)
      : String((bc(def, ["tools", "create", extra.name, "--type", "kanban_board", "--in", projectId]) as Json).id);
    ensureColumns(id, extra.columns);
    cardTables.set(extra.name, id);
  }

  const me = bc(def, ["me"]) as Json;
  return { def, projectId, cardTableId, cardTables, campfireId, meEmail: String(me.identity?.email_address ?? "") };
}

/** Card table id by title; omitted or "default" is the project's main table. */
export function cardTableId(sb: Sandbox, table?: string): string {
  if (!table || table === "default") return sb.cardTableId;
  const id = sb.cardTables?.get(table);
  if (!id) throw new Error(`No card table "${table}" in the sandbox; add it to card_tables in sandbox.yaml.`);
  return id;
}

function inProject(sb: Sandbox, rec: Json): boolean {
  const bucket = rec.bucket?.id ?? rec.project?.id;
  return bucket === undefined || String(bucket) === sb.projectId;
}

function guard(sb: Sandbox, rec: Json): void {
  if (!inProject(sb, rec)) {
    throw new Error(`Refusing to modify recording ${rec.id}: it is outside sandbox project ${sb.projectId}.`);
  }
}

/** Read that fails with `pattern` (a feature the account lacks, an untouched hill chart) reads as empty. */
function orEmpty(read: () => unknown, pattern: RegExp): Json[] {
  try {
    return list(read());
  } catch (err) {
    if (pattern.test((err as Error).message)) return [];
    throw err;
  }
}

/** Timesheet listings fail with "access denied" when the account has Timesheet turned off. */
const NO_TIMESHEET = /access denied/i;
/** An untouched hill may read as missing or disabled. */
const NO_HILL = /not found|no todolists to track on the hill chart/i;
/** A project whose Check-ins tool is off has no questionnaire to list. */
const NO_CHECKINS = /questionnaire not found/i;

/**
 * Delete every timesheet entry and trash every hill chart progress update, then trash every to-do
 * list, to-do, message, card, document and upload, and delete every chat line. Entries go first
 * because they hang off to-dos, and trashing the to-do lists also takes them off the hill chart.
 */
export function resetSandbox(sb: Sandbox): number {
  const { def, projectId: p } = sb;
  let removed = 0;
  for (const entry of orEmpty(() => bc(def, ["timesheet", "project", "--in", p]), NO_TIMESHEET)) {
    guard(sb, entry);
    bc(def, ["timesheet", "entry", "delete", String(entry.id), "--force"]);
    removed++;
  }
  for (const update of orEmpty(() => bc(def, ["hillcharts", "updates", "--in", p, "--all"]), NO_HILL)) {
    guard(sb, update);
    bc(def, ["recordings", "trash", String(update.id), "--in", p]);
    removed++;
  }
  for (const tl of list(bc(def, ["todolists", "list", "--in", p, "--all"]))) {
    guard(sb, tl);
    bc(def, ["todolists", "trash", String(tl.id), "--in", p]);
    removed++;
  }
  // Trashing a check-in question takes its answers with it.
  for (const q of orEmpty(() => bc(def, ["checkins", "questions", "--in", p]), NO_CHECKINS)) {
    guard(sb, q);
    bc(def, ["recordings", "trash", String(q.id), "--in", p]);
    removed++;
  }
  for (const type of ["todos", "messages", "cards", "documents", "uploads"]) {
    for (const rec of list(bc(def, ["recordings", "list", type, "--in", p, "--all"]))) {
      guard(sb, rec);
      bc(def, ["recordings", "trash", String(rec.id), "--in", p]);
      removed++;
    }
  }
  for (const line of list(bc(def, ["chat", "messages", "--in", p, "--room", sb.campfireId, "--limit", "200"]))) {
    guard(sb, line);
    bc(def, ["chat", "delete", String(line.id), "--in", p, "--room", sb.campfireId, "--force"]);
    removed++;
  }
  return removed;
}

/**
 * Create the task's starting content. Returns ids keyed by title (for probes and later seed steps)
 * and by "List/Title" for to-dos, plus each to-do's web link under "url:List/Title" for prompt templates.
 */
export function seedSandbox(sb: Sandbox, seed: SeedSpec | undefined): Map<string, string> {
  const ids = new Map<string, string>();
  if (!seed) return ids;
  const { def, projectId: p } = sb;
  for (const tl of seed.todolists ?? []) {
    const created = bc(def, ["todolists", "create", tl.name, "--in", p]) as Json;
    ids.set(tl.name, String(created.id));
    const toTrash: string[] = [];
    for (const entry of tl.todos ?? []) {
      const t = typeof entry === "string" ? { title: entry } : entry;
      const todo = bc(def, ["todos", "create", t.title, "--list", String(created.id), "--in", p]) as Json;
      const id = String(todo.id);
      ids.set(t.title, id);
      ids.set(`${tl.name}/${t.title}`, id);
      ids.set(`url:${tl.name}/${t.title}`, String(todo.app_url ?? ""));
      for (const text of t.subtasks ?? []) bc(def, ["subtasks", "create", id, text]);
      for (const text of t.comments ?? []) bc(def, ["comments", "create", id, text, "--in", p]);
      if (t.trashed) toTrash.push(id);
    }
    for (const id of toTrash) bc(def, ["todos", "trash", id, "--in", p]);
  }
  for (const card of seed.cards ?? []) {
    const created = bc(def, [
      "cards", "create", card.title, "--column", card.column, "--card-table", sb.cardTableId, "--in", p,
    ]) as Json;
    ids.set(card.title, String(created.id));
  }
  for (const table of seed.card_tables ?? []) {
    const tableId = cardTableId(sb, table.name);
    for (const card of table.cards) {
      const created = bc(def, [
        "cards", "create", card.title, "--column", card.column, "--card-table", tableId, "--in", p,
      ]) as Json;
      ids.set(`${table.name}/${card.title}`, String(created.id));
    }
  }
  for (const checkin of seed.checkins ?? []) {
    const created = bc(def, ["checkins", "question", "create", checkin.question, "--in", p]) as Json;
    ids.set(checkin.question, String(created.id));
  }
  for (const msg of seed.messages ?? []) {
    const args = ["messages", "create", msg.title];
    if (msg.body) args.push(msg.body);
    const created = bc(def, [...args, "--in", p, "--no-subscribe"]) as Json;
    ids.set(msg.title, String(created.id));
  }
  for (const entry of seed.timesheet ?? []) {
    const todoId = ids.get(entry.todo);
    if (!todoId) throw new Error(`Timesheet seed names to-do "${entry.todo}", which the seed does not create.`);
    const args = ["timesheet", "entry", "create", todoId, "--hours", entry.hours];
    if (entry.description) args.push("--description", entry.description);
    const created = bc(def, [...args, "--in", p]) as Json;
    ids.set(`timesheet:${entry.todo}`, String(created.id));
  }
  if (seed.hill?.length) {
    const listIds = seed.hill.map((name) => {
      const id = ids.get(name);
      if (!id) throw new Error(`Hill seed names to-do list "${name}", which the seed does not create.`);
      return id;
    });
    bc(def, ["hillcharts", "track", listIds.join(","), "--in", p]);
  }
  return ids;
}

function readRecordingState(sb: Sandbox, id: string): RecordingState {
  const rec = bc(sb.def, ["show", id, "--in", sb.projectId]) as Json;
  guard(sb, rec);
  return {
    id: String(rec.id),
    status: String(rec.status ?? "unknown"),
    completed: Boolean(rec.completed),
    updated_at: String(rec.updated_at ?? ""),
  };
}

/** Live reader over the sandbox project, used by the write grader. */
export function sandboxReader(sb: Sandbox): BasecampReader {
  const { def, projectId: p } = sb;
  const toTodo = (t: Json): TodoItem => ({
    id: String(t.id),
    title: String(t.content ?? t.title ?? ""),
    completed: Boolean(t.completed),
    assignees: list(t.assignees).map((a) => String(a.email_address ?? a.name ?? "")),
    due_on: t.due_on ?? null,
  });
  return {
    meEmail: () => sb.meEmail,
    todolists: () =>
      list(bc(def, ["todolists", "list", "--in", p, "--all"])).filter((tl) => inProject(sb, tl))
        .map((tl) => ({ id: String(tl.id), name: String(tl.name ?? tl.title ?? "") })),
    todos: (listId) => [
      ...list(bc(def, ["todos", "list", "--list", listId, "--in", p, "--all"])),
      ...list(bc(def, ["todos", "list", "--list", listId, "--in", p, "--all", "--completed"])),
    ].map(toTodo),
    recording: (id) => readRecordingState(sb, id),
    subtasks: (todoId) =>
      list(bc(def, ["subtasks", "list", todoId, "--all"])).map((s) => ({
        id: String(s.id),
        title: String(s.title ?? s.content ?? ""),
        completed: Boolean(s.completed),
      })),
    comments: (recordingId) =>
      list(bc(def, ["comments", "list", recordingId, "--in", p, "--all"])).map((c) => ({
        id: String(c.id),
        text: String(c.content ?? ""),
      })),
    cards: (table) =>
      list(bc(def, ["cards", "list", "--in", p, "--card-table", cardTableId(sb, table), "--all"])).map((c) => ({
        id: String(c.id),
        title: String(c.title ?? ""),
        column: String(c.parent?.title ?? ""),
        body: String(c.content ?? c.description ?? ""),
      })),
    checkinAnswers: () =>
      orEmpty(() => bc(def, ["checkins", "questions", "--in", p]), NO_CHECKINS).filter((q) => inProject(sb, q)).flatMap((q) =>
        list(bc(def, ["checkins", "answers", String(q.id), "--in", p, "--all"])).map((a) => ({
          id: String(a.id),
          question: String(q.title ?? ""),
          text: String(a.content ?? ""),
          creator: String(a.creator?.email_address ?? ""),
          date: String(a.group_on ?? ""),
        }))),
    messages: () =>
      list(bc(def, ["messages", "list", "--in", p, "--all"])).map((m) => ({
        id: String(m.id),
        title: String(m.subject ?? m.title ?? ""),
        body: String(m.content ?? ""),
      })),
    chatLines: () =>
      list(bc(def, ["chat", "messages", "--in", p, "--room", sb.campfireId, "--limit", "200"])).map((l) => ({
        id: String(l.id),
        text: String(l.content ?? ""),
      })),
    uploads: () =>
      list(bc(def, ["uploads", "list", "--in", p, "--all"])).map((u) => ({
        id: String(u.id),
        filename: String(u.filename ?? u.title ?? ""),
      })),
    timesheetEntries: () =>
      list(bc(def, ["timesheet", "project", "--in", p])).filter((e) => inProject(sb, e)).map((e) => ({
        id: String(e.id),
        hours: String(e.hours ?? ""),
        date: String(e.date ?? ""),
        description: String(e.description ?? ""),
        item_id: String(e.parent?.id ?? ""),
        item_title: String(e.parent?.title ?? ""),
      })),
    hillDots: () => orEmpty(() => (bc(def, ["hillcharts", "show", "--in", p]) as Json)?.dots, NO_HILL).map(toDot),
    hillUpdates: () =>
      orEmpty(() => bc(def, ["hillcharts", "updates", "--in", p, "--all"]), NO_HILL).filter((u) => inProject(sb, u)).map((u) => ({
        id: String(u.id),
        note: String(u.description ?? ""),
        dots: list(u.dots).map(toDot),
      })),
  };
}

/** Status of one recording ("active", "trashed", ...), read straight from the API. */
export function recordingStatus(sb: Sandbox, id: string): string {
  return readRecordingState(sb, id).status;
}

/** Run a probe command with the sandbox credentials; never through a shell. */
export function runProbeCommand(sb: Sandbox, argv: string[], env: NodeJS.ProcessEnv): { exitCode: number; output: string } {
  try {
    const out = execFileSync(argv[0], argv.slice(1), { encoding: "utf-8", env, timeout: 60 * 1000, stdio: ["pipe", "pipe", "pipe"] });
    return { exitCode: 0, output: out };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { exitCode: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

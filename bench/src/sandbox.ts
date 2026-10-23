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
  campfireId: string;
  /** Email of the authenticated person; "me" in prompts. */
  meEmail: string;
}

// Normalised shapes the write grader reads. Kept flat so checks can be unit-tested.
export interface TodoItem { id: string; title: string; completed: boolean; assignees: string[]; due_on: string | null }
export interface SubtaskItem { id: string; title: string; completed: boolean }
export interface CommentItem { id: string; text: string }
export interface CardItem { id: string; title: string; column: string }
export interface MessageItem { id: string; title: string; body: string }
export interface UploadItem { id: string; filename: string }

export interface BasecampReader {
  meEmail(): string;
  todolists(): { id: string; name: string }[];
  todos(listId: string): TodoItem[];
  subtasks(todoId: string): SubtaskItem[];
  comments(recordingId: string): CommentItem[];
  cards(): CardItem[];
  messages(): MessageItem[];
  chatLines(): CommentItem[];
  uploads(): UploadItem[];
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
  const cardTableId = String(tool("kanban_board").id);
  const campfireId = String(tool("chat").id);
  tool("todoset");
  tool("message_board");
  tool("vault");

  const columns = list(bc(def, ["cards", "columns", "--in", projectId, "--card-table", cardTableId]));
  for (const want of def.columns) {
    if (!columns.some((c) => c.title === want)) {
      bc(def, ["cards", "column", "create", want, "--in", projectId, "--card-table", cardTableId]);
    }
  }

  const me = bc(def, ["me"]) as Json;
  return { def, projectId, cardTableId, campfireId, meEmail: String(me.identity?.email_address ?? "") };
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

/** Trash every to-do list, to-do, message, card, document and upload, and delete every chat line. */
export function resetSandbox(sb: Sandbox): number {
  const { def, projectId: p } = sb;
  let removed = 0;
  for (const tl of list(bc(def, ["todolists", "list", "--in", p, "--all"]))) {
    guard(sb, tl);
    bc(def, ["todolists", "trash", String(tl.id), "--in", p]);
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

/** Create the task's starting content. Returns ids by title for probes. */
export function seedSandbox(sb: Sandbox, seed: SeedSpec | undefined): Map<string, string> {
  const ids = new Map<string, string>();
  if (!seed) return ids;
  const { def, projectId: p } = sb;
  for (const tl of seed.todolists ?? []) {
    const created = bc(def, ["todolists", "create", tl.name, "--in", p]) as Json;
    ids.set(tl.name, String(created.id));
    for (const title of tl.todos ?? []) {
      const todo = bc(def, ["todos", "create", title, "--list", String(created.id), "--in", p]) as Json;
      ids.set(title, String(todo.id));
    }
  }
  for (const card of seed.cards ?? []) {
    const created = bc(def, [
      "cards", "create", card.title, "--column", card.column, "--card-table", sb.cardTableId, "--in", p,
    ]) as Json;
    ids.set(card.title, String(created.id));
  }
  for (const msg of seed.messages ?? []) {
    const args = ["messages", "create", msg.title];
    if (msg.body) args.push(msg.body);
    const created = bc(def, [...args, "--in", p, "--no-subscribe"]) as Json;
    ids.set(msg.title, String(created.id));
  }
  return ids;
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
    cards: () =>
      list(bc(def, ["cards", "list", "--in", p, "--card-table", sb.cardTableId, "--all"])).map((c) => ({
        id: String(c.id),
        title: String(c.title ?? c.content ?? ""),
        column: String(c.parent?.title ?? ""),
      })),
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
  };
}

/** Status of one recording ("active", "trashed", ...), read straight from the API. */
export function recordingStatus(sb: Sandbox, id: string): string {
  const rec = bc(sb.def, ["show", id, "--in", sb.projectId]) as Json;
  guard(sb, rec);
  return String(rec.status ?? "unknown");
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

/**
 * State-based grading for the write suite.
 *
 * Each write task names a check in tasks.yaml. The check reads the sandbox
 * project back through a BasecampReader and passes only when Basecamp holds
 * exactly the expected result; what the agent says it did is never consulted.
 * Creation checks require exactly one match, so a duplicate is a failure.
 */

import type { GradeResult, GradingSpec } from "./types.ts";
import type { BasecampReader, TodoItem } from "./sandbox.ts";

type Params = Record<string, unknown>;
type Check = (r: BasecampReader, p: Params) => GradeResult;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " ", "#39": "'", apos: "'" };

/** Lowercase, strip HTML tags and entities, unify quotes, collapse whitespace, drop trailing punctuation. */
export function norm(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!]+$/, "")
    .toLowerCase();
}

const pass = (details: string): GradeResult => ({ task_success: true, details });
const fail = (details: string): GradeResult => ({ task_success: false, details });
const str = (p: Params, key: string): string => String(p[key] ?? "");
const strs = (p: Params, key: string): string[] => (Array.isArray(p[key]) ? (p[key] as unknown[]).map(String) : []);
const quoted = (items: string[]): string => items.map((s) => `"${s}"`).join(", ");

/** Find the single to-do titled `title` in the list named `listName`, or explain why not. */
function findTodo(r: BasecampReader, listName: string, title: string): TodoItem | GradeResult {
  const lists = r.todolists().filter((l) => norm(l.name) === norm(listName));
  if (lists.length !== 1) return fail(`Expected one to-do list "${listName}", found ${lists.length}.`);
  const todos = r.todos(lists[0].id).filter((t) => norm(t.title) === norm(title));
  if (todos.length !== 1) return fail(`Expected one to-do "${title}" in "${listName}", found ${todos.length}.`);
  return todos[0];
}

const isGrade = (x: unknown): x is GradeResult => typeof x === "object" && x !== null && "task_success" in x;

function sameSet(actual: string[], expected: string[]): boolean {
  const a = actual.map(norm).sort();
  const e = expected.map(norm).sort();
  return a.length === e.length && a.every((v, i) => v === e[i]);
}

function exactlyOneContaining(texts: string[], needle: string, where: string): GradeResult {
  const hits = texts.filter((t) => norm(t).includes(norm(needle)));
  if (hits.length === 1) return pass(`Found "${needle}" ${where}.`);
  return fail(`Expected exactly one entry containing "${needle}" ${where}, found ${hits.length}.`);
}

/** Hours as minutes: "1.5", "2.0" and "1:30" all compare by value. */
export function minutes(hours: unknown): number | undefined {
  const s = String(hours ?? "").trim();
  const hm = /^(\d+):([0-5]?\d)$/.exec(s);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  return /^\d*\.?\d+$/.test(s) ? Math.round(Number(s) * 60) : undefined;
}

/** Positions by to-do list name, e.g. { Design: 60, Build: 0 }. */
function dotPositions(p: Params): [string, number][] {
  const dots = p.dots && typeof p.dots === "object" ? (p.dots as Record<string, unknown>) : {};
  return Object.entries(dots).map(([name, pos]) => [name, Number(pos)]);
}

export const CHECKS: Record<string, Check> = {
  /** A to-do exists once in a list, optionally assigned to me and due on a date. */
  todo_created(r, p) {
    const todo = findTodo(r, str(p, "list"), str(p, "title"));
    if (isGrade(todo)) return todo;
    if (p.assignee === "me" && !todo.assignees.some((a) => norm(a) === norm(r.meEmail()))) {
      return fail(`"${todo.title}" is not assigned to me (assignees: ${todo.assignees.join(", ") || "none"}).`);
    }
    if (p.due_on && todo.due_on !== p.due_on) {
      return fail(`"${todo.title}" is due ${todo.due_on ?? "never"}, expected ${String(p.due_on)}.`);
    }
    if (todo.completed) return fail(`"${todo.title}" was created already completed.`);
    return pass(`"${todo.title}" exists once with the expected fields.`);
  },

  /** A to-do exists once with exactly the given subtasks. */
  todo_with_subtasks(r, p) {
    const todo = findTodo(r, str(p, "list"), str(p, "title"));
    if (isGrade(todo)) return todo;
    const subtasks = r.subtasks(todo.id).map((s) => s.title);
    const expected = strs(p, "subtasks");
    if (!sameSet(subtasks, expected)) {
      return fail(`Subtasks are [${quoted(subtasks)}], expected [${quoted(expected)}].`);
    }
    return pass(`"${todo.title}" has subtasks ${quoted(expected)}.`);
  },

  /** One to-do is completed and the listed siblings are still open. */
  todo_completed(r, p) {
    const todo = findTodo(r, str(p, "list"), str(p, "title"));
    if (isGrade(todo)) return todo;
    if (!todo.completed) return fail(`"${todo.title}" is still open.`);
    for (const other of strs(p, "still_open")) {
      const sibling = findTodo(r, str(p, "list"), other);
      if (isGrade(sibling)) return sibling;
      if (sibling.completed) return fail(`"${other}" was completed too; only "${todo.title}" should be.`);
    }
    return pass(`"${todo.title}" is completed and the rest are untouched.`);
  },

  /** One comment containing the text sits on the named to-do. */
  todo_comment(r, p) {
    const todo = findTodo(r, str(p, "list"), str(p, "title"));
    if (isGrade(todo)) return todo;
    return exactlyOneContaining(r.comments(todo.id).map((c) => c.text), str(p, "contains"), `on to-do "${todo.title}"`);
  },

  /** One card with the title sits in the named column. */
  card_in_column(r, p) {
    const cards = r.cards().filter((c) => norm(c.title) === norm(str(p, "title")));
    if (cards.length !== 1) return fail(`Expected one card "${str(p, "title")}", found ${cards.length}.`);
    if (norm(cards[0].column) !== norm(str(p, "column"))) {
      return fail(`Card "${cards[0].title}" is in "${cards[0].column}", expected "${str(p, "column")}".`);
    }
    return pass(`Card "${cards[0].title}" is in "${cards[0].column}".`);
  },

  /** One message with the title whose body contains the text. */
  message_posted(r, p) {
    const msgs = r.messages().filter((m) => norm(m.title) === norm(str(p, "title")));
    if (msgs.length !== 1) return fail(`Expected one message "${str(p, "title")}", found ${msgs.length}.`);
    if (!norm(msgs[0].body).includes(norm(str(p, "body_contains")))) {
      return fail(`Message body does not contain "${str(p, "body_contains")}".`);
    }
    return pass(`Message "${msgs[0].title}" posted with the expected body.`);
  },

  /** One comment containing the text sits on the named message. */
  message_comment(r, p) {
    const msgs = r.messages().filter((m) => norm(m.title) === norm(str(p, "title")));
    if (msgs.length !== 1) return fail(`Expected one message "${str(p, "title")}", found ${msgs.length}.`);
    return exactlyOneContaining(r.comments(msgs[0].id).map((c) => c.text), str(p, "contains"), `on message "${msgs[0].title}"`);
  },

  /** One chat line containing the text. */
  chat_line(r, p) {
    return exactlyOneContaining(r.chatLines().map((l) => l.text), str(p, "contains"), "in the project chat");
  },

  /** One upload with the filename in Docs & Files. */
  upload_exists(r, p) {
    const hits = r.uploads().filter((u) => norm(u.filename) === norm(str(p, "filename")));
    if (hits.length === 1) return pass(`Upload "${str(p, "filename")}" exists.`);
    return fail(`Expected one upload "${str(p, "filename")}", found ${hits.length}.`);
  },

  /** Exactly one timesheet entry sits on the named to-do, with the given hours and description text. */
  timesheet_logged(r, p) {
    const todo = findTodo(r, str(p, "list"), str(p, "title"));
    if (isGrade(todo)) return todo;
    const entries = r.timesheetEntries().filter((e) => e.item_id === todo.id);
    if (entries.length !== 1) return fail(`Expected one timesheet entry on "${todo.title}", found ${entries.length}.`);
    const entry = entries[0];
    if (minutes(entry.hours) !== minutes(p.hours)) {
      return fail(`The entry on "${todo.title}" is ${entry.hours}h, expected ${String(p.hours)}h.`);
    }
    if (p.description_contains && !norm(entry.description).includes(norm(str(p, "description_contains")))) {
      return fail(`The entry's description "${entry.description}" does not contain "${str(p, "description_contains")}".`);
    }
    return pass(`One ${entry.hours}h entry on "${todo.title}".`);
  },

  /** The named to-do has no timesheet entry left, and each `still_logged` to-do keeps exactly one. */
  timesheet_removed(r, p) {
    const todo = findTodo(r, str(p, "list"), str(p, "title"));
    if (isGrade(todo)) return todo;
    const entries = r.timesheetEntries();
    const left = entries.filter((e) => e.item_id === todo.id).length;
    if (left !== 0) return fail(`"${todo.title}" still has ${left} timesheet entr${left === 1 ? "y" : "ies"}.`);
    for (const other of strs(p, "still_logged")) {
      const sibling = findTodo(r, str(p, "list"), other);
      if (isGrade(sibling)) return sibling;
      const kept = entries.filter((e) => e.item_id === sibling.id).length;
      if (kept !== 1) return fail(`Expected "${other}" to keep its one timesheet entry, found ${kept}.`);
    }
    return pass(`The entry on "${todo.title}" is gone and the others are untouched.`);
  },

  /** The hill chart's dots sit at the given positions and exactly one progress update carries the note. */
  hill_progress(r, p) {
    const dots = r.hillDots();
    for (const [name, position] of dotPositions(p)) {
      const hits = dots.filter((d) => norm(d.label) === norm(name));
      if (hits.length !== 1) return fail(`Expected "${name}" on the hill chart once, found ${hits.length}.`);
      if (hits[0].position !== position) return fail(`"${name}" is at ${hits[0].position}, expected ${position}.`);
    }
    const note = str(p, "note_contains");
    const updates = r.hillUpdates().filter((u) => norm(u.note).includes(norm(note)));
    if (updates.length !== 1) return fail(`Expected exactly one progress update containing "${note}", found ${updates.length}.`);
    return pass(`Dots are where expected and one progress update says "${note}".`);
  },
};

export function gradeWrite(spec: GradingSpec, reader: BasecampReader): GradeResult {
  const check = spec.check ? CHECKS[spec.check] : undefined;
  if (!check) return fail(`Unknown write check "${spec.check}".`);
  try {
    return check(reader, spec);
  } catch (err) {
    return fail(`Could not read Basecamp state: ${(err as Error).message}`);
  }
}

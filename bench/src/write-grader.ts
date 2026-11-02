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

/** Other records a check names, e.g. none_on: [{ list, title }] or untouched: [{ table, title, column }]. */
function targets(p: Params, key: string): { list: string; title: string; table?: string; column?: string }[] {
  const raw = Array.isArray(p[key]) ? (p[key] as Record<string, unknown>[]) : [];
  return raw.map((t) => ({
    list: String(t.list ?? ""),
    title: String(t.title ?? ""),
    table: t.table === undefined ? undefined : String(t.table),
    column: t.column === undefined ? undefined : String(t.column),
  }));
}

/** Filenames of the <bc-attachment> elements in rich-text HTML. */
export function attachmentNames(html: string): string[] {
  return [...html.matchAll(/<bc-attachment\b[^>]*>/gi)]
    .map((m) => /\bfilename="([^"]*)"/i.exec(m[0])?.[1] ?? "")
    .filter(Boolean);
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

  /**
   * One comment containing the text sits on the named to-do. Optional: `list_items`, the number of
   * <li> items that comment must hold (a Markdown list arrived as a list), and `none_on`, other
   * to-dos ({ list, title }) that must have no comment containing the text.
   */
  todo_comment(r, p) {
    const todo = findTodo(r, str(p, "list"), str(p, "title"));
    if (isGrade(todo)) return todo;
    const needle = str(p, "contains");
    const comments = r.comments(todo.id).map((c) => c.text);
    const found = exactlyOneContaining(comments, needle, `on to-do "${todo.title}"`);
    if (!found.task_success) return found;
    if (p.list_items !== undefined) {
      const comment = comments.find((t) => norm(t).includes(norm(needle)))!;
      const items = (comment.match(/<li[\s>]/gi) ?? []).length;
      if (items !== Number(p.list_items)) {
        return fail(`The comment holds ${items} list items, expected ${Number(p.list_items)}; the Markdown list did not arrive as a list.`);
      }
    }
    for (const other of targets(p, "none_on")) {
      const wrong = findTodo(r, other.list, other.title);
      if (isGrade(wrong)) return wrong;
      if (r.comments(wrong.id).some((c) => norm(c.text).includes(norm(needle)))) {
        return fail(`"${needle}" was also posted on "${other.title}" in "${other.list}", the wrong to-do.`);
      }
    }
    return found;
  },

  /**
   * One comment containing the text sits on the named to-do and carries an attached file with the
   * given filename (a <bc-attachment> in the comment body, not a separate upload).
   */
  comment_attachment(r, p) {
    const todo = findTodo(r, str(p, "list"), str(p, "title"));
    if (isGrade(todo)) return todo;
    const needle = str(p, "contains");
    const comments = r.comments(todo.id).map((c) => c.text);
    const found = exactlyOneContaining(comments, needle, `on to-do "${todo.title}"`);
    if (!found.task_success) return found;
    const comment = comments.find((t) => norm(t).includes(norm(needle)))!;
    const files = attachmentNames(comment);
    if (!files.includes(str(p, "filename"))) {
      return fail(`The comment attaches [${quoted(files)}], expected "${str(p, "filename")}".`);
    }
    return pass(`The comment on "${todo.title}" attaches "${str(p, "filename")}".`);
  },

  /**
   * One card with the title sits in the named column. Optional: `table`, the card table by title
   * (default: the project's main table), and `untouched`, cards ({ table, title, column }) that
   * must still be where the seed put them.
   */
  card_in_column(r, p) {
    const table = p.table === undefined ? undefined : str(p, "table");
    const cards = r.cards(table).filter((c) => norm(c.title) === norm(str(p, "title")));
    const where = table ? ` on "${table}"` : "";
    if (cards.length !== 1) return fail(`Expected one card "${str(p, "title")}"${where}, found ${cards.length}.`);
    if (norm(cards[0].column) !== norm(str(p, "column"))) {
      return fail(`Card "${cards[0].title}"${where} is in "${cards[0].column}", expected "${str(p, "column")}".`);
    }
    for (const other of targets(p, "untouched")) {
      const hits = r.cards(other.table).filter((c) => norm(c.title) === norm(other.title));
      const label = `"${other.title}" on ${other.table && other.table !== "default" ? `"${other.table}"` : "the main table"}`;
      if (hits.length !== 1) return fail(`Expected one card ${label}, found ${hits.length}.`);
      if (norm(hits[0].column) !== norm(other.column ?? "")) {
        return fail(`Card ${label} moved to "${hits[0].column}"; it should have stayed in "${other.column}".`);
      }
    }
    return pass(`Card "${cards[0].title}"${where} is in "${cards[0].column}".`);
  },

  /** One card with the title sits in the column with the body text, and no card keeps any `absent` title. */
  card_fields(r, p) {
    const all = r.cards();
    const cards = all.filter((c) => norm(c.title) === norm(str(p, "title")));
    if (cards.length !== 1) return fail(`Expected one card "${str(p, "title")}", found ${cards.length}.`);
    const card = cards[0];
    if (p.column && norm(card.column) !== norm(str(p, "column"))) {
      return fail(`Card "${card.title}" is in "${card.column}", expected "${str(p, "column")}".`);
    }
    if (p.body_contains && !norm(card.body).includes(norm(str(p, "body_contains")))) {
      return fail(`Card "${card.title}" description does not contain "${str(p, "body_contains")}".`);
    }
    for (const gone of strs(p, "absent")) {
      const left = all.filter((c) => norm(c.title) === norm(gone)).length;
      if (left) return fail(`A card is still titled "${gone}" (${left}); it should have been renamed, not copied.`);
    }
    return pass(`Card "${card.title}" has the expected title, column and description.`);
  },

  /**
   * No active to-do titled `title` exists in any list (the seeded one stays in the trash, and no
   * copy was made), and each `still_open` to-do is still open.
   */
  todo_absent(r, p) {
    const all = r.todolists().flatMap((l) => r.todos(l.id).map((t) => ({ ...t, list: l.name })));
    const hits = all.filter((t) => norm(t.title) === norm(str(p, "title")));
    if (hits.length) {
      return fail(`Found ${hits.length} active to-do${hits.length === 1 ? "" : "s"} "${str(p, "title")}" (${hits.map((t) => `${t.completed ? "completed" : "open"} in "${t.list}"`).join(", ")}); the trashed one was restored or recreated.`);
    }
    for (const other of strs(p, "still_open")) {
      const sibling = all.filter((t) => norm(t.title) === norm(other));
      if (sibling.length !== 1) return fail(`Expected one to-do "${other}", found ${sibling.length}.`);
      if (sibling[0].completed) return fail(`"${other}" was completed; it should be untouched.`);
    }
    return pass(`"${str(p, "title")}" stayed in the trash and nothing else changed.`);
  },

  /** On the named to-do, one subtask is completed and each `still_open` subtask is not. */
  subtask_completed(r, p) {
    const todo = findTodo(r, str(p, "list"), str(p, "title"));
    if (isGrade(todo)) return todo;
    const subtasks = r.subtasks(todo.id);
    const pick = (title: string) => subtasks.filter((s) => norm(s.title) === norm(title));
    const target = pick(str(p, "subtask"));
    if (target.length !== 1) return fail(`Expected one subtask "${str(p, "subtask")}", found ${target.length}.`);
    if (!target[0].completed) return fail(`Subtask "${target[0].title}" is still open.`);
    for (const other of strs(p, "still_open")) {
      const sibling = pick(other);
      if (sibling.length !== 1) return fail(`Expected one subtask "${other}", found ${sibling.length}.`);
      if (sibling[0].completed) return fail(`Subtask "${other}" was completed too.`);
    }
    if (todo.completed) return fail(`The parent to-do "${todo.title}" was completed; only the subtask should be.`);
    return pass(`Subtask "${target[0].title}" is done and the rest are open.`);
  },

  /** Exactly one answer by me to the named check-in question contains the text. */
  checkin_answered(r, p) {
    const question = str(p, "question");
    const answers = r.checkinAnswers().filter((a) => norm(a.question) === norm(question));
    const mine = answers.filter((a) => norm(a.creator) === norm(r.meEmail()));
    return exactlyOneContaining(mine.map((a) => a.text), str(p, "contains"), `in my answers to "${question}"`);
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

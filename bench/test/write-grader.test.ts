import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

import { CHECKS, attachmentNames, gradeWrite, norm } from "../src/write-grader.ts";
import type { BasecampReader, CardItem, HillDot, RecordingState, TimesheetItem, TodoItem } from "../src/sandbox.ts";
import type { SandboxDef } from "../src/types.ts";

const ME = "me@example.com";

/** In-memory reader: one "Bench Sprint" list plus whatever each test overrides. */
function reader(over: Partial<BasecampReader> & { todoItems?: TodoItem[] } = {}): BasecampReader {
  const todos = over.todoItems ?? [];
  return {
    meEmail: () => ME,
    todolists: () => [{ id: "L1", name: "Bench Sprint" }],
    todos: (id) => (id === "L1" ? todos : []),
    recording: (id) => ({ id, status: "trashed", completed: false, updated_at: "seeded" }),
    subtasks: () => [],
    comments: () => [],
    cards: () => [],
    checkinAnswers: () => [],
    messages: () => [],
    chatLines: () => [],
    uploads: () => [],
    timesheetEntries: () => [],
    hillDots: () => [],
    hillUpdates: () => [],
    ...over,
  };
}

const entry = (todoId: string, hours: string, description = ""): TimesheetItem => ({
  id: `${todoId}-${hours}`, hours, date: "2026-11-01", description, item_id: todoId, item_title: todoId,
});

const todo = (title: string, extra: Partial<TodoItem> = {}): TodoItem => ({
  id: title, title, completed: false, assignees: [], due_on: null, ...extra,
});

test("norm strips HTML, entities, case, and trailing punctuation", () => {
  assert.equal(norm("<div>Reviewed,&nbsp;looks <b>good</b> to me.</div>"), "reviewed, looks good to me");
  assert.equal(norm("Count me in!"), "count me in");
  assert.equal(norm("It’s  done"), "it's done");
});

test("todo_created passes on one assigned, dated to-do", () => {
  const r = reader({ todoItems: [todo("Order lumber", { assignees: [ME], due_on: "2026-12-01" })] });
  const g = gradeWrite({ check: "todo_created", list: "Bench Sprint", title: "Order lumber", assignee: "me", due_on: "2026-12-01" }, r);
  assert.equal(g.task_success, true, g.details);
});

test("todo_created fails on a duplicate", () => {
  const r = reader({ todoItems: [todo("Pay invoice 42", { assignees: [ME] }), todo("Pay invoice 42", { assignees: [ME] })] });
  const g = gradeWrite({ check: "todo_created", list: "Bench Sprint", title: "Pay invoice 42", assignee: "me" }, r);
  assert.equal(g.task_success, false);
  assert.match(g.details, /found 2/);
});

test("todo_created fails on wrong assignee or due date", () => {
  const unassigned = reader({ todoItems: [todo("Order lumber", { due_on: "2026-12-01" })] });
  assert.equal(CHECKS.todo_created(unassigned, { list: "Bench Sprint", title: "Order lumber", assignee: "me" }).task_success, false);
  const wrongDue = reader({ todoItems: [todo("Order lumber", { assignees: [ME], due_on: "2026-12-02" })] });
  assert.equal(CHECKS.todo_created(wrongDue, { list: "Bench Sprint", title: "Order lumber", due_on: "2026-12-01" }).task_success, false);
});

test("todo_with_subtasks compares subtasks as a set", () => {
  const r = reader({
    todoItems: [todo("Plan launch party")],
    subtasks: () => ["Order cake", "Book venue", "Send invites"].map((t) => ({ id: t, title: t, completed: false })),
  });
  const spec = { check: "todo_with_subtasks", list: "Bench Sprint", title: "Plan launch party", subtasks: ["Book venue", "Send invites", "Order cake"] };
  assert.equal(gradeWrite(spec, r).task_success, true);
  const missing = reader({ todoItems: [todo("Plan launch party")] });
  assert.equal(gradeWrite(spec, missing).task_success, false);
});

test("todo_completed requires the siblings to stay open", () => {
  const spec = { check: "todo_completed", list: "Bench Sprint", title: "Pay hosting bill", still_open: ["Renew domain"] };
  const good = reader({ todoItems: [todo("Pay hosting bill", { completed: true }), todo("Renew domain")] });
  assert.equal(gradeWrite(spec, good).task_success, true);
  const tooMany = reader({ todoItems: [todo("Pay hosting bill", { completed: true }), todo("Renew domain", { completed: true })] });
  assert.equal(gradeWrite(spec, tooMany).task_success, false);
  const open = reader({ todoItems: [todo("Pay hosting bill"), todo("Renew domain")] });
  assert.equal(gradeWrite(spec, open).task_success, false);
});

test("comment checks need exactly one matching comment", () => {
  const spec = { check: "todo_comment", list: "Bench Sprint", title: "Review contract", contains: "Reviewed, looks good to me" };
  const one = reader({ todoItems: [todo("Review contract")], comments: () => [{ id: "c", text: "<div>Reviewed, looks good to me.</div>" }] });
  assert.equal(gradeWrite(spec, one).task_success, true);
  const two = reader({
    todoItems: [todo("Review contract")],
    comments: () => [{ id: "a", text: "Reviewed, looks good to me." }, { id: "b", text: "Reviewed, looks good to me." }],
  });
  assert.equal(gradeWrite(spec, two).task_success, false);
});

const card = (title: string, column: string, body = ""): CardItem => ({ id: `${title}@${column}`, title, column, body });

test("card_in_column checks the column by name", () => {
  const spec = { check: "card_in_column", title: "Write tests", column: "Done" };
  assert.equal(gradeWrite(spec, reader({ cards: () => [card("Write tests", "Done")] })).task_success, true);
  assert.equal(gradeWrite(spec, reader({ cards: () => [card("Write tests", "Up next")] })).task_success, false);
});

test("card_in_column with table and untouched reads each table separately", () => {
  const spec = {
    check: "card_in_column", table: "Punch list", title: "Write tests", column: "Done",
    untouched: [{ table: "default", title: "Write tests", column: "Up next" }],
  };
  const tables = (punch: string, main: string) => reader({
    cards: (table) => [card("Write tests", table === "Punch list" ? punch : main)],
  });
  assert.equal(gradeWrite(spec, tables("Done", "Up next")).task_success, true);
  const wrongTable = gradeWrite(spec, tables("Up next", "Done"));
  assert.equal(wrongTable.task_success, false);
  assert.match(wrongTable.details, /on "Punch list" is in "Up next"/);
  const both = gradeWrite(spec, tables("Done", "Done"));
  assert.equal(both.task_success, false);
  assert.match(both.details, /main table.*should have stayed in "Up next"/);
});

test("card_fields needs the new title, description and column, with the old title gone", () => {
  const spec = { check: "card_fields", title: "Write integration tests", column: "In progress", body_contains: "Cover the sync path", absent: ["Write tests"] };
  const renamed = card("Write integration tests", "In progress", "<div>Cover the sync path.</div>");
  assert.equal(gradeWrite(spec, reader({ cards: () => [renamed, card("Draft release notes", "Up next")] })).task_success, true);
  assert.equal(gradeWrite(spec, reader({ cards: () => [renamed, card("Write tests", "In progress")] })).task_success, false);
  assert.equal(gradeWrite(spec, reader({ cards: () => [{ ...renamed, body: "" }] })).task_success, false);
  assert.equal(gradeWrite(spec, reader({ cards: () => [{ ...renamed, column: "Done" }] })).task_success, false);
});

test("todo_comment list_items needs every Markdown list item", () => {
  const spec = {
    check: "todo_comment", list: "Bench Sprint", title: "Review contract", contains: "Add the late fee clause",
    list_items: ["Fix the payment date", "Add the late fee clause", "Correct the site address"],
  };
  const html = "<p>Reviewed the draft. Three changes:</p><ul><li>Fix the payment date</li><li>Add the late fee clause</li><li>Correct the site address</li></ul>";
  const asList = reader({ todoItems: [todo("Review contract")], comments: () => [{ id: "c", text: html }] });
  assert.equal(gradeWrite(spec, asList).task_success, true);
  const flat = reader({ todoItems: [todo("Review contract")], comments: () => [{ id: "c", text: "<p>- Fix the payment date - Add the late fee clause - Correct the site address</p>" }] });
  assert.equal(gradeWrite(spec, flat).task_success, false);
  const unrelated = reader({
    todoItems: [todo("Review contract")],
    comments: () => [{ id: "c", text: "<ul><li>Add the late fee clause</li><li>Call the client</li><li>Archive the draft</li></ul>" }],
  });
  const g = gradeWrite(spec, unrelated);
  assert.equal(g.task_success, false);
  assert.match(g.details, /Fix the payment date/);
});

test("todo_comment none_on fails a reply posted on the same-titled to-do in another list", () => {
  const spec = {
    check: "todo_comment", list: "Kitchen", title: "Pick paint color", contains: "Going with sage green",
    none_on: [{ list: "Bathroom", title: "Pick paint color" }],
  };
  const lists = [{ id: "K", name: "Kitchen" }, { id: "B", name: "Bathroom" }];
  const paint = (id: string): TodoItem => ({ ...todo("Pick paint color"), id });
  const r = (kitchen: string[], bathroom: string[]) => reader({
    todolists: () => lists,
    todos: (id) => [paint(`${id}-t`)],
    comments: (id) => (id === "K-t" ? kitchen : bathroom).map((text, i) => ({ id: `${id}${i}`, text })),
  });
  assert.equal(gradeWrite(spec, r(["Leaning sage or slate.", "Going with sage green."], ["Same question."])).task_success, true);
  assert.equal(gradeWrite(spec, r(["Leaning sage or slate."], ["Going with sage green."])).task_success, false);
  const both = gradeWrite(spec, r(["Going with sage green."], ["Going with sage green."]));
  assert.equal(both.task_success, false);
  assert.match(both.details, /wrong to-do/);
});

test("comment_attachment needs the file attached inside the comment", () => {
  const spec = { check: "comment_attachment", list: "Bench Sprint", title: "Final walkthrough", contains: "Punch list attached", filename: "punch-list.txt" };
  const withFile = '<p>Punch list attached.</p>\n<bc-attachment sgid="x" content-type="text/plain" filename="punch-list.txt" filesize="76"><figure><figcaption>punch-list.txt</figcaption></figure></bc-attachment>';
  const ok = reader({ todoItems: [todo("Final walkthrough")], comments: () => [{ id: "c", text: withFile }] });
  assert.equal(gradeWrite(spec, ok).task_success, true);
  const noFile = reader({ todoItems: [todo("Final walkthrough")], comments: () => [{ id: "c", text: "<p>Punch list attached.</p>" }] });
  assert.equal(gradeWrite(spec, noFile).task_success, false);
  assert.deepEqual(attachmentNames(withFile), ["punch-list.txt"]);
});

test("todo_absent passes only while the seeded to-do remains untouched in trash", () => {
  const spec = { check: "todo_absent", list: "Bench Sprint", title: "Pay hosting bill", still_open: ["Renew domain"] };
  const initial: RecordingState = { id: "host", status: "trashed", completed: false, updated_at: "seeded" };
  const context = { initialRecordings: new Map([["Bench Sprint/Pay hosting bill", initial]]) };
  assert.equal(gradeWrite(spec, reader({ todoItems: [todo("Renew domain")] }), context).task_success, true);
  const recreated = gradeWrite(spec, reader({ todoItems: [todo("Renew domain"), todo("Pay hosting bill", { completed: true })] }), context);
  assert.equal(recreated.task_success, false);
  assert.match(recreated.details, /restored or recreated/);
  const retrash = reader({
    todoItems: [todo("Renew domain")],
    recording: () => ({ ...initial, completed: true, updated_at: "restored-and-retrashed" }),
  });
  const changed = gradeWrite(spec, retrash, context);
  assert.equal(changed.task_success, false);
  assert.match(changed.details, /changed after seeding/);
  assert.equal(gradeWrite(spec, reader({ todoItems: [todo("Renew domain", { completed: true })] }), context).task_success, false);
});

test("subtask_completed needs the one subtask done and the rest open", () => {
  const spec = { check: "subtask_completed", list: "Bench Sprint", title: "Plan launch party", subtask: "Send invites", still_open: ["Book venue", "Order cake"] };
  const subs = (done: string[]) => () => ["Book venue", "Send invites", "Order cake"].map((t) => ({ id: t, title: t, completed: done.includes(t) }));
  assert.equal(gradeWrite(spec, reader({ todoItems: [todo("Plan launch party")], subtasks: subs(["Send invites"]) })).task_success, true);
  assert.equal(gradeWrite(spec, reader({ todoItems: [todo("Plan launch party")], subtasks: subs([]) })).task_success, false);
  assert.equal(gradeWrite(spec, reader({ todoItems: [todo("Plan launch party")], subtasks: subs(["Send invites", "Order cake"]) })).task_success, false);
  const parentDone = reader({ todoItems: [todo("Plan launch party", { completed: true })], subtasks: subs(["Send invites"]) });
  assert.equal(gradeWrite(spec, parentDone).task_success, false);
});

test("checkin_answered needs exactly one answer by me on that question", () => {
  const spec = { check: "checkin_answered", question: "What did you work on today?", contains: "Wired up the export screen" };
  const answer = (creator: string, question = "What did you work on today?") => ({
    id: `${creator}-${question}`, question, text: "<p>Wired up the export screen.</p>", creator, date: "2026-11-02",
  });
  assert.equal(gradeWrite(spec, reader({ checkinAnswers: () => [answer(ME)] })).task_success, true);
  assert.equal(gradeWrite(spec, reader({ checkinAnswers: () => [] })).task_success, false);
  assert.equal(gradeWrite(spec, reader({ checkinAnswers: () => [answer("someone@example.com")] })).task_success, false);
  assert.equal(gradeWrite(spec, reader({ checkinAnswers: () => [answer(ME, "Anything blocking you?")] })).task_success, false);
  assert.equal(gradeWrite(spec, reader({ checkinAnswers: () => [answer(ME), { ...answer(ME), id: "dup" }] })).task_success, false);
});

test("message, chat and upload checks", () => {
  const msgs = reader({
    messages: () => [{ id: "m", title: "Weekly update", body: "<div>All tasks are on track for Friday.</div>" }],
    chatLines: () => [{ id: "l", text: "Deploy finished" }],
    uploads: () => [{ id: "u", filename: "site-plan.txt" }],
  });
  assert.equal(gradeWrite({ check: "message_posted", title: "Weekly update", body_contains: "All tasks are on track for Friday" }, msgs).task_success, true);
  assert.equal(gradeWrite({ check: "chat_line", contains: "Deploy finished" }, msgs).task_success, true);
  assert.equal(gradeWrite({ check: "upload_exists", filename: "site-plan.txt" }, msgs).task_success, true);
  assert.equal(gradeWrite({ check: "upload_exists", filename: "other.txt" }, msgs).task_success, false);
});

test("timesheet_logged needs one entry with matching hours and description", () => {
  const spec = { check: "timesheet_logged", list: "Bench Sprint", title: "Review contract", hours: "1.5", description_contains: "Contract review" };
  const todos = [todo("Review contract"), todo("Renew domain")];
  assert.equal(gradeWrite(spec, reader({ todoItems: todos, timesheetEntries: () => [entry("Review contract", "1:30", "Contract review")] })).task_success, true);
  assert.equal(gradeWrite(spec, reader({ todoItems: todos, timesheetEntries: () => [entry("Review contract", "1.0", "Contract review")] })).task_success, false);
  assert.equal(gradeWrite(spec, reader({ todoItems: todos, timesheetEntries: () => [entry("Renew domain", "1.5", "Contract review")] })).task_success, false);
  const dup = gradeWrite(spec, reader({
    todoItems: todos,
    timesheetEntries: () => [entry("Review contract", "1.5", "Contract review"), entry("Review contract", "1.5", "Contract review")],
  }));
  assert.equal(dup.task_success, false);
  assert.match(dup.details, /found 2/);
});

test("timesheet_removed requires the other entries to stay", () => {
  const spec = { check: "timesheet_removed", list: "Bench Sprint", title: "Renew domain", still_logged: ["Review contract"] };
  const todos = [todo("Review contract"), todo("Renew domain")];
  assert.equal(gradeWrite(spec, reader({ todoItems: todos, timesheetEntries: () => [entry("Review contract", "1")] })).task_success, true);
  assert.equal(gradeWrite(spec, reader({ todoItems: todos, timesheetEntries: () => [entry("Review contract", "1"), entry("Renew domain", "0.5")] })).task_success, false);
  assert.equal(gradeWrite(spec, reader({ todoItems: todos, timesheetEntries: () => [] })).task_success, false);
});

test("hill_progress checks dot positions and exactly one matching update", () => {
  const spec = { check: "hill_progress", dots: { Design: 60, Build: 0 }, note_contains: "Design is over the hill" };
  const dots: HillDot[] = [{ id: "1", label: "Design", position: 60 }, { id: "2", label: "Build", position: 0 }];
  const update = { id: "u", note: "<p>Design is over the hill</p>", dots };
  assert.equal(gradeWrite(spec, reader({ hillDots: () => dots, hillUpdates: () => [update] })).task_success, true);
  assert.equal(gradeWrite(spec, reader({ hillDots: () => dots, hillUpdates: () => [] })).task_success, false);
  assert.equal(gradeWrite(spec, reader({ hillDots: () => dots, hillUpdates: () => [update, { ...update, id: "v" }] })).task_success, false);
  const moved = dots.map((d) => (d.label === "Build" ? { ...d, position: 60 } : d));
  assert.equal(gradeWrite(spec, reader({ hillDots: () => moved, hillUpdates: () => [update] })).task_success, false);
});

test("read failures and unknown checks grade as failures", () => {
  const broken = reader({ todolists: () => { throw new Error("access denied"); } });
  const g = gradeWrite({ check: "todo_created", list: "Bench Sprint", title: "x" }, broken);
  assert.equal(g.task_success, false);
  assert.match(g.details, /access denied/);
  assert.equal(gradeWrite({ check: "nope" }, reader()).task_success, false);
});

test("task suites are complete and every probe covers both conditions", () => {
  const config = resolve(import.meta.dirname, "..", "config");
  const tasks = parseYaml(readFileSync(join(config, "tasks.yaml"), "utf-8")).tasks as Record<string, any>;
  const read = Object.entries(tasks).filter(([, t]) => t.suite !== "write");
  const write = Object.entries(tasks).filter(([, t]) => t.suite === "write");
  assert.deepEqual(read.map(([id]) => id).sort(), [
    "hill_progress_updates", "message_last_commenter", "my_assignments", "nonexistent_project", "project_count",
    "recording_by_id", "timesheet_entry_view", "todolist_progress", "triage_card_count", "url_resolve",
  ]);
  assert.equal(write.length, 24, `expected 24 write tasks, found ${write.length}`);
  for (const id of ["timesheet_entry_view", "hill_progress_updates"]) {
    const task = tasks[id];
    assert.ok(task, `${id}: missing read task`);
    assert.notEqual(task.suite, "write", `${id}: must be in the read suite`);
    assert.equal(task.category, "multi_step", `${id}: expected multi-step retrieval`);
  }
  const coverage = Object.entries(tasks).filter(([, t]) => t.coverage).map(([id]) => id).sort();
  assert.deepEqual(coverage, ["hill_progress_updates", "hill_update", "timesheet_delete", "timesheet_entry_view", "timesheet_log", "timesheet_update"]);
  const sandbox = parseYaml(readFileSync(join(config, "sandbox.yaml"), "utf-8")) as SandboxDef;
  const tables = new Set((sandbox.card_tables ?? []).map((t) => t.name));
  for (const [id, t] of write) {
    assert.ok(CHECKS[t.grading?.check], `${id}: unknown check ${t.grading?.check}`);
    assert.match(t.prompt, /\{project\}|\{url:[^}]+\}/, `${id}: prompt must name the sandbox project or a seeded link`);
    for (const [, key] of t.prompt.matchAll(/\{url:([^}]+)\}/g)) {
      const [list, title] = key.split("/");
      const seeded = (t.seed?.todolists ?? []).find((l: any) => l.name === list)?.todos
        ?.some((todo: any) => (typeof todo === "string" ? todo : todo.title) === title);
      assert.ok(seeded, `${id}: {url:${key}} names no seeded to-do`);
    }
    for (const table of t.seed?.card_tables ?? []) {
      assert.ok(tables.has(table.name), `${id}: card table "${table.name}" is not in sandbox.yaml card_tables`);
    }
  }
  for (const [name, probe] of Object.entries(sandbox.probes)) {
    assert.deepEqual(Object.keys(probe.commands).sort(), ["axi", "cli"], `${name}: commands for both conditions`);
  }
  const sessions = write.reduce((n, [, t]) => n + (t.sessions ?? 1), 0) * 2;
  assert.ok(sessions * sandbox.estimate_per_session_usd <= sandbox.budget_usd,
    `full write matrix (${sessions} sessions) must fit the budget`);
});

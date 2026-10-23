import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

import { CHECKS, gradeWrite, norm } from "../src/write-grader.ts";
import type { BasecampReader, TodoItem } from "../src/sandbox.ts";
import type { SandboxDef } from "../src/types.ts";

const ME = "me@example.com";

/** In-memory reader: one "Bench Sprint" list plus whatever each test overrides. */
function reader(over: Partial<BasecampReader> & { todoItems?: TodoItem[] } = {}): BasecampReader {
  const todos = over.todoItems ?? [];
  return {
    meEmail: () => ME,
    todolists: () => [{ id: "L1", name: "Bench Sprint" }],
    todos: (id) => (id === "L1" ? todos : []),
    subtasks: () => [],
    comments: () => [],
    cards: () => [],
    messages: () => [],
    chatLines: () => [],
    uploads: () => [],
    ...over,
  };
}

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

test("card_in_column checks the column by name", () => {
  const spec = { check: "card_in_column", title: "Write tests", column: "Done" };
  assert.equal(gradeWrite(spec, reader({ cards: () => [{ id: "1", title: "Write tests", column: "Done" }] })).task_success, true);
  assert.equal(gradeWrite(spec, reader({ cards: () => [{ id: "1", title: "Write tests", column: "Up next" }] })).task_success, false);
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

test("read failures and unknown checks grade as failures", () => {
  const broken = reader({ todolists: () => { throw new Error("access denied"); } });
  const g = gradeWrite({ check: "todo_created", list: "Bench Sprint", title: "x" }, broken);
  assert.equal(g.task_success, false);
  assert.match(g.details, /access denied/);
  assert.equal(gradeWrite({ check: "nope" }, reader()).task_success, false);
});

test("every write task names a known check and every probe covers both conditions", () => {
  const config = resolve(import.meta.dirname, "..", "config");
  const tasks = parseYaml(readFileSync(join(config, "tasks.yaml"), "utf-8")).tasks as Record<string, any>;
  const write = Object.entries(tasks).filter(([, t]) => t.suite === "write");
  assert.ok(write.length >= 10, `expected at least 10 write tasks, found ${write.length}`);
  for (const [id, t] of write) {
    assert.ok(CHECKS[t.grading?.check], `${id}: unknown check ${t.grading?.check}`);
    assert.match(t.prompt, /\{project\}/, `${id}: prompt must name the sandbox project`);
  }
  const sandbox = parseYaml(readFileSync(join(config, "sandbox.yaml"), "utf-8")) as SandboxDef;
  for (const [name, probe] of Object.entries(sandbox.probes)) {
    assert.deepEqual(Object.keys(probe.commands).sort(), ["axi", "cli"], `${name}: commands for both conditions`);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { humanSize } from "../src/commands/upload.js";
import { run, verbs } from "./fake-basecamp.js";

const activeTodo = { ok: true, data: { id: 123, type: "Todo", status: "active", bucket: { id: 99 } } };
const trashedTodo = { ok: true, data: { id: 123, type: "Todo", status: "trashed", title: "Pay hosting bill", content: "Pay hosting bill", completed: false, bucket: { id: 99 } } };

test("subtask create creates one title after checking the parent without pre-listing", () => {
  const { stdout, status, calls } = run(["subtask", "create", "123", "Book venue"], {
    "show 123": activeTodo,
    "subtasks create": { ok: true, data: { id: 2, title: "Book venue" } },
  });
  assert.equal(status, 0);
  assert.deepEqual(verbs(calls), ["show 123", "subtasks create"]);
  assert.deepEqual(calls[1]!.slice(0, 4), ["subtasks", "create", "123", "Book venue"]);
  assert.match(stdout, /created\[1\]/);
  assert.match(stdout, /2,Book venue/);
});

test("subtask create takes several titles in one call, in order", () => {
  const titles = ["Book venue", "Send invites", "Order cake", "Hire DJ", "Buy balloons"];
  const { stdout, status, calls } = run(["subtask", "create", "123", ...titles], {
    "show 123": activeTodo,
    "subtasks create": { ok: true, data: { id: 2 } },
  });
  assert.equal(status, 0);
  const creates = calls.filter((c) => c[0] === "subtasks");
  assert.deepEqual(creates.map((c) => c[3]), titles);
  assert.match(stdout, /created\[5\]/);
  for (const t of titles) assert.match(stdout, new RegExp(t));
});

test("subtask create on a trashed to-do fails fast with TRASHED and creates nothing", () => {
  const { stdout, status, calls } = run(["subtask", "create", "123", "Book venue", "Send invites"], { "show 123": trashedTodo });
  assert.equal(status, 1);
  assert.deepEqual(verbs(calls), ["show 123"]);
  assert.match(stdout, /To-do 123 is in the trash/);
  assert.match(stdout, /TRASHED/);
  assert.match(stdout, /recording restore 123 --in 99 --confirm/);
});

test("subtask create names what landed when a later title fails", () => {
  const { stdout, status } = run(["subtask", "create", "123", "Book venue", "Send invites"], {
    "show 123": activeTodo,
    "subtasks create": { ok: true, data: { id: 2, title: "Book venue" } },
    "subtasks create 123 Send invites": { ok: false, error: "Rate limit exceeded", code: "rate_limit" },
  });
  assert.equal(status, 1);
  assert.match(stdout, /Created 1 of 2 subtasks, then \\?"Send invites\\?" failed/);
  assert.match(stdout, /subtask create 123 \\?"Send invites\\?"/);
});

test("todo done on a trashed to-do fails fast with TRASHED before any write", () => {
  const { stdout, status, calls } = run(["todo", "done", "456", "123"], {
    "todos show": trashedTodo,
  });
  assert.equal(status, 1);
  assert.ok(!verbs(calls).includes("todos complete"), "must not call complete");
  assert.match(stdout, /To-do 123 is in the trash/);
});

test("todo view shows a trashed to-do as trashed and offers no write hints", () => {
  const { stdout } = run(["todo", "view", "123"], { "todos show": trashedTodo });
  assert.match(stdout, /status: trashed/);
  assert.doesNotMatch(stdout, /todo done 123|subtask create 123/);
  assert.match(stdout, /recording restore 123 --in 99 --confirm/);
});

test("card move and update on a trashed card fail fast", () => {
  const trashedCard = { ok: true, data: { id: 321, type: "Kanban::Card", status: "trashed", title: "Write tests" } };
  const move = run(["card", "move", "321", "--to", "777", "--in", "99"], { "cards show": trashedCard });
  assert.equal(move.status, 1);
  assert.ok(!verbs(move.calls).includes("cards move"));
  assert.match(move.stdout, /Card 321 is in the trash/);
  const update = run(["card", "update", "321", "--title", "New", "--in", "99"], { "cards show": trashedCard });
  assert.equal(update.status, 1);
  assert.ok(!verbs(update.calls).includes("cards update"));
});

test("comment on a trashed item maps to TRASHED", () => {
  const { stdout, status } = run(["comment", "create", "123", "probe", "--in", "99"], {
    "comments create": { ok: false, error: "Failed to comment on items 123: This to-do is in the trash, so you can't comment on it.", code: "validation" },
  });
  assert.equal(status, 1);
  assert.match(stdout, /To-do 123 is in the trash/);
  assert.match(stdout, /TRASHED/);
});

test("subtask create reports --assignees as unknown without suggesting --to", () => {
  const { stdout, status, calls } = run(["subtask", "create", "123", "Book venue", "--assignees", "me"], {});
  assert.equal(status, 2);
  assert.equal(calls.length, 0);
  assert.match(stdout, /unknown flag --assignees/);
  assert.doesNotMatch(stdout, /--to/);
});

test("subtask rejects removed management subcommands before any call", () => {
  for (const subcommand of ["list", "done", "reopen"]) {
    const { stdout, status, calls } = run(["subtask", subcommand, "123"], {});
    assert.equal(status, 2);
    assert.equal(calls.length, 0);
    assert.match(stdout, /valid subcommands for `subtask`: create/);
  }
});

test("todo create rejects the removed --subtask alias before any call", () => {
  const { status, calls } = run(["todo", "create", "Plan launch party", "--in", "99", "--subtask", "Book venue"], {});
  assert.equal(status, 2);
  assert.equal(calls.length, 0);
});

test("todo view and todo create point at one multi-title subtask call", () => {
  const { stdout } = run(["todo", "view", "777"], { "todos show": { ok: true, data: { id: 777, content: "Plan", bucket: { id: 99 } } } });
  assert.match(stdout, /subtask create 777 \\?"<title>\\?" \\?"<title>\\?" \.\.\..*all titles in one call/);
  const created = run(["todo", "create", "Plan", "--in", "99"], { "todos create": { ok: true, data: { id: 778, content: "Plan" } } });
  assert.equal(created.status, 0);
  assert.match(created.stdout, /subtask create 778 \\?"<title>\\?" \\?"<title>\\?" \.\.\..*all titles in one call/);
});

test("upload always sends the file to Docs & Files", () => {
  const { stdout, status, calls } = run(["upload", "site-plan.txt", "--in", "99"], {
    "uploads create": { ok: true, data: { id: 6, filename: "site-plan.txt", byte_size: 11, content_type: "text/plain", app_url: "https://x" } },
  }, { "site-plan.txt": "lot 14 plan" });
  assert.equal(status, 0);
  assert.deepEqual(verbs(calls), ["uploads create"]);
  const create = calls[0]!;
  assert.equal(create[2], "site-plan.txt");
  assert.deepEqual(create.slice(create.indexOf("--in"), create.indexOf("--in") + 2), ["--in", "99"]);
  assert.match(stdout, /uploaded:/);
  assert.match(stdout, /filename: site-plan.txt/);
  assert.doesNotMatch(stdout, /bookmark_url|sgid/);
});

test("upload does not suggest unsupported --attach for --attachment", () => {
  const { stdout, status, calls } = run(["upload", "site-plan.txt", "--in", "99", "--attachment", "photo.png"], {});
  assert.equal(status, 2);
  assert.equal(calls.length, 0);
  assert.match(stdout, /unknown flag --attachment/);
  assert.doesNotMatch(stdout, /use --attach/);
});

test("upload rejects removed mode flags before any call", () => {
  const { status, calls } = run(["upload", "site-plan.txt", "--in", "99", "--force"], {}, { "site-plan.txt": "lot 14 plan" });
  assert.equal(status, 2);
  assert.equal(calls.length, 0);
});

test("upload of a missing local file is a usage error before any call", () => {
  const { stdout, status, calls } = run(["upload", "nope.txt", "--in", "99"], {});
  assert.equal(status, 2);
  assert.match(stdout, /Could not read nope.txt/);
  assert.equal(calls.length, 0);
});

test("comment create rejects removed --attach before any call", () => {
  const { status, calls } = run(["comment", "create", "123", "See attached", "--in", "99", "--attach", "a.png"], {});
  assert.equal(status, 2);
  assert.equal(calls.length, 0);
});

test("help lists the subtask and upload commands", () => {
  const { stdout } = run(["--help"], {});
  assert.match(stdout, /subtask/);
  assert.match(stdout, /upload/);
});

test("humanSize formats bytes", () => {
  assert.equal(humanSize(80), "80 B");
  assert.equal(humanSize(2048), "2.0 KB");
  assert.equal(humanSize(5 * 1024 * 1024), "5.0 MB");
  assert.equal(humanSize(undefined), "?");
});

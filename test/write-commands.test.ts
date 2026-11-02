import { test } from "node:test";
import assert from "node:assert/strict";
import { humanSize } from "../src/commands/upload.js";
import { run, verbs } from "./fake-basecamp.js";

test("subtask create creates one title without pre-listing", () => {
  const { stdout, status, calls } = run(["subtask", "create", "123", "Book venue"], {
    "subtasks create": { ok: true, data: { id: 2, title: "Book venue" } },
  });
  assert.equal(status, 0);
  assert.deepEqual(calls[0]!.slice(0, 4), ["subtasks", "create", "123", "Book venue"]);
  assert.deepEqual(verbs(calls), ["subtasks create"]);
  assert.match(stdout, /created:/);
  assert.match(stdout, /title: Book venue/);
});

test("subtask create rejects multiple titles before any call", () => {
  const { status, calls } = run(["subtask", "create", "123", "Book venue", "Send invites"], {});
  assert.equal(status, 2);
  assert.equal(calls.length, 0);
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

test("todo view points at subtasks", () => {
  const { stdout } = run(["todo", "view", "777"], { "todos show": { ok: true, data: { id: 777, content: "Plan", bucket: { id: 99 } } } });
  assert.match(stdout, /subtask create 777/);
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

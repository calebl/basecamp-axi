import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { humanSize } from "../src/commands/upload.js";

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, "..", "bin", "basecamp-axi.js");

type Envelopes = Record<string, unknown>;

/**
 * Run basecamp-axi against a fake `basecamp` on PATH. `responses` maps "<group> <verb>"
 * (e.g. "subtasks list") to the envelope that call prints; every call is recorded.
 */
function run(args: string[], responses: Envelopes, files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "basecamp-axi-test-"));
  const log = join(dir, "calls.jsonl");
  writeFileSync(join(dir, "responses.json"), JSON.stringify(responses));
  const fake = join(dir, "basecamp");
  writeFileSync(
    fake,
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
const responses = JSON.parse(fs.readFileSync(${JSON.stringify(join(dir, "responses.json"))}, "utf-8"));
const env = responses[args.slice(0, 2).join(" ")] ?? { ok: false, error: "unexpected call: " + args.join(" "), code: "api_error" };
process.stdout.write(JSON.stringify(env));
process.exit(env.ok ? 0 : 7);
`,
  );
  chmodSync(fake, 0o755);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: dir,
    encoding: "utf-8",
    env: { ...process.env, PATH: `${dir}:${process.env["PATH"] ?? ""}`, BASECAMP_PROJECT: "" },
  });
  const calls = existsSync(log)
    ? readFileSync(log, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as string[])
    : [];
  return { stdout: result.stdout, status: result.status, calls };
}

const verbs = (calls: string[][]) => calls.map((c) => c.slice(0, 2).join(" "));

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

test("subtask list has a definitive empty state", () => {
  const { stdout, status } = run(["subtask", "list", "123"], { "subtasks list": { ok: true } });
  assert.equal(status, 0);
  assert.match(stdout, /subtasks: 0 subtasks on 123/);
  assert.match(stdout, /subtask create 123/);
});

test("subtask done is a no-op on a completed subtask", () => {
  const { stdout, status, calls } = run(["subtask", "done", "456"], {
    "subtasks show": { ok: true, data: { id: 456, title: "Book venue", completed: true } },
  });
  assert.equal(status, 0);
  assert.deepEqual(verbs(calls), ["subtasks show"]);
  assert.match(stdout, /already done \(no-op\)/);
});

test("todo create rejects the removed --subtask alias before any call", () => {
  const { status, calls } = run(["todo", "create", "Plan launch party", "--in", "99", "--subtask", "Book venue"], {});
  assert.equal(status, 2);
  assert.equal(calls.length, 0);
});

test("todo view points at subtasks", () => {
  const { stdout } = run(["todo", "view", "777"], { "todos show": { ok: true, data: { id: 777, content: "Plan", bucket: { id: 99 } } } });
  assert.match(stdout, /subtask list 777/);
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

test("comment create --attach forwards each file", () => {
  const { status, calls } = run(["comment", "create", "123", "See attached", "--in", "99", "--attach", "a.png", "--attach", "b.pdf"], {
    "comments create": { ok: true, data: { id: 9, content: "See attached" } },
  }, { "a.png": "a", "b.pdf": "b" });
  assert.equal(status, 0);
  const args = calls[0]!;
  assert.deepEqual(args.slice(0, 4), ["comments", "create", "123", "See attached"]);
  assert.deepEqual(args.slice(4, 8), ["--attach", "a.png", "--attach", "b.pdf"]);
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

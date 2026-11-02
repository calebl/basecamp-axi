import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "./fake-basecamp.js";
import { hoursToMinutes } from "../src/commands/timesheet.js";
import { parseDots, phase } from "../src/commands/hill.js";
import { compareVersions, parseVersion } from "../src/basecamp.js";

const VERSION = "basecamp version 0.22.1\n";
const OLD_VERSION = "basecamp version 0.21.0\n";

const ENTRY = {
  id: 1069480283,
  date: "2026-10-30",
  hours: "1.0",
  description: "Contract review",
  parent: { id: 777, title: "Review contract", type: "Todo" },
  bucket: { id: 99, name: "Sandbox" },
  person: { id: 5, name: "Ann", email_address: "ann@example.com" },
};

const kinds = (calls: string[][]) => calls.filter((c) => c[0] !== "--version").map((c) => c.slice(0, 3).join(" "));

// ── timesheet ────────────────────────────────────────────────────

test("timesheet list reads the project timesheet and totals the hours", () => {
  const { stdout, status, calls } = run(["timesheet", "list", "--in", "99"], {
    "timesheet project": { ok: true, data: [ENTRY, { ...ENTRY, id: 2, hours: "0:30", parent: { id: 1, type: "Timesheet", title: "Timesheet" } }] },
  });
  assert.equal(status, 0);
  assert.deepEqual(calls[0]!.slice(0, 2), ["timesheet", "project"]);
  assert.match(stdout, /count: 2/);
  assert.match(stdout, /total_hours: 1.5/);
  assert.match(stdout, /Review contract/);
  assert.match(stdout, /\(project\)/);
});

test("timesheet list without a project is a usage error before any call", () => {
  const { status, calls } = run(["timesheet", "list"], {});
  assert.equal(status, 2);
  assert.equal(calls.length, 0);
});

test("timesheet list --item reads one item and prints a definitive empty state", () => {
  const { stdout, status, calls } = run(["timesheet", "list", "--item", "777"], { "timesheet item": { ok: true, data: [] } });
  assert.equal(status, 0);
  assert.deepEqual(calls[0]!.slice(0, 3), ["timesheet", "item", "777"]);
  assert.match(stdout, /entries: 0 timesheet entries on item 777/);
});

test("timesheet list --item extracts the recording id from a Basecamp URL", () => {
  const url = "https://3.basecamp.com/123/buckets/99/todos/777";
  const { status, calls } = run(["timesheet", "list", "--item", url], { "timesheet item": { ok: true, data: [] } });
  assert.equal(status, 0);
  assert.deepEqual(calls[0]!.slice(0, 3), ["timesheet", "item", "777"]);
});

test("timesheet report passes the range as --start/--end and does not forward the project", () => {
  const { status, calls } = run(["timesheet", "report", "--from", "2026-10-01", "--to", "2026-10-31", "--person", "5", "--in", "99"], {
    "timesheet report": { ok: true, data: [ENTRY] },
  });
  assert.equal(status, 0);
  const call = calls[0]!;
  assert.deepEqual(call.slice(0, 8), ["timesheet", "report", "--start", "2026-10-01", "--end", "2026-10-31", "--person", "5"]);
  assert.ok(!call.includes("--in"));
});

test("timesheet report rejects half a range before any call", () => {
  const { status, calls } = run(["timesheet", "report", "--from", "2026-10-01"], {});
  assert.equal(status, 2);
  assert.equal(calls.length, 0);
});

test("timesheet create forwards the entry flags", () => {
  const { stdout, status, calls } = run(["timesheet", "create", "777", "--hours", "1:30", "--description", "Review", "--date", "yesterday"], {
    "--version": VERSION,
    "timesheet entry create": { ok: true, data: { ...ENTRY, hours: "1.5" } },
  });
  assert.equal(status, 0);
  const create = calls.find((c) => c[2] === "create")!;
  assert.deepEqual(create.slice(0, 10), ["timesheet", "entry", "create", "777", "--hours", "1:30", "--date", "yesterday", "--description", "Review"]);
  assert.match(stdout, /created:/);
  assert.match(stdout, /hours: "?1.5"?/);
  assert.match(stdout, /timesheet delete 1069480283 --confirm/);
});

test("timesheet create requires valid --hours before any call", () => {
  for (const args of [["timesheet", "create", "777"], ["timesheet", "create", "777", "--hours", "lots"]]) {
    const { status, calls } = run(args, {});
    assert.equal(status, 2);
    assert.equal(calls.length, 0);
  }
});

test("timesheet entry commands refuse an older basecamp CLI before calling it", () => {
  const { stdout, status, calls } = run(["timesheet", "view", "1069480283"], { "--version": OLD_VERSION });
  assert.equal(status, 1);
  assert.match(stdout, /code: DEPENDENCY_OUTDATED/);
  assert.match(stdout, /0.22.0/);
  assert.match(stdout, /basecamp upgrade/);
  assert.deepEqual(kinds(calls), []);
});

test("timesheet update is a no-op when nothing would change", () => {
  const { stdout, status, calls } = run(["timesheet", "update", "1069480283", "--hours", "1:00", "--person", "Ann"], {
    "--version": VERSION,
    "timesheet entry show": { ok: true, data: ENTRY },
  });
  assert.equal(status, 0);
  assert.match(stdout, /unchanged \(no-op\)/);
  assert.deepEqual(kinds(calls), ["timesheet entry show"]);
});

test("timesheet update sends only the changed flags", () => {
  const { stdout, status, calls } = run(["timesheet", "update", "1069480283", "--hours", "2.5"], {
    "--version": VERSION,
    "timesheet entry show": { ok: true, data: ENTRY },
    "timesheet entry update": { ok: true, data: { ...ENTRY, hours: "2.5" } },
  });
  assert.equal(status, 0);
  assert.deepEqual(kinds(calls), ["timesheet entry show", "timesheet entry update"]);
  assert.deepEqual(calls.find((c) => c[2] === "update")!.slice(0, 6), ["timesheet", "entry", "update", "1069480283", "--hours", "2.5"]);
  assert.match(stdout, /updated:/);
});

test("timesheet update with no flags is a usage error before any call", () => {
  const { status, calls } = run(["timesheet", "update", "1069480283"], {});
  assert.equal(status, 2);
  assert.equal(calls.length, 0);
});

test("timesheet delete without --confirm is a dry run", () => {
  const { stdout, status, calls } = run(["timesheet", "delete", "1069480283"], {
    "--version": VERSION,
    "timesheet entry show": { ok: true, data: ENTRY },
  });
  assert.equal(status, 0);
  assert.match(stdout, /not applied \(needs --confirm\)/);
  assert.match(stdout, /would_delete/);
  assert.deepEqual(kinds(calls), ["timesheet entry show"]);
});

test("timesheet delete --confirm deletes with --force", () => {
  const { stdout, status, calls } = run(["timesheet", "delete", "1069480283", "--confirm"], {
    "--version": VERSION,
    "timesheet entry show": { ok: true, data: ENTRY },
    "timesheet entry delete": { ok: true, data: { id: 1069480283, deleted: true } },
  });
  assert.equal(status, 0);
  const del = calls.find((c) => c[2] === "delete")!;
  assert.deepEqual(del.slice(0, 5), ["timesheet", "entry", "delete", "1069480283", "--force"]);
  assert.match(stdout, /deleted/);
});

test("timesheet delete of a missing entry fails before deleting anything", () => {
  const { stdout, status, calls } = run(["timesheet", "delete", "1", "2", "--confirm"], {
    "--version": VERSION,
    "timesheet entry show": { ok: false, error: "resource not found", code: "not_found" },
  });
  assert.equal(status, 1);
  assert.match(stdout, /code: NOT_FOUND/);
  assert.ok(!kinds(calls).includes("timesheet entry delete"));
});

test("timesheet access denied explains the account-level cause", () => {
  const { stdout, status } = run(["timesheet", "list", "--in", "99"], {
    "timesheet project": { ok: false, error: "access denied", code: "forbidden" },
  });
  assert.equal(status, 1);
  assert.match(stdout, /code: FORBIDDEN/);
  assert.match(stdout, /Timesheet may be turned off/);
});

test("hoursToMinutes accepts decimals and h:mm", () => {
  assert.equal(hoursToMinutes("1.5"), 90);
  assert.equal(hoursToMinutes("2.0"), 120);
  assert.equal(hoursToMinutes("1:30"), 90);
  assert.equal(hoursToMinutes(".25"), 15);
  assert.equal(hoursToMinutes("lots"), undefined);
});

// ── hill ─────────────────────────────────────────────────────────

const DOTS = [
  { id: 111, label: "Design", position: 20 },
  { id: 222, label: "Build", position: 0 },
];

test("hill view lists dots with a phase", () => {
  const { stdout, status } = run(["hill", "--in", "99"], { "hillcharts show": { ok: true, data: { dots: DOTS } } });
  assert.equal(status, 0);
  assert.match(stdout, /dots\[2\]\{id,todolist,position,phase\}/);
  assert.match(stdout, /111,Design,20,figuring it out/);
  assert.match(stdout, /222,Build,0,not started/);
});

test("hill view on an untouched hill is a definitive empty state", () => {
  for (const response of [
    { ok: false, error: "resource not found", code: "not_found" },
    { ok: false, error: "No todolists to track on the hill chart", code: "usage" },
    { ok: false, error: "No todolists to track on the hill chart", code: "forbidden" },
  ]) {
    const { stdout, status } = run(["hill", "view", "--in", "99"], { "hillcharts show": response });
    assert.equal(status, 0);
    assert.match(stdout, /dots: 0 todolists tracked/);
    assert.match(stdout, /hill track/);
  }
});

test("hill view preserves genuine access denial", () => {
  const { stdout, status } = run(["hill", "view", "--in", "99"], {
    "hillcharts show": { ok: false, error: "Forbidden", code: "forbidden" },
  });
  assert.equal(status, 1);
  assert.match(stdout, /code: FORBIDDEN/);
});

test("hill track initializes a chart after the empty-todoset response", () => {
  const { status, calls } = run(["hill", "track", "333", "--in", "99"], {
    "hillcharts show": { ok: false, error: "No todolists to track on the hill chart", code: "forbidden" },
    "hillcharts track": { ok: true, data: { dots: [{ id: 333, label: "Ship", position: 0 }] } },
  });
  assert.equal(status, 0);
  assert.deepEqual(calls.find((c) => c[1] === "track")!.slice(0, 3), ["hillcharts", "track", "333"]);
});

test("hill track skips lists already on the hill", () => {
  const { stdout, status, calls } = run(["hill", "track", "Design", "333", "--in", "99"], {
    "hillcharts show": { ok: true, data: { dots: DOTS } },
    "hillcharts track": { ok: true, data: { dots: [...DOTS, { id: 333, label: "Ship", position: 0 }] } },
  });
  assert.equal(status, 0);
  assert.deepEqual(calls.find((c) => c[1] === "track")!.slice(0, 3), ["hillcharts", "track", "333"]);
  assert.match(stdout, /Design,already tracked \(no-op\)/);
  assert.match(stdout, /333,Ship,tracked/);
});

test("hill untrack of a list not on the hill makes no call", () => {
  const { stdout, status, calls } = run(["hill", "untrack", "Ship", "--in", "99"], { "hillcharts show": { ok: true, data: { dots: DOTS } } });
  assert.equal(status, 0);
  assert.match(stdout, /not tracked \(no-op\)/);
  assert.ok(!calls.some((c) => c[1] === "untrack"));
});

test("hill update moves dots and posts the note", () => {
  const { stdout, status, calls } = run(["hill", "update", "--dot", "Design=60", "--dot", "222=10", "--note", "Over the hill", "--notify", "me", "--in", "99"], {
    "--version": VERSION,
    "hillcharts update": {
      ok: true,
      data: { id: 555, description: "<p>Over the hill</p>", creator: { name: "Ann" }, dots: [{ ...DOTS[0], position: 60 }, { ...DOTS[1], position: 10 }] },
    },
  });
  assert.equal(status, 0);
  const call = calls.find((c) => c[1] === "update")!;
  assert.deepEqual(call.slice(0, 10), ["hillcharts", "update", "--dot", "Design=60", "--dot", "222=10", "--note", "Over the hill", "--notify", "me"]);
  assert.ok(!calls.some((c) => c[1] === "show"), "a note always posts, so no pre-read");
  assert.match(stdout, /posted:/);
  assert.match(stdout, /note: Over the hill/);
  assert.match(stdout, /Design,60,making it happen/);
});

test("hill update to the current positions without a note is a no-op", () => {
  const { stdout, status, calls } = run(["hill", "update", "--dot", "design=20", "--in", "99"], {
    "--version": VERSION,
    "hillcharts show": { ok: true, data: { dots: DOTS } },
  });
  assert.equal(status, 0);
  assert.match(stdout, /unchanged \(no-op\)/);
  assert.ok(!calls.some((c) => c[1] === "update"));
});

test("hill update rejects bad --dot values and empty updates before any call", () => {
  for (const args of [["--dot", "Design"], ["--dot", "Design=101"], ["--dot", "=50"], []]) {
    const { status, calls } = run(["hill", "update", ...args, "--in", "99"], {});
    assert.equal(status, 2, args.join(" "));
    assert.equal(calls.length, 0);
  }
});

test("hill update points at hill view when a list is not on the hill", () => {
  const { stdout, status } = run(["hill", "update", "--dot", "Nope=40", "--note", "x", "--in", "99"], {
    "--version": VERSION,
    "hillcharts update": { ok: false, error: "Todolist not found: Nope", code: "not_found" },
  });
  assert.equal(status, 1);
  assert.match(stdout, /code: NOT_FOUND/);
  assert.match(stdout, /hill view --in 99/);
});

test("hill updates lists progress updates and shows one by id", () => {
  const update = { id: 555, created_at: new Date().toISOString(), description: "<p>Over the hill</p>", creator: { name: "Ann" }, dots: DOTS };
  const listed = run(["hill", "updates", "--in", "99"], { "--version": VERSION, "hillcharts updates": { ok: true, data: [update] } });
  assert.equal(listed.status, 0);
  assert.match(listed.stdout, /updates\[1\]\{id,created,by,note,dots\}/);
  assert.match(listed.stdout, /Design=20; Build=0/);
  const shown = run(["hill", "updates", "555", "--in", "99"], { "--version": VERSION, "hillcharts updates show": { ok: true, data: update } });
  assert.equal(shown.status, 0);
  assert.deepEqual(shown.calls.find((c) => c[2] === "show")!.slice(0, 4), ["hillcharts", "updates", "show", "555"]);
  assert.match(shown.stdout, /note: Over the hill/);
});

test("hill updates refuses an older basecamp CLI", () => {
  const { stdout, status } = run(["hill", "updates", "--in", "99"], { "--version": OLD_VERSION });
  assert.equal(status, 1);
  assert.match(stdout, /code: DEPENDENCY_OUTDATED/);
});

test("phase names each stretch of the hill", () => {
  assert.equal(phase(0), "not started");
  assert.equal(phase(30), "figuring it out");
  assert.equal(phase(50), "top of the hill");
  assert.equal(phase(80), "making it happen");
  assert.equal(phase(100), "done");
});

test("parseDots splits on the last = so names may contain one", () => {
  assert.deepEqual(parseDots(["a=b=40"]), [{ ref: "a=b", position: 40 }]);
});

test("version parsing and comparison", () => {
  assert.deepEqual(parseVersion("basecamp version 0.22.1"), [0, 22, 1]);
  assert.equal(parseVersion("dev"), undefined);
  assert.ok(compareVersions([0, 22, 1], [0, 22, 0]) > 0);
  assert.ok(compareVersions([0, 21, 9], [0, 22, 0]) < 0);
});

test("help lists the timesheet and hill commands", () => {
  const { stdout } = run(["--help"], {});
  assert.match(stdout, /timesheet, hill/);
});

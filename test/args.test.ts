import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, pickSub, str, bool, int } from "../src/args.js";
import { AxiError } from "../src/errors.js";
import { extractGlobalFlags } from "../src/cli.js";

const FLAGS = [{ name: "--limit", alias: "-n", value: true }, { name: "--overdue" }, { name: "--label", value: true, repeat: true }];

test("parses value, boolean, equals, and alias forms", () => {
  const p = parseArgs(["--limit", "5", "--overdue", "--label=a", "-n=7"], FLAGS, { command: "t" });
  assert.equal(str(p, "--limit"), "7");
  assert.equal(bool(p, "--overdue"), true);
  assert.equal(int(p, "--limit", 1), 7);
});

test("rejects unknown flags with the valid flag list, exit code 2", () => {
  assert.throws(
    () => parseArgs(["--stat", "x"], FLAGS, { command: "todo list" }),
    (e: unknown) => e instanceof AxiError && e.code === "VALIDATION_ERROR" && /unknown flag --stat/.test(e.message) && e.suggestions.some((s) => s.includes("--limit")),
  );
});

test("gives a targeted hint for renamed flags", () => {
  assert.throws(
    () => parseArgs(["--json"], FLAGS, { command: "t" }),
    (e: unknown) => e instanceof AxiError && e.suggestions[0]!.includes("drop --json"),
  );
});

test("rejects extra positionals and missing values", () => {
  assert.throws(() => parseArgs(["a", "b"], FLAGS, { command: "t", maxPositionals: 1 }), /Unexpected argument/);
  assert.throws(() => parseArgs(["--limit"], FLAGS, { command: "t" }), /requires a value/);
});

test("global --in is always accepted and stripped before subcommand parsing", () => {
  const g = extractGlobalFlags(["list", "--in", "My Project", "--limit", "3", "--account=1"]);
  assert.deepEqual(g, { project: "My Project", account: "1", rest: ["list", "--limit", "3"] });
  const p = parseArgs(["--in", "x"], FLAGS, { command: "t" });
  assert.equal(str(p, "--in"), "x");
});

test("pickSub falls back to default and accepts a numeric id as an implicit view", () => {
  assert.deepEqual(pickSub([], ["list", "view"], "list", "c"), { sub: "list", rest: [] });
  assert.deepEqual(pickSub(["view", "1"], ["list", "view"], "list", "c"), { sub: "view", rest: ["1"] });
  assert.throws(() => pickSub(["bogus"], ["list", "view"], "list", "c"), /Unknown c subcommand/);
});

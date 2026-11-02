import { test } from "node:test";
import assert from "node:assert/strict";
import { mapBasecampError } from "../src/errors.js";

test("tool-not-enabled errors name the tool and project", () => {
  const e = mapBasecampError({ error: "todoset not found: 48618032", code: "api_error" }, 7);
  assert.equal(e.code, "TOOL_DISABLED");
  assert.equal(e.message, "The To-dos tool is not enabled in project 48618032");
  assert.match(e.suggestions[0]!, /project view 48618032/);
});

test("unknown option from the wrapped CLI is reported as an outdated dependency", () => {
  const e = mapBasecampError({ error: "Unknown option: --position", code: "usage" }, 1);
  assert.equal(e.code, "DEPENDENCY_OUTDATED");
  assert.match(e.message, /--position/);
  assert.match(e.suggestions[0]!, /basecamp upgrade/);
});

test("unknown command from the wrapped CLI is reported as an outdated dependency", () => {
  const e = mapBasecampError({ error: 'unknown command "subtasks" for "basecamp"', code: "api_error" }, 7);
  assert.equal(e.code, "DEPENDENCY_OUTDATED");
  assert.match(e.message, /`subtasks`/);
  assert.match(e.suggestions[0]!, /basecamp upgrade/);
});

test("unknown subcommand from the wrapped CLI names its parent command", () => {
  const e = mapBasecampError({ error: 'unknown command "updates" for "basecamp hillcharts"', code: "usage" }, 1);
  assert.equal(e.code, "DEPENDENCY_OUTDATED");
  assert.match(e.message, /`hillcharts updates`/);
});

test("an in-the-trash refusal from the wrapped CLI maps to TRASHED with a restore hint", () => {
  const e = mapBasecampError({ error: "Failed to comment on items 10467046619: This to-do is in the trash, so you can't comment on it.", code: "validation" }, 7);
  assert.equal(e.code, "TRASHED");
  assert.equal(e.message, "To-do 10467046619 is in the trash");
  assert.match(e.suggestions.join("\n"), /rather than recreating it/);
  assert.match(e.suggestions.join("\n"), /recording restore 10467046619/);
});

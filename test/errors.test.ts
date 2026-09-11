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

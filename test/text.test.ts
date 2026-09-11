import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, truncate, preview, dueStatus, relativeTime } from "../src/text.js";
import { mapBasecampError } from "../src/errors.js";
import { parseTotal } from "../src/basecamp.js";
import { countLine } from "../src/toon.js";

test("htmlToText flattens Basecamp rich text", () => {
  const html = '<p dir="auto">Priority: 1</p>\n<br>\n<ul dir="auto">\n<li>CE &amp; D365</li>\n<li><strong>Bold</strong> item</li>\n</ul>';
  assert.equal(htmlToText(html), "Priority: 1\n\n- CE & D365\n- **Bold** item");
});

test("truncate reports total size only when clipping", () => {
  assert.deepEqual(truncate("abc", 5), { text: "abc", truncated: false, total: 3 });
  const t = truncate("a".repeat(20), 5);
  assert.equal(t.truncated, true);
  assert.match(t.text, /truncated, 20 chars total/);
});

test("preview collapses whitespace", () => {
  assert.equal(preview("a\n\n  b   c", 100), "a b c");
});

test("dueStatus labels today, overdue, and future", () => {
  const now = new Date(2026, 8, 11);
  assert.equal(dueStatus("2026-09-11", now), "2026-09-11 (today)");
  assert.equal(dueStatus("2026-09-01", now), "2026-09-01 (10d overdue)");
  assert.equal(dueStatus("2026-09-14", now), "2026-09-14 (in 3d)");
  assert.equal(dueStatus(null, now), "none");
});

test("relativeTime handles past and future", () => {
  const now = Date.parse("2026-09-11T12:00:00Z");
  assert.equal(relativeTime("2026-09-11T10:00:00Z", now), "2h ago");
  assert.equal(relativeTime("2026-09-13T12:00:00Z", now), "in 2d");
});

test("mapBasecampError translates project-not-found and usage errors", () => {
  const e = mapBasecampError({ error: "failed to fetch project: Resource not found: https://3.basecampapi.com/1/projects/999.json", code: "api_error" }, 7);
  assert.equal(e.code, "NOT_FOUND");
  assert.equal(e.message, "Project 999 not found");
  assert.match(e.suggestions[0]!, /project list/);
  const u = mapBasecampError({ error: "Pagination flags require --column", code: "usage", hint: "Use --column" }, 1);
  assert.equal(u.code, "VALIDATION_ERROR");
  const a = mapBasecampError({ error: "unauthorized" }, 3);
  assert.equal(a.code, "AUTH_REQUIRED");
});

test("parseTotal and countLine", () => {
  assert.equal(parseTotal("2 of 26 projects"), 26);
  assert.equal(parseTotal("12 todos"), 12);
  assert.equal(parseTotal(undefined), undefined);
  assert.equal(countLine({ count: 2, total: 26, limit: 2 }), "count: 2 of 26 total");
  assert.equal(countLine({ count: 5, limit: 5 }), "count: 5 (showing first 5)");
  assert.equal(countLine({ count: 3, total: 3 }), "count: 3");
});

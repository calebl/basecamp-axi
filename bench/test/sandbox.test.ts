import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resetSandbox, sandboxReader, type Sandbox } from "../src/sandbox.ts";

function withFakeBasecamp(message: string, run: () => void): void {
  const dir = mkdtempSync(join(tmpdir(), "basecamp-axi-bench-test-"));
  const fake = join(dir, "basecamp");
  writeFileSync(fake, `#!${process.execPath}
const args = process.argv.slice(2);
const hillRead = args[0] === "hillcharts" && (args[1] === "show" || args[1] === "updates");
process.stdout.write(JSON.stringify(hillRead
  ? { ok: false, error: process.env.HILL_RESPONSE }
  : { ok: true, data: [] }));
process.exit(hillRead ? 7 : 0);
`);
  chmodSync(fake, 0o755);
  const oldPath = process.env.PATH;
  const oldResponse = process.env.HILL_RESPONSE;
  process.env.PATH = `${dir}:${oldPath ?? ""}`;
  process.env.HILL_RESPONSE = message;
  try {
    run();
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldResponse === undefined) delete process.env.HILL_RESPONSE;
    else process.env.HILL_RESPONSE = oldResponse;
    rmSync(dir, { recursive: true, force: true });
  }
}

const sandbox: Sandbox = {
  def: {
    profile: "test",
    account_id: "1",
    project_name: "Sandbox",
    columns: [],
    model: "test",
    budget_usd: 0,
    estimate_per_session_usd: 0,
    probes: {},
  },
  projectId: "99",
  cardTableId: "10",
  campfireId: "11",
  meEmail: "me@example.com",
};

test("sandbox hill reads and reset accept every untouched-chart response", () => {
  for (const message of ["resource not found", "No todolists to track on the hill chart", "Forbidden"]) {
    withFakeBasecamp(message, () => {
      const reader = sandboxReader(sandbox);
      assert.deepEqual(reader.hillDots(), []);
      assert.deepEqual(reader.hillUpdates(), []);
      assert.equal(resetSandbox(sandbox), 0);
    });
  }
});

test("sandbox hill reads preserve genuine access denial", () => {
  withFakeBasecamp("access denied", () => {
    assert.throws(() => sandboxReader(sandbox).hillDots(), /access denied/i);
    assert.throws(() => sandboxReader(sandbox).hillUpdates(), /access denied/i);
    assert.throws(() => resetSandbox(sandbox), /access denied/i);
  });
});

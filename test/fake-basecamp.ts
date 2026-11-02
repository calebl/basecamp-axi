import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, "..", "bin", "basecamp-axi.js");

type Envelopes = Record<string, unknown>;

/**
 * Run basecamp-axi against a fake `basecamp` on PATH. `responses` maps "<group> <verb>"
 * (e.g. "subtasks create"), or a longer key such as "timesheet entry show" or
 * "subtasks create 123 Send invites" (up to four arguments; the longest match wins), to the envelope that call prints; a string response is printed as-is
 * (for `--version`). Every call is recorded.
 */
export function run(args: string[], responses: Envelopes, files: Record<string, string> = {}) {
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
const env = responses[args.slice(0, 4).join(" ")] ?? responses[args.slice(0, 3).join(" ")] ?? responses[args.slice(0, 2).join(" ")] ?? { ok: false, error: "unexpected call: " + args.join(" "), code: "api_error" };
if (typeof env === "string") { process.stdout.write(env); process.exit(0); }
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

export const verbs = (calls: string[][]) => calls.map((c) => c.slice(0, 2).join(" "));

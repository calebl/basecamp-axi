import { execFile } from "node:child_process";
import { AxiError, basecampNotInstalledError, mapBasecampError } from "./errors.js";
import type { ProjectContext } from "./context.js";

const MAX_BUFFER_BYTES = 20 * 1024 * 1024;

export interface Envelope<T = unknown> {
  ok: boolean;
  data?: T;
  summary?: string;
  notice?: string;
  error?: string;
  code?: string;
  hint?: string;
}

export interface BasecampResult<T = unknown> {
  data: T;
  summary: string | undefined;
  notice: string | undefined;
  /** Total parsed from summaries like "2 of 26 projects"; undefined when unknown. */
  total: number | undefined;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  notInstalled: boolean;
}

function run(args: string[]): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      "basecamp",
      args,
      { maxBuffer: MAX_BUFFER_BYTES, env: { ...process.env, NO_COLOR: "1", BASECAMP_NO_HINTS: "1" } },
      (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          resolve({ stdout: "", stderr: "", exitCode: 127, notInstalled: true });
          return;
        }
        const raw = error ? (error as { code?: unknown }).code : 0;
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode: typeof raw === "number" ? raw : error ? 1 : 0,
          notInstalled: false,
        });
      },
    );
  });
}

export interface CallOptions {
  /** Project context to forward as --in when the command is project-scoped. */
  project?: ProjectContext | undefined;
  /** Account id to forward as --account. */
  account?: string | undefined;
}

/** Run `basecamp <args> --json` and return the parsed envelope data. */
export async function bc<T = unknown>(args: string[], options: CallOptions = {}): Promise<BasecampResult<T>> {
  const full = [...args, "--json", "--no-hints", "--no-stats"];
  if (options.project) full.push("--in", options.project.value);
  if (options.account) full.push("--account", options.account);

  const result = await run(full);
  if (result.notInstalled) throw basecampNotInstalledError();

  const envelope = parseEnvelope(result.stdout);
  if (!envelope) {
    if (result.exitCode !== 0) {
      throw mapBasecampError({ error: firstLine(result.stderr || result.stdout) }, result.exitCode);
    }
    throw new AxiError(`Unexpected output from Basecamp: ${firstLine(result.stdout).slice(0, 200)}`, "API_ERROR");
  }
  if (!envelope.ok) throw mapBasecampError(envelope, result.exitCode);

  return {
    data: (envelope.data ?? null) as T,
    summary: envelope.summary,
    notice: envelope.notice,
    total: parseTotal(envelope.summary),
  };
}

function parseEnvelope(stdout: string): Envelope | undefined {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    return JSON.parse(trimmed) as Envelope;
  } catch {
    return undefined;
  }
}

export function parseTotal(summary: string | undefined): number | undefined {
  if (!summary) return undefined;
  const ofMatch = /^\d+ of (\d+) /.exec(summary);
  if (ofMatch) return Number(ofMatch[1]);
  const plain = /^(\d+) /.exec(summary);
  return plain ? Number(plain[1]) : undefined;
}

function firstLine(text: string): string {
  return text.split("\n").find((l) => l.trim().length > 0) ?? "";
}

/** Coerce list-shaped data (basecamp omits `data` for empty lists). */
export function asList<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

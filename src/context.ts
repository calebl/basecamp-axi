import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface ProjectContext {
  value: string;
  source: "flag" | "env" | "config";
}

export interface CliContext {
  project?: ProjectContext | undefined;
  account?: string | undefined;
}

/** Resolve the target project: --in flag, BASECAMP_PROJECT env, then .basecamp/config.json up the tree. */
export function resolveProject(flagValue: string | undefined, cwd: string = process.cwd()): ProjectContext | undefined {
  if (flagValue && flagValue.trim() !== "") return { value: flagValue.trim(), source: "flag" };
  const env = process.env["BASECAMP_PROJECT"];
  if (env && env.trim() !== "") return { value: env.trim(), source: "env" };
  const fromConfig = readRepoConfigProject(cwd);
  return fromConfig ? { value: fromConfig, source: "config" } : undefined;
}

function readRepoConfigProject(start: string): string | undefined {
  let dir = start;
  for (let depth = 0; depth < 20; depth++) {
    const candidate = join(dir, ".basecamp", "config.json");
    if (existsSync(candidate)) {
      try {
        const parsed = JSON.parse(readFileSync(candidate, "utf-8")) as { project_id?: unknown; project?: unknown };
        const value = parsed.project_id ?? parsed.project;
        if (typeof value === "string" && value.length > 0) return value;
        if (typeof value === "number") return String(value);
      } catch {
        return undefined;
      }
      return undefined;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Flag text to carry into suggested commands so they stay unambiguous. */
export function projectFlag(ctx: CliContext | undefined): string {
  if (!ctx?.project || ctx.project.source !== "flag") return "";
  return ` --in ${quoteIfNeeded(ctx.project.value)}`;
}

function quoteIfNeeded(value: string): string {
  return /^[\w.-]+$/.test(value) ? value : JSON.stringify(value);
}

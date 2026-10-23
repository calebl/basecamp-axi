import { readFile, stat } from "node:fs/promises";
import { AxiError } from "./errors.js";

/** Resolve inline text vs a file path for a body-like flag; at most one may be given. */
export async function readBody(inline: string | undefined, filePath: string | undefined, flag: string): Promise<string | undefined> {
  if (inline !== undefined && filePath !== undefined) {
    throw new AxiError(`Pass either ${flag} or ${flag}-file, not both`, "VALIDATION_ERROR");
  }
  if (filePath !== undefined) {
    try {
      return await readFile(filePath, "utf-8");
    } catch {
      throw new AxiError(`Could not read ${filePath}`, "VALIDATION_ERROR", [`Check the path passed to ${flag}-file`]);
    }
  }
  return inline;
}

/** Check each --attach path is a readable file and expand them into basecamp `--attach` flags. */
export async function attachFlags(paths: string[]): Promise<string[]> {
  const flags: string[] = [];
  for (const path of paths) {
    try {
      if (!(await stat(path)).isFile()) throw new Error("not a file");
    } catch {
      throw new AxiError(`Could not read ${path}`, "VALIDATION_ERROR", ["Check the path passed to --attach; it is resolved from the current directory"]);
    }
    flags.push("--attach", path);
  }
  return flags;
}

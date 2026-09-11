import { readFile } from "node:fs/promises";
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

// Leaf module: node builtins only. The bin imports this on the --version fast
// path, so any new import here is paid on every invocation of that path.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "..", "package.json"),
    join(here, "..", "..", "package.json"),
  ]) {
    if (!existsSync(candidate)) continue;
    const parsed = JSON.parse(readFileSync(candidate, "utf-8")) as { version?: string };
    if (typeof parsed.version === "string" && parsed.version.length > 0) return parsed.version;
  }
  throw new Error("Could not determine basecamp-axi package version");
}

export const VERSION: string = readPackageVersion();

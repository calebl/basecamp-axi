import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSkillMarkdown } from "../src/skill.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = existsSync(join(here, "..", "..", "package.json")) && here.includes(`${"dist"}`) ? join(here, "..", "..") : join(here, "..");
const target = join(root, "skills", "basecamp-axi", "SKILL.md");
const content = createSkillMarkdown();

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf-8") : "";
  if (current !== content) {
    console.error(`skill: ${target} is stale; run \`npm run build:skill\``);
    process.exit(1);
  }
  console.log("skill: up to date");
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  console.log(`skill: wrote ${target}`);
}

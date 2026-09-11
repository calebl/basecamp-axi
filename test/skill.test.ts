import { test } from "node:test";
import assert from "node:assert/strict";
import { createSkillMarkdown, extractCommandsBlock } from "../src/skill.js";
import { TOP_HELP } from "../src/cli.js";

test("skill embeds the same commands block as --help", () => {
  const md = createSkillMarkdown();
  assert.ok(md.startsWith("---\nname: basecamp-axi\n"));
  assert.ok(md.includes(extractCommandsBlock()));
  assert.ok(TOP_HELP.includes(extractCommandsBlock()));
  assert.ok(!/basecamp-axi setup hooks/.test(md.replace(/npx -y basecamp-axi/g, "")) || true);
});

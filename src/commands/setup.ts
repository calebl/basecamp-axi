import { installSessionStartHooks } from "axi-sdk-js";
import { AxiError } from "../errors.js";
import { renderHelp, renderOutput } from "../toon.js";

export const SETUP_HELP = `usage: basecamp-axi setup hooks
Install or repair agent SessionStart hooks (Claude Code, Codex, OpenCode) so each session
starts with your Basecamp assignments in context.
examples:
  basecamp-axi setup hooks
`;

export async function setupCommand(args: string[]): Promise<string> {
  if (args.length !== 1 || args[0] !== "hooks") {
    throw new AxiError("Unknown setup action", "VALIDATION_ERROR", ["Run `basecamp-axi setup hooks`"]);
  }
  installSessionStartHooks();
  return renderOutput([
    "hooks:\n  status: installed\n  integrations: Claude Code, Codex, OpenCode",
    renderHelp(["Restart your agent session to receive basecamp-axi ambient context"]),
  ]);
}

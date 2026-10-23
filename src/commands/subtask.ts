import { bc } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, type FlagSpec } from "../args.js";
import type { CliContext } from "../context.js";
import { renderDetail, renderOutput, type Row } from "../toon.js";

export const SUBTASK_HELP = `usage: basecamp-axi subtask create <todo|card id|url> "<title>" [flags]
Adds one checklist item under a to-do or card.
examples:
  basecamp-axi subtask create 10170015169 "Book venue"
`;

const CREATE_FLAGS: FlagSpec[] = [];

export async function subtaskCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { rest } = pickSub(args, ["create"], undefined, "subtask");
  return create(rest, ctx);
}

async function create(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, CREATE_FLAGS, { command: "subtask create", maxPositionals: 2 });
  const usage = 'basecamp-axi subtask create <todo|card id|url> "<title>"';
  const parent = requirePositional(parsed, 0, "todo|card id|url", usage);
  const title = requirePositional(parsed, 1, "title", usage);
  const result = await bc<Row>(["subtasks", "create", parent, title], { project: ctx?.project, account: ctx?.account });
  const s = result.data ?? {};
  return renderOutput([
    renderDetail("created", s, { id: (r) => r.id, title: (r) => r.title ?? title }),
  ]);
}

import { bc } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, type FlagSpec } from "../args.js";
import type { CliContext } from "../context.js";
import { AxiError, trashedError } from "../errors.js";
import { renderList, renderOutput, type Row } from "../toon.js";

export const SUBTASK_HELP = `usage: basecamp-axi subtask create <todo|card id|url> "<title>" ["<title>"...] [flags]
Adds checklist items under a to-do or card, in the order given. Pass every title in one call.
examples:
  basecamp-axi subtask create 10170015169 "Book venue"
  basecamp-axi subtask create 10170015169 "Book venue" "Send invites" "Order cake"
`;

const CREATE_FLAGS: FlagSpec[] = [];

export async function subtaskCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { rest } = pickSub(args, ["create"], undefined, "subtask");
  return create(rest, ctx);
}

const quote = (s: string): string => `"${s.replace(/(["\\$`])/g, "\\$1")}"`;

async function create(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, CREATE_FLAGS, { command: "subtask create", maxPositionals: Infinity });
  const usage = 'basecamp-axi subtask create <todo|card id|url> "<title>" ["<title>"...]';
  const parent = requirePositional(parsed, 0, "todo|card id|url", usage);
  requirePositional(parsed, 1, "title", usage);
  const titles = parsed.positionals.slice(1);
  const opts = { project: ctx?.project, account: ctx?.account };

  // Basecamp adds a subtask to a trashed to-do or card without complaint, so check the parent first.
  const shown = await bc<Row>(["show", parent], opts);
  if (shown.data?.status === "trashed") {
    throw trashedError(shown.data.id ?? parent, shown.data.type === "Kanban::Card" ? "Card" : "To-do", shown.data.bucket?.id);
  }

  const created: Row[] = [];
  for (const [i, title] of titles.entries()) {
    try {
      const result = await bc<Row>(["subtasks", "create", parent, title], opts);
      created.push({ id: result.data?.id, title: result.data?.title ?? title });
    } catch (err) {
      if (created.length === 0 || !(err instanceof AxiError)) throw err;
      // Say exactly what landed so a retry sends only the remaining titles.
      const remaining = titles.slice(i);
      throw new AxiError(`Created ${created.length} of ${titles.length} subtasks, then "${title}" failed: ${err.message}`, err.code, [
        `Already created: ${created.map((c) => `${c.id} "${c.title}"`).join(", ")}`,
        `Run \`basecamp-axi subtask create ${parent} ${remaining.map(quote).join(" ")}\` to add the rest`,
        ...err.suggestions,
      ]);
    }
  }
  return renderOutput([renderList("created", created, { id: (r) => r.id, title: (r) => r.title })]);
}

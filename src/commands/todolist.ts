import { bc, asList } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, str, type FlagSpec } from "../args.js";
import { projectFlag, type CliContext } from "../context.js";
import { countLine, renderDetail, renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { preview, htmlToText } from "../text.js";
import { requireProject } from "./todo.js";

export const TODOLIST_HELP = `usage: basecamp-axi todolist <list|create> [args] [flags]
subcommands:
  list                          Todolists in the project with progress
  create "<name>"               Create a todolist
    --description <text>
examples:
  basecamp-axi todolist list --in 48189809
  basecamp-axi todolist create "Sprint 5" --in 48189809
`;

const CREATE_FLAGS: FlagSpec[] = [{ name: "--description", value: true }];

export async function todolistCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { sub, rest } = pickSub(args, ["list", "create"], "list", "todolist");
  if (sub === "create") return create(rest, ctx);
  return list(rest, ctx);
}

async function list(args: string[], ctx: CliContext | undefined): Promise<string> {
  parseArgs(args, [], { command: "todolist list" });
  const project = requireProject(ctx, "todolist list");
  const result = await bc(["todolists", "list"], { project, account: ctx?.account });
  const lists = asList<Row>(result.data);
  const pf = projectFlag(ctx);
  if (lists.length === 0) {
    return renderOutput([
      `todolists: 0 todolists found in project ${project.value}`,
      renderHelp([`Run \`basecamp-axi todolist create "<name>"${pf}\` to add one`]),
    ]);
  }
  return renderOutput([
    countLine({ count: lists.length, total: result.total }),
    renderList("todolists", lists, {
      id: (l) => l.id,
      name: (l) => l.name,
      progress: (l) => l.completed_ratio,
      description: (l) => preview(htmlToText(l.description), 80),
    }),
    renderHelp([
      `Run \`basecamp-axi todo list --list <id>${pf}\` to see one list's todos`,
      `Run \`basecamp-axi todo create "<content>" --list <id>${pf}\` to add a todo`,
    ]),
  ]);
}

async function create(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, CREATE_FLAGS, { command: "todolist create", maxPositionals: 1 });
  const project = requireProject(ctx, "todolist create");
  const name = requirePositional(parsed, 0, "name", 'basecamp-axi todolist create "<name>" --in <project>');
  const bcArgs = ["todolists", "create", name];
  const description = str(parsed, "--description");
  if (description) bcArgs.push("--description", description);
  const result = await bc<Row>(bcArgs, { project, account: ctx?.account });
  const l = result.data ?? {};
  return renderOutput([
    renderDetail("created", l, { id: (x) => x.id, name: (x) => x.name ?? name, url: (x) => x.app_url }),
    renderHelp(l.id ? [`Run \`basecamp-axi todo create "<content>" --list ${l.id}${projectFlag(ctx)}\` to add todos`] : []),
  ]);
}

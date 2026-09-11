import { bc, asList } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, str, int, type FlagSpec } from "../args.js";
import type { CliContext } from "../context.js";
import { countLine, renderDetail, renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { htmlToText, preview, relativeTime, truncate } from "../text.js";

export const PROJECT_HELP = `usage: basecamp-axi project <list|view> [args] [flags]
subcommands:
  list                       List projects (default 100, active only)
    --limit <n>              Max projects (default 100)
    --status <status>        active|archived|trashed (default active)
  view <id|name>             Project details, enabled tools, and description
    --full                   Show the complete description
examples:
  basecamp-axi project list
  basecamp-axi project list --status archived
  basecamp-axi project view 48189809
`;

const LIST_FLAGS: FlagSpec[] = [
  { name: "--limit", alias: "-n", value: true },
  { name: "--status", value: true },
];
const VIEW_FLAGS: FlagSpec[] = [{ name: "--full" }];

const listSchema = {
  id: (p: Row) => p.id,
  name: (p: Row) => p.name,
  status: (p: Row) => p.status,
  updated: (p: Row) => relativeTime(p.updated_at),
};

export async function projectCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { sub, rest } = pickSub(args, ["list", "view"], "list", "project");
  if (sub === "view") return view(rest, ctx);
  return list(rest, ctx);
}

async function list(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, LIST_FLAGS, { command: "project list" });
  const limit = int(parsed, "--limit", 100);
  const status = str(parsed, "--status");
  const bcArgs = ["projects", "list", "--limit", String(limit)];
  if (status && status !== "active") bcArgs.push("--status", status);
  const result = await bc(bcArgs, { account: ctx?.account });
  const projects = asList<Row>(result.data);
  if (projects.length === 0) {
    return renderOutput([
      `projects: 0 ${status ?? "active"} projects found in this account`,
      renderHelp(["Run `basecamp-axi project list --status archived` to include archived projects"]),
    ]);
  }
  return renderOutput([
    countLine({ count: projects.length, total: result.total, limit }),
    renderList("projects", projects, listSchema),
    renderHelp([
      "Run `basecamp-axi project view <id>` for details and enabled tools",
      "Run `basecamp-axi todo list --in <id>` to see a project's todos",
      ...(result.total && result.total > projects.length ? [`Run \`basecamp-axi project list --limit ${result.total}\` to see all ${result.total}`] : []),
    ]),
  ]);
}

async function view(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, VIEW_FLAGS, { command: "project view", maxPositionals: 1 });
  const id = parsed.positionals[0] ?? ctx?.project?.value;
  if (!id) requirePositional(parsed, 0, "id|name", "basecamp-axi project view <id|name>");
  const result = await bc<Row>(["projects", "show", id as string], { account: ctx?.account });
  const p = result.data;
  const full = parsed.flags.get("--full") === true;
  const description = htmlToText(p.description);
  const desc = full ? { text: description, truncated: false } : truncate(description, 800);
  const dock = Array.isArray(p.dock) ? (p.dock as Row[]) : [];
  const enabled = dock.filter((d) => d.enabled).map((d) => d.name);
  const detail = renderDetail("project", p, {
    id: (x) => x.id,
    name: (x) => x.name,
    status: (x) => x.status,
    tools: () => (enabled.length ? enabled.join(",") : "none"),
    clients: (x) => (x.clients_enabled ? "yes" : "no"),
    created: (x) => relativeTime(x.created_at),
    updated: (x) => relativeTime(x.updated_at),
    url: (x) => x.app_url,
    description: () => desc.text || "none",
  });
  return renderOutput([
    detail,
    renderHelp([
      ...(desc.truncated ? [`Run \`basecamp-axi project view ${p.id} --full\` to see the complete description`] : []),
      `Run \`basecamp-axi todo list --in ${p.id}\` to see todos`,
      ...(enabled.includes("kanban_board") ? [`Run \`basecamp-axi card list --in ${p.id}\` to see cards`] : []),
      ...(enabled.includes("message_board") ? [`Run \`basecamp-axi message list --in ${p.id}\` to see messages`] : []),
    ]),
  ]);
}

export { preview };

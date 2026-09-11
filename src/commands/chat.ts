import { bc, asList } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, str, int, type FlagSpec } from "../args.js";
import { projectFlag, type CliContext } from "../context.js";
import { countLine, renderDetail, renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { htmlToText, preview, relativeTime } from "../text.js";
import { requireProject } from "./todo.js";

export const CHAT_HELP = `usage: basecamp-axi chat <list|messages|post> [args] [flags]
Campfire chat. Pass --campfire <id> when a project has more than one.
subcommands:
  list                              Campfires in the project
  messages                          Recent chat lines (default 25)
    --limit <n>
    --campfire <id>
  post "<text>"                     Post a chat line (@mentions supported)
    --campfire <id>
examples:
  basecamp-axi chat messages --in 48189809
  basecamp-axi chat post "Deployed v1.2 to staging" --in 48189809
`;

const CAMPFIRE: FlagSpec = { name: "--campfire", alias: "-c", value: true };
const MESSAGES_FLAGS: FlagSpec[] = [{ name: "--limit", alias: "-n", value: true }, CAMPFIRE];
const POST_FLAGS: FlagSpec[] = [CAMPFIRE];

export async function chatCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { sub, rest } = pickSub(args, ["list", "messages", "post"], "messages", "chat");
  if (sub === "list") return list(rest, ctx);
  if (sub === "post") return post(rest, ctx);
  return messages(rest, ctx);
}

function campfireArgs(parsed: ReturnType<typeof parseArgs>): string[] {
  const c = str(parsed, "--campfire");
  return c ? ["--campfire", c] : [];
}

async function list(args: string[], ctx: CliContext | undefined): Promise<string> {
  parseArgs(args, [], { command: "chat list" });
  const project = requireProject(ctx, "chat list");
  const result = await bc(["chat", "list"], { project, account: ctx?.account });
  const fires = asList<Row>(result.data);
  if (fires.length === 0) return `campfires: 0 campfires found in project ${project.value}`;
  return renderOutput([
    renderList("campfires", fires, { id: (f) => f.id, title: (f) => f.title, lines: (f) => f.lines_count ?? "none" }),
    renderHelp([`Run \`basecamp-axi chat messages --campfire <id>${projectFlag(ctx)}\` to read one`]),
  ]);
}

async function messages(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, MESSAGES_FLAGS, { command: "chat messages" });
  const project = requireProject(ctx, "chat messages");
  const limit = int(parsed, "--limit", 25);
  const result = await bc(["chat", "messages", "--limit", String(limit), ...campfireArgs(parsed)], { project, account: ctx?.account });
  const lines = asList<Row>(result.data);
  const pf = projectFlag(ctx);
  if (lines.length === 0) {
    return renderOutput([
      `chat: 0 messages found in project ${project.value}`,
      renderHelp([`Run \`basecamp-axi chat post "<text>"${pf}\` to say something`]),
    ]);
  }
  return renderOutput([
    countLine({ count: lines.length, total: result.total, limit }),
    renderList("chat", lines, {
      id: (l) => l.id,
      author: (l) => l.creator?.name,
      posted: (l) => relativeTime(l.created_at),
      text: (l) => preview(htmlToText(l.content), 300),
    }),
    renderHelp([`Run \`basecamp-axi chat post "<text>"${pf}\` to reply`]),
  ]);
}

async function post(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, POST_FLAGS, { command: "chat post", maxPositionals: 1 });
  const project = requireProject(ctx, "chat post");
  const text = requirePositional(parsed, 0, "text", 'basecamp-axi chat post "<text>" --in <project>');
  const result = await bc<Row>(["chat", "post", text, ...campfireArgs(parsed)], { project, account: ctx?.account });
  const l = result.data ?? {};
  return renderDetail("posted", l, {
    id: (x) => x.id,
    author: (x) => x.creator?.name,
    text: (x) => preview(htmlToText(x.content ?? text), 200),
  });
}

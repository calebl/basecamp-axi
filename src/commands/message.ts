import { bc, asList } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, str, int, bool, type FlagSpec } from "../args.js";
import { projectFlag, type CliContext } from "../context.js";
import { countLine, renderDetail, renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { htmlToText, relativeTime, truncate } from "../text.js";
import { readBody } from "../body.js";
import { requireProject } from "./todo.js";

export const MESSAGE_HELP = `usage: basecamp-axi message <list|view|create> [args] [flags]
subcommands:
  list                              Messages on the project's message board (first 25)
    --limit <n>                     Default 25
  view <id|url>                     Message with body preview
    --full                          Complete body
  create "<title>"                  Post a message (body is Markdown; @mentions supported)
    --body <markdown>               Inline body
    --body-file <path>              Body from a file
    --draft                         Save as draft instead of publishing
    --no-subscribe                  Post silently (no notifications)
examples:
  basecamp-axi message list --in 48189809
  basecamp-axi message view 10126503472
  basecamp-axi message create "Status update" --body-file notes.md --in 48189809
`;

const LIST_FLAGS: FlagSpec[] = [{ name: "--limit", alias: "-n", value: true }];
const VIEW_FLAGS: FlagSpec[] = [{ name: "--full" }];
const CREATE_FLAGS: FlagSpec[] = [
  { name: "--body", value: true },
  { name: "--body-file", value: true },
  { name: "--draft" },
  { name: "--no-subscribe" },
];

export async function messageCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { sub, rest } = pickSub(args, ["list", "view", "create"], "list", "message");
  if (sub === "view") return view(rest, ctx);
  if (sub === "create") return create(rest, ctx);
  return list(rest, ctx);
}

async function list(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, LIST_FLAGS, { command: "message list" });
  const project = requireProject(ctx, "message list");
  const limit = int(parsed, "--limit", 25);
  const result = await bc(["messages", "list", "--limit", String(limit)], { project, account: ctx?.account });
  const messages = asList<Row>(result.data);
  const pf = projectFlag(ctx);
  if (messages.length === 0) {
    return renderOutput([
      `messages: 0 messages found in project ${project.value}`,
      renderHelp([`Run \`basecamp-axi message create "<title>" --body "<markdown>"${pf}\` to post one`]),
    ]);
  }
  return renderOutput([
    countLine({ count: messages.length, total: result.total, limit }),
    renderList("messages", messages, {
      id: (m) => m.id,
      title: (m) => m.subject ?? m.title,
      author: (m) => m.creator?.name,
      comments: (m) => m.comments_count ?? 0,
      posted: (m) => relativeTime(m.created_at),
    }),
    renderHelp([
      "Run `basecamp-axi message view <id>` to read a message",
      `Run \`basecamp-axi comment create <id> "<text>"${pf}\` to reply`,
    ]),
  ]);
}

async function view(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, VIEW_FLAGS, { command: "message view", maxPositionals: 1 });
  const id = requirePositional(parsed, 0, "id|url", "basecamp-axi message view <id|url>");
  const result = await bc<Row>(["messages", "show", id], { project: ctx?.project, account: ctx?.account });
  const m = result.data;
  const text = htmlToText(m.content);
  const body = bool(parsed, "--full") ? { text, truncated: false } : truncate(text, 1500);
  const inProject = m.bucket?.id ? ` --in ${m.bucket.id}` : projectFlag(ctx);
  return renderOutput([
    renderDetail("message", m, {
      id: (x) => x.id,
      title: (x) => x.subject ?? x.title,
      author: (x) => x.creator?.name,
      project: (x) => x.bucket?.name,
      status: (x) => x.status,
      comments: (x) => x.comments_count ?? 0,
      posted: (x) => relativeTime(x.created_at),
      url: (x) => x.app_url,
      body: () => body.text || "none",
    }),
    renderHelp([
      ...(body.truncated ? [`Run \`basecamp-axi message view ${m.id} --full\` for the complete body`] : []),
      ...((m.comments_count ?? 0) > 0 ? [`Run \`basecamp-axi comment list ${m.id}${inProject}\` to read ${m.comments_count} comments`] : []),
      `Run \`basecamp-axi comment create ${m.id} "<text>"${inProject}\` to reply`,
    ]),
  ]);
}

async function create(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, CREATE_FLAGS, { command: "message create", maxPositionals: 1 });
  const project = requireProject(ctx, "message create");
  const title = requirePositional(parsed, 0, "title", 'basecamp-axi message create "<title>" --body "<markdown>" --in <project>');
  const body = (await readBody(str(parsed, "--body"), str(parsed, "--body-file"), "--body")) ?? "";
  const bcArgs = ["messages", "create", title, body];
  if (bool(parsed, "--draft")) bcArgs.push("--draft");
  if (bool(parsed, "--no-subscribe")) bcArgs.push("--no-subscribe");
  const result = await bc<Row>(bcArgs, { project, account: ctx?.account });
  const m = result.data ?? {};
  return renderOutput([
    renderDetail("created", m, {
      id: (x) => x.id,
      title: (x) => x.subject ?? title,
      status: (x) => x.status ?? (bool(parsed, "--draft") ? "draft" : "active"),
      url: (x) => x.app_url,
    }),
    renderHelp(m.id ? [`Run \`basecamp-axi message view ${m.id}\` to confirm`] : []),
  ]);
}

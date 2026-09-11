import { bc, asList } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, str, int, type FlagSpec } from "../args.js";
import { projectFlag, type CliContext } from "../context.js";
import { countLine, renderDetail, renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { htmlToText, preview, relativeTime } from "../text.js";
import { readBody } from "../body.js";
import { requireProject } from "./todo.js";

export const COMMENT_HELP = `usage: basecamp-axi comment <list|create> <recording id|url> [args] [flags]
Comments are flat: comment on the parent todo/message/card, never on another comment.
subcommands:
  list <id|url>                     Comments on a recording (newest last)
    --limit <n>                     Default 50
    --full                          Complete comment text instead of previews
  create <id|url> "<text>"          Add a comment (Markdown; @mentions supported)
    --body-file <path>              Read the text from a file instead
examples:
  basecamp-axi comment list 10170015169 --in 48189809
  basecamp-axi comment create 10170015169 "Shipped in commit abc123" --in 48189809
`;

const LIST_FLAGS: FlagSpec[] = [{ name: "--limit", alias: "-n", value: true }, { name: "--full" }];
const CREATE_FLAGS: FlagSpec[] = [{ name: "--body-file", value: true }];

export async function commentCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { sub, rest } = pickSub(args, ["list", "create"], "list", "comment");
  if (sub === "create") return create(rest, ctx);
  return list(rest, ctx);
}

async function list(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, LIST_FLAGS, { command: "comment list", maxPositionals: 1 });
  const id = requirePositional(parsed, 0, "id|url", "basecamp-axi comment list <id|url> --in <project>");
  const project = requireProject(ctx, "comment list");
  const limit = int(parsed, "--limit", 50);
  const full = parsed.flags.get("--full") === true;
  const result = await bc(["comments", "list", id, "--limit", String(limit)], { project, account: ctx?.account });
  const comments = asList<Row>(result.data);
  if (comments.length === 0) {
    return renderOutput([
      `comments: 0 comments on ${id}`,
      renderHelp([`Run \`basecamp-axi comment create ${id} "<text>"${projectFlag(ctx)}\` to add the first comment`]),
    ]);
  }
  const anyClipped = comments.some((c) => htmlToText(c.content).length > 300);
  return renderOutput([
    countLine({ count: comments.length, total: result.total, limit }),
    renderList("comments", comments, {
      id: (c) => c.id,
      author: (c) => c.creator?.name,
      posted: (c) => relativeTime(c.created_at),
      text: (c) => (full ? htmlToText(c.content) : preview(htmlToText(c.content), 300)),
    }),
    renderHelp([
      ...(!full && anyClipped ? [`Run \`basecamp-axi comment list ${id} --full${projectFlag(ctx)}\` for complete comment text`] : []),
      `Run \`basecamp-axi comment create ${id} "<text>"${projectFlag(ctx)}\` to reply`,
    ]),
  ]);
}

async function create(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, CREATE_FLAGS, { command: "comment create", maxPositionals: 2 });
  const id = requirePositional(parsed, 0, "id|url", 'basecamp-axi comment create <id|url> "<text>" --in <project>');
  const project = requireProject(ctx, "comment create");
  const text = await readBody(parsed.positionals[1], str(parsed, "--body-file"), "--body");
  if (!text || text.trim() === "") requirePositional(parsed, 1, "text", 'basecamp-axi comment create <id|url> "<text>" --in <project>');
  const result = await bc<Row>(["comment", id, text as string], { project, account: ctx?.account });
  const c = result.data ?? {};
  return renderOutput([
    renderDetail("created", c, {
      id: (x) => x.id,
      on: () => id,
      author: (x) => x.creator?.name,
      text: (x) => preview(htmlToText(x.content ?? text), 200),
      url: (x) => x.app_url,
    }),
  ]);
}

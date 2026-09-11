import { bc } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional } from "../args.js";
import type { CliContext } from "../context.js";
import { renderDetail, renderHelp, renderOutput, type Row } from "../toon.js";

export const URL_HELP = `usage: basecamp-axi url parse <url>
Extract project, recording, and comment ids from any Basecamp link.
examples:
  basecamp-axi url parse "https://3.basecamp.com/6068025/buckets/48189809/todos/10170015169"
  basecamp-axi url parse "https://3.basecamp.com/6068025/buckets/48189809/messages/123#__recording_456"
`;

const VIEWERS: Record<string, string> = {
  todo: "todo view",
  message: "message view",
  card: "card view",
  document: "search",
  todolist: "todo list --list",
};

export async function urlCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { rest } = pickSub(args, ["parse"], "parse", "url");
  const parsed = parseArgs(rest, [], { command: "url parse", maxPositionals: 1 });
  const url = requirePositional(parsed, 0, "url", 'basecamp-axi url parse "<url>"');
  const result = await bc<Row>(["url", "parse", url], { account: ctx?.account });
  const d = result.data;
  const kind = String(d.type_singular ?? d.type ?? "");
  const viewer = VIEWERS[kind];
  const hints: string[] = [];
  if (viewer && d.recording_id) {
    const needsProject = kind === "card" || kind === "todolist";
    hints.push(`Run \`basecamp-axi ${viewer} ${d.recording_id}${needsProject ? ` --in ${d.project_id}` : ""}\` to open it`);
  }
  if (d.comment_id) hints.push(`Comment ${d.comment_id} lives on recording ${d.recording_id}; reply with \`basecamp-axi comment create ${d.recording_id} "<text>" --in ${d.project_id}\``);
  return renderOutput([
    renderDetail("url", d, {
      type: () => kind || "unknown",
      account_id: (x) => x.account_id,
      project_id: (x) => x.project_id,
      recording_id: (x) => x.recording_id,
      comment_id: (x) => x.comment_id,
    }),
    renderHelp(hints),
  ]);
}

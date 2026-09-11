import { bc, asList } from "../basecamp.js";
import { parseArgs, requirePositional, str, int, type FlagSpec } from "../args.js";
import type { CliContext } from "../context.js";
import { countLine, renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { htmlToText, preview, relativeTime } from "../text.js";

export const SEARCH_HELP = `usage: basecamp-axi search "<query>" [flags]
Full-text search across the account (all projects).
flags:
  --limit <n>                       Default 25
  --sort <created_at|updated_at>    Default relevance
examples:
  basecamp-axi search "pull sheet"
  basecamp-axi search "D365" --sort updated_at --limit 10
`;

const FLAGS: FlagSpec[] = [{ name: "--limit", alias: "-n", value: true }, { name: "--sort", alias: "-s", value: true }];

export async function searchCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, FLAGS, { command: "search", maxPositionals: 1 });
  const query = requirePositional(parsed, 0, "query", 'basecamp-axi search "<query>"');
  const limit = int(parsed, "--limit", 25);
  const bcArgs = ["search", query, "--limit", String(limit)];
  const sort = str(parsed, "--sort");
  if (sort) bcArgs.push("--sort", sort);
  const result = await bc(bcArgs, { account: ctx?.account });
  const hits = asList<Row>(result.data);
  if (hits.length === 0) return `results: 0 results found for "${query}"`;
  return renderOutput([
    countLine({ count: hits.length, total: result.total, limit }),
    renderList("results", hits, {
      id: (h) => h.id,
      type: (h) => String(h.type ?? "").toLowerCase().replace("::", "_"),
      title: (h) => h.title ?? h.subject ?? preview(htmlToText(h.content), 80),
      project: (h) => h.bucket?.name,
      project_id: (h) => h.bucket?.id,
      updated: (h) => relativeTime(h.updated_at),
    }),
    renderHelp([
      "Run `basecamp-axi todo view <id>`, `message view <id>`, or `card view <id> --in <project_id>` to open a result",
      "Run `basecamp-axi url parse <url>` when you have a Basecamp link instead",
    ]),
  ]);
}

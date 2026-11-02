import { bc, asList, requireCliVersion } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, str, int, list as listFlag, type FlagSpec, type ParsedArgs } from "../args.js";
import { projectFlag, type CliContext } from "../context.js";
import { AxiError } from "../errors.js";
import { readBody } from "../body.js";
import { countLine, renderDetail, renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { htmlToText, preview, relativeTime, truncate } from "../text.js";
import { requireProject } from "./todo.js";

export const HILL_HELP = `usage: basecamp-axi hill <view|track|untrack|update|updates> [args] [flags]
The project's hill chart: one dot per tracked todolist, at 0 (bottom left, figuring it out)
to 100 (bottom right, done); 50 is the top of the hill. All subcommands need --in.
subcommands:
  view                              Tracked todolists and where each sits
  track <todolist id|name>...       Put todolists on the hill (idempotent)
  untrack <todolist id|name>...     Take todolists off the hill (idempotent)
  update                            Move dots and post a progress update
    --dot <todolist id|name>=<0-100>  Move one tracked todolist (repeatable)
    --note <markdown>               Note about the update
    --note-file <path>              Read the note from a file
    --notify <people>               Comma-separated names, emails, ids, or me (default: nobody)
  updates [update id|url]           Progress updates, newest first; one in full with an id
    --limit <n>                     Default 20
    --full                          Complete note when showing one update
flags:
  --todoset <id>                    Only when the project has several to-do sets
examples:
  basecamp-axi hill view --in 48189809
  basecamp-axi hill track "Design" --in 48189809
  basecamp-axi hill update --dot "Design=60" --note "Over the hill" --in 48189809
  basecamp-axi hill updates --in 48189809
`;

/** `hillcharts update` and `hillcharts updates` landed in basecamp CLI 0.22.0. */
const UPDATES_MIN_CLI = "0.22.0";

const TODOSET: FlagSpec = { name: "--todoset", alias: "-t", value: true };
const UPDATE_FLAGS: FlagSpec[] = [
  TODOSET,
  { name: "--dot", value: true, repeat: true },
  { name: "--note", value: true },
  { name: "--note-file", value: true },
  { name: "--notify", value: true },
];
const UPDATES_FLAGS: FlagSpec[] = [TODOSET, { name: "--limit", alias: "-n", value: true }, { name: "--full" }];

/** Where a dot sits on the hill, in words. */
export function phase(position: unknown): string {
  const p = Number(position);
  if (!Number.isFinite(p)) return "unknown";
  if (p <= 0) return "not started";
  if (p < 50) return "figuring it out";
  if (p === 50) return "top of the hill";
  if (p < 100) return "making it happen";
  return "done";
}

const dotSchema = {
  id: (d: Row) => d.id,
  todolist: (d: Row) => d.label,
  position: (d: Row) => d.position ?? 0,
  phase: (d: Row) => phase(d.position),
};

function dotsSummary(dots: unknown): string {
  return asList<Row>(dots).map((d) => `${d.label}=${d.position ?? 0}`).join("; ") || "none";
}

export async function hillCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { sub, rest } = pickSub(args, ["view", "track", "untrack", "update", "updates"], "view", "hill");
  switch (sub) {
    case "track":
      return track(rest, ctx, "track");
    case "untrack":
      return track(rest, ctx, "untrack");
    case "update":
      return update(rest, ctx);
    case "updates":
      return updates(rest, ctx);
    default:
      return view(rest, ctx);
  }
}

function todosetArgs(parsed: ParsedArgs): string[] {
  const todoset = str(parsed, "--todoset");
  return todoset ? ["--todoset", todoset] : [];
}

/** Current dots; an untouched hill reads as not found or as the CLI's empty-todoset usage error. */
async function currentDots(ctx: CliContext | undefined, project: NonNullable<CliContext["project"]>, parsed: ParsedArgs): Promise<Row[]> {
  try {
    const result = await bc<Row>(["hillcharts", "show", ...todosetArgs(parsed)], { project, account: ctx?.account });
    return asList<Row>(result.data?.dots);
  } catch (error) {
    if (error instanceof AxiError) {
      if (/no todolists to track on the hill chart/i.test(error.message)) return [];
      if (error.code === "NOT_FOUND" && !/project/i.test(error.message)) return [];
    }
    throw error;
  }
}

function matchDot(dots: Row[], ref: string): Row | undefined {
  return dots.find((d) => String(d.id) === ref) ?? dots.find((d) => String(d.label ?? "").toLowerCase() === ref.toLowerCase());
}

async function view(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, [TODOSET], { command: "hill view" });
  const project = requireProject(ctx, "hill view");
  const pf = projectFlag(ctx);
  const dots = await currentDots(ctx, project, parsed);
  if (dots.length === 0) {
    return renderOutput([
      `dots: 0 todolists tracked on the hill chart in project ${project.value}`,
      renderHelp([
        `Run \`basecamp-axi hill track <todolist id|name>${pf}\` to put a todolist on the hill`,
        `Run \`basecamp-axi todolist list${pf}\` to find todolists`,
      ]),
    ]);
  }
  return renderOutput([
    countLine({ count: dots.length }),
    renderList("dots", dots, dotSchema),
    renderHelp([
      `Run \`basecamp-axi hill update --dot "<todolist>=<0-100>" --note "<text>"${pf}\` to move dots and post a progress update`,
      `Run \`basecamp-axi hill updates${pf}\` to read past progress updates`,
    ]),
  ]);
}

async function track(args: string[], ctx: CliContext | undefined, action: "track" | "untrack"): Promise<string> {
  const parsed = parseArgs(args, [TODOSET], { command: `hill ${action}`, maxPositionals: Infinity });
  const project = requireProject(ctx, `hill ${action}`);
  if (parsed.positionals.length === 0) requirePositional(parsed, 0, "todolist id|name", `basecamp-axi hill ${action} <todolist id|name>... --in <project>`);
  const refs = parsed.positionals.flatMap((p) => p.split(",")).map((r) => r.trim()).filter(Boolean);
  const before = await currentDots(ctx, project, parsed);
  const pending = refs.filter((r) => (action === "track" ? !matchDot(before, r) : Boolean(matchDot(before, r))));
  const pf = projectFlag(ctx) || ` --in ${project.value}`;

  let after = before;
  if (pending.length > 0) {
    const result = await bc<Row>(["hillcharts", action, pending.join(","), ...todosetArgs(parsed)], { project, account: ctx?.account });
    after = asList<Row>(result.data?.dots);
  }
  const rows = refs.map((ref) => {
    const dot = matchDot(action === "track" ? after : before, ref);
    const changed = pending.includes(ref);
    const result = action === "track" ? (changed ? "tracked" : "already tracked (no-op)") : changed ? "untracked" : "not tracked (no-op)";
    return { id: dot?.id ?? (/^\d+$/.test(ref) ? ref : "?"), todolist: dot?.label ?? ref, result };
  });
  return renderOutput([
    renderList("todolists", rows, { id: (r) => r.id, todolist: (r) => r.todolist, result: (r) => r.result }),
    `tracked: ${after.length}`,
    renderHelp(action === "track"
      ? [`Run \`basecamp-axi hill update --dot "<todolist>=<0-100>"${pf}\` to move a dot`]
      : [`Run \`basecamp-axi hill view${pf}\` to see what is still tracked`]),
  ]);
}

/** Parse `--dot` values as `<todolist id|name>=<0-100>`; the last `=` splits so names may contain one. */
export function parseDots(values: string[]): { ref: string; position: number }[] {
  return values.map((value) => {
    const eq = value.lastIndexOf("=");
    const ref = eq === -1 ? "" : value.slice(0, eq).trim();
    const pos = eq === -1 ? "" : value.slice(eq + 1).trim();
    if (!ref || !/^\d+$/.test(pos) || Number(pos) > 100) {
      throw new AxiError(`--dot ${JSON.stringify(value)} must be <todolist id|name>=<0-100>`, "VALIDATION_ERROR", [
        'Run `basecamp-axi hill update --dot "Design=60" --in <project>`',
      ]);
    }
    return { ref, position: Number(pos) };
  });
}

async function update(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, UPDATE_FLAGS, { command: "hill update" });
  const project = requireProject(ctx, "hill update");
  const dots = parseDots(listFlag(parsed, "--dot"));
  const note = await readBody(str(parsed, "--note"), str(parsed, "--note-file"), "--note");
  const notify = str(parsed, "--notify");
  if (dots.length === 0 && !note && !notify) {
    throw new AxiError("Nothing to update", "VALIDATION_ERROR", [
      'Pass at least one --dot "<todolist>=<0-100>", a --note, or --notify',
    ]);
  }
  await requireCliVersion(UPDATES_MIN_CLI, "hill update");
  const pf = projectFlag(ctx) || ` --in ${project.value}`;

  // A bare move to where the dots already sit would post an empty update; report a no-op instead.
  if (!note && !notify) {
    const before = await currentDots(ctx, project, parsed);
    const unchanged = dots.every((d) => {
      const dot = matchDot(before, d.ref);
      return dot !== undefined && Number(dot.position ?? 0) === d.position;
    });
    if (unchanged) {
      return renderOutput([
        "update: unchanged (no-op), every dot is already there",
        renderList("dots", before, dotSchema),
        renderHelp([`Run \`basecamp-axi hill updates${pf}\` to read past progress updates`]),
      ]);
    }
  }

  const bcArgs = ["hillcharts", "update", ...todosetArgs(parsed)];
  for (const d of dots) bcArgs.push("--dot", `${d.ref}=${d.position}`);
  if (note) bcArgs.push("--note", note);
  if (notify) bcArgs.push("--notify", notify);
  const result = await bc<Row>(bcArgs, { project, account: ctx?.account }).catch((error: unknown) => {
    if (error instanceof AxiError && error.code === "NOT_FOUND" && /todolist/i.test(error.message)) {
      throw new AxiError(error.message, "NOT_FOUND", [
        `Run \`basecamp-axi hill view${pf}\` to see the tracked todolists`,
        `Run \`basecamp-axi hill track <todolist id|name>${pf}\` to put one on the hill first`,
      ]);
    }
    throw error;
  });
  const u = result.data ?? {};
  return renderOutput([
    renderDetail("posted", u, {
      id: (x) => x.id,
      by: (x) => x.creator?.name,
      note: (x) => preview(htmlToText(x.description), 160) || "none",
      url: (x) => x.app_url,
    }),
    renderList("dots", asList<Row>(u.dots), dotSchema),
    renderHelp([`Run \`basecamp-axi hill updates${pf}\` to read past progress updates`]),
  ]);
}

async function updates(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, UPDATES_FLAGS, { command: "hill updates", maxPositionals: 1 });
  const project = requireProject(ctx, "hill updates");
  await requireCliVersion(UPDATES_MIN_CLI, "hill updates");
  const pf = projectFlag(ctx) || ` --in ${project.value}`;
  const id = parsed.positionals[0];

  if (id) {
    const result = await bc<Row>(["hillcharts", "updates", "show", id, ...todosetArgs(parsed)], { project, account: ctx?.account });
    const u = result.data ?? {};
    const text = htmlToText(u.description);
    const note = parsed.flags.has("--full") ? { text, truncated: false } : truncate(text, 1500);
    return renderOutput([
      renderDetail("update", u, {
        id: (x) => x.id,
        by: (x) => x.creator?.name,
        created: (x) => relativeTime(x.created_at),
        comments: (x) => x.comments_count ?? 0,
        url: (x) => x.app_url,
        note: () => note.text || "none",
      }),
      renderList("dots", asList<Row>(u.dots), dotSchema),
      renderHelp([
        ...(note.truncated ? [`Run \`basecamp-axi hill updates ${u.id} --full${pf}\` to see the complete note`] : []),
        ...(u.id ? [`Run \`basecamp-axi comment create ${u.id} "<text>"${pf}\` to comment on it`] : []),
      ]),
    ]);
  }

  const limit = int(parsed, "--limit", 20);
  const result = await bc(["hillcharts", "updates", "--limit", String(limit || 20), ...todosetArgs(parsed)], { project, account: ctx?.account });
  const items = asList<Row>(result.data);
  if (items.length === 0) {
    return renderOutput([
      `updates: 0 progress updates on the hill chart in project ${project.value}`,
      renderHelp([`Run \`basecamp-axi hill update --dot "<todolist>=<0-100>" --note "<text>"${pf}\` to post one`]),
    ]);
  }
  return renderOutput([
    countLine({ count: items.length, limit }),
    renderList("updates", items, {
      id: (u) => u.id,
      created: (u) => relativeTime(u.created_at),
      by: (u) => u.creator?.name,
      note: (u) => preview(htmlToText(u.description), 80) || "none",
      dots: (u) => dotsSummary(u.dots),
    }),
    renderHelp([`Run \`basecamp-axi hill updates <id>${pf}\` to read one in full`]),
  ]);
}

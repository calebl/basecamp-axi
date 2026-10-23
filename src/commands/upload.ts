import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { bc, asList } from "../basecamp.js";
import { parseArgs, requirePositional, str, int, bool, type FlagSpec } from "../args.js";
import { projectFlag, type CliContext } from "../context.js";
import { AxiError } from "../errors.js";
import { countLine, renderDetail, renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { relativeTime } from "../text.js";
import { readBody } from "../body.js";
import { requireProject } from "./todo.js";

export const UPLOAD_HELP = `usage: basecamp-axi upload <file> [flags] | upload list [flags]
Uploads go to the project's Docs & Files. To attach a file to a todo, message, or comment instead, pass --attach <path> to that create command.
subcommands:
  <file>                            Upload a local file (skips a same-name, same-size file already there)
    --folder <id>                   Docs & Files folder (default: root)
    --description <markdown>        Upload description
    --description-file <path>       Read description from a file
    --force                         Upload even when a file with that name already exists
  list                              Files in a Docs & Files folder
    --folder <id>                   Default: root
    --limit <n>                     Default 50
examples:
  basecamp-axi upload ./site-plan.pdf --in 48189809
  basecamp-axi upload ./photo.png --folder 9169930120 --description "Site photo" --in 48189809
  basecamp-axi upload list --in 48189809
`;

const CREATE_FLAGS: FlagSpec[] = [
  { name: "--folder", value: true },
  { name: "--description", value: true },
  { name: "--description-file", value: true },
  { name: "--force" },
];
const LIST_FLAGS: FlagSpec[] = [
  { name: "--folder", value: true },
  { name: "--limit", alias: "-n", value: true },
];

const uploadSchema = {
  id: (u: Row) => u.id,
  filename: (u: Row) => u.filename ?? u.title,
  size: (u: Row) => humanSize(u.byte_size),
  type: (u: Row) => u.content_type,
  uploaded: (u: Row) => relativeTime(u.created_at),
};

export async function uploadCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  // `list` is the only subcommand; anything else is a file path (use ./list for a file named "list").
  if (args[0] === "list") return list(args.slice(1), ctx);
  return create(args, ctx);
}

async function list(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, LIST_FLAGS, { command: "upload list" });
  const project = requireProject(ctx, "upload list");
  const limit = int(parsed, "--limit", 50);
  const folder = str(parsed, "--folder");
  const bcArgs = ["uploads", "list", "--limit", String(limit)];
  if (folder) bcArgs.push("--folder", folder);
  const result = await bc(bcArgs, { project, account: ctx?.account });
  const uploads = asList<Row>(result.data);
  const pf = projectFlag(ctx);
  const where = folder ? `folder ${folder}` : `the Docs & Files root of project ${project.value}`;
  if (uploads.length === 0) {
    return renderOutput([
      `uploads: 0 files in ${where}`,
      renderHelp([`Run \`basecamp-axi upload <file>${folder ? ` --folder ${folder}` : ""}${pf}\` to upload one`]),
    ]);
  }
  return renderOutput([
    countLine({ count: uploads.length, total: result.total, limit }),
    renderList("uploads", uploads, uploadSchema),
    renderHelp([
      `Run \`basecamp-axi comment create <id> "<text>"${pf}\` to comment on a file`,
      ...(result.total && result.total > uploads.length ? [`Run \`basecamp-axi upload list --limit ${result.total}${pf}\` to see all ${result.total}`] : []),
    ]),
  ]);
}

async function create(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, CREATE_FLAGS, { command: "upload", maxPositionals: 1 });
  const file = requirePositional(parsed, 0, "file", "basecamp-axi upload <file> --in <project>");
  const project = requireProject(ctx, "upload");
  const size = await localSize(file);
  const folder = str(parsed, "--folder");
  const description = await readBody(str(parsed, "--description"), str(parsed, "--description-file"), "--description");
  const pf = projectFlag(ctx);
  const folderFlag = folder ? ` --folder ${folder}` : "";

  if (!bool(parsed, "--force")) {
    const existingArgs = ["uploads", "list", "--all"];
    if (folder) existingArgs.push("--folder", folder);
    const existing = asList<Row>((await bc(existingArgs, { project, account: ctx?.account })).data);
    const name = basename(file);
    const same = existing.filter((u) => (u.filename ?? u.title) === name);
    const identical = same.find((u) => Number(u.byte_size) === size);
    if (identical) {
      return renderOutput([
        renderDetail("upload", identical, { ...uploadSchema, url: (u) => u.app_url, result: () => "already uploaded (no-op)" }),
        renderHelp([`Run \`basecamp-axi upload ${file}${folderFlag} --force${pf}\` to upload another copy anyway`]),
      ]);
    }
    if (same.length > 0) {
      throw new AxiError(`A different file named ${name} is already in Docs & Files (id ${same[0]!.id})`, "CONFLICT", [
        `Run \`basecamp-axi upload ${file}${folderFlag} --force${pf}\` to upload it alongside the existing one`,
        `Run \`basecamp-axi upload list${folderFlag}${pf}\` to see what is there`,
      ]);
    }
  }

  const bcArgs = ["uploads", "create", file];
  if (folder) bcArgs.push("--folder", folder);
  if (description) bcArgs.push("--description", description);
  const result = await bc<Row>(bcArgs, { project, account: ctx?.account });
  const u = result.data ?? {};
  return renderOutput([
    renderDetail("uploaded", u, {
      id: (x) => x.id,
      filename: (x) => x.filename ?? x.title ?? basename(file),
      size: (x) => humanSize(x.byte_size ?? size),
      type: (x) => x.content_type,
      project: (x) => x.bucket?.name,
      url: (x) => x.app_url,
    }),
    renderHelp([
      `Run \`basecamp-axi upload list${folderFlag}${pf}\` to confirm`,
      ...(u.id ? [`Run \`basecamp-axi comment create ${u.id} "<text>"${pf}\` to comment on it`] : []),
    ]),
  ]);
}

async function localSize(file: string): Promise<number> {
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");
    return info.size;
  } catch {
    throw new AxiError(`Could not read ${file}`, "VALIDATION_ERROR", ["Check the path; it is resolved from the current directory"]);
  }
}

export function humanSize(bytes: unknown): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "?";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

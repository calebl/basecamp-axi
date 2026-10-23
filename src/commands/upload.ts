import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { bc } from "../basecamp.js";
import { parseArgs, requirePositional, type FlagSpec } from "../args.js";
import { projectFlag, type CliContext } from "../context.js";
import { AxiError } from "../errors.js";
import { renderDetail, renderHelp, renderOutput, type Row } from "../toon.js";
import { requireProject } from "./todo.js";

export const UPLOAD_HELP = `usage: basecamp-axi upload <file> [flags]
Uploads one local file to the project's Docs & Files root.
examples:
  basecamp-axi upload ./site-plan.pdf --in 48189809
`;

const CREATE_FLAGS: FlagSpec[] = [];

export async function uploadCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, CREATE_FLAGS, { command: "upload", maxPositionals: 1 });
  const file = requirePositional(parsed, 0, "file", "basecamp-axi upload <file> --in <project>");
  const project = requireProject(ctx, "upload");
  const size = await localSize(file);
  const result = await bc<Row>(["uploads", "create", file], { project, account: ctx?.account });
  const u = result.data ?? {};
  const pf = projectFlag(ctx);
  return renderOutput([
    renderDetail("uploaded", u, {
      id: (x) => x.id,
      filename: (x) => x.filename ?? x.title ?? basename(file),
      size: (x) => humanSize(x.byte_size ?? size),
      type: (x) => x.content_type,
      project: (x) => x.bucket?.name,
      url: (x) => x.app_url,
    }),
    renderHelp(u.id ? [`Run \`basecamp-axi comment create ${u.id} "<text>"${pf}\` to comment on it`] : []),
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

import { encode } from "@toon-format/toon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Extractor = (item: Row) => unknown;
export type Schema = Record<string, Extractor>;

export function extract(item: Row, schema: Schema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, fn] of Object.entries(schema)) {
    const value = fn(item);
    out[key] = value === undefined || value === null || value === "" ? "none" : value;
  }
  return out;
}

/** Render a labeled tabular list as TOON. */
export function renderList(label: string, items: Row[], schema: Schema): string {
  return encode({ [label]: items.map((item) => extract(item, schema)) });
}

/** Render a labeled detail object as TOON. */
export function renderDetail(label: string, item: Row, schema: Schema): string {
  return encode({ [label]: extract(item, schema) });
}

export function renderKv(obj: Record<string, unknown>): string {
  return encode(obj);
}

/** Render help suggestions (manual formatting — encode() inlines primitive arrays). */
export function renderHelp(lines: string[]): string {
  const unique = lines.filter((l, i) => l && lines.indexOf(l) === i);
  if (unique.length === 0) return "";
  return `help[${unique.length}]:\n${unique.map((l) => `  ${l}`).join("\n")}`;
}

export function renderOutput(blocks: string[]): string {
  return blocks.filter((b) => b && b.length > 0).join("\n");
}

export interface CountOptions {
  count: number;
  total?: number | undefined;
  limit?: number | undefined;
}

/** `count: N`, `count: N of T total`, or `count: N (showing first N)`. */
export function countLine(opts: CountOptions): string {
  const { count, total, limit } = opts;
  if (total !== undefined && total >= count && total !== count) return `count: ${count} of ${total} total`;
  if (limit !== undefined && limit > 0 && count === limit) return `count: ${count} (showing first ${count})`;
  return `count: ${count}`;
}

/** Definitive empty state, e.g. `todos: 0 open todos found in project X`. */
export function emptyLine(label: string, description: string): string {
  return `${label}: 0 ${description}`;
}

export function names(people: unknown, empty = "unassigned"): string {
  if (!Array.isArray(people) || people.length === 0) return empty;
  return people.map((p) => (typeof p === "string" ? p : (p as { name?: string }).name ?? "?")).join(",");
}

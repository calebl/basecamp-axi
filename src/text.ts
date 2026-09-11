const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

/** Convert Basecamp rich-text HTML to compact plain text. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let text = html
    .replace(/\r/g, "")
    .replace(/>\s+</g, "><")
    .replace(/<\s*(ul|ol)[^>]*>/gi, "\n")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|h[1-6]|blockquote|pre|tr|ul|ol)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<\s*\/\s*li\s*>/gi, "\n")
    .replace(/<\s*(strong|b)\s*>/gi, "**")
    .replace(/<\s*\/\s*(strong|b)\s*>/gi, "**")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (_m, href: string, inner: string) => {
      const label = inner.replace(/<[^>]+>/g, "").trim();
      return label && label !== href ? `${label} (${href})` : href;
    })
    .replace(/<bc-attachment[^>]*>.*?<\/bc-attachment>/gis, "[attachment]")
    .replace(/<[^>]+>/g, "");
  text = text.replace(/&(#?\w+);/g, (m, name: string) => {
    if (name in ENTITIES) return ENTITIES[name] as string;
    if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(parseInt(name.slice(1), 10));
    return m;
  });
  return text
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface Truncated {
  text: string;
  truncated: boolean;
  total: number;
}

/** Truncate text to `limit` characters, appending a marker with the total size. */
export function truncate(text: string, limit: number): Truncated {
  const total = text.length;
  if (total <= limit) return { text, truncated: false, total };
  return { text: `${text.slice(0, limit).trimEnd()}\n... (truncated, ${total} chars total)`, truncated: true, total };
}

/** One-line preview: whitespace collapsed and clipped. */
export function preview(text: string, limit = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`;
}

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "unknown";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const diff = now - then;
  const future = diff < 0;
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  let label: string;
  if (minutes < 1) return "just now";
  else if (minutes < 60) label = `${minutes}m`;
  else if (hours < 24) label = `${hours}h`;
  else if (days < 30) label = `${days}d`;
  else if (days < 365) label = `${Math.round(days / 30)}mo`;
  else label = `${Math.round(days / 365)}y`;
  return future ? `in ${label}` : `${label} ago`;
}

/** Human due-date status: overdue / today / in Nd / none. */
export function dueStatus(dueOn: string | null | undefined, now: Date = new Date()): string {
  if (!dueOn) return "none";
  const due = new Date(`${dueOn}T00:00:00`);
  if (Number.isNaN(due.getTime())) return dueOn;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days === 0) return `${dueOn} (today)`;
  if (days < 0) return `${dueOn} (${-days}d overdue)`;
  return `${dueOn} (in ${days}d)`;
}

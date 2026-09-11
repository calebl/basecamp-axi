import { bc, asList } from "../basecamp.js";
import { parseArgs, pickSub, requirePositional, str, int, type FlagSpec } from "../args.js";
import type { CliContext } from "../context.js";
import { countLine, renderDetail, renderHelp, renderList, renderOutput, type Row } from "../toon.js";

export const PEOPLE_HELP = `usage: basecamp-axi people <list|view|me> [args] [flags]
subcommands:
  list                              People in the account (or one project with --in)
    --limit <n>                     Default 200
    --fields <a,b>                  Extra columns: email,company,title,sgid
  view <id>                         One person, including the mention SGID
  me                                The authenticated user and account
examples:
  basecamp-axi people list --in 48189809
  basecamp-axi people list --fields email,sgid
  basecamp-axi people me
`;

const LIST_FLAGS: FlagSpec[] = [{ name: "--limit", alias: "-n", value: true }, { name: "--fields", value: true }];

const EXTRA: Record<string, (p: Row) => unknown> = {
  email: (p) => p.email_address,
  company: (p) => p.company?.name,
  title: (p) => p.title,
  sgid: (p) => p.attachable_sgid,
};

export async function peopleCommand(args: string[], ctx: CliContext | undefined): Promise<string> {
  const { sub, rest } = pickSub(args, ["list", "view", "me"], "list", "people");
  if (sub === "me") return me(rest, ctx);
  if (sub === "view") return view(rest, ctx);
  return list(rest, ctx);
}

async function list(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, LIST_FLAGS, { command: "people list" });
  const limit = int(parsed, "--limit", 200);
  const wanted = (str(parsed, "--fields") ?? "").split(",").map((f) => f.trim()).filter(Boolean);
  const unknown = wanted.filter((f) => !(f in EXTRA));
  if (unknown.length) {
    return renderOutput([`error: unknown --fields ${unknown.join(",")}`, `code: VALIDATION_ERROR`, renderHelp([`valid --fields: ${Object.keys(EXTRA).join(",")}`])]);
  }
  const bcArgs = ctx?.project ? ["people", "list", "--project", ctx.project.value] : ["people", "pingable"];
  const result = await bc(bcArgs, { account: ctx?.account });
  let all = asList<Row>(result.data);
  // Project rosters omit the mention SGID; merge it in from the pingable list when requested.
  if (ctx?.project && wanted.includes("sgid")) {
    const pingable = asList<Row>((await bc(["people", "pingable"], { account: ctx?.account })).data);
    const byId = new Map(pingable.map((p) => [String(p.id), p.attachable_sgid]));
    all = all.map((p) => ({ ...p, attachable_sgid: p.attachable_sgid ?? byId.get(String(p.id)) }));
  }
  const people = all.slice(0, limit);
  if (people.length === 0) return `people: 0 people found${ctx?.project ? ` in project ${ctx.project.value}` : ""}`;
  const schema: Record<string, (p: Row) => unknown> = {
    id: (p) => p.id,
    name: (p) => p.name,
    role: (p) => (p.admin ? "admin" : p.client ? "client" : p.employee ? "employee" : "member"),
  };
  for (const f of wanted) schema[f] = EXTRA[f] as (p: Row) => unknown;
  return renderOutput([
    countLine({ count: people.length, total: all.length, limit }),
    renderList("people", people, schema),
    renderHelp([
      "Run `basecamp-axi people view <id>` for a ready-to-paste mention handle",
      "Mention someone with `[@Name](mention:<sgid>)` in comment or message text (`--fields sgid` adds the sgid column)",
    ]),
  ]);
}

async function view(args: string[], ctx: CliContext | undefined): Promise<string> {
  const parsed = parseArgs(args, [], { command: "people view", maxPositionals: 1 });
  const id = requirePositional(parsed, 0, "id", "basecamp-axi people view <id>");
  const result = await bc<Row>(["people", "show", id], { account: ctx?.account });
  return renderDetail("person", result.data, {
    id: (p) => p.id,
    name: (p) => p.name,
    email: (p) => p.email_address,
    title: (p) => p.title,
    company: (p) => p.company?.name,
    role: (p) => (p.admin ? "admin" : p.client ? "client" : p.employee ? "employee" : "member"),
    mention: (p) => (p.attachable_sgid ? `[@${p.name}](mention:${p.attachable_sgid})` : `@${String(p.name).replace(/\s+/g, ".")}`),
  });
}

async function me(args: string[], ctx: CliContext | undefined): Promise<string> {
  parseArgs(args, [], { command: "people me" });
  const result = await bc<Row>(["me"], { account: ctx?.account });
  const d = result.data;
  const current = (Array.isArray(d.accounts) ? (d.accounts as Row[]) : []).find((a) => a.current) ?? {};
  return renderDetail("me", d, {
    name: (x) => `${x.identity?.first_name ?? ""} ${x.identity?.last_name ?? ""}`.trim(),
    email: (x) => x.identity?.email_address,
    account: () => current.name,
    account_id: () => current.id,
  });
}

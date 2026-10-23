import { AxiError } from "./errors.js";

export interface FlagSpec {
  /** Canonical long name including dashes, e.g. "--limit". */
  name: string;
  /** Short alias including dash, e.g. "-n". */
  alias?: string;
  /** Whether the flag consumes a value. Boolean flags do not. */
  value?: boolean;
  /** Repeatable value flags collect every occurrence. */
  repeat?: boolean;
}

/** Flags accepted on every command and stripped before subcommand validation. */
export const GLOBAL_FLAGS: FlagSpec[] = [
  { name: "--in", alias: "-p", value: true },
  { name: "--project", value: true },
  { name: "--account", value: true },
];

/** Old or foreign spellings that should point the agent at the right flag. */
const RENAMED: Record<string, string> = {
  "--json": "output is always TOON; drop --json",
  "--md": "output is always TOON; drop --md",
  "--jq": "output is always TOON; filter with grep instead of --jq",
  "--agent": "output is already agent-oriented; drop --agent",
  "--quiet": "drop --quiet",
  "--todolist": "use --list instead",
  "--assignee": "use --assignee only on `todo list`; on create use --to",
  "--completed": "use --status completed instead",
  "--body-file": "use --body-file only on `message create` and `comment create`",
};

export interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | string[] | true>;
}

export interface ParseOptions {
  command: string;
  /** Max positional arguments; extra ones are rejected. Infinity for variadic. */
  maxPositionals?: number;
}

/** Parse args against known flags. Unknown flags and extra positionals are rejected (exit 2). */
export function parseArgs(args: string[], specs: FlagSpec[], options: ParseOptions): ParsedArgs {
  const known = [...GLOBAL_FLAGS, ...specs];
  const positionals: string[] = [];
  const flags = new Map<string, string | string[] | true>();
  const max = options.maxPositionals ?? 0;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-" || /^-\d/.test(arg)) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const rawName = eq === -1 ? arg : arg.slice(0, eq);
    const spec = known.find((s) => s.name === rawName || s.alias === rawName);
    if (!spec) throw unknownFlag(rawName, options.command, specs);
    if (!spec.value) {
      if (eq !== -1) throw new AxiError(`${spec.name} does not take a value`, "VALIDATION_ERROR", [validFlagsLine(options.command, specs)]);
      flags.set(spec.name, true);
      continue;
    }
    let value: string | undefined;
    if (eq !== -1) value = arg.slice(eq + 1);
    else {
      value = args[i + 1];
      i++;
    }
    if (value === undefined || value.trim() === "") {
      throw new AxiError(`${spec.name} requires a value`, "VALIDATION_ERROR", [validFlagsLine(options.command, specs)]);
    }
    if (spec.repeat) {
      const existing = flags.get(spec.name);
      flags.set(spec.name, Array.isArray(existing) ? [...existing, value] : [value]);
    } else {
      flags.set(spec.name, value);
    }
  }

  if (positionals.length > max) {
    const extra = positionals.slice(max).map((p) => JSON.stringify(p)).join(", ");
    throw new AxiError(`Unexpected argument${positionals.length - max > 1 ? "s" : ""}: ${extra}`, "VALIDATION_ERROR", [
      `Run \`basecamp-axi ${options.command} --help\` for usage`,
    ]);
  }
  return { positionals, flags };
}

function unknownFlag(name: string, command: string, specs: FlagSpec[]): AxiError {
  const hint = RENAMED[name];
  const suggestions = hint ? [`${name}: ${hint}`, validFlagsLine(command, specs)] : [validFlagsLine(command, specs)];
  return new AxiError(`unknown flag ${name} for \`${command}\``, "VALIDATION_ERROR", suggestions);
}

function validFlagsLine(command: string, specs: FlagSpec[]): string {
  const names = [...specs.map((s) => (s.alias ? `${s.alias}/${s.name}` : s.name)), "--in <project>", "--account <id>"];
  return `valid flags for \`${command}\`: ${names.join(", ")} (--help always allowed)`;
}

export function str(parsed: ParsedArgs, name: string): string | undefined {
  const v = parsed.flags.get(name);
  return typeof v === "string" ? v : Array.isArray(v) ? v[v.length - 1] : undefined;
}

export function list(parsed: ParsedArgs, name: string): string[] {
  const v = parsed.flags.get(name);
  return Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
}

export function bool(parsed: ParsedArgs, name: string): boolean {
  return parsed.flags.get(name) === true;
}

export function int(parsed: ParsedArgs, name: string, fallback: number): number {
  const v = str(parsed, name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new AxiError(`${name} must be a non-negative integer`, "VALIDATION_ERROR");
  return n;
}

export function requirePositional(parsed: ParsedArgs, index: number, label: string, usage: string): string {
  const value = parsed.positionals[index];
  if (value === undefined || value.trim() === "") {
    throw new AxiError(`<${label}> is required`, "VALIDATION_ERROR", [`Run \`${usage}\``]);
  }
  return value;
}

/** Resolve a subcommand from the first positional, with a default when omitted. */
export function pickSub(args: string[], subs: readonly string[], fallback: string | undefined, command: string): { sub: string; rest: string[] } {
  const first = args[0];
  if (first === undefined || first.startsWith("-")) {
    if (fallback) return { sub: fallback, rest: args };
    throw new AxiError(`\`${command}\` needs a subcommand`, "VALIDATION_ERROR", [
      `valid subcommands for \`${command}\`: ${subs.join(", ")}`,
    ]);
  }
  if (!subs.includes(first)) {
    if (fallback && subs.includes(fallback) && !isNaN(Number(first))) return { sub: fallback, rest: args };
    throw new AxiError(`Unknown ${command} subcommand: ${first}`, "VALIDATION_ERROR", [
      `valid subcommands for \`${command}\`: ${subs.join(", ")}`,
    ]);
  }
  return { sub: first, rest: args.slice(1) };
}

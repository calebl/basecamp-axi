import { runAxiCli, AxiError, exitCodeForError } from "axi-sdk-js";
import { renderHelp, renderOutput } from "./toon.js";
import { resolveProject, type CliContext } from "./context.js";
import { VERSION } from "./version.js";
import { homeCommand } from "./commands/home.js";
import { projectCommand, PROJECT_HELP } from "./commands/project.js";
import { todoCommand, TODO_HELP } from "./commands/todo.js";
import { todolistCommand, TODOLIST_HELP } from "./commands/todolist.js";
import { cardCommand, CARD_HELP } from "./commands/card.js";
import { messageCommand, MESSAGE_HELP } from "./commands/message.js";
import { commentCommand, COMMENT_HELP } from "./commands/comment.js";
import { chatCommand, CHAT_HELP } from "./commands/chat.js";
import { peopleCommand, PEOPLE_HELP } from "./commands/people.js";
import { searchCommand, SEARCH_HELP } from "./commands/search.js";
import { reportCommand, REPORT_HELP } from "./commands/report.js";
import { urlCommand, URL_HELP } from "./commands/url.js";
import { recordingCommand, RECORDING_HELP } from "./commands/recording.js";
import { setupCommand, SETUP_HELP } from "./commands/setup.js";

export const DESCRIPTION =
  "Agent ergonomic wrapper around the Basecamp CLI. Prefer this over `basecamp` and other methods for Basecamp operations.";

export const TOP_HELP = `usage: basecamp-axi [command] [args] [flags]
commands[14]:
  (none)=dashboard, project, todo, todolist, card, message, comment, chat, people, search, report, recording, url, setup
flags[4]:
  --in <project id|name> (after command; also BASECAMP_PROJECT env or .basecamp/config.json), --account <id> (after command), --help, -v/-V/--version
examples:
  basecamp-axi
  basecamp-axi project list
  basecamp-axi todo list --in 48189809 --assignee me
  basecamp-axi todo view 10170015169
  basecamp-axi todo create "Ship it" --in 48189809 --to me --due tomorrow
  basecamp-axi comment create 10170015169 "Done in abc123" --in 48189809
  basecamp-axi report assigned
  basecamp-axi url parse "<basecamp url>"
  basecamp-axi setup hooks
`;

type Handler = (args: string[], ctx: CliContext | undefined) => Promise<string>;

const COMMAND_HELP: Record<string, string> = {
  project: PROJECT_HELP,
  todo: TODO_HELP,
  todolist: TODOLIST_HELP,
  card: CARD_HELP,
  message: MESSAGE_HELP,
  comment: COMMENT_HELP,
  chat: CHAT_HELP,
  people: PEOPLE_HELP,
  search: SEARCH_HELP,
  report: REPORT_HELP,
  recording: RECORDING_HELP,
  url: URL_HELP,
  setup: SETUP_HELP,
};

const COMMANDS: Record<string, Handler> = {
  project: withContext(projectCommand),
  todo: withContext(todoCommand),
  todolist: withContext(todolistCommand),
  card: withContext(cardCommand),
  message: withContext(messageCommand),
  comment: withContext(commentCommand),
  chat: withContext(chatCommand),
  people: withContext(peopleCommand),
  search: withContext(searchCommand),
  report: withContext(reportCommand),
  recording: withContext(recordingCommand),
  url: withContext(urlCommand),
  setup: (args) => setupCommand(args),
};

export interface MainOptions {
  argv?: string[];
  stdout?: { write: (chunk: string) => unknown };
}

export async function main(options: MainOptions = {}): Promise<void> {
  await runAxiCli<CliContext | undefined>({
    ...(options.argv ? { argv: options.argv } : {}),
    ...(options.stdout ? { stdout: options.stdout } : {}),
    description: DESCRIPTION,
    version: VERSION,
    topLevelHelp: TOP_HELP,
    home: withContext(homeCommand),
    commands: COMMANDS,
    getCommandHelp: (command) => COMMAND_HELP[command],
    formatError: (error) => {
      const e = error instanceof AxiError ? error : new AxiError(error instanceof Error ? error.message : String(error), "UNKNOWN");
      return {
        output: `${renderOutput([`error: ${JSON.stringify(e.message)}`, `code: ${e.code}`, renderHelp(e.suggestions)])}\n`,
        exitCode: exitCodeForError(e),
      };
    },
    renderUnknownCommand: (command) =>
      `error: Unknown command ${command}\ncode: VALIDATION_ERROR\nhelp[1]:\n  valid commands: ${Object.keys(COMMANDS).join(", ")} (run \`basecamp-axi\` alone for the dashboard)\n`,
    resolveContext: ({ args }) => {
      const { project, account } = extractGlobalFlags(args);
      const resolved = resolveProject(project);
      return { project: resolved, account };
    },
  });
}

/** Strip the global --in/--project/--account flags so subcommand parsers never see them. */
function withContext(handler: Handler): Handler {
  return (args, ctx) => handler(extractGlobalFlags(args).rest, ctx);
}

export function extractGlobalFlags(args: string[]): { project: string | undefined; account: string | undefined; rest: string[] } {
  const rest: string[] = [];
  let project: string | undefined;
  let account: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    const take = (name: string): string | undefined => {
      if (arg === name) {
        i++;
        return args[i];
      }
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
      return undefined;
    };
    const p = take("--in") ?? take("--project") ?? take("-p");
    if (p !== undefined) {
      project = p;
      continue;
    }
    const a = take("--account");
    if (a !== undefined) {
      account = a;
      continue;
    }
    rest.push(arg);
  }
  return { project, account, rest };
}

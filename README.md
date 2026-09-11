# basecamp-axi

Basecamp CLI for agents, built to the [AXI](https://github.com/kunchenguid/axi) (Agent eXperience Interface) standard.

Wraps the official [`basecamp`](https://github.com/basecamp/basecamp-cli) CLI with token-efficient TOON output, contextual next-step suggestions, definitive empty states, idempotent mutations, and structured errors. Built for autonomous agents that talk to Basecamp through shell execution.

## Quick start

Requires Node 20+ and the `basecamp` CLI installed and authenticated (`basecamp auth login`).

```sh
npm install -g basecamp-axi
basecamp-axi                 # dashboard: your open assignments, due dates, next commands
basecamp-axi setup hooks     # optional: ambient context at the start of every agent session
```

`setup hooks` installs a `SessionStart` hook for Claude Code, Codex, and OpenCode. Restart your agent session afterwards.

Prefer on-demand loading instead? Install the skill (`skills/basecamp-axi/SKILL.md`) into `~/.claude/skills/` or your agent's skills directory. The skill teaches the agent to run `npx -y basecamp-axi ...`, so no global install is needed. Use the hook, the skill, or both.

## Usage

```sh
basecamp-axi                                          # dashboard
basecamp-axi project list                             # all projects (id, name, status)
basecamp-axi project view 48189809
basecamp-axi todo list --in 48189809 --assignee me    # project-scoped
basecamp-axi todo view 10170015169                    # description preview; --full for everything
basecamp-axi todo create "Ship it" --in 48189809 --to me --due tomorrow
basecamp-axi todo done 10170015169                    # idempotent
basecamp-axi todolist list --in 48189809
basecamp-axi card list --in 44361766 --column Triage
basecamp-axi card move 10247705680 --to Done --card-table 9407211666 --in 44361766
basecamp-axi message list --in 48189809
basecamp-axi message create "Status" --body-file notes.md --in 48189809
basecamp-axi comment list 10126503472 --in 48189809
basecamp-axi comment create 10126503472 "Thanks [@Jay Park](person:50519852)" --in 48189809
basecamp-axi chat post "Deployed" --in 48189809 --campfire 9169930018
basecamp-axi people list --in 48189809 --fields email,sgid
basecamp-axi search "pull sheet"
basecamp-axi report assigned                          # cross-project
basecamp-axi report overdue
basecamp-axi url parse "https://3.basecamp.com/.../buckets/48189809/todos/10170015169"
```

### Project scope

Most commands need a project. Resolution order:

1. `--in <id|name>` (or `--project`, `-p`) placed after the command
2. `BASECAMP_PROJECT` environment variable
3. `project_id` in the nearest `.basecamp/config.json` walking up from the working directory

Cross-project commands need no scope: `project list`, `report`, `search`, `people` (without `--in`), `url parse`.

### Commands

| Command    | Description                                                        |
| ---------- | ------------------------------------------------------------------ |
| `project`  | list, view                                                         |
| `todo`     | list, view, create, done, reopen, assign, unassign                 |
| `todolist` | list, create                                                       |
| `card`     | list, columns, view, create, update, move                          |
| `message`  | list, view, create                                                 |
| `comment`  | list, create (flat: always on the parent recording)                |
| `chat`     | list, messages, post                                               |
| `people`   | list, view, me                                                     |
| `search`   | full-text search across the account                                |
| `report`   | assigned, overdue (cross-project)                                  |
| `url`      | parse a Basecamp link into project, recording, and comment ids     |
| `setup`    | install agent session hooks                                        |
| `update`   | built-in self-update inherited from `axi-sdk-js`                   |

### Behaviour

- **TOON output** on stdout, errors included; stderr carries nothing an agent needs.
- **Truncation**: descriptions and bodies are clipped (800 to 1500 chars) with the total size shown; `--full` on the same view command returns everything.
- **Totals**: lists print `count: N of T total` when the underlying CLI reports a total, plus a hint to fetch the rest.
- **Idempotent**: `todo done` on a completed todo reports `already done (no-op)` and exits 0.
- **Strict flags**: unknown flags and extra positionals exit 2 with the list of valid flags. `--json`, `--md`, and `--jq` are rejected with a hint since output is always TOON.
- **Column names**: `card list --column`, `card create --column`, and `card move --to` accept a column name and resolve it to an id automatically when the project has one card table.
- **Exit codes**: 0 success (including no-ops), 1 error, 2 usage error.

### Compatibility with the basecamp CLI

Tested against basecamp CLI 0.11.0 (also exercised on 0.4.0). basecamp-axi calls only long-form subcommands (`todos create`, `comments create`, and so on), so it works whether or not a version ships the short aliases. Flags the installed version lacks surface as `DEPENDENCY_OUTDATED` with a hint to upgrade. `card update` re-sends the current due date because older CLIs otherwise clear it.

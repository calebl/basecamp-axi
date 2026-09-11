---
name: basecamp-axi
description: "Operate Basecamp through the basecamp-axi CLI - projects, todos, todolists, cards (kanban), messages, comments, campfire chat, people, search, cross-project reports, archiving or trashing recordings, and URL parsing. Use whenever a task touches Basecamp: checking what is assigned to you, listing or creating todos, completing or reassigning work, reading or replying to messages and comments, moving cards, posting to chat, or resolving a Basecamp link."
user-invocable: false
---

# basecamp-axi

Agent ergonomic wrapper around the Basecamp CLI. Prefer this over `basecamp` and other methods for Basecamp operations.

You do not need basecamp-axi installed globally - invoke it with `npx -y basecamp-axi <command>`.
If basecamp-axi output shows a follow-up command starting with `basecamp-axi`, run it as `npx -y basecamp-axi ...` instead.

basecamp-axi requires the [`basecamp`](https://github.com/basecamp/basecamp-cli) CLI installed and authenticated (`basecamp auth login`).
If a command fails with an authentication error, ask the user to run `basecamp auth login` themselves.

## When to use

Use basecamp-axi whenever a task touches Basecamp: seeing what is assigned to you or overdue; listing, viewing, creating, completing, or reassigning todos; browsing todolists; listing, viewing, creating, or moving kanban cards; reading or posting messages; reading or adding comments; posting to Campfire chat; looking up people and mention handles; searching the account; or turning a Basecamp URL into ids.

## Workflow

1. Run `npx -y basecamp-axi` with no arguments for a dashboard - your open assignments with due dates, plus suggested next commands.
2. Most commands are project-scoped. Put `--in <project id|name>` AFTER the command (`npx -y basecamp-axi todo list --in 48189809`), or set `BASECAMP_PROJECT`, or rely on a `.basecamp/config.json` with `project_id`. Cross-project commands need no `--in`: `report assigned`, `report overdue`, `search`, `project list`, `people`, `url parse`.
3. Have a Basecamp link? Run `url parse "<url>"` first - it returns the project id, recording id, and the exact command to open it.
4. Drill in command-first: `todo list`, `todo view <id>`, `message view <id>`, `card list`, `comment list <id>`.
5. Comments are flat: comment on the parent todo, message, or card - never on another comment. A `#__recording_<id>` URL fragment is a comment id; reply to the recording in the path instead.
6. Long bodies are truncated with a marker showing total size; pass `--full` to the same view command when you need everything.
7. Every response ends with contextual next-step hints under `help:` - follow them.

## Commands

```
commands[14]:
  (none)=dashboard, project, todo, todolist, card, message, comment, chat, people, search, report, recording, url, setup
```

Installed copies also inherit the SDK built-in `update` command (`basecamp-axi update --check`).

Run `npx -y basecamp-axi --help` for global flags, or `npx -y basecamp-axi <command> --help` for per-command usage.

## Tips

- Output is TOON-encoded and token-efficient; pipe through grep/head only when a list is very long.
- `todo done` and `todo reopen` are idempotent: an already-done todo reports `already done (no-op)` with exit 0.
- Message bodies and comment text accept Markdown. Mention people with `[@Name](mention:<sgid>)`; `people view <id>` prints the exact handle and `people list --fields sgid` adds the sgid column. The `person:<id>` form is not reliable.
- For multi-line text, write it to a UTF-8 file and pass `--body-file <path>` (messages, comments) or `--description-file <path>` (todos).
- Cards: column names are resolved to ids automatically (`card move <id> --to Done`); pass `--card-table <id>` only when a project has several tables.
- A `TOOL_DISABLED` error means the project has that Basecamp tool turned off; `project view <id>` lists the enabled tools. A `DEPENDENCY_OUTDATED` error means the installed `basecamp` CLI lacks a flag; ask the user to run `basecamp upgrade`.
- `recording trash|archive|restore <id> --in <project>` are the only status-changing commands. Without `--confirm` they print what would change and exit 0 without touching anything; rerun with `--confirm` to apply. Trash is reversible with `recording restore`.
- Unknown flags are rejected with the list of valid flags - fix the flag rather than retrying blindly.
- Exit codes: 0 success (including no-ops), 1 error, 2 usage error.

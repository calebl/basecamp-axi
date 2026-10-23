# basecamp-axi

Basecamp CLI for agents, built to the [AXI](https://github.com/kunchenguid/axi) (Agent eXperience Interface) standard.

Wraps the official [`basecamp`](https://github.com/basecamp/basecamp-cli) CLI with token-efficient TOON output, contextual next-step suggestions, definitive empty states, idempotent mutations, and structured errors. Built for autonomous agents that talk to Basecamp through shell execution.

## Benchmarks

Agent ergonomics is measurable. The harness in [`bench/`](bench/) runs the same Basecamp tasks through two conditions: an agent using basecamp-axi and one using the raw `basecamp` CLI.

**Read tasks.** Ten read-only tasks (assignments across projects, overdue work, message comment threads, card counts, URL resolution, a not-found case, and more), 3 repeats each, with `claude-sonnet-5` as the agent and an LLM judge scoring task success.

| Condition        | Success  | Avg Input Tokens | Avg Cost/Task | Avg Duration | Avg Turns |
| ---------------- | -------- | ---------------- | ------------- | ------------ | --------- |
| **basecamp-axi** | **100%** | **105,981**      | **$0.040**    | **8.1s**     | **3**     |
| basecamp CLI     | 100%     | 162,194          | $0.070        | 14.1s        | 5         |

Same success rate with 35% fewer input tokens, 43% lower cost, and 43% less wall-clock time. The gap is widest on cross-project work: "what is assigned to me and what is overdue" took the raw CLI agent 12 turns walking projects, against 4 for basecamp-axi's single report. Full write-up and per-task numbers: [`bench/published-results/STUDY.md`](bench/published-results/STUDY.md).

**Write tasks.** Eleven everyday writes in a throwaway sandbox project: create a to-do with an assignee and due date, create one with subtasks, complete one, comment on one, create and move cards, post and reply to messages, post in chat, upload a file, and repeat a task in a fresh session. The agent is `claude-sonnet-5-5`, with 1 repeat. Success is checked by reading Basecamp back after each run; a duplicate counts as a failure.

| Condition        | Success | Avg Input Tokens | Avg Cost/Task | Avg Duration | Avg Turns |
| ---------------- | ------- | ---------------- | ------------- | ------------ | --------- |
| **basecamp-axi** | 9/11    | **83,967**       | **$0.028**    | **8.1s**     | **4**     |
| basecamp CLI     | 10/11   | 125,552          | $0.047        | 11.3s        | 5         |

On the nine writes both tools support, both passed every task, and basecamp-axi used 36% fewer input tokens, cost 44% less, and finished 29% faster. Repeating a task was the widest gap: neither agent created a duplicate, but the CLI agent took 17 turns and the basecamp-axi agent took 7. The two basecamp-axi failures exposed commands that were missing at benchmark time: creating subtasks and uploading files. The raw CLI agent did not find native subtasks either. In the safety probes, the raw CLI trashed an item at once without confirmation; basecamp-axi treated the same request as a dry run until `--confirm` was added. Full write-up: [`bench/published-results/write/STUDY.md`](bench/published-results/write/STUDY.md).

## Quick start

Requires Node 20+ and the `basecamp` CLI installed and authenticated (`basecamp auth login`).

```sh
npm install -g basecamp-axi
basecamp-axi                 # dashboard: your open assignments, due dates, next commands
basecamp-axi setup hooks     # optional: ambient context at the start of every agent session
```

`setup hooks` installs a `SessionStart` hook for Claude Code, Codex, and OpenCode. Restart your agent session afterwards.

Prefer on-demand loading instead? Install the skill in the [Agent Skills](https://agentskills.io) format:

```sh
npx skills add calebl/basecamp-axi --skill basecamp-axi -g
```

The skill teaches the agent to run `npx -y basecamp-axi ...`, so no global install is needed. `-g` installs it for every project; drop it to install into the current project only. Use the hook, the skill, or both.

## Usage

```sh
basecamp-axi                                          # dashboard
basecamp-axi project list                             # all projects (id, name, status)
basecamp-axi project view 48189809
basecamp-axi todo list --in 48189809 --assignee me    # project-scoped
basecamp-axi todo view 10170015169                    # description preview; --full for everything
basecamp-axi todo create "Ship it" --in 48189809 --to me --due tomorrow
basecamp-axi todo done 10170015169                    # idempotent
basecamp-axi subtask create 10170015169 "Order cake"
basecamp-axi todolist list --in 48189809
basecamp-axi card list --in 44361766 --column Triage
basecamp-axi card move 10247705680 --to Done --card-table 9407211666 --in 44361766
basecamp-axi message list --in 48189809
basecamp-axi message create "Status" --body-file notes.md --in 48189809
basecamp-axi comment list 10126503472 --in 48189809
basecamp-axi people view 50519852                     # prints a ready-to-paste [@Jay Park](mention:<sgid>) handle
basecamp-axi comment create 10126503472 "Thanks [@Jay Park](mention:<sgid>)" --in 48189809
basecamp-axi upload ./site-plan.pdf --in 48189809     # project Docs & Files root
basecamp-axi chat post "Deployed" --in 48189809 --campfire 9169930018
basecamp-axi people list --in 48189809 --fields email,sgid
basecamp-axi search "pull sheet"
basecamp-axi report assigned                          # cross-project
basecamp-axi report overdue
basecamp-axi url parse "https://3.basecamp.com/.../buckets/48189809/todos/10170015169"
basecamp-axi recording archive 10295117789 --in 48618032            # dry run: shows what would change
basecamp-axi recording archive 10295117789 --in 48618032 --confirm  # applies it
```

### Project scope

Most commands need a project. Resolution order:

1. `--in <id|name>` (or `--project`, `-p`) placed after the command
2. `BASECAMP_PROJECT` environment variable
3. `project_id` in the nearest `.basecamp/config.json` walking up from the working directory

Cross-project commands need no scope: `project list`, `report`, `search`, `people` (without `--in`), `url parse`.

### Commands

| Command     | Description                                                            |
| ----------- | ---------------------------------------------------------------------- |
| `project`   | list, view                                                             |
| `todo`      | list, view, create, done, reopen, assign, unassign                     |
| `subtask`   | create one checklist item under a todo or card                         |
| `todolist`  | list, create                                                           |
| `card`      | list, columns, view, create, update, move                              |
| `message`   | list, view, create                                                     |
| `comment`   | list, create (flat: always on the parent recording)                    |
| `upload`    | upload one file to the project's Docs & Files root                     |
| `chat`      | list, messages, post                                                   |
| `people`    | list, view, me                                                         |
| `search`    | full-text search across the account                                    |
| `report`    | assigned, overdue (cross-project)                                      |
| `recording` | list by type and status; trash, archive, restore (require `--confirm`) |
| `url`       | parse a Basecamp link into project, recording, and comment ids         |
| `setup`     | install agent session hooks                                            |
| `update`    | built-in self-update inherited from `axi-sdk-js`                       |

### Behaviour

- **TOON output** on stdout, errors included; stderr carries nothing an agent needs.
- **Truncation**: descriptions and bodies are clipped (800 to 1500 chars) with the total size shown; `--full` on the same view command returns everything.
- **Totals**: lists print `count: N of T total` when the underlying CLI reports a total, plus a hint to fetch the rest.
- **Idempotent**: `todo done` on a completed todo reports `already done (no-op)` and exits 0; the same holds for `recording trash|archive|restore`.
- **Confirmation gate**: trash, archive, and restore are the only commands that change visibility for other people. Without `--confirm` they are a dry run.
- **Strict flags**: unknown flags and extra positionals exit 2 with the list of valid flags. `--json`, `--md`, and `--jq` are rejected with a hint since output is always TOON.
- **Column names**: `card list --column`, `card create --column`, and `card move --to` accept a column name and resolve it to an id automatically when the project has one card table.
- **Exit codes**: 0 success (including no-ops), 1 error, 2 usage error.

### Compatibility with the basecamp CLI

Tested against basecamp CLI 0.11.0 (also exercised on 0.4.0). basecamp-axi calls only long-form subcommands (`todos create`, `comments create`, and so on), so it works whether or not a version ships the short aliases. Flags or commands the installed version lacks surface as `DEPENDENCY_OUTDATED` with a hint to upgrade; `subtask` needs a CLI with the `subtasks` command (tested on 0.17.0). `card update` re-sends the current due date because older CLIs otherwise clear it.

## Benchmark

`bench/` holds a fork of the [axi](https://github.com/kunchenguid/axi) `bench-github` harness pointed at Basecamp. It runs headless Claude Code with scoped tool permissions under two conditions, `cli` (raw `basecamp`) and `axi` (`basecamp-axi`), grades read tasks with an LLM judge and write tasks by reading Basecamp back, and reports tokens, cost, turns, and success rate.

```sh
cd bench && npm install
npm run bench -- run --condition axi --task project_count --repeat 3
npm run bench -- matrix --repeat 3 --parallel     # full grid, both conditions at once
npm run bench -- report                            # results/report.md and report.csv
```

Tasks and their ground-truth grading hints live in `bench/config/tasks.yaml`; they were captured against one account on 2026-09-11 and need refreshing if that data changes. Defaults: agent and judge `claude-sonnet-5`; override with `--model` and `BENCH_JUDGE_MODEL`. Set `BENCH_SKIP_PERMISSIONS=1` to use the upstream `--dangerously-skip-permissions` mode instead of the scoped allowlist. The axi condition runs this checkout's `dist/` build when it exists, so run `npm run build` first.

The write suite (`suite: write` tasks) changes Basecamp, so it runs only inside one sandbox project, configured in `bench/config/sandbox.yaml`. The config sets the CLI profile, the account, the exact project name, the agent model, and a spend cap. The harness creates the project when it is missing. It empties the project and seeds it before every task, and empties it again at the end. Each task is graded by a named check in `bench/src/write-grader.ts` that reads the project back. Before starting, a write matrix prints its cost estimate. It refuses to start over budget and stops once actual spend reaches the cap. After the agent tasks, it runs model-free safety probes (trash without confirmation, completing a to-do twice).

```sh
npm run bench -- matrix --suite write             # 11 tasks × 2 conditions + safety probes, ≈ $1
npm run bench -- run --condition axi --task card_move
npm run bench -- report --suite write             # results/write/report.md
npm run bench -- sandbox reset                    # empty the sandbox project by hand
npm test                                          # offline grader and harness tests
```

## Development

```sh
npm install
npm run build          # tsc -> dist/
npm test               # build + node --test
npm run build:skill    # regenerate skills/basecamp-axi/SKILL.md from the CLI's own help
npm run check:skill    # fail if the committed skill is stale
node dist/bin/basecamp-axi.js <command>
```

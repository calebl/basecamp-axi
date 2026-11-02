# basecamp-axi

Basecamp CLI for agents, built to the [AXI](https://github.com/kunchenguid/axi) (Agent eXperience Interface) standard.

Wraps the official [`basecamp`](https://github.com/basecamp/basecamp-cli) CLI with token-efficient TOON output, contextual next-step suggestions, definitive empty states, idempotent mutations, and structured errors. Built for autonomous agents that talk to Basecamp through shell execution.

## Benchmarks

Agent ergonomics is measurable. The harness in [`bench/`](bench/) runs the same Basecamp tasks through two conditions: an agent using basecamp-axi and one using the raw `basecamp` CLI.

**Read tasks.** The published run (2026-11-02, basecamp-axi 0.3.0, basecamp CLI 0.22.1) used nine read-only tasks: a project count, to-do list progress, a card count, a message's comment thread, assignments across projects, a recording read by bare id, URL resolution, a not-found case, and the hill chart's progress updates. The agent was `claude-sonnet-5-5` (the same model as the write tasks), with 1 repeat and an LLM judge scoring task success. The suite was rebalanced toward how agents actually used Basecamp across 2,128 recorded calls, so these numbers are not directly comparable with earlier runs. The hill chart task is coverage, not realism, so it is reported apart from the table. The timesheet-entry task was left out: Timesheet is not enabled on the bench account, where every timesheet call is "access denied", and the read project has no timesheet entries to check an answer against.

| Condition        | Success | Avg Input Tokens | Avg Cost/Task | Avg Duration | Avg Turns |
| ---------------- | ------- | ---------------- | ------------- | ------------ | --------- |
| **basecamp-axi** | 7/8     | **66,149**       | **$0.021**    | **5.3s**     | **3**     |
| basecamp CLI     | **8/8** | 77,261           | $0.034        | 5.7s         | 3         |

basecamp-axi used 14% fewer input tokens, cost 40% less, and finished 8% faster, but failed one task the raw CLI passed. Given a bare recording id, the basecamp-axi agent tried each `view` command in one shell loop, which the benchmark's scoped permissions deny, and stopped without an answer; basecamp-axi has no command that resolves a bare id without a project. Both conditions passed the hill chart coverage task. The basecamp-axi condition was run twice: the first attempt ran a globally installed 0.2.0 instead of this checkout, so the harness now refuses to start until a preflight confirms the build under test. Full write-up and per-task numbers: [`bench/published-results/STUDY.md`](bench/published-results/STUDY.md). Earlier runs are kept under [`bench/published-results/history/`](bench/published-results/history/): 2026-10-23 (basecamp-axi 0.1.0, ten tasks: axi 10/10 vs CLI 9/10, $0.030 vs $0.041 per task) and 2026-09-11 (`claude-sonnet-5`, 3 repeats).

**Write tasks.** The published run (2026-11-02, basecamp-axi 0.3.0, basecamp CLI 0.22.1) used 21 everyday writes in a throwaway sandbox project. They lean toward the writes agents make most in real use: to-dos with assignees, due dates and subtasks; completing to-dos and subtasks; comments typed in, read from a Markdown file, with an attachment, or replying to a link; cards created, renamed and moved, including on the second of two card tables; messages, replies, chat and a file upload; a check-in answer; repeating a task or a reply in a fresh session; and being asked to complete a to-do that is in the trash. The task set changed since the previous run, so the numbers are not directly comparable with it. The hill chart update is coverage, not realism, so it is reported apart from the table. The three timesheet tasks were left out because Timesheet is not enabled on the bench account: every timesheet call there, including the harness's own seeding, is "access denied", so they could only fail. The agent is `claude-sonnet-5-5`, with 1 repeat. Success is checked by reading Basecamp back after each run; a duplicate counts as a failure.

| Condition        | Success | Avg Input Tokens | Avg Cost/Task | Avg Duration | Avg Turns |
| ---------------- | ------- | ---------------- | ------------- | ------------ | --------- |
| **basecamp-axi** | 17/20   | **97,035**       | **$0.024**    | **8.2s**     | 5         |
| basecamp CLI     | 17/20   | 114,350          | $0.031        | 8.3s         | 5         |

Each condition failed three tasks, and they were different ones. basecamp-axi's failures are commands it does not have yet: `comment create` cannot attach a file, there is no way to complete an existing subtask, and there is no check-in command. The raw CLI failed creating a to-do with subtasks and moving a card on the second card table, both because its agent tried a shell loop that the benchmark's scoped permissions deny. It also created a duplicate when the to-do task was repeated, after a `grep | head` check cut its listing off before the existing to-do. basecamp-axi passed all three, adding the subtasks with one multi-title `subtask create`. On the 14 tasks both passed, basecamp-axi used 21% fewer input tokens, cost 29% less, and finished 14% faster. Both passed the hill chart coverage task. In the safety probes, the raw CLI trashed an item at once without confirmation and reported success when completing a trashed to-do; basecamp-axi treated the trash as a dry run until `--confirm` was added and refused the trashed to-do with a `TRASHED` error. Full write-up: [`bench/published-results/write/STUDY.md`](bench/published-results/write/STUDY.md). Earlier runs are kept under [`bench/published-results/write/history/`](bench/published-results/write/history/): 2026-11-01 (basecamp-axi 0.2.0, eleven tasks: axi 10/11 vs CLI 10/11) and 2026-10-23 (basecamp-axi 0.1.0: axi 9/11 vs CLI 10/11).

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
basecamp-axi subtask create 10170015169 "Book venue" "Order cake"   # several titles in one call
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
basecamp-axi timesheet list --in 48189809                         # project entries with total hours
basecamp-axi timesheet create 10170015169 --hours 1:30 --description "Review"
basecamp-axi timesheet update 1069480283 --hours 2.5              # no-op when nothing changes
basecamp-axi timesheet delete 1069480283 --confirm                # permanent; dry run without --confirm
basecamp-axi hill view --in 48189809                              # tracked todolists at 0-100
basecamp-axi hill update --dot "Design=60" --note "Over the hill" --in 48189809
basecamp-axi hill updates --in 48189809                           # past progress updates
basecamp-axi url parse "https://3.basecamp.com/.../buckets/48189809/todos/10170015169"
basecamp-axi recording archive 10295117789 --in 48618032            # dry run: shows what would change
basecamp-axi recording archive 10295117789 --in 48618032 --confirm  # applies it
```

### Project scope

Most commands need a project. Resolution order:

1. `--in <id|name>` (or `--project`, `-p`) placed after the command
2. `BASECAMP_PROJECT` environment variable
3. `project_id` in the nearest `.basecamp/config.json` walking up from the working directory

Cross-project commands need no scope: `project list`, `report`, `timesheet report`, `search`, `people` (without `--in`), `url parse`.

### Commands

| Command     | Description                                                            |
| ----------- | ---------------------------------------------------------------------- |
| `project`   | list, view                                                             |
| `todo`      | list, view, create, done, reopen, assign, unassign                     |
| `subtask`   | create checklist items under a todo or card (several titles per call)  |
| `todolist`  | list, create                                                           |
| `card`      | list, columns, view, create, update, move                              |
| `message`   | list, view, create                                                     |
| `comment`   | list, create (flat: always on the parent recording)                    |
| `upload`    | upload one file to the project's Docs & Files root                     |
| `chat`      | list, messages, post                                                   |
| `people`    | list, view, me                                                         |
| `search`    | full-text search across the account                                    |
| `report`    | assigned, overdue (cross-project)                                      |
| `timesheet` | list, report, view, create, update, delete (requires `--confirm`)      |
| `hill`      | view, track, untrack, update (move dots, post a progress update), updates |
| `recording` | list by type and status; trash, archive, restore (require `--confirm`) |
| `url`       | parse a Basecamp link into project, recording, and comment ids         |
| `setup`     | install agent session hooks                                            |
| `update`    | built-in self-update inherited from `axi-sdk-js`                       |

### Behaviour

- **TOON output** on stdout, errors included; stderr carries nothing an agent needs.
- **Truncation**: descriptions and bodies are clipped (800 to 1500 chars) with the total size shown; `--full` on the same view command returns everything.
- **Totals**: lists print `count: N of T total` when the underlying CLI reports a total, plus a hint to fetch the rest.
- **Idempotent**: `todo done` on a completed todo reports `already done (no-op)` and exits 0; the same holds for `recording trash|archive|restore`, `hill track|untrack`, `timesheet update` with values that already match, and `hill update` that moves dots to where they already are (without a note).
- **Confirmation gate**: trash, archive, restore, and `timesheet delete <entry id|url>` (one permanent deletion) need `--confirm`. Without it they are a dry run.
- **Trashed items**: completing or reopening a trashed to-do, adding its subtasks, updating or moving a trashed card, and commenting on a trashed item fail with a `TRASHED` error instead of silently succeeding or restoring it. Restore the item only when the user asks.
- **Strict flags**: unknown flags and extra positionals exit 2 with the list of valid flags. `--json`, `--md`, and `--jq` are rejected with a hint since output is always TOON.
- **Column names**: `card list --column`, `card create --column`, and `card move --to` accept a column name and resolve it to an id automatically when the project has one card table.
- **Exit codes**: 0 success (including no-ops), 1 error, 2 usage error.

### Compatibility with the basecamp CLI

Tested against basecamp CLI 0.11.0 (also exercised on 0.4.0). basecamp-axi calls only long-form subcommands (`todos create`, `comments create`, and so on), so it works whether or not a version ships the short aliases. Flags or commands the installed version lacks surface as `DEPENDENCY_OUTDATED` with a hint to upgrade; `subtask` needs a CLI with the `subtasks` command (tested on 0.17.0). `timesheet view|create|update|delete`, `hill update`, and `hill updates` need CLI 0.22.0 or newer (tested on 0.22.1) and check the installed version first, because older CLIs run the timesheet report instead of rejecting `timesheet entry`. `card update` re-sends the current due date because older CLIs otherwise clear it.

## Benchmark

`bench/` holds a fork of the [axi](https://github.com/kunchenguid/axi) `bench-github` harness pointed at Basecamp. It runs headless Claude Code with scoped tool permissions under two conditions, `cli` (raw `basecamp`) and `axi` (`basecamp-axi`), grades read tasks with an LLM judge and write tasks by reading Basecamp back, and reports tokens, cost, turns, and success rate.

```sh
cd bench && npm install
npm run bench -- run --condition axi --task project_count --repeat 3
npm run bench -- matrix --repeat 3 --parallel     # full grid, both conditions at once
npm run bench -- report                            # results/report.md and report.csv
```

Tasks and their ground-truth grading hints live in `bench/config/tasks.yaml`. Ground truth was last refreshed against one account on 2026-11-02 and needs refreshing if that data changes; the timesheet-entry read task still needs its ground truth captured on an account with timesheet entries before it can run. `npm run bench -- regrade --condition <id> --task <id>` re-judges saved read trajectories after a hint is corrected, without re-running the agent. Defaults: agent and judge `claude-sonnet-5` for the read suite (the published read results use `--model claude-sonnet-5-5` with `BENCH_JUDGE_MODEL=claude-sonnet-5-5`); override with `--model` and `BENCH_JUDGE_MODEL`. Set `BENCH_SKIP_PERMISSIONS=1` to use the upstream `--dangerously-skip-permissions` mode instead of the scoped allowlist. The axi condition runs this checkout's `dist/` build, so run `npm run build` first. Before any axi session, a short preflight session (on `BENCH_PREFLIGHT_MODEL`, default `claude-haiku-5-5`, well under a cent) checks that `basecamp-axi` in the agent's shell resolves to that build, and the run refuses to start otherwise; a version manager in the shell profile can otherwise put a global install first.

The write suite (`suite: write` tasks) changes Basecamp, so it runs only inside one sandbox project, configured in `bench/config/sandbox.yaml`. The config sets the CLI profile, the account, the exact project name, the agent model, and a spend cap. The harness creates the project when it is missing. It empties the project and seeds it before every task, and empties it again at the end. Each task is graded by a named check in `bench/src/write-grader.ts` that reads the project back. Before starting, a write matrix prints its cost estimate. It refuses to start over budget and stops once actual spend reaches the cap. After the agent tasks, it runs model-free safety probes (trash without confirmation, completing a to-do twice, and refusing to complete a trashed to-do).

```sh
npm run bench -- matrix --suite write             # 24 tasks × 2 conditions, 52 sessions, estimated $3.12
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

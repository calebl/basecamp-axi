# basecamp-axi vs basecamp CLI: write tasks

**Agent**: Claude Sonnet 5.5 (`claude-sonnet-5-5`) in headless Claude Code with scoped Bash permissions
**Grading**: read back from Basecamp after each run (no LLM judge)
**Repeats**: 1 per condition × task
**Total**: 22 trials, 24 agent sessions (`rerun_no_duplicate` runs twice), $0.82
**Date**: 2026-10-23
**Tools**: basecamp CLI 0.14.0, basecamp-axi 0.1.0 (this checkout's build)

## Setup

Every write lands in one dedicated project, "basecamp-axi bench", in a separate Basecamp account (Basecamp Personal). Before each trial the harness empties that project and seeds the task's starting content (a to-do list, cards, messages). After the trial it reads the project back. When the matrix finishes it empties the project again. The harness only modifies recordings that it has verified sit in the sandbox project.

Conditions and permissions match the read suite: each agent may run only its own binary plus read-only shell helpers. The axi condition runs this checkout's `dist/` build.

## Results

| Condition | Success | Avg input tokens | Avg output tokens | Avg cost | Total cost | Avg duration | Avg turns |
| --------- | ------- | ---------------- | ----------------- | -------- | ---------- | ------------ | --------- |
| **axi**   | 9/11    | 83,967           | 377               | $0.028   | $0.31      | 8.1s         | 4         |
| cli       | 10/11   | 125,552          | 593               | $0.047   | $0.52      | 11.3s        | 5         |

On the nine tasks both tools support (everything except `todo_with_subtasks` and `file_upload`), both conditions passed 9/9. Against the raw CLI, basecamp-axi averaged:

- **Cost:** $0.027 against $0.049 per task, 44% less.
- **Input tokens:** 84,940 against 132,176, 36% fewer.
- **Turns:** 3.9 against 5.4.
- **Wall-clock time:** 7.9s against 11.1s, 29% faster.

| Task | cli | axi |
| ---- | --- | --- |
| todo_create (assignee + due date) | PASS, $0.037 | PASS, $0.031 |
| todo_with_subtasks | FAIL, $0.048 | FAIL, $0.037 |
| todo_complete | PASS, $0.038 | PASS, $0.021 |
| todo_comment | PASS, $0.041 | PASS, $0.028 |
| card_create | PASS, $0.069 | PASS, $0.027 |
| card_move | PASS, $0.043 | PASS, $0.027 |
| message_post | PASS, $0.032 | PASS, $0.022 |
| message_reply | PASS, $0.036 | PASS, $0.023 |
| chat_post | PASS, $0.026 | PASS, $0.021 |
| file_upload | PASS, $0.031 | FAIL, $0.026 |
| rerun_no_duplicate (2 sessions) | PASS, $0.116, 17 turns | PASS, $0.045, 7 turns |

## Safety probes

These run without a model. Each probe seeds a to-do, runs the condition's own command, and reads the result back.

| Probe | cli (`basecamp`) | axi (`basecamp-axi`) |
| ----- | ---------------- | -------------------- |
| Trash without a confirm flag | **Trashed immediately** (`todos trash`) | Refused: dry run, item still active (`recording trash` without `--confirm`) |
| Complete the same to-do twice | Exit 0 both times, still completed | Exit 0 both times, still completed, second run reported as a no-op |

## Findings

- **Re-running a task is where the gap is widest.** `rerun_no_duplicate` asks the agent twice, in fresh sessions, to make sure a to-do exists. Neither condition created a duplicate. The cli agent spent 17 turns and $0.12 checking lists in JSON, while the axi agent spent 7 turns and $0.05.
- **basecamp-axi has no subtask or upload command.** The axi agent could not complete `todo_with_subtasks` or `file_upload`; both are follow-ups for the wrapper. The raw CLI handled the upload with `basecamp upload`.
- **Neither agent found native subtasks.** Both treated "subtasks" as separate to-dos in the same list. The raw CLI does have `basecamp subtasks create`, but `basecamp todos --help` does not point to it. In both runs the shell loop that would have created the extra to-dos was also denied by the scoped allowlist (see below). The grader requires real subtasks, so the outcome would have been a failure either way.
- **Only basecamp-axi refuses a trash without confirmation.** The raw CLI moves the item to the trash straight away; basecamp-axi treats a trash without `--confirm` as a dry run.

## Methodology notes

- The agent model differs from the read suite. Write sessions with `claude-sonnet-5` measured $0.11 to $0.21 each in development, which would put a full matrix near $3 and over the $2 cap. `claude-sonnet-5-5` measured about $0.05 per session. Compare write numbers with each other, not with the read table.
- Two harness changes landed with this suite and apply to both suites. Each condition now reuses one fixed workspace path, because a per-run path in the system prompt defeated prompt caching across runs. MCP servers are now disabled (`--strict-mcp-config`), because a claude.ai Basecamp connector gave the agent a third route to Basecamp. The published read results predate both changes.
- The scoped allowlist only matches commands that start with an allowed binary. Shell loops and variable assignments (`for t in ...; do basecamp ...`, `L=123; basecamp-axi ...`) are therefore denied, the same way `/tmp` redirects were in the read suite. This affected both conditions in `todo_with_subtasks`, and the axi condition in `file_upload`.
- Per-run artifacts (`agent_output.txt`, `grade.json`) live under `results/write/` locally and are not committed.

# basecamp-axi vs basecamp CLI: write tasks

**Agent**: Claude Sonnet 5.5 (`claude-sonnet-5-5`) in headless Claude Code with scoped Bash permissions
**Grading**: read back from Basecamp after each run (no LLM judge)
**Repeats**: 1 per condition × task
**Total**: 22 trials, 24 agent sessions (`rerun_no_duplicate` runs twice), $0.57
**Date**: 2026-11-01
**Tools**: basecamp CLI 0.21.0, basecamp-axi 0.2.0 (this checkout's build)

This rerun follows basecamp-axi 0.2.0, which added `subtask create` and `upload`. The two basecamp-axi failures in the previous run were on exactly those tasks. Tasks, seeds, grader, model and harness are unchanged. The previous run (2026-10-23, basecamp-axi 0.1.0, basecamp CLI 0.14.0, $0.82) is kept in [`history/2026-10-23-claude-sonnet-5-5/`](../2026-10-23-claude-sonnet-5-5/STUDY.md).

## Setup

Every write lands in one dedicated project, "basecamp-axi bench", in a separate Basecamp account (Basecamp Personal). Before each trial the harness empties that project and seeds the task's starting content (a to-do list, cards, messages). After the trial it reads the project back. When the matrix finishes it empties the project again. The harness only modifies recordings that it has verified sit in the sandbox project.

Conditions and permissions match the read suite: each agent may run only its own binary plus read-only shell helpers. The axi condition runs this checkout's `dist/` build.

## Results

| Condition | Success | Avg input tokens | Avg output tokens | Avg cost | Total cost | Avg duration | Avg turns |
| --------- | ------- | ---------------- | ----------------- | -------- | ---------- | ------------ | --------- |
| **axi**   | 10/11   | 80,869           | 324               | $0.019   | $0.21      | 6.2s         | 4         |
| cli       | 10/11   | 99,346           | 436               | $0.033   | $0.36      | 7.7s         | 4         |

Both conditions failed only `todo_with_subtasks`. On the ten tasks both passed, basecamp-axi averaged, against the raw CLI:

- **Cost:** $0.019 against $0.032 per task, 41% less.
- **Input tokens:** 80,369 against 90,140, 11% fewer.
- **Turns:** 3.9 against 4.0.
- **Wall-clock time:** 6.1s against 7.1s, 14% faster.

| Task | cli | axi |
| ---- | --- | --- |
| todo_create (assignee + due date) | PASS, $0.068 | PASS, $0.021 |
| todo_with_subtasks | FAIL, $0.047, 8 turns | FAIL, $0.022, 4 turns |
| todo_complete | PASS, $0.017 | PASS, $0.014 |
| todo_comment | PASS, $0.031 | PASS, $0.019 |
| card_create | PASS, $0.048 | PASS, $0.019 |
| card_move | PASS, $0.025 | PASS, $0.018 |
| message_post | PASS, $0.022 | PASS, $0.015 |
| message_reply | PASS, $0.025 | PASS, $0.015 |
| chat_post | PASS, $0.017 | PASS, $0.014 |
| file_upload | PASS, $0.020 | PASS, $0.017 |
| rerun_no_duplicate (2 sessions) | PASS, $0.046, 7 turns | PASS, $0.033, 7 turns |

## Safety probes

These run without a model. Each probe seeds a to-do, runs the condition's own command, and reads the result back.

| Probe | cli (`basecamp`) | axi (`basecamp-axi`) |
| ----- | ---------------- | -------------------- |
| Trash without a confirm flag | **Trashed immediately** (`todos trash`) | Refused: dry run, item still active (`recording trash` without `--confirm`) |
| Complete the same to-do twice | Exit 0 both times, still completed | Exit 0 both times, still completed, second run reported as a no-op |

## Findings

- **Uploads now work through basecamp-axi.** The axi agent read `basecamp-axi upload --help` and uploaded `site-plan.txt` with `basecamp-axi upload ./site-plan.txt --in <project>`, in 4 turns.
- **Both agents found native subtasks this time, and both were stopped by the allowlist.** After `basecamp-axi todo create`, the help hint pointed to `basecamp-axi subtask create <id> "<title>"`. The axi agent found it with its second command. The cli agent found `basecamp subtasks create` with its fifth, by searching `basecamp commands`; `basecamp todos --help` still does not mention subtasks. Both then tried to add the three subtasks in one shell `for` loop. The scoped allowlist denies loops (see methodology notes), so each agent stopped and reported that it had created the parent to-do but no subtasks. With three separate calls, either agent would have passed. Neither tried that, so this task fails in both conditions because of the harness, not because a command is missing.
- **Re-running a task no longer separates the tools.** Neither condition created a duplicate in `rerun_no_duplicate`. Both took 7 turns, and the axi agent cost $0.033 against $0.046. In the previous run the cli agent took 17 turns.
- **The first tasks inflate the cli cost.** The cli condition runs first for each task. Its `todo_create` and `card_create` sessions had 65% and 87% cache hits, against 92–97% elsewhere, so part of the cost gap on those two tasks is prompt-cache warm-up, not tool output.
- **Only basecamp-axi refuses a trash without confirmation.** The raw CLI moves the item to the trash straight away; basecamp-axi treats a trash without `--confirm` as a dry run.

## Methodology notes

- The agent model differs from the read suite's earlier runs but matches its current published run. Write sessions with `claude-sonnet-5` measured $0.11 to $0.21 each in development; `claude-sonnet-5-5` measured about $0.02 per session in this run.
- This run's spend cap was $1.50, set in `sandbox.yaml` for this run only; the committed default stays $2.00. The pre-start estimate was 24 × $0.06 = $1.44; actual spend was $0.57.
- The scoped allowlist only matches commands that start with an allowed binary. Shell loops and variable assignments (`for t in ...; do basecamp ...`, `L=123; basecamp-axi ...`) are therefore denied, the same way `/tmp` redirects were in the read suite. This affected both conditions in `todo_with_subtasks`.
- Each condition reuses one fixed workspace path, and MCP servers are disabled (`--strict-mcp-config`), as in the previous write run.
- Per-run artifacts (`agent_output.txt`, `grade.json`) live under `results/write/` locally and are not committed.

# basecamp-axi vs basecamp CLI: write tasks

**Agent**: Claude Sonnet 5.5 (`claude-sonnet-5-5`) in headless Claude Code with scoped Bash permissions
**Grading**: read back from Basecamp after each run (no LLM judge)
**Repeats**: 1 per condition × task
**Total**: 42 trials, 46 agent sessions (`rerun_no_duplicate` and `reply_rerun` run twice), $1.13
**Date**: 2026-11-02
**Tools**: basecamp CLI 0.22.1, basecamp-axi 0.3.0 (this checkout's build, confirmed by the harness preflight)

This run is the release benchmark for basecamp-axi 0.3.0. The task set changed since the previous run, so the numbers are not directly comparable with it. The suite was rebalanced toward the writes agents make most in real use. It adds comments from a Markdown file, a reply by link, a comment with an attachment, completing a subtask, a check-in answer, a card rename, a move on the second of two card tables, a reply re-run and completing a trashed to-do. Card tasks now name their table. The previous run (2026-11-01, 11 tasks, basecamp-axi 0.2.0) is kept in [`history/2026-11-01-claude-sonnet-5-5/`](history/2026-11-01-claude-sonnet-5-5/STUDY.md).

**Timesheet tasks left out.** `timesheet_log`, `timesheet_update` and `timesheet_delete` were excluded. Timesheet is not enabled on the bench account, so every timesheet call, including the harness's own seeding, is "access denied". The tasks could only fail, and would measure the account rather than either tool. `hill_update` ran, as coverage for the hill chart commands.

## Setup

Every write lands in one dedicated project, "basecamp-axi bench", in a separate Basecamp account (Basecamp Personal). Before each trial the harness empties that project and seeds the task's starting content. After the trial it reads the project back. When the matrix finishes it empties the project again. The harness only modifies recordings that it has verified sit in the sandbox project.

Conditions and permissions match the read suite: each agent may run only its own binary plus read-only shell helpers. The axi condition runs this checkout's `dist/` build.

## Results (20 realism tasks per condition)

`hill_update` is a coverage task, so it is reported separately and left out of this table. Both conditions passed it.

| Condition | Success | Avg input tokens | Avg output tokens | Avg cost | Total cost | Avg duration | Avg turns |
| --------- | ------- | ---------------- | ----------------- | -------- | ---------- | ------------ | --------- |
| **axi**   | 17/20   | 97,035           | 451               | $0.024   | $0.48      | 8.2s         | 5         |
| cli       | 17/20   | 114,350          | 495               | $0.031   | $0.61      | 8.3s         | 5         |

Each condition failed three tasks, and they were different ones. On the 14 tasks both passed, basecamp-axi averaged, against the raw CLI:

- **Cost:** $0.020 against $0.028 per task, 29% less.
- **Input tokens:** 81,026 against 102,979, 21% fewer.
- **Turns:** 4.0 against 4.6.
- **Wall-clock time:** 6.4s against 7.4s, 14% faster.

| Task | cli | axi |
| ---- | --- | --- |
| todo_create (assignee + due date) | PASS, $0.037 | PASS, $0.019 |
| todo_with_subtasks | FAIL, $0.042, 8 turns | PASS, $0.025, 5 turns |
| todo_complete | PASS, $0.019 | PASS, $0.015 |
| todo_comment | PASS, $0.024 | PASS, $0.018 |
| card_create | PASS, $0.026 | PASS, $0.024 |
| card_move | PASS, $0.042 | PASS, $0.026 |
| message_post | PASS, $0.024 | PASS, $0.017 |
| message_reply | PASS, $0.025 | PASS, $0.017 |
| chat_post | PASS, $0.021 | PASS, $0.015 |
| file_upload | PASS, $0.021 | PASS, $0.016 |
| todo_comment_from_file | PASS, $0.027 | PASS, $0.019 |
| reply_by_url | PASS, $0.029 | PASS, $0.022 |
| comment_with_attachment | PASS, $0.029 | FAIL, $0.029, 5 turns |
| subtask_complete | PASS, $0.045, 9 turns | FAIL, $0.039, 7 turns |
| checkin_answer | PASS, $0.032 | FAIL, $0.031, 6 turns |
| card_update | PASS, $0.029 | PASS, $0.021 |
| card_move_two_tables | FAIL, $0.020, 3 turns | PASS, $0.039, 9 turns |
| rerun_no_duplicate (2 sessions) | FAIL, $0.052, 9 turns | PASS, $0.035, 7 turns |
| reply_rerun (2 sessions) | PASS, $0.041, 9 turns | PASS, $0.030, 7 turns |
| act_on_trashed | PASS, $0.026 | PASS, $0.019 |
| hill_update (coverage) | PASS, $0.027 | PASS, $0.018 |

## Safety probes

These run without a model. Each probe seeds a to-do, runs the condition's own command, and reads the result back.

| Probe | cli (`basecamp`) | axi (`basecamp-axi`) |
| ----- | ---------------- | -------------------- |
| Trash without a confirm flag | **Trashed immediately** (`todos trash`) | Refused: dry run, item still active (`recording trash` without `--confirm`) |
| Complete the same to-do twice | Exit 0 both times, still completed | Exit 0 both times, still completed, second run reported as a no-op |
| Complete a trashed to-do | **Reported success**, item still in the trash | Refused with a `TRASHED` error (exit 1) |

## Findings

- **Multi-title `subtask create` fixed the subtask task for basecamp-axi.** The axi agent added all three subtasks with one `basecamp-axi subtask create <id> "Book venue" "Send invites" "Order cake"` call. The cli agent found `basecamp subtasks create` and again tried a shell `for` loop, which the allowlist denies, so it created none.
- **basecamp-axi's three failures are missing commands.**
  - `comment_with_attachment`: `comment create` has no attach option. The agent uploaded the file to Docs & Files and linked it in the comment, so the comment has no attachment.
  - `subtask_complete`: there is no way to list or complete an existing subtask, and `todo view` does not show subtasks. The agent stopped and said so, changing nothing.
  - `checkin_answer`: there is no check-in command yet. This failure was expected.
- **The raw CLI's other failures.** In `card_move_two_tables` the cli agent tried to list both card tables in one shell loop, which was denied, and it stopped. In `rerun_no_duplicate`, its second session checked the list through `grep | head`. That cut the output off before the existing to-do, so it created "Pay invoice 42" a second time.
- **Trashed items.** Both agents left the trashed to-do in the trash in `act_on_trashed`. The new probe shows the tool difference underneath: the raw CLI reports success when completing a trashed to-do, though nothing changed. basecamp-axi refuses with a `TRASHED` error.
- **Hill chart coverage passes in both conditions**, with the axi agent at $0.018 and 3 turns against $0.027 and 4.

## Methodology notes

- The harness now checks, before any axi session, that `basecamp-axi` in a real Claude Code shell resolves to this checkout's build. The read suite's first attempt showed that a version manager in the shell profile could put a global install ahead of the PATH shim. This write run passed that preflight. Earlier write runs used the PATH-only shim and may have measured the globally installed basecamp-axi.
- This run's spend cap was $1.35, set in `sandbox.yaml` for this run only so the release benchmark's total stayed within $2.50. The per-session estimate was lowered to $0.029 for the same run. The committed defaults stay $3.50 and $0.06. The pre-start estimate was 46 × $0.029 = $1.33; actual spend was $1.13.
- The scoped allowlist only matches commands that start with an allowed binary. Shell loops and variable assignments are therefore denied. This affected the cli condition in `todo_with_subtasks` and `card_move_two_tables`, and the axi condition in the read suite's `recording_by_id`.
- Each condition reuses one fixed workspace path, and MCP servers are disabled (`--strict-mcp-config`).
- Per-run artifacts (`agent_output.txt`, `grade.json`) live under `results/write/` locally and are not committed.

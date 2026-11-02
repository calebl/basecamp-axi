# basecamp-axi vs basecamp CLI: read tasks

**Agent**: Claude Sonnet 5.5 (`claude-sonnet-5-5`) in headless Claude Code with scoped Bash permissions
**Judge**: Claude Sonnet 5.5 (`BENCH_JUDGE_MODEL=claude-sonnet-5-5`)
**Repeats**: 1 per condition × task
**Total runs**: 18 (2 conditions × 9 tasks), $0.48 agent spend in the published rows
**Date**: 2026-11-02
**Tools**: basecamp CLI 0.22.1, basecamp-axi 0.3.0 (this checkout's build, confirmed by the harness preflight)

This run uses the rebalanced read suite, so it is not directly comparable with earlier runs. The suite drops `project_tools`, `people_on_project` and `overdue_oldest`, which no recorded agent session needed. It adds `recording_by_id`, a read by bare id, and `hill_progress_updates`, a coverage task for the new hill chart commands. The previous run (2026-10-23, 10 tasks, basecamp-axi 0.1.0) is kept in [`history/2026-10-23-claude-sonnet-5-5/`](history/2026-10-23-claude-sonnet-5-5/STUDY.md).

**Timesheet task left out.** `timesheet_entry_view` was excluded from this run. Timesheet is not enabled on the write suite's bench account, where every timesheet call is "access denied". Project 48189809 in the read account also has no timesheet entries, so there was no ground truth to capture.

## Conditions

| Condition | Interface       | Notes                                                                                   |
| --------- | --------------- | --------------------------------------------------------------------------------------- |
| `cli`     | `basecamp`      | Raw CLI with `--json`. Allowed to pipe through jq, grep, python3, and similar helpers.   |
| `axi`     | `basecamp-axi`  | AXI wrapper with TOON output, totals, next-step hints. Same helper allowlist.            |

Both conditions read the Construct-Ease account (6068025) through the same CLI profile. No task writes.

## Results (8 realism tasks per condition)

`hill_progress_updates` is a coverage task, so it is reported separately and left out of this table.

| Condition | Success | Avg input tokens | Avg output tokens | Avg cost | Total cost | Avg duration | Avg turns |
| --------- | ------- | ---------------- | ----------------- | -------- | ---------- | ------------ | --------- |
| **axi**   | 7/8     | 66,149           | 331               | $0.021   | $0.17      | 5.3s         | 3         |
| cli       | 8/8     | 77,261           | 413               | $0.034   | $0.28      | 5.7s         | 3         |

basecamp-axi used 14% fewer input tokens, cost 40% less and finished 8% faster, but failed one task the raw CLI passed.

| Task | cli | axi |
| ---- | --- | --- |
| project_count | PASS, $0.065, 4 turns | PASS, $0.013, 2 turns |
| todolist_progress | PASS, $0.019, 3 turns | PASS, $0.017, 3 turns |
| triage_card_count | PASS, $0.049, 4 turns | PASS, $0.015, 3 turns |
| message_last_commenter | PASS, $0.059, 3 turns | PASS, $0.037, 4 turns |
| my_assignments | PASS, $0.027, 4 turns | PASS, $0.031, 4 turns |
| recording_by_id | PASS, $0.026, 3 turns | FAIL, $0.019, 3 turns |
| url_resolve | PASS, $0.020, 3 turns | PASS, $0.015, 2 turns |
| nonexistent_project | PASS, $0.012, 2 turns | PASS, $0.017, 3 turns |
| hill_progress_updates (coverage) | PASS, $0.022, 4 turns | PASS, $0.016, 3 turns |

## Findings

- **`recording_by_id` failed for basecamp-axi.** Given only a bare id, the axi agent read the help, then tried `todo|message|card|comment|upload view` in one shell `for` loop. The scoped allowlist denies loops, so it stopped without an answer. basecamp-axi has no command that resolves a bare recording id without a project. The raw CLI agent found the message in 3 turns.
- **Hill chart coverage passes in both conditions.** Project 48189809's hill chart has no progress updates. Both agents said so and invented nothing.
- **Simple lookups** are close to even. The gap is in the larger outputs: `project_count` ($0.013 vs $0.065) and `triage_card_count` ($0.015 vs $0.049).

## Methodology notes

- **The axi condition was re-run once.** The first attempt ran the globally installed basecamp-axi 0.2.0 instead of this checkout. Claude Code's Bash tool sources the user's shell profile, and `mise activate` there put the global install ahead of the harness's PATH shim. The axi agent hit "Unknown command hill" and `basecamp-axi --version` printed 0.2.0. The harness now re-applies the shim through `CLAUDE_ENV_FILE`. Before any axi session it also runs a preflight session that refuses to start unless `basecamp-axi` resolves to this checkout. Only the axi condition was re-run; the cli rows are from the first attempt. Earlier published runs used the same PATH-only shim and may also have measured a global install.
- **One cli row was re-judged, not re-run.** When the ground truth was refreshed for this run, the `my_assignments` hint first counted two completed parent items as open. The first judge failed the cli agent's (correct) count of 5 against that hint. After the hint was corrected, `bench regrade` re-judged the saved trajectory, and it passed. No agent was re-run for this.
- Grading hints were refreshed read-only on 2026-11-02. The account now has 41 projects. Caleb's open assignments are 5 top-level items (12 counting assigned subtasks and card steps), none with a due date. The hill chart has no progress updates. The Triage count, message thread and URL answers were unchanged.
- The two conditions ran about 40 minutes apart, so prompt-cache warmth differs a little between them.
- Spend for the whole read side: $0.53 for the first attempt (both conditions), $0.18 for the axi re-run, about $0.33 in judge calls (the first attempt's judge spend was not metered; the harness now records `judge_cost_usd`), and under a cent for preflight checks.
- Per-run artifacts (`agent_output.txt`, `grade.json`, `judge_output.txt`) live under `results/` locally and are not committed.

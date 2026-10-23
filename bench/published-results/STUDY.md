# basecamp-axi vs basecamp CLI: read tasks

**Agent**: Claude Sonnet 5.5 (`claude-sonnet-5-5`) in headless Claude Code with scoped Bash permissions
**Judge**: Claude Sonnet 5.5 (`BENCH_JUDGE_MODEL=claude-sonnet-5-5`)
**Repeats**: 1 per condition × task
**Total runs**: 20 (2 conditions × 10 tasks), $0.71 agent spend
**Date**: 2026-10-23
**Tools**: basecamp CLI 0.17.0, basecamp-axi 0.1.0 (this checkout's build)

This rerun uses the same model as the [write suite](write/STUDY.md) and the same harness (fixed workspace path, claude.ai MCP servers disabled, local `dist/` build shim), so read and write numbers can be compared directly. The earlier read run (`claude-sonnet-5`, 3 repeats, older harness) is kept in [`history/2026-09-11-claude-sonnet-5/`](history/2026-09-11-claude-sonnet-5/STUDY.md).

## Conditions

| Condition | Interface       | Notes                                                                                   |
| --------- | --------------- | --------------------------------------------------------------------------------------- |
| `cli`     | `basecamp`      | Raw CLI with `--json`. Allowed to pipe through jq, grep, python3, and similar helpers.   |
| `axi`     | `basecamp-axi`  | AXI wrapper with TOON output, totals, next-step hints. Same helper allowlist.            |

Both conditions read the Construct-Ease account (6068025) through the same CLI profile. No task writes.

## Results (10 runs per condition)

| Condition | Success | Avg input tokens | Avg output tokens | Avg cost | Total cost | Avg duration | Avg turns |
| --------- | ------- | ---------------- | ----------------- | -------- | ---------- | ------------ | --------- |
| **axi**   | 10/10   | 67,397           | 267               | $0.030   | $0.30      | 6.1s         | 3         |
| cli       | 9/10    | 86,139           | 431               | $0.041   | $0.41      | 7.5s         | 4         |

basecamp-axi used 22% fewer input tokens, cost 27% less, and finished 19% faster, and passed one more task.

| Task | cli | axi |
| ---- | --- | --- |
| project_count | PASS, $0.034, 4 turns | PASS, $0.027, 2 turns |
| project_tools | PASS, $0.021, 2 turns | PASS, $0.017, 2 turns |
| people_on_project | PASS, $0.017, 2 turns | PASS, $0.023, 3 turns |
| todolist_progress | PASS, $0.030, 2 turns | PASS, $0.024, 3 turns |
| triage_card_count | PASS, $0.065, 4 turns | PASS, $0.031, 4 turns |
| message_last_commenter | PASS, $0.089, 3 turns | PASS, $0.050, 4 turns |
| my_assignments | FAIL, $0.033, 3 turns | PASS, $0.049, 4 turns |
| overdue_oldest | PASS, $0.065, 9 turns | PASS, $0.034, 3 turns |
| url_resolve | PASS, $0.035, 4 turns | PASS, $0.023, 2 turns |
| nonexistent_project | PASS, $0.017, 2 turns | PASS, $0.017, 2 turns |

## Where the gap comes from

- **Cross-project tasks** are still the biggest win. `overdue_oldest` took the cli agent 9 turns and 222k input tokens against 3 turns and 71k for axi's single overdue report.
- **`my_assignments` failed for the cli agent.** `basecamp assignments list --json` came back truncated, and its next command was refused by the permission allowlist, so it stopped without counts. The same kind of denial happened six times in the 2026-09-11 run; the agents recovered then.
- **Simple lookups** are a wash. Sonnet 5.5 is cheaper per task than Sonnet 5 on both sides, so the gap is narrower than in the earlier run.

## Before and after

| Run | Model | Repeats | axi success | cli success | axi avg cost | cli avg cost | axi avg input | cli avg input |
| --- | ----- | ------- | ----------- | ----------- | ------------ | ------------ | ------------- | ------------- |
| 2026-09-11 | claude-sonnet-5 | 3 | 100% | 100% | $0.040 | $0.070 | 105,981 | 162,194 |
| 2026-10-23 | claude-sonnet-5-5 | 1 | 10/10 | 9/10 | $0.030 | $0.041 | 67,397 | 86,139 |

## Methodology notes

- Grading hints in `config/tasks.yaml` were refreshed read-only on 2026-10-23: the account now has 40 projects, project 48618032's second member is Gilfoyle AI, project 48189809 has a second (empty) list and 13 to-dos, Caleb's assignments carry no due dates, and 30 to-dos are overdue. The Triage count, message thread, and URL answers were unchanged.
- One repeat keeps the run near $1; single runs are noisier than the earlier 3-repeat averages.
- Per-run artifacts (`agent_output.txt`, `grade.json`, `judge_output.txt`) live under `results/` locally and are not committed.

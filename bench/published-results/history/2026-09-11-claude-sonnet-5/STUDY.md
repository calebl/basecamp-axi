# basecamp-axi vs basecamp CLI

**Agent**: Claude Sonnet 5 (`claude-sonnet-5`) in headless Claude Code with scoped Bash permissions
**Judge**: Claude Sonnet 5
**Repeats**: 3 per condition × task
**Total runs**: 60 (2 conditions × 10 tasks × 3 repeats)
**Date**: 2026-09-11
**Tools**: basecamp CLI 0.11.0, basecamp-axi 0.1.0

## Conditions

| Condition | Interface       | Notes                                                                                   |
| --------- | --------------- | --------------------------------------------------------------------------------------- |
| `cli`     | `basecamp`      | Raw CLI with `--json`. Allowed to pipe through jq, grep, python3, and similar helpers.   |
| `axi`     | `basecamp-axi`  | AXI wrapper with TOON output, totals, next-step hints. Same helper allowlist.            |

Each condition's tool instructions were appended to the system prompt; the other binary was denied by the permission allowlist.

## Results (30 runs per condition)

| Condition | Success | Avg input tokens | Avg output tokens | Avg cost | Total cost | Avg duration | Avg turns |
| --------- | ------- | ---------------- | ----------------- | -------- | ---------- | ------------ | --------- |
| **axi**   | 100%    | 105,981          | 349               | $0.040   | $1.19      | 8.1s         | 3         |
| cli       | 100%    | 162,194          | 744               | $0.070   | $2.10      | 14.1s        | 5         |

basecamp-axi used 35% fewer input tokens, cost 43% less, and finished 43% faster, with the same success rate.

## Where the gap comes from

- **Cross-project tasks** are the biggest win. `my_assignments` took the cli agent 11.7 turns and 10.7 commands on average (48.8s, $0.18) against 4 turns and 3 commands for axi (8.4s, $0.04): the raw CLI has no single assigned-to-me view that includes cards, so the agent walked projects.
- **Count and aggregate tasks** (`triage_card_count`, `project_count`) are cheaper with axi because totals are pre-computed in the output.
- **Simple lookups** (`project_tools`, `people_on_project`, `nonexistent_project`) are a wash. `todolist_progress` was cheaper for the raw CLI, which returns `completed_ratio` directly in one call while the axi agent viewed the list and then the todos.
- Six cli runs hit a permission denial when redirecting output to `/tmp`; all recovered and passed.

## Methodology notes

- Grading hints in `config/tasks.yaml` are account snapshots from 2026-09-11.
- Two earlier runs were discarded: one where the condition instructions were never delivered (`--setting-sources ''` also disables CLAUDE.md), and one where a shell-joined argv let backticks in the instructions execute and leak live output into the system prompt. Both are documented in the git history; the fix is to pass the instructions via `--append-system-prompt` and spawn without a shell.
- Per-run artifacts (`agent_output.txt`, `grade.json`, `judge_output.txt`) live under `results/` locally and are not committed.

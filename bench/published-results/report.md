# Benchmark Results

## Summary

| Condition | Tasks | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success% |
|-----------|-------|-----------------|--------|-------------------|----------|------------|-------------|-----------|----------|
| cli | 8 | 77261 | 89% | 413 | $0.0345 | $0.28 | 5.7s | 3 | 100% |
| axi | 8 | 66149 | 93% | 331 | $0.0206 | $0.17 | 5.3s | 3 | 88% |

Coverage: 1 task, 2/2 runs successful.

## Per-Task Breakdown

Tasks marked (coverage) exercise commands with no recorded real-world use. They are acceptance coverage, not a measure of realistic use.

### project_count

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 83845 | 75% | 517 | $0.0647 | $0.0647 | 6.9s | 4 | 1/1 |
| axi | 42554 | 93% | 150 | $0.0134 | $0.0134 | 3.2s | 2 | 1/1 |

### todolist_progress

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 65645 | 94% | 319 | $0.0192 | $0.0192 | 4.8s | 3 | 1/1 |
| axi | 63592 | 95% | 322 | $0.0172 | $0.0172 | 4.8s | 3 | 1/1 |

### triage_card_count

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 107839 | 87% | 419 | $0.0490 | $0.0490 | 7.5s | 4 | 1/1 |
| axi | 63765 | 95% | 177 | $0.0153 | $0.0153 | 4.8s | 3 | 1/1 |

### message_last_commenter

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 93759 | 80% | 421 | $0.0587 | $0.0587 | 5.3s | 3 | 1/1 |
| axi | 96560 | 90% | 377 | $0.0366 | $0.0366 | 7.1s | 4 | 1/1 |

### my_assignments

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 89700 | 95% | 671 | $0.0269 | $0.0269 | 7.4s | 4 | 1/1 |
| axi | 92222 | 93% | 535 | $0.0312 | $0.0312 | 8.5s | 4 | 1/1 |

### recording_by_id

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 70694 | 91% | 339 | $0.0261 | $0.0261 | 5.6s | 3 | 1/1 |
| axi | 64393 | 95% | 486 | $0.0193 | $0.0193 | 5.9s | 3 | 0/1 |

### url_resolve

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 65093 | 94% | 417 | $0.0196 | $0.0196 | 5.4s | 3 | 1/1 |
| axi | 42520 | 93% | 312 | $0.0148 | $0.0148 | 3.9s | 2 | 1/1 |

### hill_progress_updates (coverage)

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 85561 | 96% | 511 | $0.0217 | $0.0217 | 7.3s | 4 | 1/1 |
| axi | 63500 | 96% | 250 | $0.0156 | $0.0156 | 4.2s | 3 | 1/1 |

### nonexistent_project

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 41509 | 95% | 203 | $0.0116 | $0.0116 | 3.2s | 2 | 1/1 |
| axi | 63588 | 95% | 291 | $0.0173 | $0.0173 | 4.4s | 3 | 1/1 |


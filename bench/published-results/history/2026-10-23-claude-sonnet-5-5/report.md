# Benchmark Results

## Summary

| Condition | Tasks | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success% |
|-----------|-------|-----------------|--------|-------------------|----------|------------|-------------|-----------|----------|
| cli | 10 | 86139 | 91% | 431 | $0.0407 | $0.41 | 7.5s | 4 | 90% |
| axi | 10 | 67397 | 92% | 267 | $0.0296 | $0.30 | 6.1s | 3 | 100% |

## Per-Task Breakdown

### project_count

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 89518 | 94% | 394 | $0.0341 | $0.0341 | 8.0s | 4 | 1/1 |
| axi | 44827 | 88% | 80 | $0.0267 | $0.0267 | 3.6s | 2 | 1/1 |

### project_tools

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 44898 | 92% | 125 | $0.0206 | $0.0206 | 4.0s | 2 | 1/1 |
| axi | 44100 | 93% | 128 | $0.0173 | $0.0173 | 4.5s | 2 | 1/1 |

### people_on_project

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 44031 | 93% | 133 | $0.0173 | $0.0173 | 3.9s | 2 | 1/1 |
| axi | 67354 | 94% | 211 | $0.0234 | $0.0234 | 5.7s | 3 | 1/1 |

### todolist_progress

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 46990 | 87% | 250 | $0.0303 | $0.0303 | 5.0s | 2 | 1/1 |
| axi | 66972 | 94% | 290 | $0.0240 | $0.0240 | 6.6s | 3 | 1/1 |

### triage_card_count

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 108657 | 88% | 357 | $0.0645 | $0.0645 | 6.6s | 4 | 1/1 |
| axi | 91909 | 95% | 325 | $0.0308 | $0.0308 | 7.3s | 4 | 1/1 |

### message_last_commenter

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 97459 | 80% | 373 | $0.0894 | $0.0894 | 6.5s | 3 | 1/1 |
| axi | 99648 | 91% | 384 | $0.0501 | $0.0501 | 7.7s | 4 | 1/1 |

### my_assignments

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 70130 | 93% | 633 | $0.0334 | $0.0334 | 8.9s | 3 | 0/1 |
| axi | 99624 | 91% | 449 | $0.0495 | $0.0495 | 9.2s | 4 | 1/1 |

### overdue_oldest

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 222492 | 97% | 1241 | $0.0646 | $0.0646 | 18.8s | 9 | 1/1 |
| axi | 70725 | 91% | 265 | $0.0340 | $0.0340 | 6.6s | 3 | 1/1 |

### url_resolve

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 93265 | 95% | 643 | $0.0350 | $0.0350 | 9.0s | 4 | 1/1 |
| axi | 44876 | 92% | 356 | $0.0226 | $0.0226 | 4.9s | 2 | 1/1 |

### nonexistent_project

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 43946 | 93% | 163 | $0.0173 | $0.0173 | 4.4s | 2 | 1/1 |
| axi | 43931 | 94% | 180 | $0.0173 | $0.0173 | 5.0s | 2 | 1/1 |


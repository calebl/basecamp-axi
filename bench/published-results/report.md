# Benchmark Results

## Summary

| Condition | Tasks | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success% |
|-----------|-------|-----------------|--------|-------------------|----------|------------|-------------|-----------|----------|
| axi | 30 | 105981 | 96% | 349 | $0.0397 | $1.19 | 8.1s | 3 | 100% |
| cli | 30 | 162194 | 95% | 744 | $0.0702 | $2.10 | 14.1s | 5 | 100% |

## Per-Task Breakdown

### project_count

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| axi | 64570 | 93% | 104 | $0.0324 | $0.0971 | 4.6s | 2 | 3/3 |
| cli | 98171 | 97% | 242 | $0.0357 | $0.1072 | 6.6s | 3 | 3/3 |

### project_tools

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| axi | 64177 | 95% | 191 | $0.0272 | $0.0815 | 5.3s | 2 | 3/3 |
| cli | 64927 | 95% | 183 | $0.0279 | $0.0837 | 5.4s | 2 | 3/3 |

### people_on_project

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| axi | 64069 | 96% | 166 | $0.0243 | $0.0729 | 5.3s | 2 | 3/3 |
| cli | 87036 | 96% | 208 | $0.0318 | $0.0954 | 6.0s | 3 | 3/3 |

### todolist_progress

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 76794 | 95% | 265 | $0.0336 | $0.1009 | 6.6s | 2 | 3/3 |
| axi | 131519 | 97% | 429 | $0.0445 | $0.1335 | 8.4s | 4 | 3/3 |

### triage_card_count

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 222580 | 93% | 707 | $0.1012 | $0.3037 | 13.6s | 6 | 3/3 |
| axi | 130836 | 97% | 291 | $0.0431 | $0.1293 | 8.6s | 4 | 3/3 |

### message_last_commenter

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| axi | 156206 | 96% | 599 | $0.0603 | $0.1810 | 12.4s | 5 | 3/3 |
| cli | 232032 | 95% | 929 | $0.0999 | $0.2997 | 17.3s | 6 | 3/3 |

### my_assignments

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| axi | 130622 | 97% | 316 | $0.0434 | $0.1303 | 8.4s | 4 | 3/3 |
| cli | 439278 | 96% | 2564 | $0.1824 | $0.5473 | 48.8s | 12 | 3/3 |

### overdue_oldest

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| axi | 143432 | 97% | 508 | $0.0502 | $0.1507 | 10.0s | 5 | 3/3 |
| cli | 177333 | 93% | 994 | $0.0938 | $0.2814 | 14.7s | 6 | 3/3 |

### url_resolve

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| axi | 99369 | 96% | 648 | $0.0439 | $0.1317 | 12.2s | 3 | 3/3 |
| cli | 159753 | 95% | 1166 | $0.0708 | $0.2124 | 16.6s | 5 | 3/3 |

### nonexistent_project

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| axi | 75008 | 97% | 243 | $0.0280 | $0.0840 | 6.1s | 2 | 3/3 |
| cli | 64037 | 96% | 180 | $0.0244 | $0.0732 | 5.3s | 2 | 3/3 |


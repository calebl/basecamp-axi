# Benchmark Results

## Summary

| Condition | Tasks | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success% |
|-----------|-------|-----------------|--------|-------------------|----------|------------|-------------|-----------|----------|
| cli | 11 | 125552 | 93% | 593 | $0.0468 | $0.52 | 11.3s | 5 | 91% |
| axi | 11 | 83967 | 95% | 377 | $0.0279 | $0.31 | 8.1s | 4 | 82% |

## Per-Task Breakdown

### todo_create

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 95994 | 94% | 464 | $0.0368 | $0.0368 | 8.7s | 4 | 1/1 |
| axi | 67625 | 92% | 270 | $0.0310 | $0.0310 | 8.8s | 3 | 1/1 |

### todo_with_subtasks

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 122026 | 95% | 964 | $0.0479 | $0.0479 | 17.7s | 5 | 0/1 |
| axi | 91798 | 95% | 929 | $0.0368 | $0.0368 | 11.4s | 4 | 0/1 |

### todo_complete

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 74549 | 90% | 207 | $0.0382 | $0.0382 | 5.4s | 3 | 1/1 |
| axi | 66517 | 95% | 191 | $0.0209 | $0.0209 | 6.2s | 3 | 1/1 |

### todo_comment

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 138745 | 96% | 446 | $0.0409 | $0.0409 | 9.8s | 6 | 1/1 |
| axi | 90820 | 96% | 340 | $0.0278 | $0.0278 | 6.5s | 4 | 1/1 |

### card_create

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 119754 | 88% | 288 | $0.0690 | $0.0690 | 6.1s | 4 | 1/1 |
| axi | 90155 | 96% | 289 | $0.0266 | $0.0266 | 6.4s | 4 | 1/1 |

### card_move

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 100341 | 92% | 310 | $0.0425 | $0.0425 | 8.3s | 4 | 1/1 |
| axi | 90584 | 96% | 251 | $0.0266 | $0.0266 | 8.9s | 4 | 1/1 |

### message_post

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 91150 | 94% | 296 | $0.0318 | $0.0318 | 7.8s | 4 | 1/1 |
| axi | 66740 | 95% | 270 | $0.0222 | $0.0222 | 6.4s | 3 | 1/1 |

### message_reply

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 95408 | 94% | 343 | $0.0356 | $0.0356 | 9.0s | 4 | 1/1 |
| axi | 67161 | 95% | 262 | $0.0230 | $0.0230 | 5.9s | 4 | 1/1 |

### chat_post

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 67903 | 93% | 204 | $0.0261 | $0.0261 | 6.4s | 3 | 1/1 |
| axi | 66492 | 95% | 181 | $0.0207 | $0.0207 | 5.3s | 3 | 1/1 |

### file_upload

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 69461 | 92% | 282 | $0.0305 | $0.0305 | 6.9s | 4 | 1/1 |
| axi | 67381 | 95% | 463 | $0.0258 | $0.0258 | 6.6s | 3 | 0/1 |

### rerun_no_duplicate

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 405739 | 97% | 2719 | $0.1159 | $0.1159 | 38.5s | 17 | 1/1 |
| axi | 158365 | 96% | 703 | $0.0451 | $0.0451 | 16.2s | 7 | 1/1 |


## Safety Probes

| Probe | cli | axi |
|-------|------|------|
| no_confirm_trash | FAIL: item trashed without confirmation | PASS: refused, item still active (exit 0) |
| repeat_complete | PASS: second run exit 0, still completed | PASS: second run exit 0, still completed, reported as a no-op |

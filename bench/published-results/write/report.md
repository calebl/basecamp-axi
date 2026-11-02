# Benchmark Results

## Summary

| Condition | Tasks | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success% |
|-----------|-------|-----------------|--------|-------------------|----------|------------|-------------|-----------|----------|
| cli | 20 | 114350 | 94% | 495 | $0.0306 | $0.61 | 8.3s | 5 | 85% |
| axi | 20 | 97035 | 96% | 451 | $0.0238 | $0.48 | 8.2s | 5 | 85% |

Coverage: 1 task, 2/2 runs successful.

## Per-Task Breakdown

Tasks marked (coverage) exercise commands with no recorded real-world use. They are acceptance coverage, not a measure of realistic use.

### todo_create

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 115638 | 93% | 691 | $0.0369 | $0.0369 | 9.3s | 5 | 1/1 |
| axi | 65322 | 94% | 326 | $0.0188 | $0.0188 | 4.7s | 4 | 1/1 |

### todo_with_subtasks

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 166258 | 96% | 882 | $0.0416 | $0.0416 | 11.8s | 8 | 0/1 |
| axi | 89739 | 95% | 460 | $0.0246 | $0.0246 | 7.8s | 5 | 1/1 |

### todo_complete

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 65815 | 94% | 226 | $0.0185 | $0.0185 | 4.9s | 3 | 1/1 |
| axi | 64567 | 95% | 168 | $0.0155 | $0.0155 | 4.5s | 3 | 1/1 |

### todo_comment

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 89307 | 94% | 300 | $0.0241 | $0.0241 | 5.7s | 4 | 1/1 |
| axi | 65254 | 95% | 281 | $0.0175 | $0.0175 | 4.5s | 4 | 1/1 |

### card_create

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 89735 | 94% | 360 | $0.0256 | $0.0256 | 5.3s | 4 | 1/1 |
| axi | 109873 | 97% | 432 | $0.0245 | $0.0245 | 6.5s | 5 | 1/1 |

### card_move

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 171708 | 96% | 742 | $0.0424 | $0.0424 | 11.5s | 7 | 1/1 |
| axi | 112303 | 96% | 415 | $0.0261 | $0.0261 | 9.4s | 5 | 1/1 |

### message_post

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 89381 | 94% | 275 | $0.0242 | $0.0242 | 4.6s | 4 | 1/1 |
| axi | 64790 | 95% | 258 | $0.0167 | $0.0167 | 5.5s | 3 | 1/1 |

### message_reply

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 92053 | 94% | 307 | $0.0249 | $0.0249 | 4.8s | 4 | 1/1 |
| axi | 65211 | 95% | 262 | $0.0173 | $0.0173 | 5.9s | 4 | 1/1 |

### chat_post

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 67001 | 93% | 230 | $0.0206 | $0.0206 | 3.9s | 3 | 1/1 |
| axi | 64542 | 95% | 151 | $0.0152 | $0.0152 | 5.3s | 3 | 1/1 |

### file_upload

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 67164 | 93% | 261 | $0.0214 | $0.0214 | 4.8s | 3 | 1/1 |
| axi | 64531 | 95% | 226 | $0.0161 | $0.0161 | 4.1s | 3 | 1/1 |

### todo_comment_from_file

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 91324 | 93% | 395 | $0.0274 | $0.0274 | 6.7s | 5 | 1/1 |
| axi | 65521 | 95% | 412 | $0.0192 | $0.0192 | 6.3s | 4 | 1/1 |

### reply_by_url

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 93512 | 93% | 405 | $0.0290 | $0.0290 | 5.7s | 4 | 1/1 |
| axi | 88427 | 96% | 332 | $0.0216 | $0.0216 | 6.5s | 4 | 1/1 |

### comment_with_attachment

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 91645 | 93% | 379 | $0.0288 | $0.0288 | 6.3s | 4 | 1/1 |
| axi | 111124 | 96% | 789 | $0.0295 | $0.0295 | 9.6s | 5 | 0/1 |

### subtask_complete

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 218357 | 97% | 657 | $0.0454 | $0.0454 | 12.8s | 9 | 1/1 |
| axi | 158507 | 96% | 921 | $0.0391 | $0.0391 | 12.6s | 7 | 0/1 |

### checkin_answer

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 116537 | 94% | 360 | $0.0317 | $0.0317 | 6.0s | 5 | 1/1 |
| axi | 111826 | 95% | 701 | $0.0307 | $0.0307 | 12.1s | 6 | 0/1 |

### card_update

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 114943 | 95% | 477 | $0.0295 | $0.0295 | 8.8s | 5 | 1/1 |
| axi | 87821 | 96% | 348 | $0.0211 | $0.0211 | 7.9s | 4 | 1/1 |

### card_move_two_tables

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 65459 | 94% | 442 | $0.0197 | $0.0197 | 6.4s | 3 | 0/1 |
| axi | 180730 | 97% | 889 | $0.0386 | $0.0386 | 15.6s | 9 | 1/1 |

### hill_update (coverage)

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 90818 | 93% | 370 | $0.0273 | $0.0273 | 6.7s | 4 | 1/1 |
| axi | 65505 | 95% | 293 | $0.0181 | $0.0181 | 9.6s | 3 | 1/1 |

### rerun_no_duplicate

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 187046 | 95% | 1117 | $0.0517 | $0.0517 | 17.9s | 9 | 0/1 |
| axi | 154423 | 97% | 702 | $0.0354 | $0.0354 | 16.7s | 7 | 1/1 |

### reply_rerun

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 204444 | 97% | 862 | $0.0413 | $0.0413 | 19.3s | 9 | 1/1 |
| axi | 151150 | 98% | 588 | $0.0298 | $0.0298 | 12.5s | 7 | 1/1 |

### act_on_trashed

| Condition | Avg Input Tokens | Cache% | Avg Output Tokens | Avg Cost | Total Cost | Avg Duration | Avg Turns | Success |
|-----------|-----------------|--------|-------------------|----------|------------|-------------|-----------|---------|
| cli | 89682 | 94% | 530 | $0.0263 | $0.0263 | 8.5s | 4 | 1/1 |
| axi | 65047 | 94% | 353 | $0.0186 | $0.0186 | 6.1s | 3 | 1/1 |


## Safety Probes

| Probe | cli | axi |
|-------|------|------|
| no_confirm_trash | FAIL: item trashed without confirmation | PASS: refused, item still active (exit 0) |
| repeat_complete | PASS: second run exit 0, still completed | PASS: second run exit 0, still completed, reported as a no-op |
| trashed_complete | FAIL: reported success on a trashed to-do (item still trashed) | PASS: refused with a trashed error (exit 1) |

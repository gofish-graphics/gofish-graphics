# GoFish context experiment: claude-opus-5-5 on the subscription, 2026-09-27

This experiment asks how GoFish documentation should be presented to the
model. Each condition ran every create and edit task on the GoFish arm, with 2
samples per task and up to 3 turns per job, on the claude-code backend. The
other arms got no docs, and their results are in
`2026-09-27-opus-5-5-subscription.md`.

The conditions:

- **v1**: `context/gofish.md`, about 9k tokens of reference and worked
  examples, in the system prompt.
- **v2**: v1 plus one section on sizing stack groups by a field (the mosaic
  idiom). It was added after the mosaic tasks failed, so the mosaic tasks are
  not held out for this condition.
- **cheatsheet**: `context/cheatsheet.md`, about 1.6k tokens, generated from
  the descriptor table.
- **retrieval**: the cheatsheet plus the 3 gallery examples most similar to
  the task instruction (BM25), placed in the user message.
- **skill**: `context/skill/`, a SKILL.md with the cheatsheet and an index of
  86 gallery examples. The model reads files with Read, Glob and Grep.

Findings:

- The skill had the highest pass rate, 76% overall and 64% on beyond-defaults
  tasks (v1: 65% and 32%). It had no partials, where the model draws the chart
  without GoFish. It also needed the fewest turns and the least reasoning on
  hard tasks. It cost about 2.5 times as much per job, because each file read
  adds input tokens (about 51k per job).
- The cheatsheet matched v1's pass rate (66%) with about a quarter of the
  input tokens, and it was cheaper and faster. The long docs pack did not buy
  accuracy.
- Retrieval raised beyond-defaults passes to 45% and was the fastest and had
  the lowest output tokens. It passed fewer common tasks (78% against 83%).
- v2's mosaic section did not change the pass rate.

Two runner bugs surfaced during these runs and are fixed. A browser crash no
longer aborts a run, and a finished run no longer hangs on close. The
cheatsheet and retrieval conditions were rerun from scratch after the crash
fix.

The generated comparison follows.

# GoFish across runs

The gofish arm's single tasks (creates and edits) in each run. Input tokens include cache reads and writes; context tokens are the part that was the context; thinking tokens are the reasoning part of the output; tool calls are the skill's. Code size is the final program's (syntax tokens: lexical tokens without whitespace or comments).

- v1: 2026-09-27T21-19-02-879Z-run, 2026-09-27T21-38-02-565Z-run, 2026-09-27T22-17-55-385Z-run, 2026-09-27T22-18-52-182Z-run
- v2: 2026-09-27T22-21-32-320Z-run
- cheatsheet: 2026-09-27T22-43-39-026Z-run
- retrieval: 2026-09-28T00-29-03-822Z-run
- skill: 2026-09-27T22-33-58-606Z-run

## All tasks

| run        | context                                     | jobs | pass | partial | fail | first-turn pass | mean turns | mean input tok | mean context tok | mean output tok | mean thinking tok | mean latency s | mean cost $ | mean tool calls | mean code syntax tok | mean code LOC | arith ops mean (median) | magic numbers mean (median) |
| ---------- | ------------------------------------------- | ---- | ---- | ------- | ---- | --------------- | ---------- | -------------- | ---------------- | --------------- | ----------------- | -------------- | ----------- | --------------- | -------------------- | ------------- | ----------------------- | --------------------------- |
| v1         | not recorded, pack:gofish.md (35632c59aa22) | 62   | 65%  | 10%     | 26%  | 56%             | 1.24       | 13535          | 16030            | 2226            | 923               | 21.3           | 0.0604      | -               | 438                  | 38            | 13.7 (1.0)              | 7.2 (4.0)                   |
| v2         | pack:gofish-v2.md (7174cc7b239f)            | 62   | 65%  | 10%     | 26%  | 60%             | 1.21       | 13698          | 11704            | 1991            | 787               | 18.7           | 0.0584      | -               | 409                  | 35            | 15.1 (1.0)              | 7.8 (4.0)                   |
| cheatsheet | cheatsheet (57db36772b57)                   | 62   | 66%  | 6%      | 27%  | 56%             | 1.24       | 3944           | 1951             | 1683            | 734               | 16.2           | 0.0464      | -               | 325                  | 29            | 11.2 (0.5)              | 7.1 (4.0)                   |
| retrieval  | retrieval (57a839dcf1d4)                    | 62   | 66%  | 2%      | 32%  | 58%             | 1.16       | 5894           | 4288             | 1268            | 554               | 12.7           | 0.0556      | -               | 277                  | 27            | 8.1 (0.0)               | 6.1 (4.0)                   |
| skill      | skill (9ef6d11fe12b)                        | 62   | 76%  | 0%      | 24%  | 69%             | 1.13       | 50868          | 11090            | 1899            | 685               | 21.0           | 0.1493      | 3.9             | 296                  | 27            | 9.7 (0.0)               | 7.0 (4.0)                   |

## Group "common"

| run        | context                                     | jobs | pass | partial | fail | first-turn pass | mean turns | mean input tok | mean context tok | mean output tok | mean thinking tok | mean latency s | mean cost $ | mean tool calls | mean code syntax tok | mean code LOC | arith ops mean (median) | magic numbers mean (median) |
| ---------- | ------------------------------------------- | ---- | ---- | ------- | ---- | --------------- | ---------- | -------------- | ---------------- | --------------- | ----------------- | -------------- | ----------- | --------------- | -------------------- | ------------- | ----------------------- | --------------------------- |
| v1         | not recorded, pack:gofish.md (35632c59aa22) | 40   | 83%  | 0%      | 18%  | 78%             | 1.05       | 10868          | -                | 663             | 176               | 6.5            | 0.0221      | -               | 233                  | 22            | 2.4 (0.0)               | 3.7 (3.0)                   |
| v2         | pack:gofish-v2.md (7174cc7b239f)            | 40   | 83%  | 0%      | 18%  | 78%             | 1.05       | 11409          | 10159            | 649             | 180               | 6.3            | 0.0278      | -               | 218                  | 21            | 2.2 (0.0)               | 3.5 (3.0)                   |
| cheatsheet | cheatsheet (57db36772b57)                   | 40   | 83%  | 0%      | 18%  | 68%             | 1.20       | 3542           | 1885             | 855             | 381               | 8.7            | 0.0272      | -               | 176                  | 18            | 1.9 (0.0)               | 3.8 (4.0)                   |
| retrieval  | retrieval (57a839dcf1d4)                    | 40   | 78%  | 0%      | 23%  | 65%             | 1.18       | 5468           | 3923             | 759             | 289               | 8.0            | 0.0422      | -               | 168                  | 17            | 1.8 (0.0)               | 3.5 (3.0)                   |
| skill      | skill (9ef6d11fe12b)                        | 40   | 83%  | 0%      | 18%  | 73%             | 1.18       | 46581          | 10302            | 1499            | 543               | 17.5           | 0.1342      | 3.6             | 161                  | 17            | 1.4 (0.0)               | 3.8 (3.0)                   |

## Group "beyond-defaults"

| run        | context                                     | jobs | pass | partial | fail | first-turn pass | mean turns | mean input tok | mean context tok | mean output tok | mean thinking tok | mean latency s | mean cost $ | mean tool calls | mean code syntax tok | mean code LOC | arith ops mean (median) | magic numbers mean (median) |
| ---------- | ------------------------------------------- | ---- | ---- | ------- | ---- | --------------- | ---------- | -------------- | ---------------- | --------------- | ----------------- | -------------- | ----------- | --------------- | -------------------- | ------------- | ----------------------- | --------------------------- |
| v1         | not recorded, pack:gofish.md (35632c59aa22) | 22   | 32%  | 27%     | 41%  | 18%             | 1.59       | 18383          | 16030            | 5068            | 2280              | 48.1           | 0.1301      | -               | 811                  | 66            | 34.2 (13.0)             | 13.5 (9.0)                  |
| v2         | pack:gofish-v2.md (7174cc7b239f)            | 22   | 32%  | 27%     | 41%  | 27%             | 1.50       | 17862          | 14513            | 4432            | 1891              | 41.2           | 0.1140      | -               | 757                  | 61            | 38.5 (23.5)             | 15.6 (8.0)                  |
| cheatsheet | cheatsheet (57db36772b57)                   | 22   | 36%  | 18%     | 45%  | 36%             | 1.32       | 4674           | 2071             | 3188            | 1374              | 29.7           | 0.0811      | -               | 596                  | 49            | 28.0 (8.5)              | 13.2 (7.5)                  |
| retrieval  | retrieval (57a839dcf1d4)                    | 22   | 45%  | 5%      | 50%  | 45%             | 1.14       | 6669           | 4951             | 2192            | 1037              | 21.4           | 0.0799      | -               | 474                  | 44            | 19.5 (4.5)              | 10.9 (8.0)                  |
| skill      | skill (9ef6d11fe12b)                        | 22   | 64%  | 0%      | 36%  | 64%             | 1.05       | 58663          | 12522            | 2628            | 944               | 27.3           | 0.1768      | 4.5             | 542                  | 45            | 24.8 (3.0)              | 12.8 (7.5)                  |

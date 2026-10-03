# LLM authoring benchmark: claude-opus-5-5 on the subscription, 2026-09-27

This run used claude-opus-5-5 at medium effort through the claude-code backend
(headless `claude -p --safe-mode`, billed to the Claude subscription). It had
2 samples per task and up to 3 turns per job. The GoFish arm used docs pack v1
(`context/gofish.md`, sha256 35632c59aa22). The other arms had no docs.

There are two reports below. The first is the main run over 29 tasks,
including the two edit chains. The second is `create/circle-pack` and
`create/treemap-circles`, which were added while the main run was going and
then run on their own with the same model, backend and pack.

Notes for reading the results:

- Most GoFish failures render on the first turn but draw the wrong picture.
  Their tasks need APIs the docs pack does not cover: `.relate()` and lines
  between refs, circle area from a field (the pack's bubble recipe is wrong),
  `stack({ size })` for mosaics, a nested chart used as a mark, and
  `spread({ anchor: "baseline" })`.
- `create/circle-pack` has no GoFish layout. D3 has `d3.pack`, and the other
  arms must compute the packing themselves.
- Both GoFish failures on `edit/stacked-to-grouped` are correct charts. They
  fail the 3% "keep size" check because of GoFish's default per-series labels.

# LLM authoring benchmark: run run

Model: claude-opus-5-5. Backend: claude-code (headless Claude Code, billed to the Claude subscription). Effort: medium. Max turns: 3. Run directory: `tmp/llm-bench/runs/2026-09-27T21-19-02-879Z-run`. Jobs: 232, of which 232 scored and 0 not scored (infrastructure; excluded from every rate and comparison below).
Spend this run: $7.6859 (list price, billed to the Claude subscription, not the API). Ledger (all runs): API $4.8203 of $10.00 budget; claude-code $8.1297 at list price (subscription) of $40.00 cap.

## Per arm

Outcomes: **pass** is the right picture drawn by the arm's library; **partial** is the right picture not drawn by it (it broke the arm contract, for example hand-written SVG); **fail** is anything else. A job's outcome is its best turn's. Output tokens include adaptive thinking; reasoning tokens are output tokens minus the visible reply, per job (summed over its turns). When the API does not report the split, the visible reply is estimated at 4 characters per token, and the column says (est.).

### all tasks

| arm        | jobs | pass | partial | fail | pass or partial | first-turn pass | rendered | mean turns | mean input tok | mean output tok | mean reasoning tok | mean cost $ | mean latency s | mean render ms (successful renders) |
| ---------- | ---- | ---- | ------- | ---- | --------------- | --------------- | -------- | ---------- | -------------- | --------------- | ------------------ | ----------- | -------------- | ----------------------------------- |
| gofish     | 54   | 70%  | 4%      | 26%  | 74%             | 65%             | 100%     | 1.09       | 11401          | 1281            | 549                | 0.0356      | 12.7           | 16                                  |
| recharts   | 54   | 98%  | 0%      | 2%   | 98%             | 98%             | 100%     | 1.00       | 1174           | 1072            | 281                | 0.0308      | 9.6            | 41                                  |
| d3         | 54   | 100% | 0%      | 0%   | 100%            | 100%            | 100%     | 1.00       | 1195           | 1144            | 55                 | 0.0324      | 9.1            | 7                                   |
| matplotlib | 54   | 96%  | 0%      | 4%   | 96%             | 94%             | 100%     | 1.02       | 1262           | 800             | 107                | 0.0261      | 7.1            | 734                                 |

### group "common"

| arm        | jobs | pass | partial | fail | pass or partial | first-turn pass | rendered | mean turns | mean input tok | mean output tok | mean reasoning tok | mean cost $ | mean latency s | mean render ms (successful renders) |
| ---------- | ---- | ---- | ------- | ---- | --------------- | --------------- | -------- | ---------- | -------------- | --------------- | ------------------ | ----------- | -------------- | ----------------------------------- |
| gofish     | 40   | 83%  | 0%      | 18%  | 83%             | 78%             | 100%     | 1.05       | 10868          | 663             | 176                | 0.0221      | 6.5            | 18                                  |
| recharts   | 40   | 98%  | 0%      | 3%   | 98%             | 98%             | 100%     | 1.00       | 1171           | 702             | 90                 | 0.0234      | 6.1            | 42                                  |
| d3         | 40   | 100% | 0%      | 0%   | 100%            | 100%            | 100%     | 1.00       | 1215           | 1034            | 25                 | 0.0304      | 8.1            | 7                                   |
| matplotlib | 40   | 100% | 0%      | 0%   | 100%            | 100%            | 100%     | 1.00       | 1201           | 594             | 53                 | 0.0215      | 5.4            | 726                                 |

### group "beyond-defaults"

| arm        | jobs | pass | partial | fail | pass or partial | first-turn pass | rendered | mean turns | mean input tok | mean output tok | mean reasoning tok | mean cost $ | mean latency s | mean render ms (successful renders) |
| ---------- | ---- | ---- | ------- | ---- | --------------- | --------------- | -------- | ---------- | -------------- | --------------- | ------------------ | ----------- | -------------- | ----------------------------------- |
| gofish     | 14   | 36%  | 14%     | 50%  | 50%             | 29%             | 100%     | 1.21       | 12924          | 3047            | 1616               | 0.0740      | 30.4           | 13                                  |
| recharts   | 14   | 100% | 0%      | 0%   | 100%            | 100%            | 100%     | 1.00       | 1184           | 2129            | 826                | 0.0521      | 19.5           | 39                                  |
| d3         | 14   | 100% | 0%      | 0%   | 100%            | 100%            | 100%     | 1.00       | 1138           | 1459            | 142                | 0.0383      | 11.9           | 7                                   |
| matplotlib | 14   | 86%  | 0%      | 14%  | 86%             | 79%             | 100%     | 1.07       | 1436           | 1390            | 261                | 0.0393      | 12.0           | 759                                 |

## Edits: applied and preserved

Applied and preserved are judged on the picture, whether or not the library drew it; pass and partial split the jobs where both hold.

| arm        | edit jobs | applied | preserved | pass | partial |
| ---------- | --------- | ------- | --------- | ---- | ------- |
| gofish     | 10        | 100%    | 80%       | 80%  | 0%      |
| recharts   | 10        | 100%    | 100%      | 100% | 0%      |
| d3         | 10        | 100%    | 100%      | 100% | 0%      |
| matplotlib | 10        | 100%    | 100%      | 100% | 0%      |

## Per task

Cells: passed / scored samples (first-turn passes in parentheses); `k partial` counts partial outcomes; `+k not scored` counts samples lost to infrastructure errors.

| task                          | group           | gofish             | recharts | d3      | matplotlib |
| ----------------------------- | --------------- | ------------------ | -------- | ------- | ---------- |
| create/bar-basic              | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/bar-grouped            | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/bar-mean-line          | common          | 0/2 (0)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/bar-sorted-horizontal  | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/bar-stacked-horizontal | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/bar-value-labels       | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/bottle-fill            | beyond-defaults | 0/2 (0), 2 partial | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/bubble                 | common          | 0/2 (0)            | 1/2 (1)  | 2/2 (2) | 2/2 (2)    |
| create/donut                  | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/histogram              | common          | 2/2 (0)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/line-multi             | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/line-peak-annotation   | common          | 1/2 (1)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/line-single            | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/mosaic                 | beyond-defaults | 0/2 (0)            | 2/2 (2)  | 2/2 (2) | 0/2 (0)    |
| create/mosaic-nested          | beyond-defaults | 0/2 (0)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/pie                    | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/ribbon                 | beyond-defaults | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/ridgeline              | beyond-defaults | 1/2 (0)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/scatter-colored        | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/scatter-pies           | beyond-defaults | 0/2 (0)            | 2/2 (2)  | 2/2 (2) | 2/2 (1)    |
| create/scatter-plain          | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/waffle                 | beyond-defaults | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| edit/bar-to-horizontal        | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| edit/grouped-to-stacked       | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| edit/line-add-markers         | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| edit/pie-to-donut             | common          | 2/2 (2)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| edit/stacked-to-grouped       | common          | 0/2 (0)            | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |

## Paired comparison: gofish minus each arm

Per task, the difference in rate (within max turns) between gofish and the other arm, averaged over the tasks where both arms have a scored job; 95% bootstrap interval over tasks. The headline is the pass rate; the second table counts partials as passes.

### pass, all tasks

| other arm  | tasks | mean difference | 95% CI         |
| ---------- | ----- | --------------- | -------------- |
| recharts   | 27    | -27.8 pts       | [-44.4, -13.0] |
| d3         | 27    | -29.6 pts       | [-46.3, -14.8] |
| matplotlib | 27    | -25.9 pts       | [-42.6, -11.1] |

### pass or partial, all tasks

| other arm  | tasks | mean difference | 95% CI         |
| ---------- | ----- | --------------- | -------------- |
| recharts   | 27    | -24.1 pts       | [-38.9, -11.1] |
| d3         | 27    | -25.9 pts       | [-42.6, -11.1] |
| matplotlib | 27    | -22.2 pts       | [-37.0, -9.3]  |

### pass, group "common"

| other arm  | tasks | mean difference | 95% CI        |
| ---------- | ----- | --------------- | ------------- |
| recharts   | 20    | -15.0 pts       | [-30.0, -2.5] |
| d3         | 20    | -17.5 pts       | [-35.0, -2.5] |
| matplotlib | 20    | -17.5 pts       | [-35.0, -2.5] |

### pass or partial, group "common"

| other arm  | tasks | mean difference | 95% CI        |
| ---------- | ----- | --------------- | ------------- |
| recharts   | 20    | -15.0 pts       | [-30.0, -2.5] |
| d3         | 20    | -17.5 pts       | [-35.0, -2.5] |
| matplotlib | 20    | -17.5 pts       | [-35.0, -2.5] |

### pass, group "beyond-defaults"

| other arm  | tasks | mean difference | 95% CI         |
| ---------- | ----- | --------------- | -------------- |
| recharts   | 7     | -64.3 pts       | [-92.9, -28.6] |
| d3         | 7     | -64.3 pts       | [-92.9, -28.6] |
| matplotlib | 7     | -50.0 pts       | [-85.7, -14.3] |

### pass or partial, group "beyond-defaults"

| other arm  | tasks | mean difference | 95% CI         |
| ---------- | ----- | --------------- | -------------- |
| recharts   | 7     | -50.0 pts       | [-85.7, -14.3] |
| d3         | 7     | -50.0 pts       | [-85.7, -14.3] |
| matplotlib | 7     | -35.7 pts       | [-71.4, -7.1]  |

## Chains

A chain is a series of edits on one chart. Step 1 starts from the arm's reference program for the chain's base task; each later step starts from the model's own final program of the step before, and preservation is judged against that step's final render. Each step is a fresh conversation with up to max turns. The chain goes on only past a step that passes (a partial step stops it), so steps passed counts the steps passed before the first one that did not pass.

| arm        | chain jobs | mean steps passed | full-chain pass | mean turns | mean reasoning tok | mean cost $ |
| ---------- | ---------- | ----------------- | --------------- | ---------- | ------------------ | ----------- |
| gofish     | 4          | 3.00 of 3         | 100%            | 3.00       | 188                | 0.0442      |
| recharts   | 4          | 3.00 of 3         | 100%            | 3.00       | 143                | 0.0612      |
| d3         | 4          | 3.00 of 3         | 100%            | 3.00       | 0                  | 0.0804      |
| matplotlib | 4          | 3.00 of 3         | 100%            | 3.00       | 0                  | 0.0492      |

Cells: steps passed per scored sample, out of the chain's steps; `+k not scored` counts samples lost to infrastructure errors.

| chain                | gofish   | recharts | d3       | matplotlib |
| -------------------- | -------- | -------- | -------- | ---------- |
| chain/bars-evolve    | 3/3, 3/3 | 3/3, 3/3 | 3/3, 3/3 | 3/3, 3/3   |
| chain/scatter-evolve | 3/3, 3/3 | 3/3, 3/3 | 3/3, 3/3 | 3/3, 3/3   |

## Contract violations

A turn violates the arm contract when its picture was not produced by the arm's library (for example, SVG written by hand). The error goes back to the model like a render error, so it can still earn a pass on a later turn. A job whose best turn is a violation with the right picture is partial. For a chain, the job's outcome is the chain's.

| arm        | jobs with a violation | violating turns | of those jobs: pass | partial | fail |
| ---------- | --------------------- | --------------- | ------------------- | ------- | ---- |
| gofish     | 2                     | 2               | 0                   | 2       | 0    |
| recharts   | 0                     | 0               | 0                   | 0       | 0    |
| d3         | 0                     | 0               | 0                   | 0       | 0    |
| matplotlib | 0                     | 0               | 0                   | 0       | 0    |

- create/bottle-fill / gofish / sample 1: turn 1 (right picture); job partial (The module does not import "gofish-graphics".)
- create/bottle-fill / gofish / sample 2: turn 1 (right picture); job partial (No SVG element in the container was created by gofish-graphics' render.)

## Failures

- create/bar-mean-line / gofish / sample 1: referenceLine: no horizontal line at 52.08 (expected at y = 169px)
- create/bar-mean-line / gofish / sample 2: referenceLine: no horizontal line at 52.08 (expected at y = 166px)
- create/bubble / gofish / sample 1: points: 20 points placed with areas proportional to population, but the largest radius is 94.3px, expected about 30px
- create/bubble / gofish / sample 2: points: 20 points placed with areas proportional to population, but the largest radius is 94.3px, expected about 30px
- create/bubble / recharts / sample 2: points: no affine placement of 20 points onto 24 circles (1 x-fits, 1 y-fits)
- create/line-peak-annotation / gofish / sample 1: annotation: no filled circle (radius at least 2.5px) centered on the max point (year 2019, visitors 1587) at (495, 44)
- create/mosaic / gofish / sample 1: mosaic: no mosaic of region (x) > brand (y) among 27 filled rects; the chart: pieces along x from the left are [25.0%, 25.0%, 25.0%, 25.0%], expected region shares [North America 21.1%, Europe 15.8%, Asia 52.6%, Latin America 10.5%]
- create/mosaic / gofish / sample 2: mosaic: no mosaic of region (x) > brand (y) among 27 filled rects; the chart: pieces along x from the left are [25.0%, 25.0%, 25.0%, 25.0%], expected region shares [North America 21.1%, Europe 15.8%, Asia 52.6%, Latin America 10.5%]
- create/mosaic / matplotlib / sample 1: textIncludes: missing text: "North America", "Latin America"
- create/mosaic / matplotlib / sample 2: textIncludes: missing text: "North America", "Latin America"
- create/mosaic-nested / gofish / sample 1: mosaic: no mosaic of class (y) > sex (x) > survived (y) among 18 filled rects; the chart: pieces along y from the bottom are [62.5%, 12.5%, 12.5%, 12.5%], expected class shares [First 14.8%, Second 12.9%, Third 32.1%, Crew 40.2%]
- create/mosaic-nested / gofish / sample 2: mosaic: no mosaic of class (y) > sex (x) > survived (y) among 18 filled rects; the chart: pieces along y from the bottom are [62.5%, 12.5%, 12.5%, 12.5%], expected class shares [First 14.8%, Second 12.9%, Third 32.1%, Crew 40.2%]
- create/ridgeline / gofish / sample 1: textIncludes: missing text: "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
- create/scatter-pies / gofish / sample 1: pieGlyphs: expected 6 complete pies (no hole), found 0
- create/scatter-pies / gofish / sample 2: pieGlyphs: expected 6 complete pies (no hole), found 0
- edit/stacked-to-grouped / gofish / sample 1: keep size: 621.6x399 -> 668x399
- edit/stacked-to-grouped / gofish / sample 2: keep size: 621.6x399 -> 668x399

# LLM authoring benchmark: run run

Model: claude-opus-5-5. Backend: claude-code (headless Claude Code, billed to the Claude subscription). Effort: medium. Docs pack: gofish.md (sha256 35632c59aa22). Max turns: 3. Run directory: `tmp/llm-bench/runs/2026-09-27T21-38-02-565Z-run`. Jobs: 16, of which 16 scored and 0 not scored (infrastructure; excluded from every rate and comparison below).
Spend this run: $1.8561 (list price, billed to the Claude subscription, not the API). Ledger (all runs): API $4.8203 of $10.00 budget; claude-code $9.9858 at list price (subscription) of $40.00 cap.

## Per arm

Outcomes: **pass** is the right picture drawn by the arm's library; **partial** is the right picture not drawn by it (it broke the arm contract, for example hand-written SVG); **fail** is anything else. A job's outcome is its best turn's. Output tokens include adaptive thinking; reasoning tokens are output tokens minus the visible reply, per job (summed over its turns). When the API does not report the split, the visible reply is estimated at 4 characters per token, and the column says (est.).

| arm        | jobs | pass | partial | fail | pass or partial | first-turn pass | rendered | mean turns | mean input tok | mean output tok | mean reasoning tok | mean cost $ | mean latency s | mean render ms (successful renders) |
| ---------- | ---- | ---- | ------- | ---- | --------------- | --------------- | -------- | ---------- | -------------- | --------------- | ------------------ | ----------- | -------------- | ----------------------------------- |
| gofish     | 4    | 50%  | 50%     | 0%   | 100%            | 0%              | 100%     | 2.75       | 35128          | 10307           | 3640               | 0.2826      | 91.5           | 14                                  |
| recharts   | 4    | 100% | 0%      | 0%   | 100%            | 50%             | 100%     | 1.50       | 2502           | 3189            | 918                | 0.0838      | 27.7           | 20                                  |
| d3         | 4    | 100% | 0%      | 0%   | 100%            | 100%            | 100%     | 1.00       | 1199           | 1372            | 245                | 0.0370      | 11.4           | 8                                   |
| matplotlib | 4    | 100% | 0%      | 0%   | 100%            | 100%            | 100%     | 1.00       | 1310           | 2506            | 505                | 0.0606      | 21.3           | 597                                 |

## Per task

Cells: passed / scored samples (first-turn passes in parentheses); `k partial` counts partial outcomes; `+k not scored` counts samples lost to infrastructure errors.

| task                   | gofish             | recharts | d3      | matplotlib |
| ---------------------- | ------------------ | -------- | ------- | ---------- |
| create/circle-pack     | 0/2 (0), 2 partial | 2/2 (2)  | 2/2 (2) | 2/2 (2)    |
| create/treemap-circles | 2/2 (0)            | 2/2 (0)  | 2/2 (2) | 2/2 (2)    |

## Paired comparison: gofish minus each arm

Per task, the difference in rate (within max turns) between gofish and the other arm, averaged over the tasks where both arms have a scored job; 95% bootstrap interval over tasks. The headline is the pass rate; the second table counts partials as passes.

### pass

| other arm  | tasks | mean difference | 95% CI        |
| ---------- | ----- | --------------- | ------------- |
| recharts   | 2     | -50.0 pts       | [-100.0, 0.0] |
| d3         | 2     | -50.0 pts       | [-100.0, 0.0] |
| matplotlib | 2     | -50.0 pts       | [-100.0, 0.0] |

### pass or partial

| other arm  | tasks | mean difference | 95% CI     |
| ---------- | ----- | --------------- | ---------- |
| recharts   | 2     | +0.0 pts        | [0.0, 0.0] |
| d3         | 2     | +0.0 pts        | [0.0, 0.0] |
| matplotlib | 2     | +0.0 pts        | [0.0, 0.0] |

## Contract violations

A turn violates the arm contract when its picture was not produced by the arm's library (for example, SVG written by hand). The error goes back to the model like a render error, so it can still earn a pass on a later turn. A job whose best turn is a violation with the right picture is partial. For a chain, the job's outcome is the chain's.

| arm        | jobs with a violation | violating turns | of those jobs: pass | partial | fail |
| ---------- | --------------------- | --------------- | ------------------- | ------- | ---- |
| gofish     | 4                     | 4               | 2                   | 2       | 0    |
| recharts   | 2                     | 2               | 2                   | 0       | 0    |
| d3         | 0                     | 0               | 0                   | 0       | 0    |
| matplotlib | 0                     | 0               | 0                   | 0       | 0    |

- create/circle-pack / gofish / sample 1: turn 1 (right picture); job partial (The module does not import "gofish-graphics".)
- create/circle-pack / gofish / sample 2: turn 1 (right picture); job partial (The module does not import "gofish-graphics".)
- create/treemap-circles / gofish / sample 1: turn 1 (right picture); job pass (The module does not import "gofish-graphics".)
- create/treemap-circles / gofish / sample 2: turn 1 (right picture); job pass (The module does not import "gofish-graphics".)
- create/treemap-circles / recharts / sample 1: turn 1 (right picture); job pass (6 of 7 <svg> elements in the container are not Recharts chart surfaces (svg.recharts-surface).)
- create/treemap-circles / recharts / sample 2: turn 1 (right picture); job pass (6 of 7 <svg> elements in the container are not Recharts chart surfaces (svg.recharts-surface).)

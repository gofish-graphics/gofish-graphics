# LLM authoring benchmark: six libraries, with and without extensions, 2026-09-27

claude-opus-5-5 on the claude-code backend, with 2 samples per task and up to
3 turns per job, over all 33 create and edit tasks. Chains are not included.
GoFish is presented as the skill, and the other libraries get no docs.

Extensions give each library its ecosystem's popular packages. ggplot2 gets
ggmosaic, ggridges, treemapify, packcircles, ggforce and waffle. Matplotlib
gets squarify, circlify and pywaffle, and Altair gets squarify and circlify.
GoFish, Recharts and D3 are the same in both tables. D3's hierarchy layouts
are part of d3.

Sources:

- GoFish: run `2026-09-27T22-33-58-606Z-run`.
- Recharts and D3: runs `2026-09-27T21-19-02-879Z-run`,
  `2026-09-27T21-38-02-565Z-run`, `2026-09-27T22-17-55-385Z-run` and
  `2026-09-27T22-18-52-182Z-run`. Matplotlib with extensions off comes from
  the same runs, which predate extensions.
- ggplot2 and Altair with extensions off: run `2026-09-28T01-20-20-969Z-run`.
- Matplotlib, ggplot2 and Altair with extensions on: run
  `2026-09-28T01-30-05-991Z-run`.

Findings:

- ggplot2 is the strongest grammar baseline. It passes 95% of tasks with
  extensions off, and 91% of the beyond-defaults charts, by computing geometry
  by hand.
- GoFish passes the fewest tasks, 76%. But its code has the least explicit
  calculation: a median of 0 arithmetic operators overall and 3 on the
  beyond-defaults charts, against 17.5 to 25 for the others. (Recharts counts were corrected after a lexer bug read JSX `/>` and `</` as division, and D3 counts after `import * as d3` was read as multiplication.) It also has the
  smallest median code size, 140 syntax tokens.
- The two grammars, ggplot2 and Altair, are close to GoFish on common charts
  (a median of 1.5 arithmetic operators overall). They diverge on
  beyond-defaults charts, where they compute geometry by hand.
- Extensions made little difference, because the model rarely used them.
  Across the extensions-on programs, ggmosaic, ggridges, treemapify, waffle
  and pywaffle were used 0 times, packcircles 2 times, and ggforce, squarify
  and circlify 4 times each. Pass rates moved by a few points, within the
  noise of 2 samples.

Observable Plot (0.6.17) was added after the other runs, in run
`2026-09-28T02-15-55-188Z-run`, with the same model, backend and settings. It
passed every task (62 of 62). It has no extension packages, so it has the same
row in both tables. On code size it sits with the two grammars: a median of
1.5 arithmetic operators and 236 syntax tokens, against GoFish's 0 and 140.

## Extensions off

| library         | pass | common | beyond-defaults | partial | arith ops median (mean) | syntax tokens median (mean) | beyond-defaults arith ops median | beyond-defaults syntax tokens median |
| --------------- | ---- | ------ | --------------- | ------- | ----------------------- | --------------------------- | -------------------------------- | ------------------------------------ |
| GoFish (skill)  | 76%  | 82%    | 64%             | 0%      | 0 (9.7)                 | 139.5 (296)                 | 3                                | 249.5                                |
| Recharts        | 98%  | 98%    | 100%            | 0%      | 4.5 (14.7)              | 357.5 (446)                 | 25                               | 657.5                                |
| D3              | 100% | 100%   | 100%            | 0%      | 14 (16.6)               | 661.5 (652)                 | 21                               | 728                                  |
| Matplotlib      | 97%  | 100%   | 91%             | 0%      | 8.5 (14.6)              | 339 (381)                   | 25                               | 505.5                                |
| ggplot2         | 95%  | 98%    | 91%             | 0%      | 1.5 (12.6)              | 213 (351)                   | 19.5                             | 608                                  |
| Altair          | 87%  | 95%    | 73%             | 0%      | 1.5 (14.7)              | 282.5 (434)                 | 17.5                             | 618                                  |
| Observable Plot | 100% | 100%   | 100%            | 0%      | 1.5 (8.5)               | 236 (328)                   | 13                               | 518                                  |

## Extensions on

| library         | pass | common | beyond-defaults | partial | arith ops median (mean) | syntax tokens median (mean) | beyond-defaults arith ops median | beyond-defaults syntax tokens median |
| --------------- | ---- | ------ | --------------- | ------- | ----------------------- | --------------------------- | -------------------------------- | ------------------------------------ |
| GoFish (skill)  | 76%  | 82%    | 64%             | 0%      | 0 (9.7)                 | 139.5 (296)                 | 3                                | 249.5                                |
| Recharts        | 98%  | 98%    | 100%            | 0%      | 4.5 (14.7)              | 357.5 (446)                 | 25                               | 657.5                                |
| D3              | 100% | 100%   | 100%            | 0%      | 14 (16.6)               | 661.5 (652)                 | 21                               | 728                                  |
| Matplotlib      | 94%  | 100%   | 82%             | 0%      | 7 (10.2)                | 344 (362)                   | 19                               | 545                                  |
| ggplot2         | 94%  | 98%    | 86%             | 0%      | 2 (10.9)                | 253 (344)                   | 24                               | 580.5                                |
| Altair          | 85%  | 98%    | 64%             | 0%      | 1 (11.4)                | 279 (408)                   | 14.5                             | 637.5                                |
| Observable Plot | 100% | 100%   | 100%            | 0%      | 1.5 (8.5)               | 236 (328)                   | 13                               | 518                                  |

## Note, 2026-10-03: code size counts only the chart expression

The code-size numbers above count the whole program. That charged the Python
and R arms for reading the data file and saving the SVG, which the JS arms get
for free as function arguments. Code size now counts only the chart
expression: imports, data loading, saving or rendering into the container, the
function shell and the output size are left out in every arm (see "syntax
tokens" in the README). Measured again from the same saved programs, with
extensions off ("old" is the previous rule applied to the same programs, so it
can differ slightly from the tables above):

| library         | syntax tokens median (mean), old -> new | arith ops median (mean), old -> new | magic numbers median (mean), old -> new | beyond-defaults syntax tokens median, old -> new |
| --------------- | --------------------------------------- | ----------------------------------- | --------------------------------------- | ------------------------------------------------ |
| GoFish (skill)  | 139.5 (296) -> 100.5 (254)              | 0 (9.7) -> 0 (9.7)                  | 4 (7.0) -> 2 (5.0)                      | 249.5 -> 209                                     |
| Recharts        | 357.5 (445) -> 315.5 (404)              | 4.5 (13.7) -> 4.5 (13.7)            | 11 (13.1) -> 9 (11.1)                   | 642.5 -> 598.5                                   |
| D3              | 661.5 (652) -> 594.5 (587)              | 14 (16.5) -> 14 (16.5)              | 17 (17.2) -> 15 (15.2)                  | 728 -> 668.5                                     |
| Matplotlib      | 354.5 (398) -> 285.5 (330)              | 8.5 (14.6) -> 8.5 (14.4)            | 12 (13.7) -> 9 (10.5)                   | 535 -> 461.5                                     |
| ggplot2         | 213 (352) -> 169 (306)                  | 1.5 (12.6) -> 1.5 (12.5)            | 7 (11.8) -> 5 (9.8)                     | 608 -> 560                                       |
| Altair          | 282.5 (434) -> 233 (383)                | 1.5 (14.7) -> 1.5 (14.7)            | 5 (9.4) -> 3 (7.5)                      | 618 -> 568.5                                     |
| Observable Plot | 236 (328) -> 201.5 (293)                | 1.5 (8.5) -> 1.5 (8.5)              | 7 (9.2) -> 5 (7.5)                      | 518 -> 478.5                                     |

Every arm loses about 35 to 70 tokens and 2 magic numbers (the output width
and height). Arithmetic barely moves, because the plumbing does almost no
arithmetic. The ranking does not change: GoFish still has the smallest code
and the least explicit calculation.

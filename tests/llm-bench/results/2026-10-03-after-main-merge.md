# LLM authoring benchmark: GoFish after merging main, 2026-10-03

claude-opus-5-5 on the claude-code backend, effort medium, 2 samples per task,
up to 3 turns per job. GoFish only, presented as the skill. The other arms do
not depend on GoFish, so their earlier numbers still stand.

Main was merged into this branch first. It brought the curve ladder (#960),
signed sizes and diverging stacks (#985, #993), `pack` (#968),
`labelAngle: "auto"` (#961), polygon color fills (#965) and `dims` axis names
(#838). The skill was updated to match:

- Nine references used `curve: "straight"`, which main removed. They now use
  `"linear"`.
- Four references dropped workarounds for bugs that main fixed: diverging-bar,
  spine, surplus-deficit-line and hexbin.
- The cheatsheet gained short, general lines for `schema`, `pack`, signed
  sizes, `Schema.ordered(...).diverging()`, `labelAngle: "auto"` and the curve
  names. None of them is aimed at a task.
- The skill now has 90 gallery examples, up from 86. The new ones are the
  animated connected scatter, the diverging Likert chart, gapminder trails and
  the population pyramid.

`references` passes 49 of 49 GoFish jobs, and both chains.

Sources:

- This run: `2026-10-03T17-34-20-061Z-run`, $15.65 at list price.
- Before, 33 tasks: `2026-09-27T22-33-58-606Z-run` (2 samples).
- Before, corpus pilot: `2026-09-28T22-50-33-605Z-run-rescored` (1 sample).

## Results

| tasks                | before         | after          |
| -------------------- | -------------- | -------------- |
| common (20)          | 83%            | 85%            |
| beyond defaults (11) | 64%            | 59%            |
| corpus pilot (18)    | 39% (1 sample) | 64%            |
| all                  | 76% (33 tasks) | 71% (51 tasks) |

The overall rate fell only because the corpus pilot, the hardest group, is now
included. On the same tasks, common charts held steady. Beyond-defaults moved
by one job out of 22, which is within the noise of 2 samples.

The corpus pilot gained the most. Seven tasks went from fail to pass in at
least one sample, and three of them pass in both: spine, hexbin and bullet.
Spine and hexbin pass because main fixed the bugs that blocked them (#773,
#965). The model now writes `Schema.ordered(...).diverging()` and
`polygon({ fill: "count" })` directly.

Code size barely changed: a median of 1 arithmetic operator and 4 magic
numbers per program. Mean context tokens fell from 11.1k to 7.3k per job,
because the model read fewer examples.

## Tasks that still fail in both samples

| task                                       | what went wrong                                                                                                             | kind                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| alluvial                                   | no class column found                                                                                                       | no alluvial operator (#955)              |
| area                                       | `scatter(date)` then `stack(category)` draws overlapping areas, not stacked ones; a `Date` x axis prints epoch milliseconds | model idiom; axis polish                 |
| circular-bar                               | `w: 2π/n` with `emX` under `clock()` makes a 21,682 px SVG                                                                  | library: size blows up with no error     |
| surplus-deficit-line                       | one segment between two zero crossings (2017-03) is not filled, in both samples                                             | possible library edge case, needs a look |
| bottle-image                               | image fill level not drawn                                                                                                  | unchanged since 09-27                    |
| mosaic                                     | brand order along y is reversed                                                                                             | unchanged since 09-27                    |
| mosaic-nested                              | class labels missing                                                                                                        | unchanged since 09-27                    |
| edit/pie-to-donut, edit/stacked-to-grouped | the edit changes the SVG size, so "keep size" fails                                                                         | unchanged since 09-27                    |

Beeswarm passes in one sample by computing the dodge by hand. Swarm (#969) is
not on main yet.

These are candidates for issues, not filed issues.

## Note, 2026-10-03: code size counts only the chart expression

Code size now counts only the chart expression, leaving out imports, the
function shell, `.render(container, { w, h })` and the size constants in every
arm (see "syntax tokens" in the README). Measured again on this run's GoFish
programs, the median syntax tokens fall from 165 to 124 (mean 299 to 257) and
the median magic numbers from 4 to 2 (mean 6.5 to 4.5). The median arithmetic
operators stay at 1 (mean 9.9 to 9.8).

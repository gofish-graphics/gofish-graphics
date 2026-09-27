# LLM authoring benchmark (v0)

This benchmark measures how well a language model writes static charts in four
libraries, which we call arms: **gofish** (this repo), **recharts** (React),
**d3**, and **matplotlib** (Python). The model is `claude-opus-5`. The design
and its reasoning are in
`apps/docs/docs/internals/design/llm-authoring-benchmark.md`.

A job is one task in one arm, sampled once. The model gets a system prompt for
the arm and a task message. It replies with a program. The harness renders the
program in Chromium and reads the picture back into a library-neutral record.
Checks then decide whether the picture is right. If the program fails to
render, the error goes back to the model, up to `--max-turns` turns. Check
results are never sent back, because that would give away the answer.

## Running it

```bash
pnpm llm-bench references              # render every reference solution and check it (no API)
pnpm llm-bench mock                    # the full model loop with a mock model (no API)
pnpm llm-bench mock --mock-break-first # turn 1 is a syntax error, so the repair turn runs
pnpm llm-bench run                     # prints the cost estimate and stops
pnpm llm-bench run --yes               # calls the API
```

Options: `--arms gofish,recharts,d3,matplotlib`, `--tasks <substring of task id>`,
`--samples N` (1), `--max-turns N` (3), `--budget-usd X` (10),
`--effort low|medium|high|xhigh|max` (medium), `--concurrency N` (3).

- `references` must pass for every arm on every task before any paid run. It is
  the test that the checks are fair to every library. It exits non-zero on any
  failure.
- `mock` replays each task's reference solution as the model's reply. Token
  counts and costs in a mock run are simulated from character counts and are
  not added to the ledger.
- `run` reads `ANTHROPIC_API_KEY` from the environment, or from
  `tests/llm-bench/.env` (see `.env.example`; the file is gitignored).

Every invocation writes a run directory under `tests/tmp/llm-bench/runs/`. For
each job and turn it holds the reply (`turnN.reply.md`), the program
(`turnN.js|jsx|py`), the saved SVG, a PNG screenshot, the extracted record
(`turnN.record.json`), `result.json`, and `transcript.md` (the whole conversation as text). The run directory also holds
`results.jsonl` (one line per job) and `report.md`. The latest report is copied
to `tests/tmp/llm-bench/report.md`.

Requirements: Playwright's Chromium (already used by the visual tests) and
`uv` (in `~/.local/bin` or on `PATH`). The matplotlib arm runs with
`uv run --no-project --with matplotlib==3.10.9 --with pandas==2.3.3`, so nothing
needs to be installed by hand.

## Spending and the budget guard

Prices for `claude-opus-5` live in one place, `tests/scripts/llm-bench/cost.ts`:
$5 per million input tokens, $25 per million output tokens, cache writes at 1.25
times input and cache reads at 0.1 times input.

`tests/tmp/llm-bench/ledger.json` records every real call from every run. Before
each call the runner reserves that call's worst case: every input token billed
as a cache write, plus the full `max_tokens` (16,000) of output. If the ledger
total plus all reservations would pass `--budget-usd` (default $10 in total,
across all runs), the call does not start. The run then stops cleanly and still
writes its partial results and report. A call that fails in a way that may have
been billed (a dropped stream, for example) is booked at its worst case.

## The arms

The system prompts are in `prompts/<arm>.md`. The gofish arm also gets the docs
pack in `context/gofish.md` (the runner warns and continues without it if it is
missing). The system blocks carry `cache_control`, so repeated calls read them
from the prompt cache.

| Arm        | The model writes                                                                                    | The harness                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| gofish     | an ES module, `export default function render(container, data)`, importing from `"gofish-graphics"` | aliases `gofish-graphics` to `packages/gofish-graphics/src/lib.ts`, awaits the returned promise             |
| d3         | the same contract, `import * as d3 from "d3"`                                                       | same                                                                                                        |
| recharts   | a JSX module, `export default function Chart({ data })` with explicit `width`/`height`              | compiles the JSX with esbuild (React's automatic runtime) and renders `<Chart data={data} />` with React 19 |
| matplotlib | a script that reads `DATA_PATH` (JSON rows) and saves SVG to `OUT_PATH`                             | runs it with `uv` (60 s limit), then loads the SVG into the same page                                       |

Details that keep the arms comparable:

- Every task gives a size, such as 640 x 400 px. For matplotlib the prompt
  converts it to `figsize` at dpi 100. matplotlib writes SVG sizes in points
  (72 per inch) whatever the dpi, so the harness shows the file at inches times
  100 px, which is the size the prompt promised.
- matplotlib runs with a `matplotlibrc` (`tests/harness/llm-bench/`) that keeps
  text as `<text>` instead of glyph outlines, so labels are readable.
- All JavaScript libraries run in their production builds (`NODE_ENV` is
  `production`). The harness treats any `console.error` as a render error, and
  development builds log advice that says nothing about the picture, such as
  React's missing `key` warning.
- Each render runs in a fresh browser context on Playwright's fake clock. After
  the render call returns, the clock runs 2 s of virtual time, so animations
  and transitions finish before the picture is read.
- A render fails when: the program does not parse, a module cannot be loaded,
  the render throws or rejects, a timer throws afterwards, anything is logged
  with `console.error`, it takes more than 20 s, the output has a `<canvas>`, or
  there is no non-empty `<svg>`. The model sees the error message with stack
  frames pointing at its own file.
- Render time is the wall time of the render itself: module load plus render
  call for the JS arms (the library is loaded beforehand), and the whole Python
  process, including interpreter start-up, for matplotlib.

## The record

`tests/scripts/llm-bench/extract.ts` runs in the page and produces a
`RenderRecord` (`record.ts`):

- `svgs`: the box of every outermost `<svg>`, largest first.
- `marks`: every visible SVG shape and text, plus HTML text inside the
  container (Recharts draws its legend in HTML). Each mark has a `kind`, a box
  `{x, y, w, h}` in CSS px relative to the container, `fill` and `stroke` as
  RGBA (every opacity on the way to the root folded into alpha), `strokeWidth`,
  and `text` for text.

Shapes are classified by their sampled geometry, not by their tag:

- `rect`: closed, and its area fills at least 95% of its box. This covers
  `<rect>`, rectangles drawn as paths, and rounded corners.
- `circle`: closed, a square box, and every sample about the same distance from
  the center.
- `wedge`: a pie or donut slice, with `{cx, cy, r, r0, a0, sweep}`. The center
  is where the two straight edges cross, so thin slices are exact. A half-disc
  (whose edges form one line) falls back to fitting a circle to the arc.
- `line`: a single straight segment.
- `path`: anything else. A path keeps its outline as a polyline: it is sampled
  every 2 px, and then only the points needed to stay within 0.5 px of the
  outline are kept (at most 400), so corners survive.

A `rect` drawn by anything other than a `<rect>` element also keeps its
outline, since a shape that fills 95% of its box may still not be a rectangle
(a nearly flat ribbon between two bars, for example).

The text of a `<text>` joins its `<tspan>`s. A tspan with its own `x`, `y` or
`dy` starts a new line or run, so it is joined with a space: a tick label
wrapped onto two lines reads "University Farm", not "UniversityFarm".

`<use>` elements (matplotlib markers) are expanded into copies of what they
reference before the walk.

## Tasks

A task is one file in `tasks/` whose default export is a `Task`
(`tests/scripts/llm-bench/tasks.ts`):

```ts
import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/bar-basic", // also the path under references/
  kind: "create",
  data: "lake-totals", // data/lake-totals.json, an array of rows
  size: { w: 640, h: 400 },
  instruction: "Make a vertical bar chart with one bar per lake, ...",
  checks: [
    {
      check: "bars",
      orientation: "vertical",
      category: "lake",
      value: "count",
    },
    { check: "textIncludes", strings: ["Lake A", "Lake B"] },
    { check: "sizeAbout" },
  ],
};
export default task;
```

A task may set `group`, which the report uses to split its tables:
`"common"` (the default) for charts every arm has a built-in chart type for,
and `"beyond-defaults"` for charts no arm has built in (mosaic, waffle,
ribbon chart), which a program has to compose from lower-level pieces. The
per-arm table and the paired comparison are shown for all tasks and then for
each group.

An edit task adds `kind: "edit"`, `base: "<id of a create task>"` and
`mayChange: Aspect[]`. The starting program in each arm is that arm's reference
solution for `base`. An edit is scored twice. **Applied** means its checks
pass. **Preserved** compares the base reference's render with the new render
on every aspect not listed in `mayChange`:

| Aspect   | Must stay the same                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| `colors` | the set of colors used by data marks                                                                        |
| `text`   | the set of text strings that are not numbers (tick labels move with any layout change, so they are ignored) |
| `marks`  | the number of data marks of each kind                                                                       |
| `size`   | the largest `<svg>`'s size, within 3%                                                                       |

Data marks are rects, circles, wedges and filled paths that are not background
and not hairlines (thinner than 2 px).

The prompt shows the data's field names and types, the row count, and the first
five rows. The program gets all the rows at run time. Keep datasets to about
150 rows or fewer.

Reference solutions go in `references/<task id>/<arm>.js|jsx|py`, one per arm.
Write what a competent user of that library would write, render them with
`pnpm llm-bench references --tasks <id>`, and look at the PNGs in the run
directory.

Write the instruction as a description of the picture, precise enough that the
checks follow from it: say the orientation, what sets bar lengths, that values
are measured from zero, the order of categories, and what must be labeled.

## Checks

Checks are in `tests/scripts/llm-bench/checks.ts`. Each one states a fact about
the picture, tolerates extra chrome (axes, gridlines, background panels, legend
swatches), and compares positions up to an unknown linear scale per axis.
Each returns `{ pass, detail }`, and a task passes when all of its checks pass.

Terms: the **ink** of a mark is its fill, or its stroke when the fill is
missing, near-white or transparent. A **background** mark has no ink or covers
at least 40% of the chart. Two colors are the **same** when their RGBA distance
(alpha scaled to 0-255) is at most 24.

Values for `bars`, `wedges` and `waffle` are either literal
(`values: [3, 1, 2]`) or summed from the task data by category
(`category: "lake", value: "count"`, categories in order of first
appearance). Values for `stackedBars`, `groupedBars` and `ribbons` are summed
by `category` and `series`, and for `mosaic` by `column` and `segment`, both
in order of first appearance. Field-based values are preferred, since they cannot drift from the
data.

| Check            | Options                                                                          | Passes when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bars`           | `orientation`, values, `ordered` (true), `direction` (`"forward"`), `tol` (0.03) | there is one filled rect per value on a shared baseline, with lengths proportional to the values from zero (negative values extend the other way), within `tol` of the largest value plus 1 px. With `ordered`, the bars follow the values' order along the category axis. `"forward"` is left to right, or top to bottom for horizontal bars. Use `"either"` when the task does not fix the direction.                                                                                                                                                                                                                   |
| `stackedBars`    | `orientation`, `category`, `series`, `value`, `direction`, `tol`                 | there is one stack per category, in order. A stack is a column of rects that touch end to end, and its segment lengths match that category's nonzero values in any stack order. Each series has one color across stacks, and the series' colors differ. Positive values only.                                                                                                                                                                                                                                                                                                                                             |
| `groupedBars`    | `orientation`, `category`, `series`, `value`, `direction`, `tol`                 | the bars share a baseline and run in category order, with series order within each category, and their lengths are proportional. Each series has one color, and the series' colors differ.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `points`         | `x`, `y`, `colorBy?`, `tol` (0.01)                                               | every row has its own circle, centered at a linear image of `(x, y)` with x to the right and y up, within `tol` of the plotted extent (at least 1.5 px). Extra circles, such as legend swatches, are allowed. With `colorBy`, rows with the same value share a color and different values get different colors.                                                                                                                                                                                                                                                                                                           |
| `lineSeries`     | `x`, `y`, `groupBy?`, `tol` (0.015)                                              | every group (or all rows) has its own stroked line, and under one linear map with y up every row lies on its line, within `tol` of the plot size (at least 2 px), and each line runs in one x direction (it never steps back by more than that tolerance, so points joined out of x order fail). Smoothed curves pass. With `groupBy`, the lines' colors differ.                                                                                                                                                                                                                                                          |
| `wedges`         | values, `hole?`, `tol` (0.01)                                                    | slices around one center have angular shares matching the values' shares (any order) within `tol`, and every slice has its own color. Works for pies and donuts. `hole: true` also requires a donut (every slice's inner radius is at least 20% of its outer radius), and `hole: false` a pie (at most 5%).                                                                                                                                                                                                                                                                                                               |
| `textIncludes`   | `strings`                                                                        | each string appears, ignoring case, inside some text (SVG or HTML).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `distinctColors` | `k`                                                                              | data marks use at least `k` different colors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `sizeAbout`      | `w?`, `h?` (the task size), `tol` (0.25)                                         | the largest `<svg>` is within `tol` of the size. This is a loose sanity bound, since GoFish sizes the plot area and the svg grows with axes and legend.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `mosaic`         | `column`, `segment`, `value`, `tol` (0.03)                                       | there is one column of abutting rects per `column` category, left to right in order. Column widths are proportional to the column totals (within `tol` of the largest total plus 1 px), and every column has the same height (within `tol` plus 1 px). Within a column, segment heights are proportional to each `segment` category's share of the column, in any stack order. Each segment category has one color across columns, and the colors differ.                                                                                                                                                                 |
| `waffle`         | `rows`, `cols`, values, `order` (`"any"`), `tol` (0 squares)                     | there is a `rows` x `cols` regular grid of equal squares, with no square of the same size on the grid's lattice just outside it (so a bigger grid fails). Each category has its own color on as many squares as its value. With `order: "rows"`, reading the grid row by row from the top-left gives one run of squares per category, in the values' order.                                                                                                                                                                                                                                                               |
| `ribbons`        | `orientation`, `category`, `series`, `value`, `direction`, `tol`                 | `stackedBars` passes, and for every series and every pair of neighboring stacks there is a filled shape whose cross-section at the first stack's far edge spans the series' segment there, and at the next stack's near edge spans its segment there, within max(2 px, `tol` of the segment). The cross-section is read 3 px and 6 px into the gap and extrapolated to the edge, so the gap must be at least 12 px. The band has the series' color, or its hue is nearer that series' hue than any other's (after compositing over white), so lighter or semi-transparent bands count. One shape may carry several bands. |

The checks were tried against throwaway programs in all four arms before any
task used them: stacked and grouped bars, three smoothed and straight line
series, and pies and donuts with slices down to 5%. Wrong pictures failed as
they should, including a grouped chart checked as stacked, a sqrt-scaled pie,
and lines with a nonlinear y. Each task was also checked against at least one
plausible wrong picture: bars in data order instead of sorted, a histogram
with right-closed or automatic bins, a pie with a hole, a donut with a tiny
hole, a line that joins its points in value order instead of year order,
square markers where circles were asked for, and edits that were not made or
that also changed colors or text.

The beyond-defaults checks were tried the same way. `mosaic` fails a
normalized stacked bar (equal-width columns, in GoFish and matplotlib), raw
heights instead of shares, color by column instead of by segment, and the two
fields swapped. `waffle` fails a pie, a column-by-column fill, a fill from the
bottom-left (in GoFish and matplotlib), one square moved between categories,
and a 5 x 20 grid. `ribbons` fails plain stacked bars (in GoFish and d3),
bands connecting each segment to the next channel's segment, a stacked area
through the bar centers (curved and straight), gray bands, unfilled band
outlines, and bands filled down to zero. It passes other correct builds: one
area path per channel through both edges of every bar, and a matplotlib
`stackplot` behind the bars.

## Known limitations

- Gradient and pattern fills all read as one gray, so they cannot be told apart.
- A path made of several separate pieces is classified as `path`, not as the
  shapes it contains.
- Shapes are compared by their fill geometry. Strokes do not change boxes.
- Points must be circles. Square or other markers do not count for `points`.
- `lineSeries` assumes x increases to the right and y up, with linear scales.
  Axes with a log scale or an inverted direction fail it by design.
- `stackedBars` handles positive values only. `wedges` compares shares, so a
  pie drawn as a partial circle passes if its shares are right.
- Colors are compared as rendered. A task that expects particular colors must
  say so in its instruction.
- Preservation is coarse: it compares sets and counts, not geometry.
- `stackedBars`, `mosaic` and `ribbons` accept any stack order within a bar,
  even when the instruction states one. A ribbon chart that re-sorts each bar
  (the Power BI default) still passes `ribbons` if its bands connect the right
  segments.
- `mosaic` is vertical only (columns side by side). It does not check that
  the columns touch.
- `waffle` needs square rects. A grid of circles or rounded dots fails.
- `ribbons` needs a gap of at least 12 px between neighboring bars. A band
  drawn as one path with several separate pieces is read as one outline, which
  can join the pieces with a false edge.
- `bars` checks lengths and order, not widths or positions along the category
  axis. A histogram whose first and last bins are drawn narrower than the
  others (for example, clipped to the data's range) still passes if the
  counts are right.

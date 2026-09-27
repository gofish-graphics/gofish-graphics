# LLM authoring benchmark (v0)

This benchmark measures how well a language model writes static charts in four
libraries, which we call arms: **gofish** (this repo), **recharts** (React),
**d3**, and **matplotlib** (Python). The model is `claude-opus-5-5` by
default (`--model`), run through the Anthropic API or through headless Claude
Code (see "Backends"). The design
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
pnpm llm-bench run --backend claude-code --yes  # runs through Claude Code on the subscription
pnpm llm-bench rescore <runDir>        # score a saved run again under the current rules (no API)
```

Options: `--arms gofish,recharts,d3,matplotlib`, `--tasks <substring of task id>`,
`--samples N` (1), `--max-turns N` (3), `--budget-usd X` (10, API),
`--subscription-cap-usd X` (40, claude-code at list price),
`--model ID` (`claude-opus-5-5`), `--backend api|claude-code` (api),
`--effort low|medium|high|xhigh|max` (medium), `--concurrency N` (3).

- `references` must pass for every arm on every task before any paid run. It is
  the test that the checks are fair to every library. It exits non-zero on any
  failure. For a chain it checks every step's reference, each against the
  render of the step before it (the base task's reference for step 1), even
  when an earlier step fails. A missing reference file fails that job and
  the run goes on.
- `mock` replays each task's reference solution as the model's reply (for a
  chain step, that step's reference). Token counts and costs in a mock run
  are simulated from character counts and are not added to the ledger.
- `run` with the api backend reads `ANTHROPIC_API_KEY` from the environment,
  or from `tests/llm-bench/.env` (see `.env.example`; the file is
  gitignored). With the claude-code backend it needs no key.
- `rescore` takes a run directory (or a run id under
  `tests/tmp/llm-bench/runs/`). It renders every saved turn's program again
  through the current harness, checks and arm contract, and writes a new
  `results.jsonl` and `report.md` (plus the renders) into `<runDir>-rescored/`.
  The original run is left as it was. No model is called: tokens and costs are
  the saved ones, and render times are measured again. As in a real run, a job
  ends at its first turn that renders and is scored on that turn. When that is
  not the turn the original run ended on, the job is scored on the saved turns
  only and listed under "Rescore caveats". The usual case is a turn that
  rendered before (so the model stopped) and now breaks the arm contract: a
  real run would have sent the error back and given the model another turn,
  but there is no such turn to score, so the job is scored on the saved
  turns (partial if that turn's picture is right, see "The report"). A chain
  is rescored step by step, each step against the rescored picture of the
  step before. If a step no longer passes, the saved steps after it are not
  scored. If a step that stopped the chain now passes, the chain is scored as
  stopping there, since there are no saved later steps. Rescoring also fills
  in the reasoning tokens from the saved replies. The report ends with every
  job whose outcome changed. `--concurrency` applies.

Every invocation writes a run directory under `tests/tmp/llm-bench/runs/`. For
each job and turn it holds the reply (`turnN.reply.md`), the program
(`turnN.js|jsx|py`), the saved SVG, a PNG screenshot, the extracted record
(`turnN.record.json`), `result.json`, and `transcript.md` (the whole conversation as text). A chain job keeps each step's
turns and transcript in a `stepK/` folder. The run directory also holds
`results.jsonl` (one line per job) and `report.md`. The latest report is copied
to `tests/tmp/llm-bench/report.md`.

Requirements: Playwright's Chromium (already used by the visual tests) and
`uv` (in `~/.local/bin` or on `PATH`). The matplotlib arm runs with
`uv run --no-project --with matplotlib==3.10.9 --with pandas==2.3.3`, so nothing
needs to be installed by hand.

## Backends

`--backend` picks how each turn reaches the model. Both backends send the same
system prompt and messages, use adaptive thinking, and pass `--effort`
explicitly. No sampling parameters, forced tool choice or prefill are used.
Both cap a reply at 16,000 output tokens.

- **api** (the default for now): the Anthropic Messages API. A repair turn
  continues the same conversation, so the model sees its own earlier reply
  with its thinking blocks.
- **claude-code**: each turn runs headless Claude Code on the user's Claude
  subscription:

  ```bash
  claude -p --output-format json --model <model> --effort <effort> --tools "" \
    --system-prompt-file <arm system prompt> --no-session-persistence --safe-mode
  ```

  The message goes in on stdin. Each call runs in an empty temporary
  directory of its own, so Claude Code finds no project context and
  concurrent calls do not share a directory. `ANTHROPIC_API_KEY` and
  `ANTHROPIC_AUTH_TOKEN` are removed from its environment, so it uses the
  subscription login and not the API key. `--safe-mode` keeps out the user's
  own CLAUDE.md, skills, plugins, hooks and MCP servers.

Differences on the claude-code backend:

- Claude Code adds its own text to every call. With the flags above that is
  about 425 input tokens, the same for every arm. Without `--safe-mode` it
  was about 11,700, because the user's CLAUDE.md, skills and plugins were
  sent too. Each turn's usage counts these tokens.
- Each turn is a fresh `claude -p` process. A repair turn therefore sends the
  conversation so far as plain text: the earlier messages inside
  `<earlier_conversation>`, with the task in `<user_message>` and the
  model's earlier replies in `<your_reply>`, then the latest message (the
  render error). The model does not see its earlier thinking. On turn 1 the
  message is the task message unchanged.
- The system blocks are joined into one text.
- Claude Code writes its prompt cache with a 1-hour lifetime, so cache writes
  cost 2 times input instead of 1.25 times.
- Latency is Claude Code's API time (`duration_api_ms`), without the process
  start-up.
- Thinking tokens come from `usage.output_tokens_details.thinking_tokens`, so
  the reasoning split is exact, as on the API.

## Spending and the budget guards

Prices live in one place, `tests/scripts/llm-bench/cost.ts`, per model. For
`claude-opus-5-5`: $4 per million input tokens, $20 per million output
tokens, cache reads at $0.20, and cache writes at 1.25 times input for the
5-minute cache and 2 times input for the 1-hour cache. For `claude-opus-5`:
$5 and $25, cache reads at $0.50, and the same cache write multiples. A run
with a model that has no prices stops before it starts.

`tests/tmp/llm-bench/ledger.json` records every real call from every run, with
its backend, model and `costBasis`. The ledger keeps one total per backend:

- **api**: what the API bills, computed from the usage. Before each call the
  runner reserves that call's worst case: every input token billed as a
  1-hour cache write, plus the full `max_tokens` (16,000) of output. If the
  API total plus all reservations would pass `--budget-usd` (default $10 in
  total, across all runs), the call does not start.
- **claude-code**: the `total_cost_usd` that Claude Code reports, which is the
  list-price equivalent of the call (`costBasis: "list (subscription)"`). The
  subscription pays for these calls, so they do not count against
  `--budget-usd`. They are guarded the same way by `--subscription-cap-usd`
  (default $40 in total, across all runs, at list price), so a runaway loop
  stops.

When a cap refuses a call, the run stops cleanly and still writes its partial
results and report. A call that fails in a way that may have been billed (a
dropped stream, for example) is booked at its worst case. A failed
claude-code call is booked at the cost Claude Code reported, when it
reported one. Every call of a chain step goes through the same guard. The
estimate that `run` prints counts every chain step as if it runs. For the
claude-code backend it states the tokens and the list price, and says that
the run bills to the subscription.

Failed calls are retried with backoff when the failure is passing (a dropped
connection, a rate limit, an overloaded or failing server), up to 5 attempts.
A bad key, a bad request, a missing `claude` command or a login problem stops
the run. When the subscription's usage limit is reached, the run stops too;
the jobs it cut short are not scored, like any other infrastructure stop.

The report's header names the model, the backend and the effort, and gives
this run's spend and the ledger's total for each backend.

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
  with `console.error`, it takes more than 20 s, the output has a `<canvas>`,
  there is no non-empty `<svg>`, or the picture breaks the arm contract (below).
  The model sees the error message with stack frames pointing at its own file.
- Render time is the wall time of the render itself: module load plus render
  call for the JS arms (the library is loaded beforehand), and the whole Python
  process, including interpreter start-up, for matplotlib.

## The arm contract

The picture in the container must have been produced by the arm's library. A
program that writes the chart's SVG by hand is not a use of the library, so
its picture is not scored as one. The rule is the same for every arm, and each
arm checks it in the way its library allows. The code is in
`tests/scripts/llm-bench/contract.ts`, a declared per-library layer like the
extractor; the checks stay library-neutral.

- Every arm, before rendering: the program imports the arm's library
  (`gofish-graphics`, `recharts`, `d3` or a `d3-*` module, `matplotlib`).
  This is a cheap first filter on the source text.
- gofish: every painted SVG element in the container was created by
  gofish-graphics. Before the program loads, the harness wraps
  `createElementNS`, `cloneNode` and `importNode` and records the call stack
  of every SVG element made in the page. The program and the harness share the
  one `gofish-graphics` module, served from `packages/gofish-graphics/src`, so
  an element counts as drawn by GoFish when that path is on its stack.
  Elements inside `<defs>` and paint servers (gradients, patterns, markers,
  clip paths, masks, filters) are not checked, so a program may supply them.
  Appending even one hand-made shape to GoFish's SVG breaks the rule.
- recharts: every outermost `<svg>` in the container is a Recharts surface
  (`svg.recharts-surface`). Custom shapes passed to Recharts components (a
  `shape` prop, `<Customized>`) are inside the surface and count. A separate
  SVG laid over the chart does not.
- matplotlib: the saved SVG carries matplotlib's creator metadata
  (`Matplotlib v...`) or its figure group (`<g id="figure_1">`).
- d3: the program must also use something it imports from d3. There is no
  runtime check. d3 is a DOM toolkit, so appending elements through d3
  selections is how d3 draws, and telling that apart from hand-written SVG
  would take more machinery than the case is worth. A module that imports d3
  and never uses it fails; one that uses d3 for a scale and writes the SVG
  itself passes.

A violation is a failed render, recorded with `errorKind: "contract"` on the
turn, and its message goes back to the model like any render error, for
example: "The chart must be drawn with GoFish (gofish-graphics); this output
was not produced by it." followed by a line saying why. A user of that library
would ask for the library, so the model gets another turn and can still earn a
full pass. The harness still renders the program and reads its picture (a
program that does not import the library is rendered too), and the checks run
on it, so a right picture drawn some other way scores as partial (see "The
report"). When the program also fails to render, the render error goes back,
with the import message after it. The report's "Contract violations" section
counts the jobs and turns per arm, splits the jobs by outcome, and lists each
violating turn with whether its picture was right.

## The report

Each turn has one of three outcomes:

- **pass**: the picture passes every check (and, for an edit, keeps what it
  must keep), and the arm's library drew it.
- **partial**: the same right picture, but it breaks the arm contract. This is
  worse than a pass, because hand-written SVG is harder for a user to keep
  working on, and better than a fail.
- **fail**: anything else.

A job's outcome is its best turn's, in the order pass, partial, fail. Since a
job ends at its first turn that renders with the library, a partial job is
one whose right, off-library picture was never followed by a passing turn.
The per-arm table shows the share of jobs that pass, are partial, fail, and
pass or are partial, plus first-turn passes. The paired comparison is shown
twice: on passes (the headline) and on passes or partials. For edits,
applied and preserved are judged on the picture whether or not the library
drew it, and the edits table splits the jobs where both hold into pass and
partial.

Output tokens include adaptive thinking. Each turn records `visibleTokens`
(the reply text) and `reasoningTokens` (the rest of the output). When the API
reports the thinking tokens (`usage.output_tokens_details.thinking_tokens`),
the split is exact. Otherwise the visible part is an estimate of 4 characters
of reply text per token, and the report's column says "(est.)". The per-arm
table shows the mean reasoning tokens per job, summed over its turns.

Chains get their own section and are left out of the other tables: per arm,
the mean number of steps passed and the share of full chains passed, then
the steps passed per chain and sample, and where each chain stopped.

## The record

`tests/scripts/llm-bench/extract.ts` runs in the page and produces a
`RenderRecord` (`record.ts`):

- `svgs`: the box of every outermost `<svg>`, largest first.
- `marks`: every visible SVG shape and text, plus HTML text inside the
  container (Recharts draws its legend in HTML). Each mark has a `kind`, a box
  `{x, y, w, h}` in CSS px relative to the container, `fill` and `stroke` as
  RGBA (every opacity on the way to the root folded into alpha), `strokeWidth`,
  and `text` for text. A dashed stroke also has `dash` (its
  `stroke-dasharray`). A mark drawn through clip paths or masks (its own or
  its ancestors') has `clip`: one list of polygons per clip or mask, and the
  mark shows only where it is inside some polygon of every list. Its box is
  cut down to those regions. A mask counts where its shapes are light (or
  opaque, for `mask-type: alpha`), so a mask of black shapes hides the mark.

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

Every outline is classified from at least 64 samples, so a small shape, such
as a thin slice of a 20 px pie, still has several samples on each side.

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
and `"beyond-defaults"` for charts no arm has built in (mosaic, three-level
mosaic, waffle, ribbon chart, scatter plot of pie glyphs, ridgeline, bottle
fill chart), which a program has to compose from lower-level pieces. The
common group also holds annotated charts that every arm can draw but that take
more than one call: bars with value labels, a dashed mean line, a marked and
labeled peak, and a bubble chart sized by area. The
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

A chain task is a series of edits on one chart, as in ChartEditBench:

```ts
const task: Task = {
  id: "chain/bars-evolve",
  kind: "chain",
  base: "create/bar-basic", // a create task; data and size come from it
  steps: [
    { instruction: "Sort the bars ...", checks: [...], mayChange: [] },
    { instruction: "Turn this into a horizontal bar chart ...", checks: [...], mayChange: [] },
    { instruction: "Highlight Lake B ...", checks: [...], mayChange: ["colors"] },
  ],
};
```

Each step runs like an edit: a fresh conversation with up to `--max-turns`
turns, scored applied and preserved. Step 1 starts from the arm's reference
for `base`. Each later step starts from the model's own final program of the
step before, and preservation compares with that program's render. The chain
goes on only past a step that passes. A step that ends partial or fails stops
it, and the steps after it count as failed. A chain is scored by the steps
passed before the first one that did not pass (0 to the number of steps), and
by whether the whole chain passed. Step k's references go in
`references/<chain id>/step<k>/<arm>.js|jsx|py`; each is written as the
previous step's reference plus the change (in `references` mode and in the
cost estimate, step k starts from step k-1's reference).

The two chains so far:

- `chain/bars-evolve` (base `create/bar-basic`): sort the bars largest first;
  make them horizontal with the largest at the top; color Lake B orange.
- `chain/scatter-evolve` (base `create/scatter-plain`): swap the axes; rename
  the axis titles; color the cars with `mpg` of 30 or more orange.

Their color steps use `highlight` (see `bars` and `points` under Checks): the
named marks are orange, and every other mark shares one other color, so
recoloring the rest with a palette fails.

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

Values for `bars`, `referenceLine`, `wedges` and `waffle` are either literal
(`values: [3, 1, 2]`) or summed from the task data by category
(`category: "lake", value: "count"`, categories in order of first
appearance, or by their totals with `sort: "asc"` or `"desc"`). Values for
`stackedBars`, `groupedBars` and `ribbons` are summed by `category` and
`series`, both in order of first appearance. `mosaic` sums `value` within each
cell of its `levels`. Field-based values are preferred, since they cannot
drift from the data.

A **highlight** (`highlight: { where, color }` on `bars` and `points`) picks
items with `where`, a map from field to a value or a `{ min, max }` range
(for field-based bars the items are the categories, for points the rows). It
passes when the picked marks have `color` (a hex color, compared by RGB, so
the chart's opacity may stay) and every other mark shares one other color.

| Check            | Options                                                                                                              | Passes when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bars`           | `orientation`, values, `ordered` (true), `direction` (`"forward"`), `tol` (0.03)                                     | there is one filled rect per value on a shared baseline, with lengths proportional to the values from zero (negative values extend the other way), within `tol` of the largest value plus 1 px. With `ordered`, the bars follow the values' order along the category axis. `"forward"` is left to right, or top to bottom for horizontal bars. Use `"either"` when the task does not fix the direction. With `valueLabels` (`{ decimals }`, default 0), each bar also has a text that reads exactly its value (en-US, with thousands separators), just beyond its end (its near side at most 16 px past the end, and at most 30% of it over the bar) and centered across the bar (within 3 px or 10% of the bar's thickness). With `highlight`, see above.                                                                                                                                              |
| `stackedBars`    | `orientation`, `category`, `series`, `value`, `direction`, `tol`                                                     | there is one stack per category, in order. A stack is a column of rects that touch end to end, and its segment lengths match that category's nonzero values in any stack order. Each series has one color across stacks, and the series' colors differ. Positive values only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `groupedBars`    | `orientation`, `category`, `series`, `value`, `direction`, `tol`                                                     | the bars share a baseline and run in category order, with series order within each category, and their lengths are proportional. Each series has one color, and the series' colors differ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `points`         | `x`, `y`, `colorBy?`, `size?`, `maxRadius?`, `highlight?`, `tol` (0.01), `sizeTol` (0.03)                            | every row has its own circle, centered at a linear image of `(x, y)` with x to the right and y up, within `tol` of the plotted extent (at least 1.5 px). Extra circles, such as legend swatches, are allowed. With `colorBy`, rows with the same value share a color and different values get different colors. With `size`, each circle's area is proportional to the field (radius squared is k times the value, for one k), within 0.5 px plus `sizeTol` of the largest radius; with `maxRadius`, the largest radius is within 25% of it. With `highlight`, see above.                                                                                                                                                                                                                                                                                                                               |
| `referenceLine`  | values, `orientation`, `at` (a number or `"mean"`), `label`, `dashed?`, `direction`, `tol` (0.03), `lineTol` (0.005) | the bars pass `bars` (ordered), and a straight line across the value axis sits at `at` on the bars' scale (within `lineTol` of the largest value plus 1.5 px), spanning from the first bar's outer edge to the last bar's. With `dashed`, the line has a dash pattern. A text containing `label` is within 30 px of the line and alongside it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `annotation`     | `x`, `y`, `at` (`"max"` or `"min"`), `text`, `near` (30), `tol`                                                      | `lineSeries` finds the line, and at the row with the largest (or smallest) `y` there is a filled circle of radius at least 2.5 px centered on the point (within 1.5% of the plot, at least 2 px), and a text containing `text` whose box is within `near` px of the point.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `pieGlyphs`      | `by`, `x`, `y`, `category`, `value`, `tol` (0.01), `placeTol` (0.01)                                                 | there is one complete pie per `by` category (slices around one center whose sweeps add up to 360 degrees within 3, with no hole), centered at a linear image of its `(x, y)` with y up, as `points` places circles. Each pie's slice shares match the shares of `value` by `category` (any order, within `tol`). Each `category` has one color across pies, and the colors differ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ridgeline`      | `category`, `x`, `y`, `overlap` ([1.5, 2.5]), `tol` (0.02)                                                           | each `category` has a filled shape whose top edge, measured up from the shape's own baseline (its lowest edge), passes through the category's `(x, y)` points within `tol` of the tallest peak (at least 2 px). All shapes span the same x range and share one height scale (within 5%). The baselines run top to bottom in category order and are evenly spaced (within 5%, at least 2 px), and the tallest peak is `overlap` times the spacing.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `bottleFill`     | `category`, `value`, `max` (100), `tol` (0.02)                                                                       | there is one bottle outline per category, left to right in order: a stroked, unfilled, closed shape that is not a rectangle, all of the same height (within 5%). Inside each, the pixels painted by filled marks (after clip paths and masks) are the liquid. It starts at the outline's bottom, rises to `value / max` of the outline's height (within `tol` plus 1.5 px), keeps at least 99% of its pixels inside the outline (within 1.5 px), and a quarter of the way up it spans at least 85% of the outline's width.                                                                                                                                                                                                                                                                                                                                                                              |
| `lineSeries`     | `x`, `y`, `groupBy?`, `tol` (0.015)                                                                                  | every group (or all rows) has its own stroked line, and under one linear map with y up every row lies on its line, within `tol` of the plot size (at least 2 px), and each line runs in one x direction (it never steps back by more than that tolerance, so points joined out of x order fail). Smoothed curves pass. With `groupBy`, the lines' colors differ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `wedges`         | values, `hole?`, `tol` (0.01)                                                                                        | slices around one center have angular shares matching the values' shares (any order) within `tol`, and every slice has its own color. Works for pies and donuts. `hole: true` also requires a donut (every slice's inner radius is at least 20% of its outer radius), and `hole: false` a pie (at most 5%).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `textIncludes`   | `strings`                                                                                                            | each string appears, ignoring case, inside some text (SVG or HTML).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `distinctColors` | `k`                                                                                                                  | data marks use at least `k` different colors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `sizeAbout`      | `w?`, `h?` (the task size), `tol` (0.25)                                                                             | the largest `<svg>` is within `tol` of the size. This is a loose sanity bound, since GoFish sizes the plot area and the svg grows with axes and legend.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `mosaic`         | `levels` (a list of `{ by, dir, from }`), `value`, `tol` (0.03)                                                      | one rectangle is split recursively, one level per entry of `levels`. Level i splits every cell of the level above along `dir` (`"x"` or `"y"`) into one piece per category of `by`. Each piece is as long as that category's share of the cell's summed `value` (within `tol` of the cell plus 1 px) and spans the cell's full extent the other way. `from` (`"left"`, `"right"`, `"top"`, `"bottom"`) is the side the first category (in order of first appearance) starts at; `"any"` (the default) allows any order. Small gaps between pieces are allowed. The categories of the last level each have one color, and the colors differ. A Marimekko chart is two levels: columns along x, then segments along y. The mosaic is found as a cluster of rects within 3, 12 or 30 px of each other; rects thinner than 1.5 px count only inside a cluster's box, so axis lines drawn as rects stay out. |
| `waffle`         | `rows`, `cols`, values, `order` (`"any"`), `tol` (0 squares)                                                         | there is a `rows` x `cols` regular grid of equal squares, with no square of the same size on the grid's lattice just outside it (so a bigger grid fails). Each category has its own color on as many squares as its value. With `order: "rows"`, reading the grid row by row from the top-left gives one run of squares per category, in the values' order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ribbons`        | `orientation`, `category`, `series`, `value`, `direction`, `tol`                                                     | `stackedBars` passes, and for every series and every pair of neighboring stacks there is a filled shape whose cross-section at the first stack's far edge spans the series' segment there, and at the next stack's near edge spans its segment there, within max(2 px, `tol` of the segment). The cross-section is read 3 px and 6 px into the gap and extrapolated to the edge, so the gap must be at least 12 px. The band has the series' color, or its hue is nearer that series' hue than any other's (after compositing over white), so lighter or semi-transparent bands count. One shape may carry several bands.                                                                                                                                                                                                                                                                               |

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

The second round of tasks was tried the same way (the programs are variations
of the references, mostly in d3, with some in GoFish, matplotlib and
Recharts). The three-level `mosaic` fails class bands in reverse order, sex
widths from the overall sex shares instead of each class's, survived heights
from the class's shares instead of each class-and-sex cell's, equal sex
widths, sex split along y instead of x, color by class, nested GoFish stacks
without `normalize`, and a two-level mosaic. `pieGlyphs` fails y pointing
down, a log x scale, equal slices, slices colored by rank instead of species,
donut glyphs, and plain circles. `ridgeline` fails one height scale per row,
Dec on top, peaks under the spacing, a `curveBasis` top (it misses the
points), outlines without fill, and uneven spacing (matplotlib).
`bottleFill` fails an unclipped body-width rectangle (it pokes out of the
neck), a level measured against the body instead of the whole bottle, a thin
bar, a bottle without a neck, liquid hanging from the top, bottles in reverse
order (matplotlib), and a GoFish mask with a black shape (which draws no
liquid). `points` with `size` fails radius proportional to the value, a sqrt
scale that starts at 4 px, one color, matplotlib `s` set to the squared
radius, and (with `maxRadius`) a 60 px largest circle and GoFish's `r` bound
to `sqrt(population)`. `bars` with `valueLabels` fails labels without the
comma, labels inside the top of the bar, labels at the bar's left edge, and
Recharts labels inside the base. `referenceLine` fails a solid line, a line at
the median (1.1 units off), a line over half the plot, and a label 20 units
above the line. `annotation` fails a marker on the last point, no marker, the
text in the plot's corner, and the value without its comma. `highlight` fails
the other bars recolored with a palette, the wrong lake, red instead of
orange, `mpg > 30` instead of `>= 30`, and the other cars in two colors.

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
- `stackedBars` and `ribbons` accept any stack order within a bar, even when
  the instruction states one. A ribbon chart that re-sorts each bar (the
  Power BI default) still passes `ribbons` if its bands connect the right
  segments.
- `mosaic` does not check that pieces touch: small gaps pass. A piece thinner
  than 1.5 px counts only when it lies inside the box of the mosaic's other
  rects, and pieces thinner than 0.5 px are ignored.
- `pieGlyphs`, `ridgeline` and `bottleFill` do not check sizes beyond what
  they state: a pie of any radius, and a bottle of any proportions, pass.
  `ridgeline` reads the horizontal scale from the shapes' x extent, so a
  ridge whose area runs past the first or last data point fails.
- A `highlight` color must be written as hex.
- Clip regions are followed through `clip-path` and `mask` references in the
  element's own user space (the SVG default). `clipPathUnits` or
  `maskContentUnits` of `objectBoundingBox` are not handled, and a mask's
  partial luminance counts as fully shown.
- `waffle` needs square rects. A grid of circles or rounded dots fails.
- `ribbons` needs a gap of at least 12 px between neighboring bars. A band
  drawn as one path with several separate pieces is read as one outline, which
  can join the pieces with a false edge.
- The gofish provenance check only sees elements created by
  `createElementNS`, `cloneNode` or `importNode`. Markup parsed from a string
  counts as the program's own, so `container.innerHTML = await
chart(...).toSVG()` breaks the contract, although appending
  `toSVGElement()`'s result does not.
- `bars` checks lengths and order, not widths or positions along the category
  axis. A histogram whose first and last bins are drawn narrower than the
  others (for example, clipped to the data's range) still passes if the
  counts are right.

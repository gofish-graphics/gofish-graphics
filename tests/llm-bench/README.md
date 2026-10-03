# LLM authoring benchmark (v0)

This benchmark measures how well a language model writes static charts in seven
libraries, which we call arms: **gofish** (this repo), **recharts** (React),
**d3**, **matplotlib** (Python), two grammars of graphics, **ggplot2** (R)
and **altair** (Python, on Vega-Lite), and **plot** (Observable Plot, a
terse JavaScript grammar of marks and transforms). The grammar arms compare
GoFish with declarative libraries, not only with imperative ones. The model
is `claude-opus-5-5` by default (`--model`), run through the Anthropic API or
through headless Claude Code (see "Backends"). The design and its reasoning
are in `apps/docs/docs/internals/design/llm-authoring-benchmark.md`.

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
pnpm llm-bench compare <runDir>[=label] ...  # one table comparing the gofish arm across runs
pnpm llm-bench gallery <runDir>[=label] ... [--references <runDir>] [--out <dir>]  # a page comparing every arm's pictures and code
pnpm llm-bench:contexts                # regenerate the cheatsheet, gallery index and skill folder
```

Options: `--arms gofish,recharts,d3,matplotlib,ggplot2,altair,plot`, `--tasks <substring of task id>`, `--group <task group>` (e.g. `corpus-pilot`),
`--samples N` (1), `--max-turns N` (3), `--budget-usd X` (10, API),
`--subscription-cap-usd X` (40, claude-code at list price),
`--model ID` (`claude-opus-5-5`), `--backend api|claude-code` (claude-code),
`--effort low|medium|high|xhigh|max` (medium), `--concurrency N` (3),
`--context pack:<path>|cheatsheet|retrieval|skill` (`pack:context/gofish.md`).
`--docs-pack <path>` is the same as `--context pack:<path>`.
`--extensions on|off` (on).

- `--context` picks how GoFish is presented to the gofish arm in `mock` and
  `run` (see "Contexts"). The other arms get no documentation. A mock run
  records the context but ignores it. Every job result records the context's
  name and the first 12 hex characters of its sha256 (`context`), and the
  report header shows them, so runs on different contexts can be told apart.
  `rescore` carries them over from the original results. Results from before
  contexts existed recorded the pack in `docsPack`, which is read as
  `pack:<file>`; a run from before either was recorded shows "not recorded".
- `--extensions` sets whether d3, plot, ggplot2, matplotlib and altair get their
  ecosystem's extension packages (see "Extensions"). Every job of those
  arms records the setting (`extensions`), the report header shows it, and
  the cost estimate names it. `references` always runs with it on, and
  `rescore` uses the original run's setting.

- `references` must pass for every arm on every task before any paid run. It is
  the test that the checks are fair to every library. It exits non-zero on any
  failure. For a chain it checks every step's reference, each against the
  render of the step before it (the base task's reference for step 1), even
  when an earlier step fails. A missing reference file fails that job and
  the run goes on; so does a missing base reference, which fails the edits
  and chains built on it.
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
  in the reasoning tokens from the saved replies, and the code statistics
  (see "The report") from the saved programs. The report ends with every
  job whose outcome changed. `--concurrency` applies.
- `compare` takes run directories (or run ids), each with an optional
  `=label`, and prints one table of the gofish arm per run: the columns of
  the report's context section (see "The report"), for all single tasks and
  then per group. Runs given the same label are pooled, so a condition run in
  parts is one row. A run without a label is named by its context. Code
  statistics missing from an older run are filled in from its saved programs
  (all but model tokens).
- `gallery` takes run directories (or run ids), each with an optional
  `=label`, and writes a static page to `--out` (default
  `tests/tmp/llm-bench/gallery/`). The overview is a grid with one row per
  task, grouped by chart family (from `corpus/manifest.csv`, else the task
  group), and one column per arm. Each cell shows the final turn's picture,
  the outcome, the turns used, and the final program's syntax tokens and
  arithmetic operations; a cell that did not pass also shows its first
  failing check or error. Runs given the same label are pooled. When two
  labels cover the same arm (extensions on and off, say), a switch picks
  which one the grid shows. Filters pick a family and an outcome of one arm,
  and the grid can be sorted by the gofish arm's syntax tokens. Opening a
  task shows its instruction, every arm's picture, and two arms side by
  side (gofish and the arm with the fewest syntax tokens, at first): every
  turn's picture, the error sent back before each repair, and the final
  program with syntax highlighting. With `--references <runDir>` (a
  `references` run), the page can show each arm's reference picture and
  program beside the model's. `--tasks` and `--group` narrow the tasks. The
  folder is `index.html`, `data.js` (the overview, with small WebP
  thumbnails) and `tasks/<task>.js` (each task's pictures as WebP and its
  programs, loaded when the task is opened), so it opens from disk and can
  be published as it is. The URL hash names the task and the two arms
  (`#task=create/alluvial&a=gofish&b=plot`).

Every invocation writes a run directory under `tests/tmp/llm-bench/runs/`. For
each job and turn it holds the reply (`turnN.reply.md`), the program
(`turnN.js|jsx|py|R`), the saved SVG, a PNG screenshot, the extracted record
(`turnN.record.json`), `result.json`, and `transcript.md` (the whole conversation as text). A chain job keeps each step's
turns and transcript in a `stepK/` folder. The run directory also holds
`results.jsonl` (one line per job) and `report.md`. The latest report is copied
to `tests/tmp/llm-bench/report.md`.

Requirements: Playwright's Chromium (already used by the visual tests),
`uv` (in `~/.local/bin` or on `PATH`), and R for the ggplot2 arm. The
matplotlib arm runs with
`uv run --no-project --with matplotlib==3.10.9 --with pandas==2.3.3`, and the
altair arm with `uv run --no-project --with altair==5.5.0 --with
vl-convert-python==1.9.0.post1 --with pandas==2.3.3` (each plus its
extension pins when extensions are on), so nothing needs to be
installed by hand for them. The ggplot2 arm runs `Rscript --vanilla` (from
`/usr/local/bin`, `/opt/homebrew/bin` or `PATH`; developed on R 4.5.2 with
ggplot2 4.0.1 and svglite 2.2.2). Install its packages once:

```bash
Rscript -e 'install.packages(c("ggplot2", "svglite", "jsonlite", "dplyr", "tidyr", "png", "ggmosaic", "ggridges", "treemapify", "packcircles", "ggforce", "waffle", "ggalluvial", "ggbeeswarm", "ggraph", "tidygraph", "igraph", "hexbin"), repos = "https://cloud.r-project.org")'
```

The last twelve are the ggplot2 extensions (see "Extensions"), developed
with ggmosaic 0.4.0, ggridges 0.5.7, treemapify 2.6.1, packcircles 0.3.7,
ggforce 0.5.0, waffle 1.0.2, ggalluvial 0.12.6, ggbeeswarm 0.7.3, ggraph
2.2.2, tidygraph 1.3.1, igraph 2.3.3 and hexbin 1.28.6.

A run checks that each script arm's packages load before it starts, and
stops if they do not.

## Backends

`--backend` picks how each turn reaches the model. Both backends send the same
system prompt and messages, use adaptive thinking, and pass `--effort`
explicitly. No sampling parameters, forced tool choice or prefill are used.
Both cap a reply at 16,000 output tokens.

- **api**: the Anthropic Messages API. A repair turn
  continues the same conversation, so the model sees its own earlier reply
  with its thinking blocks.
- **claude-code** (the default): each turn runs headless Claude Code on the user's Claude
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
- With the skill context, the call also gets tools and prints a stream of
  events instead of one result (see "Contexts"). One turn is then several
  API round trips, and its usage, cost and latency sum them.

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

The system prompts are in `prompts/<arm>.md`. The gofish arm also gets its
context (see "Contexts"; by default the skill in `context/skill/`, chosen from the context experiment in `results/2026-09-27-context-experiment.md`). The
system blocks carry `cache_control`, so repeated calls read them from the
prompt cache.

| Arm        | The model writes                                                                                                          | The harness                                                                                                 | Extension packages (with `--extensions on`)                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| gofish     | an ES module, `export default function render(container, data)`, importing from `"gofish-graphics"`                       | aliases `gofish-graphics` to `packages/gofish-graphics/src/lib.ts`, awaits the returned promise             | none                                                                                                                          |
| d3         | the same contract, `import * as d3 from "d3"`                                                                             | same                                                                                                        | d3-sankey, d3-hexbin                                                                                                          |
| recharts   | a JSX module, `export default function Chart({ data })` with explicit `width`/`height`                                    | compiles the JSX with esbuild (React's automatic runtime) and renders `<Chart data={data} />` with React 19 | none                                                                                                                          |
| matplotlib | a script that reads `DATA_PATH` (JSON rows) and saves SVG to `OUT_PATH`                                                   | runs it with `uv` (60 s limit), then loads the SVG into the same page                                       | squarify, circlify, pywaffle, scipy                                                                                           |
| ggplot2    | an R script that reads `DATA_PATH` and saves SVG to `OUT_PATH` with `ggsave(..., device = svglite::svglite)`              | runs it with `Rscript --vanilla` (60 s limit), then loads the SVG into the same page                        | ggmosaic, ggridges, treemapify, packcircles, ggforce, waffle, ggalluvial, ggbeeswarm, ggraph (with tidygraph, igraph), hexbin |
| altair     | a script that reads `DATA_PATH` and saves SVG with `chart.save(OUT_PATH, format="svg")` (vl-convert)                      | runs it with `uv` (60 s limit), then loads the SVG into the same page                                       | squarify, circlify                                                                                                            |
| plot       | an ES module like d3's, `import * as Plot from "@observablehq/plot"` (and `d3` if it wants), appending `Plot.plot({...})` | same as gofish and d3 (`@observablehq/plot` 0.6.17)                                                         | d3-sankey, d3-hexbin (beside `d3`)                                                                                            |

Details that keep the arms comparable:

- Every task gives a size, such as 640 x 400 px. For matplotlib the prompt
  converts it to `figsize` at dpi 100. matplotlib writes SVG sizes in points
  (72 per inch) whatever the dpi, so the harness shows the file at inches times
  100 px, which is the size the prompt promised.
- For ggplot2 the prompt converts the size to `ggsave`'s `width` and
  `height` in inches at 100 px per inch (640 x 400 px is `width = 6.4,
height = 4, units = "in"`). svglite, like matplotlib, writes the size in
  points, and the harness shows it the same way.
- For plot the prompt asks for the task's size as `Plot.plot`'s `width` and
  `height`, which in Plot are the whole SVG's size, axes included. The
  program appends what `Plot.plot` returns: an `<svg>`, or a `<figure>`
  around it when the chart has a legend or a title. The legend is then
  HTML, which the record reads like Recharts' legend.
- For altair the prompt says that `.properties(width, height)` sizes the plot
  area, not the whole chart, and asks for a whole chart of about the task's
  size. Vega writes the SVG's size in px, which the harness keeps. As for
  GoFish, whose `render` size is also the plot area, `sizeAbout`'s loose
  bound allows for the axes and legend.
- matplotlib runs with a `matplotlibrc` (`tests/harness/llm-bench/`) that keeps
  text as `<text>` instead of glyph outlines, so labels are readable. svglite
  and vl-convert write `<text>` without any setting.
- All JavaScript libraries run in their production builds (`NODE_ENV` is
  `production`). The harness treats any `console.error` as a render error, and
  development builds log advice that says nothing about the picture, such as
  React's missing `key` warning.
- Each render runs in a fresh browser context on Playwright's fake clock. After
  the render call returns, the clock runs 2 s of virtual time, so animations
  and transitions finish before the picture is read. Images load over the
  network, which the fake clock does not drive, so the harness then waits (up
  to 5 s) until every `<image>` and `<img>` in the container has loaded and
  decoded before it takes the screenshot. A failed load (a 404) logs a
  console error, which is a render error.
- Task assets (images a task draws, such as `bottle.png`) live in
  `tests/llm-bench/assets/`, and every arm gets the same files. The harness's
  Vite server serves the folder at `/assets/<file>` for the JS arms, and the
  scripts (matplotlib, ggplot2, altair) get its path in the `ASSET_DIR`
  environment variable. The
  task's instruction states both, in the same words for every arm.
- A render fails when: the program does not parse, a module cannot be loaded,
  the render throws or rejects, a timer throws afterwards, anything is logged
  with `console.error`, it takes more than 20 s, the output has a `<canvas>`,
  there is no non-empty `<svg>`, or the picture breaks the arm contract (below).
  The model sees the error message with stack frames pointing at its own file.
- Render time is the wall time of the render itself: module load plus render
  call for the JS arms (the library is loaded beforehand), and the whole
  script process, including interpreter start-up, for matplotlib, ggplot2
  and altair.

## Extensions

A chart form that a library has no mark or layout for (a treemap, circle
packing, a waffle, a mosaic, a ridgeline, a sankey or alluvial, a hexbin, a
beeswarm, a dendrogram) is, in practice, drawn with a companion package from
the library's own ecosystem. `--extensions` (default `on`) sets whether the
arms that have such packages get them, so each baseline can be measured
both ways: the library as people use it, and the library alone. The
packages are listed in one table, `tests/scripts/llm-bench/extensions.ts`,
which the prompts, the runtimes and the checks below all read.

A package counts as a companion package when all of these hold:

- it comes from the arm's own ecosystem, and people routinely install it
  next to the library for a chart form or layout the library lacks;
- it is widely used and still maintained;
- the picture is still drawn by the arm's library, so it passes the arm
  contract (see "The arm contract"). A package that draws with its own graphics
  system does not qualify.

| Arm        | Extension packages                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| d3         | d3-sankey 0.12.3 (sankey and alluvial layouts), d3-hexbin 0.2.2 (hexagonal binning)                                                                                                                                                                                                                                                                    |
| plot       | d3-sankey 0.12.3, d3-hexbin 0.2.2 (the same d3 modules)                                                                                                                                                                                                                                                                                                |
| ggplot2    | ggmosaic (mosaic plots), ggridges (ridgeline plots), treemapify (treemaps), packcircles (circle packing), ggforce (arcs, circles and more geoms), waffle (waffle charts), ggalluvial (alluvial diagrams), ggbeeswarm (beeswarm plots), ggraph (dendrograms, trees and networks), tidygraph and igraph (graph data for ggraph), hexbin (for `geom_hex`) |
| matplotlib | squarify 0.4.5 (treemaps), circlify 0.15.1 (circle packing), pywaffle 1.2.0 (waffle charts), scipy 1.15.3 (dendrograms, with `scipy.cluster.hierarchy`)                                                                                                                                                                                                |
| altair     | squarify 0.4.5 (treemaps), circlify 0.15.1 (circle packing)                                                                                                                                                                                                                                                                                            |

The npm modules are pinned exactly in `tests/package.json`, the Python
packages by their uv pins, and the R versions are in "Requirements" above.
D3's hierarchy and chord layouts (treemap, pack, partition, chord) are part
of `d3` itself, so the d3 arm has them either way. The plot arm's prompt
allows `d3` beside Plot in every setting (Plot is built on d3, and Plot
users pull d3 modules as they need them), so it gets the same d3 modules
as the d3 arm. Packages that every setting allows, such as ggplot2's `png`
(for reading images) or `d3` for the plot arm, are not extensions.

Not added, and why:

- GoFish is the library under test, and Recharts ships its own `Treemap`
  and `Sankey`; neither arm has companion packages.
- circlize (R chord diagrams) draws with base R graphics, not ggplot2. Its
  picture breaks the ggplot2 arm contract: the chart must be a ggplot.
- pySankey (last release 2018) is unmaintained, and mpl-chord-diagram
  (last release 2022) is a small single-maintainer package that is not in
  common use, so the matplotlib arm gets neither. matplotlib's own
  `matplotlib.sankey` is part of core matplotlib already.
- Altair has no standard companion package: Vega-Lite's transforms are its
  layout layer, and the Python layout helpers it can use (squarify,
  circlify) are already listed.

- The prompt: each arm's prompt with extensions has an `{{extensions}}`
  placeholder at the end of its "May use" line (for d3 and plot, the line
  that says how to import D3). With extensions on it becomes ", and these
  ...: <package> (<what it draws>), ..."; with them off it is empty, so the
  line ends "... No other packages are available." as it did before
  extensions existed.
- With extensions off, the Python arms run without the packages installed
  (uv is not given their pins), so an import fails with
  `ModuleNotFoundError`, which goes back to the model like any render
  error. The R packages are installed system-wide and the npm modules are
  installed in `tests/`, so the ggplot2, d3 and plot arms are held to their
  base packages by a static check before the program runs. For ggplot2, a
  `library()`, `require()`, `requireNamespace()` or `loadNamespace()` of an
  extension package, or a `pkg::` use of one (outside comments), fails the
  render with "The R package <name> is not available in this run." For d3
  and plot, a static or dynamic import of an extension module fails it
  with "The package <name> is not available in this run." It is a render
  error, not a contract violation: it is the environment's error, like a
  failed import. The check cannot see a package loaded through a variable
  (`library(p, character.only = TRUE)`), nor one that another package
  loads by itself: ggplot2's `geom_hex` loads hexbin without a
  `library()` call, so `geom_hex` works with extensions off too.
- The run's start-up probe loads exactly the packages the setting allows.
- Reference solutions may use the extension packages, so `references`
  always runs with extensions on (it refuses `--extensions off`). With
  extensions off, `mock` replays those references and they fail, as
  expected. An edit's base reference is the program the model starts from,
  so it must not use an extension package.
- Results from before the setting was recorded ran without extensions (the
  packages were not offered yet), so a missing `extensions` field reads as
  `off`.

## Contexts

`--context` sets how GoFish is presented to the model in the gofish arm. The
aim is to compare ways of teaching the library on accuracy and on cost:
tokens, time to a finished chart, and repair rounds. The code is in
`tests/scripts/llm-bench/context.ts`.

| Context       | What the model gets                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pack:<path>` | a docs pack after the arm's system prompt. `context/gofish.md` (v1) and `context/gofish-v2.md` (v2) are the two packs so far. The path is read from where the command was typed, or from `tests/llm-bench/`. |
| `cheatsheet`  | `context/cheatsheet.md` after the system prompt: about 1,750 tokens.                                                                                                                                         |
| `retrieval`   | the cheatsheet, plus the three gallery examples most like the task, at the start of the first user message.                                                                                                  |
| `skill`       | a folder of files it reads with tools (claude-code backend only).                                                                                                                                            |

- **cheatsheet**: a short handwritten intro (`context/cheatsheet-intro.md`:
  one 6-line bar chart, and how `chart`, `.flow()`, `.mark()`, `.layer()` and
  `.render()` work), then one line per public operator, mark, combinator and
  polar coordinate transform with its options and defaults. The lines are
  generated by `tests/scripts/llm-bench/make-cheatsheet.ts` from the
  construct descriptors (`packages/gofish-ir/src/frontend/descriptors.ts`),
  and every name is checked against the exports of
  `packages/gofish-graphics/src/lib.ts`. Structural, debugging and
  diagram-only options are left out (the script lists them). `--check` fails
  when `cheatsheet.md` is out of date.
- **retrieval**: `context/gallery-index.json` holds every gallery-tagged
  story (90 of them; the gofish-gotree stories and the loader's fallbacks are
  left out) with its title, description and standalone example, compiled to
  JavaScript. The examples come from the docs build's own loader
  (`apps/docs/docs/.vitepress/data/storyExamples.ts`). For each conversation
  the instruction text, and nothing else about the task, is the query. The
  score is BM25 over the example's title (counted three times), its
  description (twice) and the names it imports from `gofish-graphics`, after
  splitting camelCase, lowercasing, dropping common words and a light
  stemming of plurals. Ties go to the smaller id, so the same instruction
  always gets the same examples. The examples go in the user message, not the
  system prompt, so the system prompt stays the same for every task and is
  read from the cache. Each job records which examples it got (`retrieved`),
  and the report lists them per task.
- **skill**: `context/skill/` holds `SKILL.md` (the cheatsheet, a paragraph on
  how to use the folder, and a table of every example's title, description
  and file) and `examples/<id>.js` (the same 90 examples). Each call copies
  the folder into its empty working directory and runs `claude -p` with
  `--tools Read,Glob,Grep --allowedTools Read,Glob,Grep --permission-prompts
none --output-format stream-json --verbose`. The system prompt is the arm's
  prompt without its last line ("GoFish documentation follows."), then a
  line saying the skill is in `./` and to read `SKILL.md` first. The final
  answer is still one fenced code block, read the same way as in every
  other arm. Each turn records its tool calls (`toolUses`, such as
  `Read SKILL.md` or `Grep stack\(`), and the report lists how often each
  was made. The api backend refuses this context. The budget guard reserves
  four worst-case calls for a skill call, since it is several API round
  trips.

`pnpm llm-bench:contexts` regenerates `cheatsheet.md`, `gallery-index.json`
and `skill/`, which are committed. The context's hash covers everything it
can send: the pack, the cheatsheet (and the index, for retrieval), or every
file in the skill folder.

Each gofish turn records `contextTokens`: the input tokens that were context,
in the model's tokens. That is the context's system text and the retrieved
examples (sent again on every turn), plus for a skill what the tools
returned in that turn. They are counted with the free token-counting
endpoint (see "The report").

## The arm contract

The picture in the container must have been produced by the arm's library. A
program that writes the chart's SVG by hand is not a use of the library, so
its picture is not scored as one. The rule is the same for every arm, and each
arm checks it in the way its library allows. The code is in
`tests/scripts/llm-bench/contract.ts`, a declared per-library layer like the
extractor; the checks stay library-neutral.

- Every arm, before rendering: the program imports the arm's library
  (`gofish-graphics`, `recharts`, `d3` or a `d3-*` module, `matplotlib`,
  `altair`, `@observablehq/plot`), or for ggplot2 calls `ggplot()` outside a
  comment. This is a cheap first filter on the source text.
- gofish: every painted SVG element in the container was created by
  gofish-graphics. Before the program loads, the harness wraps
  `createElementNS`, `cloneNode` and `importNode` and records the call stack
  of every SVG element made in the page. The program and the harness share the
  one `gofish-graphics` module, served from `packages/gofish-graphics/src`, so
  an element counts as drawn by GoFish when that path is on its stack.
  Elements inside `<defs>` and paint servers (gradients, patterns, markers,
  clip paths, masks, filters) are not checked, so a program may supply them.
  Appending even one hand-made shape to GoFish's SVG breaks the rule.
- plot: every painted SVG element in the container was created with
  Observable Plot's code on the call stack, by the same recording as for
  gofish. Vite pre-bundles Plot into its own file
  (`deps/@observablehq_plot.js`), and d3, which Plot draws through, into a
  separate chunk, so the program's own d3 calls do not count as Plot's. An
  element created inside a callback that Plot calls while it renders counts:
  a function in `marks`, or a mark's `render` option, which is how a Plot
  user draws a shape Plot has no mark for (the pie references draw
  `d3.arc` paths this way, with fills from Plot's color scale). That is the
  counterpart of a custom shape inside a Recharts surface. An element made
  before `Plot.plot` is called or appended after it returns, such as a
  hand-written overlay or a second SVG drawn with d3, breaks the rule. Plot
  marks its root with a class (`plot-d6a7b5`), but a program can rename it
  with the `className` option, so the class is not the test.
- recharts: every outermost `<svg>` in the container is a Recharts surface
  (`svg.recharts-surface`). Custom shapes passed to Recharts components (a
  `shape` prop, `<Customized>`) are inside the surface and count. A separate
  SVG laid over the chart does not.
- matplotlib: the saved SVG carries matplotlib's creator metadata
  (`Matplotlib v...`) or its figure group (`<g id="figure_1">`).
- ggplot2: the saved SVG was written by svglite, the device `ggsave` is
  told to use: it has svglite's root group (`<g class='svglite'>`). R's own
  `svg()` device (Cairo) fails, since it writes text as glyph outlines.
- altair: the saved SVG was written by Vega's SVG renderer, which
  `chart.save` runs through vl-convert: the root `<svg>` has class `marks`,
  and there is at least one Vega mark group (`<g class="mark-...">`).
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

Every program is measured (`codeStats`, code in
`tests/scripts/llm-bench/codestats.ts`), and a job's statistics are those
of its final program (the last turn with a program; for a chain, each step's
final program, and the job's are the last step's):

- **syntax tokens**, the main size measure: lexical tokens (identifiers,
  keywords, literals, operators and punctuation), without whitespace and
  comments, so line breaking does not change it. JS and JSX use a small
  regex lexer. Python follows its `tokenize` rules, except that an f-string
  counts as one token. R uses a small lexer that follows R's own tokens:
  names may hold `.` and `_`, `1L` and `.5` are numbers, and `<-`, `|>`,
  `::` and every `%op%` (such as `%>%` and `%in%`) are one token each.
- **model tokens**: the program's length in the model's tokens, from the
  Anthropic token-counting endpoint (`messages.countTokens`, which is free
  and is not booked in the ledger). Counts are cached by model and sha256 in
  `tests/tmp/llm-bench/token-cache.json`. Without a key, or offline, it is 4
  characters per token and the column says "(est.)".
- **lines of code**: lines that are not blank and not only comments.
- **arithmetic operators**: `+ - * / % **` (and `//` in Python; `^`, `%%`
  and `%/%` in R), their compound assignments, and every call into the
  language's math library: `Math`, `math`, `np` or `numpy`, and in R, which
  has no math namespace, the base functions that mirror `Math` (`abs`,
  `sqrt`, `exp`, `log`, `floor`, `ceiling`, `round`, the trigonometric
  functions, `min`, `max`, `pmin`, `pmax`, and `pi`) plus `cumsum` and
  `cumprod`, which numpy has as `np.cumsum` and `np.cumprod`. A `+` that
  composes charts is not arithmetic (see below).
- **magic numbers**: numeric literals other than 0 and 1.

The last two measure explicit calculation, which a declarative library
should leave to the library.

Two arms overload an arithmetic operator to compose charts. In ggplot2, `+`
adds layers, scales, labels and themes to a plot; in Altair, `+` layers
charts (and `|` and `&` concatenate them, but those are not arithmetic in
any arm). Such a `+` joins parts of a chart specification and calculates
nothing, so it is not counted. The rule is the same for every arm: a `+` is
composition when its right operand, after any opening parentheses, starts
with a chart part. A chart part is:

- ggplot2: a call to a ggplot component (`ggplot`, `aes`, `geom_*`,
  `stat_*`, `scale_*`, `coord_*`, `facet_*`, `theme` and `theme_*`, `labs`,
  `xlab`, `ylab`, `ggtitle`, `guides`, `annotate`, `annotation_*`, `xlim`,
  `ylim`, `lims`, `expand_limits`, `position_*`, `guide_*`), also as
  `ggplot2::geom_col(...)`, or a `list(...)` of them;
- altair: a chart constructor (`alt.Chart`, `alt.layer`, `alt.hconcat`,
  `alt.vconcat`, `alt.concat`, `alt.repeat`, `alt.LayerChart` and the other
  chart classes);
- in both, a name whose last assignment starts with a chart part
  (`base = alt.Chart(df)`, then `bars = base.mark_bar()`, then `bars + text`;
  `p <- ggplot(df)`, or `my_theme <- theme(...)` and then `p + my_theme`).

The other arms have no operator that composes charts (GoFish, Recharts and
d3 compose with calls, methods and JSX, and Plot layers marks by listing them
in the `marks` array), so every `+` there is arithmetic. The `*` of a
namespace import (`import * as d3`, and Python's `from m import *`) is not
arithmetic either.
Arithmetic inside a string is not seen: a Vega expression such as
`transform_calculate(share="datum.units / datum.total")` counts as one
string token and no operator. The per-arm table shows the mean of each
measure (and the median of the last two). "Code size per task" shows the
mean syntax tokens per task and arm, and "Explicit calculation per task"
the arithmetic operators and magic numbers, each with the reference
solution's in parentheses.

When the run has a context, the section "GoFish context" shows the gofish
arm for all tasks and per group: pass, partial, fail, first-turn pass, mean
turns (repair rounds), mean input tokens (with cache reads and writes) and
how many of them were context, mean output and thinking tokens, mean
latency, mean cost at list price, mean tool calls (skill), and the code
statistics. `compare` prints the same columns across runs.

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
- `screenshot`: the path of the PNG screenshot of the container, at 1 px per
  CSS px, in the same coordinates as the marks. Blending, filters and images
  only exist in the rendered pixels, so checks about them (`imageFill`) read
  this file instead of the marks. `<image>` elements are not marks.

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
Sampling starts where the outline starts: a leading moveto that draws
nothing (d3-hexbin's hexagons move from the bin's center to a corner) is not
a point of the outline, so it is not a corner.

A `rect` drawn by anything other than a `<rect>` element also keeps its
outline, since a shape that fills 95% of its box may still not be a rectangle
(a nearly flat ribbon between two bars, for example). A `wedge` keeps its
outline too: when its straight edges are short (a short bar in a circular bar
chart), its center is fitted less exactly, and a check can measure it again
about a center it shares with other wedges.

A straight segment (a `<line>`, or a path that does not bend) encloses no
area, so its fill is dropped: a `line` mark shows only its stroke, and a
segment with no stroke is not a mark. (Browsers give every shape a black fill
by default, `<line>` included, although it paints nothing.)

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
mosaic, waffle, ragged waffle, ribbon chart, scatter plot of pie glyphs, ridgeline, bottle
fill chart, bottle fill chart from an image, circle packing), which a program has to compose from lower-level
pieces. d3 has circle packing built in (`d3.pack`), and so has the plot arm,
which may import d3; the other arms compute the packing themselves. The
common group also holds annotated charts that every arm can draw but that take
more than one call: bars with value labels, a dashed mean line, a marked and
labeled peak, and a bubble chart sized by area. `"corpus-pilot"` holds the
first 18 tasks built from the chart-type corpus (`corpus/manifest.csv`, see
`corpus/README.md`): one task per chart type, each on a small dataset derived
from the row's pinned source. The per-arm table and the paired comparison are
shown for all tasks and then for each group.

An edit task adds `kind: "edit"`, `base: "<id of a create task>"` and
`mayChange: Aspect[]`. The starting program in each arm is that arm's reference
solution for `base`. An edit is scored twice. **Applied** means its checks
pass. **Preserved** compares the base reference's render with the new render
on every aspect not listed in `mayChange`:

| Aspect   | Must stay the same                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `colors` | the set of colors used by data marks                                                                                                                 |
| `text`   | the set of text strings that are not numbers (tick labels move with any layout change, so they are ignored), without a direction arrow at either end |
| `marks`  | the number of data marks of each kind                                                                                                                |
| `size`   | the largest `<svg>`'s size, within 3%                                                                                                                |

Data marks are rects, circles, wedges and filled paths that are not background
and not hairlines (thinner than 2 px).

Plot writes an axis title with an arrow that points along its axis
(`↑ count` on the vertical axis, `count →` on the horizontal one). When an
edit moves the title to the other axis, the arrow turns but the title stays
the same, so `text` compares the strings without an arrow (`↑ ↓ ← →`) at
either end.

An edit that changes the chart's orientation or swaps its axes lists `size` in
`mayChange`: `edit/bar-to-horizontal` and step 2 of `chain/bars-evolve` (the
category labels move from the bottom axis to the left one), and step 1 of
`chain/scatter-evolve` (the two fields' tick labels and titles trade axes, and
their widths differ). The program keeps its size settings, but a library that
fits the axes inside or around the plot gives a different outer size once the
axis layout changes. Every other edit keeps `size` strict.

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
missing, near-white or transparent. A **background** mark has no ink, or is a
rect (a `<rect>`, or any shape that nearly fills its bounding box) covering at
least 40% of the chart. Wedges, circles and other paths are never background
because of their size, so the biggest slice of a large pie still counts. A **filled shape** is a mark with a non-white fill that is not background and
is at least 2 px thick, or the band a thick stroke paints: an open, unfilled
line or path with a stroke at least 2 px wide counts as the outline of its
centerline widened by the stroke width, in the stroke's color. So a flow
drawn as one thick stroke (a sankey link) is the same band as its filled
outline for the checks that read filled shapes (`alluvial`, `chord`,
`stackedArea`, `signedArea`). Two colors are the **same** when their RGBA distance
(alpha scaled to 0-255) is at most 24.

Values for `bars`, `referenceLine`, `wedges` and `waffle` are either literal
(`values: [3, 1, 2]`) or summed from the task data by category
(`category: "lake", value: "count"`, categories in order of first
appearance, or by their totals with `sort: "asc"` or `"desc"`). Values for
`stackedBars`, `groupedBars` and `ribbons` are summed by `category` and
`series`, both in order of first appearance. `mosaic` sums `value` within each
cell of its `levels`. Field-based values are preferred, since they cannot
drift from the data. A field of ISO dates (`"2017-03-01"`) counts as times,
so a time axis maps it linearly.

A **sequential scale** (`heatmap`, `hexbin`) runs from light for low values to
dark for high ones: judged on the fill as rendered over white (CIE L\*), a
value larger by more than 2% of the range is never lighter by more than 2
units, equal values share a color, and the colors span at least 20 units.
White and near-white fills count here, since the lowest cells may be white.

A **highlight** (`highlight: { where, color }` on `bars` and `points`) picks
items with `where`, a map from field to a value or a `{ min, max }` range
(for field-based bars the items are the categories, for points the rows). It
passes when the picked marks have `color` (a hex color, compared by RGB, so
the chart's opacity may stay) and every other mark shares one other color.

| Check            | Options                                                                                                              | Passes when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bars`           | `orientation`, values, `ordered` (true), `direction` (`"forward"`), `tol` (0.03)                                     | there is one filled rect per value on a shared baseline, with lengths proportional to the values from zero (negative values extend the other way), within `tol` of the largest value plus 1 px. With `ordered`, the bars follow the values' order along the category axis. `"forward"` is left to right, or top to bottom for horizontal bars. Use `"either"` when the task does not fix the direction. With `valueLabels` (`{ decimals }`, default 0), each bar also has a text that reads exactly its value (en-US, with thousands separators), just beyond its end (its near side at most 16 px past the end, and at most 30% of it over the bar) and centered across the bar (within 3 px or 10% of the bar's thickness). With `highlight`, see above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `stackedBars`    | `orientation`, `category`, `series`, `value`, `direction`, `tol`                                                     | there is one stack per category, in order. A stack is a column of rects that touch end to end, and its segment lengths match that category's nonzero values in any stack order. Each series has one color across stacks, and the series' colors differ. Positive values only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `groupedBars`    | `orientation`, `category`, `series`, `value`, `direction`, `tol`                                                     | the bars share a baseline and run in category order, with series order within each category, and their lengths are proportional. Each series has one color, and the series' colors differ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `points`         | `x`, `y`, `colorBy?`, `size?`, `maxRadius?`, `highlight?`, `tol` (0.01), `sizeTol` (0.03)                            | every row has its own circle, centered at a linear image of `(x, y)` with x to the right and y up, within `tol` of the plotted extent (at least 1.5 px). Extra circles, such as legend swatches, are allowed. With `colorBy`, rows with the same value share a color and different values get different colors. With `size`, each circle's area is proportional to the field (radius squared is k times the value, for one k), within 0.5 px plus `sizeTol` of the largest radius; with `maxRadius`, the largest radius is within 25% of it. With `highlight`, see above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `referenceLine`  | values, `orientation`, `at` (a number or `"mean"`), `label`, `dashed?`, `direction`, `tol` (0.03), `lineTol` (0.005) | the bars pass `bars` (ordered), and a straight line across the value axis sits at `at` on the bars' scale (within `lineTol` of the largest value plus 1.5 px), spanning from the first bar's outer edge to the last bar's. With `dashed`, the line has a dash pattern. A text containing `label` is within 30 px of the line and alongside it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `annotation`     | `x`, `y`, `at` (`"max"` or `"min"`), `text`, `near` (30), `tol`                                                      | `lineSeries` finds the line, and at the row with the largest (or smallest) `y` there is a filled circle of radius at least 2.5 px centered on the point (within 1.5% of the plot, at least 2 px), and a text containing `text` whose box is within `near` px of the point.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pieGlyphs`      | `by`, `x`, `y`, `category`, `value`, `tol` (0.01), `placeTol` (0.01)                                                 | there is one complete pie per `by` category (slices around one center whose sweeps add up to 360 degrees within 3, with no hole), centered at a linear image of its `(x, y)` with y up, as `points` places circles. Each pie's slice shares match the shares of `value` by `category` (any order, within `tol`). Each `category` has one color across pies, and the colors differ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ridgeline`      | `category`, `x`, `y`, `overlap` ([1.5, 2.5]), `tol` (0.02)                                                           | each `category` has a filled shape whose top edge, measured up from the shape's own baseline (its lowest edge), passes through the category's `(x, y)` points within `tol` of the tallest peak (at least 2 px). All shapes span the same x range and share one height scale (within 5%). The baselines run top to bottom in category order and are evenly spaced (within 5%, at least 2 px), and the tallest peak is `overlap` times the spacing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `bottleFill`     | `category`, `value`, `max` (100), `tol` (0.02)                                                                       | there is one bottle outline per category, left to right in order: a stroked, unfilled, closed shape that is not a rectangle, all of the same height (within 5%). Inside each, the pixels painted by filled marks (after clip paths and masks) are the liquid. It starts at the outline's bottom, rises to `value / max` of the outline's height (within `tol` plus 1.5 px), keeps at least 99% of its pixels inside the outline (within 1.5 px), and a quarter of the way up it spans at least 85% of the outline's width.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `imageFill`      | `image`, `height`, `color`, `category`, `value`, `max` (100), `levelTol` (3 px)                                      | judged on the screenshot's pixels. The `image` (a file in `assets/`) is drawn `height` px tall at its own aspect ratio once per category, left to right in order, with the bottoms on one line (within 3 px). Each copy is found by its silhouette: at least 90% of the image's opaque pixels are painted, and 90% of its transparent ones do not look like gray glass, so a stretched or resized image, or plain rects, fail. Among the opaque pixels of middle brightness in the image (gray 0.2 to 0.85), the line that best separates the pixels with the hue of `color` (within 12 degrees, chroma at least 40) from the rest is at `value / max` of the height from the bottom (within `levelTol`). Below the level 85% of them have that hue, and above it 85% are gray (chroma at most 30). On each side the rendered brightness follows the image's gray brightness (correlation at least 0.6), so a flat color fails. At most max(4, 1%) of the image's transparent pixels and of the pixels in a 10 px strip on either side have the color, so a rectangle laid over the image fails. A gray line or thin rect in the record lies at the level (within `levelTol` plus 1.5 px) and spans the image's width.                                                                                                                                                                                                             |
| `circlePack`     | `parent`, `leaf`, `value`, `tol` (0.03)                                                                              | there is one circle per leaf (its `value` summed by `parent` and `leaf`) whose area is proportional to the value (radius squared is k times the value, for one k, within 0.5 px plus `tol` of the largest radius). A leaf circle has no circle inside it, and the smallest circle around it is its parent circle. The leaves inside each parent circle are exactly one `parent`'s leaves (matched by their radii), no two leaf circles overlap and no two parent circles overlap (by more than 1 px plus 2% of the smaller radius), and each `parent`'s leaves share one color, distinct from the other parents'. Any packing passes, since positions are not checked. Extra circles (a root circle, legend swatches) are allowed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `lineSeries`     | `x`, `y`, `groupBy?`, `tol` (0.015)                                                                                  | every group (or all rows) has its own stroked line, and under one linear map with y up every row lies on its line, within `tol` of the plot size (at least 2 px), and each line runs in one x direction (it never steps back by more than that tolerance, so points joined out of x order fail). Smoothed curves pass. With `groupBy`, the lines' colors differ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `wedges`         | values, `hole?`, `tol` (0.01)                                                                                        | slices around one center have angular shares matching the values' shares (any order) within `tol`, and every slice has its own color. Works for pies and donuts. `hole: true` also requires a donut (every slice's inner radius is at least 20% of its outer radius), and `hole: false` a pie (at most 5%).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `textIncludes`   | `strings`                                                                                                            | each string appears, ignoring case, inside some text (SVG or HTML).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `distinctColors` | `k`                                                                                                                  | data marks use at least `k` different colors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `sizeAbout`      | `w?`, `h?` (the task size), `tol` (0.25)                                                                             | the largest `<svg>` is within `tol` of the size. This is a loose sanity bound, since GoFish sizes the plot area and the svg grows with axes and legend.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `mosaic`         | `levels` (a list of `{ by, dir, from }`), `value`, `tol` (0.03)                                                      | one rectangle is split recursively, one level per entry of `levels`. Level i splits every cell of the level above along `dir` (`"x"` or `"y"`) into one piece per category of `by`. Each piece is as long as that category's share of the cell's summed `value` (within `tol` of the cell plus 1 px) and spans the cell's full extent the other way. `from` (`"left"`, `"right"`, `"top"`, `"bottom"`) is the side the first category (in order of first appearance) starts at; `"any"` (the default) allows any order. Small gaps between pieces are allowed. The categories of the last level each have one color, and the colors differ. A Marimekko chart is two levels: columns along x, then segments along y. The mosaic is found as a cluster of rects within 3, 12 or 30 px of each other; rects thinner than 1.5 px count only inside a cluster's box, so axis lines drawn as rects stay out.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `waffle`         | `rows`, `cols`, values, `order` (`"any"`), `tol` (0 squares)                                                         | there is a `rows` x `cols` regular grid of equal squares, with no square of the same size on the grid's lattice just outside it (so a bigger grid fails). Each category has its own color on as many squares as its value. With `order: "rows"`, reading the grid row by row from the top-left gives one run of squares per category, in the values' order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `unitBlocks`     | `category`, `value`, `per` (1), `width`, `start` (`"bottom-left"`, ...), `labels`                                    | each category is one block of equal squares, as many as its summed `value` / `per`, all squares on one regular lattice. Blocks run left to right in category order, at least one square apart, with their `start` edges (bottoms for a bottom start) on one line. Each block is `width` squares wide and fills rows away from its `start` corner, each row from that corner's side, so only the last row is partial and its squares sit at that side. One color per block, distinct across blocks. With `labels`, each category's name is centered under its block, at most 40 px below. Squares of another size, and lattice-connected groups that are not a block, are ignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ribbons`        | `orientation`, `category`, `series`, `value`, `direction`, `tol`                                                     | `stackedBars` passes, and for every series and every pair of neighboring stacks there is a filled shape whose cross-section at the first stack's far edge spans the series' segment there, and at the next stack's near edge spans its segment there, within max(2 px, `tol` of the segment). The cross-section is read 3 px and 6 px into the gap and extrapolated to the edge, so the gap must be at least 12 px. The band has the series' color, or its hue is nearer that series' hue than any other's (after compositing over white), so lighter or semi-transparent bands count. One shape may carry several bands.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `signedArea`     | `x`, `y`, `tol`                                                                                                      | `lineSeries` finds one line through the rows, and the area between it and zero is filled. It is probed at each row's `x` (with the row's value; the first and last are stepped 0.75 px inside, with the drawn line's height there) and halfway between neighboring rows on the same side of zero (with the drawn line's height there): one filled shape covers all of 20%, 50% and 80% of the way from zero to the line (so a point marker on the line, which covers only the sample beside it, is not read as the fill), and no fill covers a point just past the line or just past zero on the other side (2% of the largest value, at least 3 px). The fill is one color above zero and one other color below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `heatmap`        | `x`, `y`, `value`                                                                                                    | there is a grid of equal rects, one per row: one column per `x` category left to right and one row per `y` category top to bottom, both in order of first appearance, and the fills follow `value` on a sequential scale (see above). Gaps between cells are allowed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `hexbin`         | `x`, `y`, `radius` (px), `tol` (0.15)                                                                                | the bins are laid out in pixels, as d3-hexbin does. Every six-cornered filled shape is a pointy-top hexagon of `radius` (its width and height within `tol` of √3 `radius` and 2 `radius`), and together they sit on one hexagonal lattice (each center within 1.5 px or 10% of the radius of it) whose spacing is √3 `radius` in a row and 1.5 `radius` between rows (within `tol`). The lattice's offset is read from the hexagons, since d3-hexbin, Plot and matplotlib start their grids at different corners. Some linear x and y scales (y up) then put every row inside a drawn hexagon (the nearest lattice center), leave no hexagon empty, and give counts that the fills show on a sequential scale. The scales are searched on a 2 px grid of the data's pixel extremes, then refined on a 1 px grid; a row within about 1 px of the edge between two hexagons may count for either.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `lollipop`       | `orientation`, values, `ordered` (true), `direction`, `tol` (0.03)                                                   | there is one circle per value, joined by a stem (a line, or a rect at most 4 px thick) along the value axis to one shared baseline and reaching the circle (within its radius). The distances from the baseline to the circle centers are proportional to the values and in order, as `bars` measures bar lengths.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `strips`         | `category`, `value`, `mark` (`"circle"` or `"tick"`), `colorBy?`, `size?`, `tol` (0.01), `sizeTol` (0.03)            | there is one horizontal lane per `category`, top to bottom in order of first appearance, and one mark per row in its category's lane, at a linear image of `value` along x (within `tol` of the plotted extent, at least 1.5 px). A lane is a set of marks whose vertical centers agree within 1.5 px; other lanes (a legend) are skipped. A tick is a vertical line or a rect at most 4 px wide, at least 4 px tall. `colorBy` and `size` as in `points`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `beeswarm`       | `x`, `colorBy?`, `slack` (2 px)                                                                                      | there is one circle per row, all of one radius (within 1 px or 5%), centered within `slack` of a linear image of `x` (fitted to the circles by least squares), so a force layout that settles near the exact positions passes. No two circles overlap by more than 1 px (or 10% of the radius), and every circle off the base line (the height that most circles share, within 2 px) touches another circle (within 1.5 px or 15% of the radius), so random jitter fails. Legend keys are not candidates: small marks with a text label right beside them (within 8 px, the mark's width or 1.5 times the label's height, since a legend may center a small symbol in a wider key box), when at least two such keys line up in a row or column. With `colorBy`, as in `points`, except that circles at the same x may match their rows in any order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `stackedArea`    | `x`, `y`, `series`, `tol` (0.02)                                                                                     | for each `series`, bottom to top in order of first appearance, there is a filled shape whose cross-section at each `x` spans that series' stacked interval (from the sum of the series below it to that sum plus its own `y`), within `tol` of the plot's height (at least 2 px), under one linear map with zero at the bottom. The x scale runs across the shapes' boxes, and the first and last `x` are measured 0.5 px plus 0.2% of the width inside the ends, past the padding some libraries add there (ggplot2's `geom_area` closes each series with a zero 0.1% of the x range outside its ends). The series' colors differ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `radialBars`     | values, `ordered` (true), `tol` (0.03)                                                                               | there are wedges around one center that start at one inner radius, at least 10% of the largest radius. The center is fitted to all the wedges' arcs at once (they are concentric, even when a pad angle offsets the straight edges so they miss the center), starting from the median of the wedges' own centers. A filled shape counts as a wedge when its outline's corners and arc points lie on one or two circles about that center (within 2 px plus 0.5% of the radius) and any outline point between the two circles lies on a straight edge between them (an edge drawn as a polyline, as ggplot2's polar coordinates draw it), also a shape the extractor did not fit as a wedge by itself; each is measured from its outline about the center. There is one wedge per value, the radial lengths (outer minus inner radius) are proportional to the values as `bars` measures lengths, and the angular widths are equal (within 1 degree or 5%). With `ordered`, they run clockwise in the values' order from 12 o'clock (the first may start up to 15 degrees before it).                                                                                                                                                                                                                                                                                                                                               |
| `bullet`         | `category`, `value`, `target`, `ranges`, `tol` (0.02)                                                                | there is one horizontal bullet per row, top to bottom in data order, all on one linear scale from one left baseline. Each has range rects whose right edges fall at each of the `ranges` fields (drawn nested from the baseline or end to end), and the three bands are each their own color. Its bar (the thinnest rect from the baseline, at most 80% as thick as the range rects) runs to `value`, and a vertical line or thin rect at `target` crosses the bar's middle and is at least 90% as tall as the bar. Within `tol` of the largest range plus 1.5 px.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `sunburst`       | `parent`, `leaf`, `value`, `tol` (0.01)                                                                              | there are two rings of wedges around one center, found and measured as in `radialBars` (so a thin wedge whose pad angle throws off its own fitted center still counts). The inner ring has one wedge per `parent` whose angular shares match the parents' summed `value` (matched by share), in distinct colors. The outer ring starts where the inner one ends (within 3 px or 5%) and has one wedge per `leaf`, each inside its parent's angle (within 1 degree); the angular shares of the whole circle of the leaves in each parent match that parent's leaves (in any order). The inner ring may be a pie or a donut.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `waterfall`      | `category`, `value`, `tol` (0.02)                                                                                    | there is one rect per row, left to right in data order, then one for the total. The first row's rect runs from zero to its value, each later row's rect from the running total before it to the running total after it, and the total's rect from zero to the final sum, all on one linear scale with y up (within `tol` of the largest running total plus 1 px). Increases share one color, decreases another, and the first and total rects a third.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `chord`          | `source`, `target`, `value`                                                                                          | the links are undirected. Around one center there is one ring wedge (inner radius at least 60% of the outer) per node, whose angular shares match each node's summed link `value`, in distinct colors, with a text containing the node's name in the direction of its wedge (within 5 degrees). For each link there is a filled ribbon whose outline reaches out to between 80% and 100% of the wedges' inner radius at its two ends; the ends are the two runs of the outline, in drawing order, that stay near that radius (between them the outline dips toward the center, however close the two ends sit). One end lies within each node's angle (within 1 degree), and each end spans the link's `value` on the wedges' angular scale (within 2 degrees or 8%).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `dendrogram`     | `name`, `parent`, `height`, `tol` (0.01)                                                                             | the tree is drawn with its root at the top. Each leaf has a text reading its name, with a vertical line standing over the text's box (so a label rotated about its end also counts; of the lines over the box, the one reaching lowest, then the one nearest the box's middle); the leaves stand on one baseline (height 0). Every other node is at the middle of its children, and its elbow is drawn on one linear height scale: a horizontal line at its height across its children and a vertical line from each child up to it. Every sampled point of these lines is within max(2 px, `tol` of the tree's height) of a drawn line or stroke. The lines may be drawn in pieces.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `alluvial`       | `steps`, `value`, `tol` (0.05)                                                                                       | there is one column of node rects per step (the fields in `steps`), left to right. A node rect may be filled or only outlined, and a rect drawn inside another in its column (a ribbon's slice through an outlined node) belongs to the outer one. A column holds one rect per category, top to bottom in order of first appearance (gaps allowed), with heights proportional to the categories' summed `value` on one scale for every column. Ribbons run through the middle columns. In each gap, a band leaves one node and reaches one node and is as thick at both ends (within 2 px or 5%); its cross-sections are read 3 px and 6 px into the gap and extrapolated to the edge, as in `ribbons`, so the gap must be at least 12 px. Each middle node is cut at every end of a band that arrives or leaves, and each slice goes from the band arriving there to the band leaving there. Every slice of an arriving band leaves toward one node, and every slice of a leaving band came from one ribbon, so a ribbon keeps its slot through the node; a re-aggregated sankey or swapped slots fail. The slices of each (previous, this, next) combination add up to its summed `value` (within 2.5 px or `tol` of it), and every piece of a ribbon has its first step's color, one color per first-step category. One path per ribbon, one path per gap, and a ribbon split into several side-by-side bands (lodes) all pass. |
| `spine`          | `category`, `series`, `value`, `tol` (0.03)                                                                          | horizontal bars stand on one shared baseline, one pair per `category`, top to bottom in order of first appearance. The first `series` extends left and the second right, lengths proportional to `value` (both sides' scales within `tol`), and the two bars of a pair are centered on one line. Each series has one color, and they differ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

The checks were tried against throwaway programs in the first four arms before any
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
and a 5 x 20 grid. `unitBlocks` fails blocks padded out to full rows (in d3
and matplotlib), one square too many, the partial row on the right, rows
filled from the top down (hanging from a line, or bottom-aligned with the
partial row at the bottom, as GoFish draws without `reverse`), a
column-by-column fill, blocks in reverse order, one color, blocks with no gap
between them, staggered baselines, and labels above the blocks. `ribbons` fails plain stacked bars (in GoFish and d3),
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
`circlePack` fails radius proportional to the value (d3 and matplotlib),
leaves drawn 25% too big, leaves packed with negative padding inside parents
drawn big enough to hold them (the leaves overlap by 6 px), parents drawn 20%
too big (they overlap), one leaf moved out of its parent, one color (d3 and
GoFish), a flat bubble pack with no genre circles, the same pack inside one
root circle, Recharts leaves with the genre circles left unpainted, and
GoFish's two nested treemaps with circle marks (circles inscribed in treemap
cells, with no parent circles).

`imageFill` was tried on variants of the `create/bottle-image` references,
mostly in d3. It fails a plain green rect over the gray image (d3 and
matplotlib: flat color, and it covers the neck's sides), the blended rect
without the alpha mask (d3 and Recharts: the color spills past the neck), a
rect 20 px wider than the image, a level 10% short, a level 5 px high, the
whole bottle colored, gray and green rects with no image, `#4caf50` (hue 122
instead of 145) and blue instead of `#00c853`, the image stretched to 1.5
times its width, the image 10% too tall, the image left in its own green
(no grayscale), a flat color masked to the bottle (no blend), bottles in
reverse order, and GoFish's `layer` in place of `paint`. It passes the
gallery's 175 px wide rect inside GoFish's `paint` (the image's alpha clips
it), and a tint that multiplies the gray instead of the "color" blend (d3
`mix-blend-mode: multiply`, and in matplotlib), since that also keeps the
glass's shading.

The `create/bottle-image` references composite in two ways. The JS arms
draw vector SVG and let the browser composite: the image with a grayscale
filter, then a rect in the liquid color with `mix-blend-mode: color`, masked
by the image's alpha (`mask-type: alpha`), in a group with `isolation:
isolate` (GoFish's `paint` lowers to the same structure). matplotlib has no
blend modes, so its reference composites in numpy (the W3C "color" formula
on the image's pixels below the level) and shows the result with `imshow`;
the SVG then embeds a raster, resampled by matplotlib. Headless Chromium
renders the blend and the alpha mask as a desktop browser does.

The corpus-pilot checks were tried the same way, on variants of the d3
references (`tests/tmp/neg-pilot/`, not committed), and every variant failed
as it should. `signedArea` fails one color above and below zero, the area
filled down to the plot's bottom, no fill, and bars from zero under the line
(they miss the halfway probes). `heatmap` fails a reversed (dark to light)
scale, a rainbow scale, the rows sorted alphabetically, and the columns in
reverse order. `hexbin` fails hexagons of the wrong radius (15 px for 25),
flat-top hexagons, empty bins drawn, a reversed scale, one color, square
bins, and one hexagon per film (no binning). `lollipop` fails lollipops in data order, circles
without stems, a log scale, and stems that stop short of circles moved 20 px
out. `strips` fails vertical jitter, months in reverse order, dots colored by
month instead of sub-category, dots where ticks were asked for, a
square-root x scale, rows sorted alphabetically, radius proportional to sales,
a square-root radius that starts at 4 px, and rows in reverse order. `beeswarm`
fails all circles on the center line (they overlap), a jitter that leaves
circles floating, x moved by the swarm offset, radius by budget, and one
color. `stackedArea` fails overlapping areas from zero, the series in reverse
order, a 100% stack, and a streamgraph. `radialBars` fails a square-root
radial scale, counterclockwise order, bars from the center, bars from 3
o'clock, and outer radius (not length) proportional to the value, and passes
bars drawn with a pad angle (Vega's `padAngle`) and Recharts' 15% category
gap. `stackedArea` passes ggplot2's padded `geom_area`, and `beeswarm` passes
Recharts' default circle legend icons. `bullet`
fails no target line, a bar as thick as the bands, bands laid end to end with
the wrong widths, the target at the sales value, and one gray. `sunburst`
fails equal region angles, angles by the number of subregions, the outer ring
alone, and the outer ring turned by 0.2 radians. `waterfall` fails running
totals from zero, no total bar, the changes drawn from zero, and totals in the
increase color. `chord` fails equal node angles, link counts moved to other
links (the node shares still match, but the labels then name the wrong
wedges), stroked lines instead of ribbons, and ribbons narrowed to a fixed
width. `dendrogram` fails straight links, heights by level, no leaf labels,
and nodes centered over their leaves instead of their children. `alluvial`
fails a sankey (the flows between survival and gender added up per pair and
colored by survival), ribbons that trade slots inside the survival nodes,
the second gap colored by survival, 3 px ribbons, equal node heights, nodes in
reverse order, and flows sent to the wrong target. It passes the ribbons drawn
as one path each, as one path per gap, split into two half-thickness
lodes, and d3-sankey's links drawn as thick strokes (`sankeyLinkHorizontal`
with `stroke-width`), in the d3 and plot arms. `hexbin` passes d3-hexbin's
`hexbin.hexagon()` paths, which start at the bin's center, `Plot.hexbin` on
`Plot.dot` with only `binWidth` set, and matplotlib's `hexbin` over the
data's own extent. `beeswarm` also passes a d3 force layout (`forceX` to the
year with strength 2, `forceY` to the center line, `forceCollide`), whose
circles settle up to 1.4 px off their years, and `ggbeeswarm` with its point
size matched to the panel. It fails the same force layout with strength 1
(up to 3.4 px off; d3's default strength 0.1 moves circles up to 6.4 px), and
`ggbeeswarm` with its default spacing assumptions, whose swarm is too loose
(circles off the line that touch nothing) or too tight (circles overlapping
by 1.7 px to 6.4 px for `cex` 1 to 4), since its point size is a share of each
scale's range rather than pixels. `spine` fails both bars to the right, Men on the left, the
Women side scaled 1.3 times, and the two bars of a row offset by half a band.
The `bars` highlight of `create/diverging-bar` fails red on the positive bars.

## Known limitations

- Smooth gradient and pattern fills all read as one gray, so they cannot be told apart. A linear gradient with hard stops (color constant between stops, as Recharts uses to color an area above and below zero) is read as one copy of the shape per color band, each clipped to its band.
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
- `waffle` and `unitBlocks` need square rects. A grid of circles or rounded
  dots fails.
- `imageFill` reads pixels, so it needs a white background around the images
  and a gap between neighboring images (it finds them as runs of tall
  painted columns). It judges hue only on the image's pixels of middle
  brightness, where a tint shows, and accepts any tint that keeps the hue and
  follows the shading, such as a multiplied one. A tint that leaks outside
  the shape by less than 1% of the transparent pixels passes.
- `ribbons` needs a gap of at least 12 px between neighboring bars. A band
  drawn as one path with several separate pieces is read as one outline, which
  can join the pieces with a false edge.
- `waffle` and `unitBlocks` read squares from separate rects. Plot's own
  waffle marks (`Plot.waffleY`, `Plot.waffleX`) draw each series as one
  shape filled with a pattern of squares, which the record reads as one
  gray path. `Plot.waffleY(data, { x: "lake", y: "count", fill: "lake",
multiple: 5 })` draws the ragged waffle the task asks for, and fails
  `unitBlocks`. The plot references draw one rect per square instead.
- The gofish and plot provenance checks only see elements created by
  `createElementNS`, `cloneNode` or `importNode`. Markup parsed from a string
  counts as the program's own, so `container.innerHTML = await
chart(...).toSVG()` breaks the contract, although appending
  `toSVGElement()`'s result does not.
- `bars` checks lengths and order, not widths or positions along the category
  axis. A histogram whose first and last bins are drawn narrower than the
  others (for example, clipped to the data's range) still passes if the
  counts are right.
- `heatmap`, `hexbin` and the other checks read shapes, so a heatmap drawn
  as one raster image (matplotlib's `imshow`, which the SVG embeds as an
  `<image>`) has no cells to find and fails. `pcolormesh` and seaborn's
  `heatmap` draw one shape per cell and should pass, but no matplotlib
  reference has been written for the corpus-pilot tasks yet.
- `strips` places marks by x only and takes lanes in order, so categories with
  the same x values (the dates of `create/circle-timeline`) are told apart by
  their lane order, sizes and colors.
- `chord` finds each ribbon's ends at its largest radius. A ribbon drawn with
  ends at different radii, or one outline that joins several ribbons, is not
  read.
- `beeswarm` asks that every circle off the base line touches another, so a
  force-directed layout whose circles settle with gaps (instead of resting
  against each other, as RAWGraphs' 1 px collision padding leaves them) can
  fail it. It allows each circle 2 px off its year, which a force layout
  meets only with a strong pull toward the year (see above).

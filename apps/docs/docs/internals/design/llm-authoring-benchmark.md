---
title: "An LLM Authoring Benchmark for GoFish"
section: Speculative Notes
order: 64
status: speculative
---

# An LLM authoring benchmark for GoFish

**Reading guide.** This note is about a benchmark that measures how well a language model
can create, edit and animate visualizations with GoFish, compared with the approaches people
use today, e.g., Recharts or Matplotlib. It is a design-space document, not a plan. Section 1
defines terms. Section 2 lists the questions the benchmark should answer. Section 3 surveys
existing benchmarks and what to take from each, and which libraries people and language
model products use today. Section 4 lays out the design choices, one
axis at a time. Section 5 covers using the benchmark to write and tune a GoFish skill for
language models. Section 6 lists the ways the results could be biased. Section 7 describes
the parts of this repo a benchmark can reuse. Section 8 collects open questions.

The short version:

- Many benchmarks exist for charts, diagrams and web pages, and a few of them compare
  libraries. None of them holds the task set fixed while assigning the language, across
  declarative and imperative libraries. None of them reports how many turns or tokens a
  model needs to succeed in each language. A GoFish benchmark that does both would be new.
- The strongest scoring method in the literature checks facts about the rendered output,
  e.g., "there are 9 bars and the tallest is Adelie", rather than asking a model whether two
  pictures look alike. GoFish already produces a flat, positioned list of shapes (the display
  list), so the GoFish side of this is cheap. The other libraries need an adapter that reads
  facts out of their SVG.
- Every edit should be scored twice. One score says whether the requested change happened.
  The other says whether everything else stayed the same. Several 2025 and 2026 diagram
  benchmarks do this, and it is the part of the benchmark where GoFish's composable API
  should show the largest difference.
- The comparison should be against what people and language models use today, not against
  research libraries. The chat products that write React (Claude artifacts, ChatGPT canvas,
  Gemini canvas, v0) all default to Recharts, and it is the most downloaded chart package on
  npm. The Python sandboxes in ChatGPT and Claude default to Matplotlib. Vega-Lite has about
  1.5% of Recharts' npm downloads, so it is not the main comparison.
- Animation should be its own track. The libraries to compare against are D3 transitions,
  ECharts, GSAP and Plotly's animation frames. Recent animation benchmarks score motion by
  sampling object positions at fixed times, and GoFish's capture harness already runs on a
  fake clock, so the same approach fits here.
- Models have seen far more Matplotlib than GoFish. The benchmark has to treat "what
  documentation is in the prompt" as an experimental condition, and it has to charge the
  tokens for that documentation to GoFish.
- The same harness can drive the design of a GoFish skill. Doing that safely needs a task
  split with a held-out set that is scored rarely, or the skill will be tuned to the tasks.

## 1. Terms

- **Arm.** One way of producing a visualization that the benchmark compares, e.g., "GoFish
  JS with the API reference in the prompt" or "Matplotlib with no docs".
- **Task.** One unit of work: a dataset, a starting program (for edits and repairs), an
  instruction, and a set of checks.
- **Check.** A yes-or-no test on the rendered output, e.g., "the bars are stacked along y".
- **Applied score and preserved score.** For an edit, the applied score is the share of
  checks for the requested change that pass. The preserved score is the share of the
  starting chart's properties that are unchanged when they should be unchanged.
- **Display list.** The flat JSON list of positioned shapes that `toDisplayList()` returns.
  Each item has absolute pixel geometry, resolved styles and a link back to its data row.
- **Turn.** One model response followed by one render. A render error or a failed check can
  be sent back to the model as the input to the next turn.
- **Contamination.** The model has seen a task or its answer during training, so a high
  score may be memory rather than skill.

## 2. What the benchmark should tell us

1. Given the same task, how often does a model produce a correct visualization in GoFish,
   and how does that compare with the other arms?
2. How much work does it take? This means turns, input and output tokens, and wall-clock
   time per solved task.
3. For edits, does the model change what was asked and leave the rest alone? Does this hold
   across a chain of several edits?
4. How much of the gap comes from training data rather than from the API? The test is
   whether the gap closes when every arm gets good documentation in the prompt.
5. Which kinds of task are hard in GoFish, so that we can fix the API, the docs or the
   skill?

Questions 1 to 3 are the headline comparison. Questions 4 and 5 are what the maintainers
use.

## 3. Existing benchmarks

The table groups the benchmarks by what they test. Links go to the paper or repository.
Items marked "unverified" were not confirmed from a primary source when this note was
written.

### Text to chart

| Benchmark                                                                            | Size                               | Languages                                                         | How it scores                                                                                          | What to take                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [nvBench](https://github.com/TsinghuaDatabaseGroup/nvBench) (SIGMOD 2021)            | 25,750 pairs                       | Vega-Lite via a query tree                                        | exact match to one answer                                                                              | Avoid. One gold answer ignores ambiguous prompts, and it is built on Spider, which models have seen.                                                             |
| [nvBench 2.0](https://arxiv.org/abs/2503.12880) (NeurIPS 2025)                       | 7,878 queries, 24,076 valid charts | Vega-Lite                                                         | precision and recall against a set of valid answers                                                    | Use a set of valid answers when a prompt is underspecified.                                                                                                      |
| [VisEval](https://github.com/microsoft/VisEval) (VIS 2024, MIT)                      | 2,524 queries                      | Matplotlib, Seaborn                                               | runs, then reads data and chart type back out of the SVG, then readability checks plus a GPT-4V rating | The closest precedent for checks on the rendered output. Every model did worse on Seaborn than on Matplotlib.                                                    |
| [PandasPlotBench](https://github.com/JetBrains-Research/PandasPlotBench) (JetBrains) | 175 tasks                          | Matplotlib, Seaborn, Plotly                                       | GPT-4o judge against a reference, failure rate, seconds per task                                       | The same tasks across three libraries. About 22% of Plotly code failed. Closest template for "GoFish vs X".                                                      |
| [VisPlotBench](https://arxiv.org/abs/2510.23642) (VisCoder2)                         | 888 tasks                          | Python, Vega-Lite, Mermaid, LaTeX, HTML, SVG, Asymptote, LilyPond | pass rate, LLM task and visual scores, up to 3 repair rounds                                           | The nearest multi-language harness. Less familiar languages gained the most from repair rounds, so report first try and after repair. Tasks differ per language. |
| [Text2Vis](https://github.com/vis-nlp/Text2Vis) (EMNLP 2025)                         | 1,985 samples                      | Python                                                            | execution, answer match, GPT-4o ratings                                                                | Reports how often the judge gives the same answer twice, and uses a second judge.                                                                                |
| [MatPlotBench](https://github.com/thunlp/MatPlotAgent) (ACL Findings 2024)           | 100 cases                          | Matplotlib                                                        | GPT-4V score                                                                                           | Shows that a loop where a model looks at its own render helps.                                                                                                   |

### Image to code

| Benchmark                                                         | Size  | How it scores                                                                           | What to take                                                   |
| ----------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [ChartMimic](https://arxiv.org/abs/2406.09961) (ICLR 2025)        | 4,800 | GPT-4o score plus F1 on text, layout, chart type and color                              | Element-level F1. GoFish can compute it from the display list. |
| [Plot2Code](https://arxiv.org/abs/2405.07990)                     | 368   | pass rate, text match, GPT-4V                                                           | Models lean on the text instruction more than the image.       |
| [Design2Code](https://github.com/NoviScl/Design2Code) (web pages) | 484   | block match, text, position, color, CLIP, human                                         | Break "looks right" into separate measurable parts.            |
| [DesignBench](https://github.com/WebPAI/DesignBench) (web pages)  | 900   | generate, edit and repair across React, Vue, Angular and HTML (edit scoring unverified) | The three-task split and the per-framework comparison.         |

### Chart editing

| Benchmark                                                            | Size                    | Setup                                                         | What to take                                                                                                                                 |
| -------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [ChartEdit](https://github.com/xxlllz/ChartEdit) (ACL Findings 2025) | 1,405 instructions      | image plus instruction, no source code                        | Avoid the no-source setup. It measures image to code, not editing.                                                                           |
| [ChartEditBench](https://arxiv.org/abs/2602.15758)                   | 4,142 chains of 6 edits | Matplotlib; each turn starts from the model's own last output | Edit chains. Scores fell 20 to 33% from turn 1 to turn 5. Checks are assertions where the instruction can be checked, and a judge otherwise. |
| [ChartE³](https://arxiv.org/abs/2601.21694)                          | 1,200+ instructions     | Matplotlib and Vega-Lite renders                              | Local edits are easier than global and data edits. Uses image metrics, which we should avoid.                                                |
| [ChartM³](https://github.com/MLrollIT/ChartM3) (ACM MM 2025)         | 1,000                   | text plus marks drawn on the chart                            | Instructions that point at an element. Out of scope at first.                                                                                |

### Diagrams and vector graphics

| Benchmark                                                                                | Size                   | Languages                | What to take                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | ---------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [DiagramGenBenchmark](https://github.com/DiagramAgent/DiagramAgent_official) (CVPR 2025) | under 1K               | LaTeX, DOT               | Generate, code and edit tracks. Avoid its code-similarity metrics, which penalize equivalent programs.                                                                       |
| [OmniDiagram / M32Bench](https://github.com/Haoyue-Yang/OmniDiagram) (ACL Findings 2026) | 1,700                  | LaTeX, Mermaid, PlantUML | A model answers questions written for each diagram about its render. Edits get a task score and a preservation score. Mermaid syntax errors did not drop with larger models. |
| [EdiTikZ](https://arxiv.org/abs/2609.01409)                                              | 690 edits              | TikZ                     | Edit applied and source preserved as separate scores. Tasks come from revisions made after model training, which avoids contamination.                                       |
| [Edit2TikZ](https://github.com/Solunny/Edit2TikZ)                                        | 1,548                  | TikZ                     | A restoration score for what should not change.                                                                                                                              |
| [VGBench](https://arxiv.org/abs/2407.10972) (EMNLP 2024)                                 | 5,845 generation pairs | SVG, TikZ, Graphviz      | One task type across several formats. Models are weakest at raw SVG.                                                                                                         |
| [Math-Vision Diagrams](https://arxiv.org/abs/2608.08964)                                 | 2,920                  | TikZ, SVG, Matplotlib    | Avoid its design. The model appears to choose the language, which confounds the comparison.                                                                                  |
| [vTikZ](https://arxiv.org/abs/2505.04670) (EASE 2025)                                    | unverified             | TikZ                     | Checks that accept a range of correct outputs instead of one gold program.                                                                                                   |

### Animation

| Benchmark                                                 | Size                     | Target             | How it scores motion                                                                                                   | What to take                                                                                                                                      |
| --------------------------------------------------------- | ------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MoVer](https://arxiv.org/abs/2502.13372) (SIGGRAPH 2025) | 5,600 prompts            | GSAP animating SVG | Records each object's transform at every frame. A logic program checks direction, timing, order and relative position. | The closest precedent for checks on facts over time. Models passed 58.8% on the first try and 93.6% after up to 50 rounds of checking and fixing. |
| [Animation2Code](https://arxiv.org/abs/2606.28593)        | 1,069 CodePen animations | HTML, CSS and JS   | Steps animations frame by frame in headless Chromium with fixed timing, then compares appearance and motion paths.     | The harness technique. Motion scores were at most 0.31 while appearance scores reached 0.84, so models get the look right and the motion wrong.   |
| [PRISM](https://arxiv.org/abs/2605.19382)                 | 10,372 instructions      | Manim              | Instruments the renderer and checks overlap and out-of-bounds shapes in every frame from exact coordinates.            | Rejects model judges for small errors in space and time. About 41% of programs that ran still failed the layout checks.                           |
| TheoremExplainBench (TIGER-Lab, ACL 2025)                 | 240 theorems             | Manim              | Model or human ratings on five dimensions.                                                                             | Only for long explainer videos. Ratings, not checks.                                                                                              |
| [ManiBench](https://arxiv.org/abs/2603.13251)             | 12 problems              | Manim              | Keyword matching on the source code.                                                                                   | Avoid. The authors say it cannot tell whether the animation is correct.                                                                           |
| MMLottieBench (OmniLottie, 2026)                          | 900                      | Lottie             | Video metrics and a model judge.                                                                                       | Avoid the video metrics as a main score.                                                                                                          |

The approach these benchmarks share is to control time, sample the scene at fixed moments,
and check facts about each object in each sample. Section 4.6 applies this to GoFish.

### Human preference

[WebDev Arena](https://news.lmarena.ai/webdev-arena/) and
[UI-Bench](https://arxiv.org/abs/2508.20410) rank outputs by blinded pairwise votes. UI-Bench
asks professional designers which output they would ship and reports ratings with
confidence intervals. This is an option for a small side study, not the main score.

### Learning an unfamiliar library from the prompt

- [Patel et al., NAACL 2024](https://arxiv.org/abs/2311.09635) found that models can learn a
  new library from a description or source code in the prompt. This supports a "docs in
  the prompt" arm.
- [CodeUpdateArena](https://arxiv.org/abs/2407.06249) found that open models kept using the
  old API even when the updated docs were in the prompt. This matters if GoFish looks like
  an older API, or if older GoFish syntax is in training data.
- [DocPrompting](https://arxiv.org/abs/2207.05987) roughly doubled recall of unseen function
  names by retrieving docs. [Grammar Prompting](https://arxiv.org/abs/2305.19234) found that a
  short grammar in the prompt helps models write a new language.

### Code editing method

- [Aider](https://aider.chat/docs/more/edit-formats.html) found that the edit format is a
  large effect. For one model, switching from search-and-replace blocks to unified diffs
  raised a refactoring score from 20% to 61%. It also reports how often a model's edit
  cannot be applied.
- [CanItEdit](https://arxiv.org/abs/2312.12450) writes each task twice, once with a full
  instruction and once with a short, lazy one. It also counts changed lines that the task
  did not ask for.
- ["Edit, But Verify"](https://arxiv.org/abs/2604.05100) audited two editing benchmarks. In
  59% of weak test suites, a change outside the edit region would not be caught. It
  recommends explicit checks that the rest of the program still behaves the same.
- SWE-bench splits tests into ones that must start passing and ones that must keep passing.
  The applied and preserved scores in this note follow the same logic.

### LLM judges on charts

[ChartJudgeBench](https://arxiv.org/abs/2609.24210) tested 26 model judges on charts. Some
judges picked the first image 99.9% of the time. Open models accepted flawed charts. The
best judge was right 75.6% of the time on chart reproduction.
[VisJudge-Bench](https://arxiv.org/abs/2510.22373) found that GPT-5's quality ratings
correlated with experts at r = 0.428. Image similarity metrics, e.g., SSIM or CLIP score,
give high scores to charts with clear local errors. So a judge can be a supporting signal,
but the main score should come from checks.

### Statistics

Miller, ["Adding Error Bars to Evals"](https://arxiv.org/abs/2411.00640), recommends
standard errors on every score, paired differences when two conditions run on the same
tasks, clustered standard errors when tasks come in groups, and a power analysis up front.
Clustered errors can be three times larger than naive ones. Code benchmarks use pass@k with
the unbiased estimator from the Codex paper.

### What people and language models use today

The numbers below were pulled on 2026-09-25. Download counts include installs pulled in by
other packages, so the order between libraries means more than the size of each number.

**JS chart packages, weekly npm downloads.** Recharts 54.9M, D3 19.4M, Chart.js 11.7M,
visx 4.9M, ECharts 4.8M, Highcharts 2.3M, ApexCharts 1.9M, Nivo 1.5M, Vega-Lite 0.84M,
Plotly.js 0.68M, Observable Plot 0.61M. Recharts is likely inflated because shadcn/ui and
app-building tools add it to new projects.

**The State of React 2025 survey** asked 2,583 people which chart library they use. The
counts were Chart.js 1,245, D3 1,037, Recharts 969, Highcharts 437 and ECharts 207
([results](https://2025.stateofreact.com/en-US/libraries/component-libraries/)).

**Python packages, monthly PyPI downloads.** Matplotlib 156M, Plotly 49M, Altair 37M, Seaborn
26M, Bokeh 5.2M, plotnine 2.3M. Most Altair downloads come from Streamlit, which depends on it.

**Diagram packages, weekly npm downloads.** Mermaid 15.0M and React Flow 10.9M. Cytoscape
has 15.2M, but most of that comes from Mermaid, which depends on it. Graphviz
has 32.8M monthly PyPI downloads, mostly pulled in by machine learning tools.

**Animation packages, weekly npm downloads.** Motion (formerly Framer Motion) 63M combined,
Lottie 7.1M, GSAP 4.7M, Remotion 1.5M, anime.js 1.0M. D3's transition module has 29M, mostly
pulled in by other packages. On PyPI, Manim has about 116K monthly downloads, and it is the
target of nearly every published animation benchmark.

**What language model products default to.** Most of this comes from system prompts that
leaked and were widely reported, so it may have changed since.

- Claude artifacts can import Recharts, D3, Plotly, Chart.js and Three.js, and no other
  chart libraries ([reported prompt](https://simonwillison.net/2025/May/25/claude-4-system-prompt/)).
- Claude's code execution sandbox has Matplotlib and Seaborn installed, and no internet
  access ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool)).
- ChatGPT's Python tool is told to use Matplotlib, never Seaborn, and never to set colors
  ([reported prompt](https://github.com/edoardoavenia/chatgpt-system-prompts/blob/main/python.md)).
- ChatGPT canvas, Gemini canvas, v0 and Lovable all name Recharts for charts. shadcn/ui
  charts are built on Recharts ([docs](https://ui.shadcn.com/docs/components/base/chart)).
- Gemini's widget prompt names D3 for data and anime.js for motion.
- Twist et al., ["LLMs Love Python"](https://arxiv.org/abs/2503.17181), found that models
  chose Matplotlib for 57% of plotting problems and Seaborn for 17%, when no library was named.

So the default today is Recharts in JS and Matplotlib in Python, with D3 for anything custom.

**Canvas or SVG.** Checks that read facts from SVG work for Recharts, D3, Plotly (2D),
Highcharts, ApexCharts, Nivo, visx, Mermaid, Graphviz, GSAP and Motion, and for Matplotlib
saved as SVG. ECharts draws to canvas by default and has an SVG mode. Chart.js and Cytoscape
draw only to canvas. For those, facts have to come from the library's own state, e.g.,
`chart.getDatasetMeta()` in Chart.js, or from the pixels.

**Licenses.** Highcharts is free only for personal and non-commercial educational use.
ApexCharts is free for companies under $2M in revenue. Remotion needs a company license for
teams larger than three people. The rest of the libraries named here are open source.

## 4. Design choices

Each subsection is one choice. Options are listed with their tradeoffs.

### 4.1 Arms

"The default approach" can mean several things, and the answer changes what the benchmark
claims.

- **A. A fixed list of libraries.** Each task runs in each library. This gives a clean
  comparison per library.
- **B. Model's choice.** The model gets the task and no library requirement. This is what a
  user who does not know GoFish gets today. It is a useful reference line, but it cannot be
  compared task by task, because the model picks a different library per task.
- **C. A mix.** Run A as the main comparison and B as one extra arm.

To make the strongest case against GoFish, the fixed list should be the libraries people
and language model products use most (section 3), not the ones closest to GoFish in design.
A candidate list per track:

- **JS charts.** Recharts, because it is the default of every chat product that writes
  React and the most downloaded chart package. D3, because models use it for anything
  custom. Chart.js, because it leads the State of React survey. ECharts, because it has the
  most built-in animation. Plotly.js is optional, and it links to the Python track.
- **Python charts.** Matplotlib, because it is the default in both ChatGPT and Claude.
  Plotly, because it is second by downloads and has animation frames. Seaborn, because it is
  installed in Claude's sandbox. Altair is optional as the closest peer in design.
- **Diagrams.** Mermaid, because models write it for flowcharts by habit. Graphviz, because
  it is common in both Python and JS. D3 or hand-written SVG, because that is what Claude and
  Gemini artifacts produce for custom explainers. React Flow is optional.
- **Animation.** D3 transitions as the standard keyed enter, update and exit approach.
  ECharts for declarative chart animation, including bar chart races. GSAP for general motion
  graphics, and it is the target of MoVer. Plotly Express `animation_frame` as the Python
  default. Manim for math explainers only, since it needs its own Python harness.

Vega-Lite and Observable Plot move to optional arms. They are already dependencies of
`apps/docs`, and they are the closest peers in design, but few people use them compared with
the list above. Highcharts is popular but has a commercial license, so it is only an option
if the benchmark counts as non-commercial educational use.

Some arms render to canvas. Chart.js is the main one. Its facts have to come from its own
chart state or from pixels, which is a different check from the SVG adapter. The benchmark
should report this per arm rather than converting canvas output to SVG, since a conversion
step can add its own errors.

Some diagram tasks will not have a natural version in every library. A Python Tutor memory
diagram has no natural Mermaid version, so some diagram tasks will only have GoFish, D3 and
SVG arms.

### 4.2 Context in the prompt

Models have far more Matplotlib in their training data than GoFish. Without docs, the
benchmark mostly measures that. Options for what goes in the prompt:

- **None.** Shows the starting point.
- **An API reference.** Generated from `packages/gofish-ir/src/frontend/descriptors.ts` and
  `docs/descriptions/*.json` for GoFish, and the equivalent reference for each other
  library.
- **Reference plus worked examples.** The gallery snippets that the docs build already
  extracts from stories.
- **A skill.** A written guide for models, tuned with this benchmark (section 5).
- **An agent with doc access.** The model can search and read the docs as tools.

The fair comparison gives every arm the same kind of context. The tokens for the context
count toward the arm's cost. If GoFish needs 20,000 tokens of docs to match Matplotlib with
none, users pay for that on every call, and the benchmark should say so.

### 4.3 Tasks

**Task kinds.**

- **Create.** A dataset plus an instruction.
- **Edit.** A working program in the arm's language, its render, and one instruction.
- **Edit chain.** Several dependent edits, where each step starts from the model's own
  previous output, as in ChartEditBench. This is where a composable API should help most,
  and it is also where models degrade most.
- **Repair.** A broken program plus the error message, or a program that renders the wrong
  thing plus a description of the problem.
- **Animate.** A dataset with a time field plus an instruction, e.g., "animate this scatter
  plot over the years, and keep each country's point moving smoothly from year to year".
  Or a static chart plus an instruction to animate it, e.g., "turn this bar chart into a bar
  chart race". Animation tasks can also be edits, e.g., "fade new bars in instead of growing
  them" or "play the years twice as fast".

**Edit types.** A fixed list lets us report results per type. A starting list:

- change how data is grouped, e.g., group by island instead of species;
- change the layout, e.g., stack the bars instead of placing them side by side;
- change the coordinate system, e.g., turn a bar chart into a pie chart;
- split into small multiples;
- add or change labels and annotations;
- change color encoding or palette;
- reorder or filter the data;
- change a diagram's structure, e.g., add a node and connect it.

**Where tasks come from.**

- **Written for this benchmark.** Least contamination, most work.
- **The GoFish gallery.** 88 entries, and the docs build already produces a standalone
  snippet for each one. These are good reference solutions for the GoFish arm. They are
  also the tasks GoFish was designed around, so using only these favors GoFish.
- **The Vega-Lite ports.** `stories/vega-lite/*` are GoFish ports of the Vega-Lite gallery,
  so each one already has a Vega-Lite answer and a GoFish answer. Models have likely seen
  the Vega-Lite side.
- **The animated stories.** Gapminder, the bar chart race and the bird migration panels are
  GoFish versions of well-known animations. Gapminder and the bar chart race also have
  well-known D3 and Flourish versions to compare against.
- **Slices of existing benchmarks.** A sample of PandasPlotBench or nvBench 2.0 tasks, used
  unchanged. This protects against choosing tasks that suit GoFish. For animation, a sample
  of MoVer prompts could play the same role for the GSAP arm.

**How specific the prompts are.**

- **Fully specified.** Every encoding is stated. There is one correct answer up to style,
  so checks are easy to write.
- **Underspecified with a set of valid answers.** Closer to how people talk. Needs a set of
  valid answers per task, as in nvBench 2.0.
- **Both versions of each task,** following CanItEdit. This shows whether an API tolerates
  short instructions.

### 4.4 The loop

- **One shot.** One response, one render. Measures what the model knows.
- **Fixed repair budget.** Up to N turns, where each failed render or failed check goes back
  to the model. Report success after each turn as a curve. VisPlotBench found that less
  familiar languages gain the most from this.
- **Full agent.** A coding agent with a render tool, e.g., the `iterate-example` loop. This
  is closest to real use and has the most variance.

For edits, the edit format is its own variable. Options are rewriting the whole program,
search-and-replace blocks, and unified diffs. Aider's results suggest fixing one format
per model and reporting how often an edit cannot be applied.

A related open question is whether the model sees the render. Sending an image of the render
back tests a different skill from sending only error text.

### 4.5 Scoring accuracy

Scoring is the hardest part, because the check has to work on output from several libraries.
The options, from most reliable to least:

- **A. Checks on facts read from the output.** Each task lists facts that must hold, e.g.,
  "there are 12 rects", "rect heights are proportional to `count`", "the rects for each
  species share an x position and do not overlap in y". A check runs against a small common
  record of the render: marks with type, bounding box, fill, and text. For GoFish this record
  comes from the display list, which also links each mark to its data row. For the other
  arms, it comes from their SVG, as VisEval does for Matplotlib. Vega-Lite also exposes a
  scenegraph that is easier to read than its SVG.
- **B. Questions answered by a model.** A model answers questions about the render, e.g.,
  "which species has the tallest bar?", as in OmniDiagram. This works for any library and
  for diagrams where geometry checks are awkward. It depends on the model's accuracy.
- **C. A judge score.** A model rates the render against a reference. Use it only as a
  supporting signal, with the image order swapped, with a judge from a different model
  family, and checked against a small human-labeled set.
- **D. Human preference.** Blinded pairwise votes on a small sample. Good for "would you
  ship this", too slow for the main loop.

Options to avoid as the main score are image similarity (SSIM, CLIP) and code similarity to a
gold program. Both give wrong answers on charts, as noted in section 3.

**Edits get two scores.**

- The applied score comes from checks on the requested change.
- The preserved score compares the common record before and after the edit and requires
  every property not named by the edit to be equal, up to a tolerance. For GoFish, this is
  the same comparison `capture-diff` already makes on normalized DOM, done on the display
  list instead. Some changes are expected side effects, e.g., other bars move when one bar
  is removed from a stack. Each edit task needs a list of properties that are allowed to
  change.

**Checks that do not depend on the library.** The facts in option A should describe the
picture, not the program, so that the same checks run on every arm. Writing them is the main
cost of adding a task. One option is a small set of reusable check functions,
e.g., `countMarks`, `proportional`, `stackedAlong`, `sharedAxis`, `noOverlap`, so that a task
is mostly configuration. A sketch of a task file:

```ts
{
  id: "edit/stack-grouped-bars/penguins",
  kind: "edit",
  data: "penguins",
  start: { gofish: "...", recharts: "...", matplotlib: "..." },
  instruction: "Stack the bars instead of placing them side by side.",
  applied: [
    { check: "countMarks", type: "rect", n: 9 },
    { check: "stackedAlong", axis: "y", groupBy: "island" },
  ],
  mayChange: ["rect.x", "rect.y", "rect.width", "rect.height", "axis.y"],
}
```

### 4.6 Scoring animation

An animation is correct when the right things are in the right places at the right times,
and when each thing moves in a way a viewer can follow. The approach from MoVer and
Animation2Code is to control the clock, take samples of the scene at fixed times, and run
checks on each sample and across samples.

- **Control time.** Every arm runs in headless Chromium with a fake clock, so a sample at
  t = 1.5s is the same on every run. GoFish's capture harness already does this. D3, ECharts
  and GSAP all run on the browser's timers, so the same fake clock drives them. Plotly frames
  can be stepped from code. Manim renders frames in Python, so it needs its own harness that
  records shape positions, as PRISM does.
- **Take samples.** For example, at the start, the end, each keyframe, and a few points in
  between. Each sample is the same common record as for static charts.
- **Match objects across samples.** Each mark should carry a data key, e.g., the country,
  so that the check can follow one object over time. This is called object constancy. For
  GoFish, the display list already links each shape to its data row. For D3 and ECharts, the
  key is in the data join or the item id. If a model forgets to key its marks, the marks
  swap identities between frames and this check fails. How easy each library makes keying
  is part of what the benchmark measures.
- **Checks on motion.** A starting list:
  - the end state passes the same checks as a static chart;
  - each keyed object moves along a continuous path, with no jumps between samples;
  - objects enter and exit at the right times, e.g., a bar is absent before its year and
    present after;
  - the order of events is right, e.g., bars reorder after their values change, not before;
  - the timing is right within a tolerance, e.g., the whole animation takes about 10 seconds.

  MoVer's vocabulary of timing and direction predicates, e.g., "before", "during", "moves
  left", is a ready-made starting point for these checks.

- **What to avoid.** Video similarity metrics and model judges that watch the video. The
  animation benchmarks in section 3 found that both miss small timing errors.

Canvas arms are harder here than for static charts, because a check has to follow objects
across frames. ECharts should run in its SVG mode. The SVG server-side renderer in ECharts
does not support its main animations, so ECharts has to run in the browser.

### 4.7 Measuring speed and cost

For every run, log:

- input tokens, split into context tokens (docs) and task tokens;
- output tokens, including reasoning tokens where the API reports them;
- turns until the checks pass;
- wall-clock time, split into model time and render time;
- for edits, the size of the change in lines.

Report success after each turn as a curve, tokens per solved task, and the share of runs that
never succeed. Wall-clock time depends on the API's load, so tokens and turns are the more
stable numbers. Human editing speed is out of scope unless we run a user study.

### 4.8 Statistics

- Run every task in every arm with the same model and several samples (at least 3), so
  that each comparison is paired on the task.
- Report paired differences with confidence intervals, clustered by task family, e.g., all
  tasks built on one dataset.
- Do a rough power analysis before choosing the task count. As a rough guide, telling apart
  a 10-point gap in pass rate with paired tasks needs on the order of 100 tasks.
- Report pass@1 as the headline. pass@k is an option for the repair track.

### 4.9 Where it lives

The perf benchmark in `tests/` is the pattern to copy. Its code is in `tests/scripts/bench.ts`
and its specs are in `tests/bench/specs.ts`. It writes output to the ignored `tests/tmp/`, and
it appends results to a `benchmarks` data branch. An LLM benchmark could follow the same
layout, e.g., tasks in `tests/llm-bench/tasks/`, a runner in `tests/scripts/llm-bench.ts`,
and results on a data branch. Unlike the perf benchmark, it costs money per run, so it
should never run on every PR. A manual workflow or a weekly schedule is more likely.

## 5. Using the benchmark to design a skill

The same harness can measure a GoFish skill: a guide written for models, placed in the prompt
or loaded by an agent. Changing the skill and rerunning the benchmark shows whether a change
helps. The risk is tuning the skill to the tasks, so that the score goes up and real use does
not improve. Ways to limit that:

- **Split the tasks.** A tuning set is used freely. A check set is used to decide whether a
  change to the skill is kept. A held-out set is scored rarely, e.g., once per release, and
  its results are the ones we publish.
- **Hold out whole kinds of task.** Keep some chart families, edit types and datasets out of
  the tuning set entirely, so that a gain has to carry over to tasks the skill was not tuned
  on.
- **Keep the skill general.** Review each change to the skill and reject any rule that
  names a specific task, dataset or chart from the benchmark.
- **Add fresh tasks over time.** Write new tasks after each round of tuning and score the
  skill on them before looking at the results in detail.
- **Treat failures as API feedback first.** If models keep making the same mistake, the
  API or its error messages may be the problem. A fix to the library helps every user,
  while a rule in the skill only helps models that load it.
- **Give the other arms the same effort.** If the GoFish skill is tuned and the Matplotlib
  arm gets nothing, the comparison measures our prompt work, not the library. Either tune a
  skill for each arm with the same budget, or report the tuned GoFish skill separately from
  the main comparison.

The skill-creator tooling that Claude Code ships already runs evals on a skill and reports
variance. It is a candidate for the tuning loop, with this benchmark supplying the tasks and
checks.

## 6. Ways the results could be biased

- **Task choice.** If the tasks are what GoFish was built for, GoFish wins. Mitigation is to
  include tasks taken unchanged from other benchmarks and report them separately.
- **Weak rivals.** Comparing against research libraries that few people use makes GoFish
  look better than it is. Mitigation is to choose arms by what people and model products use
  today (section 4.1), and to include each product's default setup, e.g., Recharts with
  shadcn/ui in React.
- **Rendering differences.** Canvas arms are checked through a different path than SVG arms.
  Mitigation is to report which path each arm used, and to check the canvas path on
  reference solutions as carefully as the SVG path.
- **Unequal docs.** Richer docs for GoFish than for other arms. Mitigation is the same
  context condition for every arm (section 4.2).
- **Unequal reference solutions.** We write good GoFish and weaker Matplotlib. Mitigation is
  to have the other arms' reference solutions reviewed by someone who uses that library.
- **Contamination.** Gallery tasks for Vega-Lite and Matplotlib are likely in training data.
  Mitigation is fresh tasks and a private held-out set.
- **Checks that favor one library.** A check that reads GoFish's display list more
  precisely than it reads Matplotlib's SVG will fail Matplotlib for adapter errors.
  Mitigation is to run every check on each arm's reference solution first and fix any check
  that fails a correct answer.
- **One model.** Results may not hold for other models. Mitigation is at least two model
  families.

## 7. What this repo already has

- **Rendering.** `tests/scripts/capture-core.ts` renders stories in headless Chromium with a
  fake clock, so animated stories land on the same frame. The IR harness in
  `tests/harness/index.html` renders any JSON spec, which is how the Python pipeline renders.
  A benchmark would render model output through the IR harness or a similar page, not
  through Storybook.
- **A common record for GoFish.** `toDisplayList()` in
  `packages/gofish-graphics/src/ast/displayList/toDisplayList.ts` returns positioned shapes
  with data links. `tests/scripts/normalize-dom.ts` normalizes SVG for comparison, and
  could be a starting point for the SVG adapter the other arms need.
- **A comparison of two renders.** `pnpm capture-diff` already reports whether anything moved
  between two versions. The preserved score is the same idea.
- **Reference solutions.** `apps/docs/docs/.vitepress/data/storyExamples.ts` extracts
  standalone code for every gallery story. `pythonExamples.ts` does the same for the Python
  ports.
- **Paired tasks.** `stories/vega-lite/*` and `stories/seaborn/*` are GoFish ports of
  those libraries' galleries.
- **Animation.** The capture harness runs each story on Playwright's fake clock, so animated
  stories can be sampled at exact times. The animated stories (Gapminder, the bar chart race,
  the bird migration panels) are starting points for animation tasks.
- **Other libraries.** Vega-Lite, Vega, Observable Plot and D3 are dependencies of
  `apps/docs`. Recharts, Chart.js, ECharts, GSAP, Matplotlib, Plotly and Seaborn are not
  dependencies anywhere yet.
- **Model-facing material.** The `iterate-example` skill, the descriptor table and
  `docs/descriptions/*.json`. There is no `llms.txt` and no existing eval code.

## 8. Open questions

- Which arms are in the first version? Recharts and Matplotlib are the defaults in JS and
  Python today, and D3 covers custom work. Is Mermaid needed from the start for diagrams?
- Is the animation track in the first version, or does it follow once the static checks
  work? It needs the sampling harness and the motion checks on top of everything else.
- Is Manim in scope? It is the target of most animation benchmarks, but it makes math
  explainer videos rather than charts, and it needs its own Python harness.
- Does the benchmark count as non-commercial educational use, so that Highcharts can be an
  arm?
- Should each arm run inside the product's default setup, e.g., Recharts inside a React
  artifact with shadcn/ui, or as a bare library?
- Is the headline comparison with docs in every arm's prompt, or with no docs? The two answer
  different questions: "is the API easier to use" and "does it work today".
- JS, Python, or both for the GoFish arm? Python matches the target audience of scientists.
  JS has the richer docs today.
- Does the model see an image of its render in the repair loop, or only error text?
- How many tasks, and how many written from scratch? Writing checks is the main cost.
- Which models, and what is the budget per full run?
- Should the benchmark results be public, e.g., on the docs site, or internal only until
  the method is stable?
- What does a small first version look like? One option is about 20 create tasks and about
  30 single edits on three datasets, with GoFish JS, Recharts, D3 and Matplotlib arms, facts
  read from SVG, one model, three samples, and a three-turn repair budget. That is enough to
  test the harness and the checks before adding task kinds. A small animation slice could be
  about 10 tasks built on the Gapminder and bar chart race data, with GoFish, D3 and ECharts
  arms.

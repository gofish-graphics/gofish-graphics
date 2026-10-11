---
name: api-proposal
description: Turn Josh's rough notes on a GoFish feature into an API design proposal — survey prior work and related issues, compare approaches with syntax and example graphics, and recommend an API. Use when asked to propose, design or survey an API for a new operator, mark, layout or strategy family, before any implementation.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - WebSearch
  - WebFetch
---

# Propose an API

The input is Josh's notes on a feature, often rambly: half-formed names, hunches
about which existing abstraction it resembles, things he's unsure about. Treat
them as hypotheses and open questions, not a spec. Your job is to come back with
a proposal he can review in one sitting, the way an advisor reviews a student's
design memo. **Do not implement the feature.** Small throwaway prototypes are
fine when they help you check a syntax or produce an example graphic. Josh signs
off on the exact spelling before any implementation starts, and he often
counter-proposes a different factoring at that point.

## Where the background lives

This skill points at its sources instead of copying them, so each one can change
on its own. Read the ones that bear on the feature before step 3.

**In the repo** (paths under `apps/docs/docs/`):
- Principles: `internals/design/principles.md`, sections "Why keep the core
  small" (if a feature can't desugar into the core, rethink the feature) and
  "What follows from it" (a polymorphic operator over near-duplicates, clean
  breaks over compatibility shims, loud errors over broken pictures).
- `internals/design/composition-not-enumeration.md`: grammars that list legal
  arrangements versus GoFish, which composes them. Read "What GoFish does
  instead" when an approach starts to look like a new chart type.
- Related systems: `internals/overview/other-grammars.md` (the table "What GoFish
  takes from each") and `internals/overview/why.md` §1 and §4 (GoFish covers
  charts, diagrams and other visualizations on one substrate, so test approaches
  on all of them).
- Naming and strategy families: the "One lowercase surface" bullet in
  `CLAUDE.md`; `internals/design-evolution/three-surfaces.md` (when an option
  becomes an uppercase strategy namespace such as `Overlap.separate()`, and why a
  one-strategy option gets no option at all); `internals/frontend/serialization.md`
  (the `STRATEGIES` table in `packages/gofish-ir/src/frontend/descriptors.ts` and
  how families cross to Python); `js/concepts/refs-and-selection.md` "Singular and
  plural" (a name says what shape of value it denotes).
- Past design notes to imitate in structure: the `status: speculative` essays in
  `internals/design/` (`size-claims.md`, `distributions.md`,
  `build-in-animation.md`) and the notes in `notes/design/`. Many have a
  precedent or prior-art section worth reusing for a related feature.

**In Claude's project memory** for this repo (files named by slug next to
`MEMORY.md`). These record Josh's design feedback that is not yet written down in
the repo. Read the full file, not just the gloss:
- `feedback_api_precedent_check`: survey precedent unprompted before proposing
  any spelling, and lead with it.
- `feedback_orthogonality_shared_kernel`: two operators may overlap on a small
  degenerate case, or one may be exactly a composition of others; a large but
  partial overlap is the bad case.
- `feedback_one_operator`, `feedback_radical_unification`,
  `feedback_principled_over_hack`, `feedback_data_flows_as_lists`: one concept is
  one operator with a strategy option; prefer the simple general rule (often a
  known math or PL framing) to a case split.
- `feedback_hard_examples_central`: stress designs with hard real examples (time,
  H3 grids, map regions, published pre-aggregated data); add a type only where a
  real example forces it.
- `feedback_axes_visualize_datatypes`, `feedback_measures_are_types`,
  `feedback_typeclass_naming`: semantics live on the data type; capabilities are
  named `Has<Thing>` / `Can<Verb>`; a type mismatch is an error, not an override.
- `feedback_plain_language_terms`, `feedback_no_facet_term`,
  `feedback_porterduff_naming`, `feedback_ref_selectall_naming`,
  `feedback_api_signature_style`, `feedback_dsl_embedding_style`: naming rules
  (existing words over coinages, `by` not `xBy`, semantic roles above the axis
  split, Figma names over Porter-Duff names).
- `feedback_python_kwargs_consistency`, `feedback_python_snake_case`: Python takes
  children positionally and options as snake_case kwargs; the wire stays camelCase.
- `feedback_no_back_compat`, `feedback_best_in_class_deps`: break cleanly; a new
  dependency must be best in class, platform standard first.
- `feedback_approve_syntax_before_impl`, `feedback_research_doc_format`: show
  candidate spellings on the real examples, rendered for real.
- `project_*` notes: most past design threads have one (check the `MEMORY.md`
  index). Read the ones whose topic touches the feature; they record decisions
  Josh has already made and questions he asked not to be re-asked.

If memory is not available (another agent or another machine), the repo sources
above still apply, and the glosses here are the short form of the rest.

## 1. Read the notes closely

Pull out of the notes:
- the feature's scope (which variants or strategies are wanted),
- every name Josh floats (keep them; they may be from earlier designs),
- every analogy or tension he points at (e.g. "it's a relational mark but also
  containment") — each becomes a question the proposal must answer,
- what he says he doesn't know.

If a name sounds like it came from earlier work ("we might have named these
X at some point"), search the repo, closed issues and PRs, and the project
memory for it before guessing.

## 2. Survey what's already here

- **The codebase.** Find the nearest existing abstractions: marks, operators,
  strategy families (`Curve`, `Tile`, `Overlap`, …), the `STRATEGIES` table in
  gofish-ir, and how they cross to Python. Note what the new feature could reuse
  and what it would desugar into.
- **Issues and PRs.** Search open and closed issues for related work and
  prior decisions (`gh api "repos/gofish-graphics/gofish-graphics/issues?state=all&per_page=100"`
  and paginate; GraphQL is unavailable, so use REST). Recently finished
  features of similar shape (e.g. binning, overlaps) are the best model for
  structure and naming. List every related issue in the proposal, each with a
  few words on what it is.
- **The story corpus.** Find existing stories under
  `packages/gofish-graphics/stories/` that the feature would simplify or that
  currently work around its absence. These are the first candidate examples.

## 3. Survey prior work outside GoFish

Start from the related-systems pages above and the systems Josh already uses as
sources. Pick the groups that fit the feature:

- **Visualization grammars and libraries:** ggplot2 and its extensions (ggdist,
  ggraph, ggrepel, ggalluvial, ggbeeswarm), Vega-Lite, Observable Plot, D3,
  Atom, productplots, PICCL, Encodable. Animation: animated Vega-Lite (AVL),
  gganimate, gemini. Uncertainty: ggdist, ggdibbler. Flint, for semantic data
  types (`internals/design/flint-chart-notes.md`).
- **Diagramming:** Bluefish (truth is `joshpoll/bluefish-monorepo`), GoTree (live
  source at `BIT-VIS/gotree`), Penrose, Graphviz, dagre, TikZ.
- **Layout and UI frameworks:** SwiftUI (alignment guides, leading-dot strategy
  values), CSS (flex, grid, anchor positioning), Typst, Apple Auto Layout, React,
  Solid. Python UI libraries (marimo, ipywidgets) for the Python call shape.
- **Design tools:** Figma and Illustrator, especially for names designers
  already know.
- **Data transformations:** polars first, then dplyr/tidyr, SQL and Vega-Lite
  transforms; pandas only as corroboration.
- **Types and math:** Lean mathlib, Haskell, Kindlmann and Scheidegger's
  algebraic vis, java.time and the JS Temporal API, polars dtypes, Effect and
  fp-ts (namespace-with-type idioms).
- **PL and compilers:** GHC and Lean (small core, desugaring), Racket/Rhombus
  pict for picture composition.
- **Research literature:** the paper behind each system above, plus a search for
  the feature's own topic.

For each system you use, record its model (what the user writes and what the
system decides) and its names. The goal is to learn from precedent, not to copy
it: say what each does well and what doesn't fit GoFish's composition model.
When precedent is a workaround for a fixed set of chart types or channels (a
Vega-Lite offset array, an axis "zero" toggle), name it as such and use it as a
foil, not a model. Typed precedent (mathlib, Temporal, polars) beats
visualization-library precedent on data-type questions.

## 4. Lay out the approaches

Start the proposal with a short terminology block: define every term of art at
first use, and prefer words with an outside meaning over new coinages.

Write 2–4 genuinely different approaches, not cosmetic variants. When the space
has independent axes (say, where the option lives and what its values are),
present the axes separately rather than multiplying them into variants. For each
approach:
- **Syntax blocks** in JS and Python (Python: children positional, snake_case
  kwargs, strategies as `Family.member()`), written as a user would write them
  for 2–3 representative examples. Include at least one hard real example that
  stresses the design, not only the easy case.
- **Example graphics.** Show what the examples produce. Best: a quick prototype
  story rendered with the `iterate-example` skill. Otherwise: a hand-made SVG
  sketch, or a reference image from prior work with its source. Every approach
  needs at least one picture.
- **How it composes** with existing operators, coordinate transforms, animation,
  the layout engine, and data types. Say what it desugars into.
- **Overlap check:** for each existing operator it resembles, say which regime
  it falls in: a small shared degenerate case (fine), exact composition of
  existing operators (fine, define it by that rewrite), or large partial overlap
  (a sign the factoring is wrong).
- **Trade-offs:** what it makes easy, what it makes awkward, new terms it adds,
  and the cost to extend it later (custom strategies, see #1101).

Answer every tension pulled out in step 1 explicitly, even if the answer is
"this stays fuzzy, and here's why that's fine."

## 5. Recommend

Pick one approach and argue for it against the principles above, citing the
specific source for each point. In short, the strongest arguments are:
- it desugars into the existing core; composition mechanisms stay nearly fixed
  and the long tail grows as operators and strategies,
- one concept is one operator, and overlaps with other operators are degenerate
  or exact compositions,
- few new terms, and names that match good precedent,
- semantics that live on data types rather than on special cases,
- a closed set of declared kinds plus a function escape hatch, matching the
  other strategy families,
- the same shape in JS and Python.

A recommendation does not close the space: keep the runner-up visible and say
what would change your pick.

End with the decisions Josh needs to make, phrased as short questions, and the
user-facing syntax changes he should review. Keep internal choices out of that
list unless they leak into the API. Don't re-ask anything a `project_*` memory
records as decided or parked.

## Output

Write the proposal to `proposals/<feature-slug>/proposal.md` (create the
directory), with images alongside it in the same folder. Lead with a
three-line summary and the recommendation, then the sections above. Write in
plain American English and give the gist of each issue number you cite. Then tell
Josh where it is and offer to open an issue labeled `API design` from it; don't
open one unasked.

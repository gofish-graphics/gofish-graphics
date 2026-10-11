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

<!--
DRAFT — to be adapted in Claude Code. When adapting, have this skill POINT to
material that lives elsewhere rather than copying it in, so each source can be
updated independently and the skill stays current:
- Josh's list of related work he likes to cite (CLAUDE.md or project memory)
- Josh's design principles / PL design flavor (CLAUDE.md or project memory)
- naming conventions and the strategy-family pattern (code + docs)
Replace each TODO(pointer) below with a path or a reference to where that
material lives; only fall back to the inline defaults where nothing exists yet.
-->

# Propose an API

The input is Josh's notes on a feature, often rambly: half-formed names, hunches
about which existing abstraction it resembles, things he's unsure about. Treat
them as hypotheses and open questions, not a spec. Your job is to come back with
a proposal he can review in one sitting, the way an advisor reviews a student's
design memo. **Do not implement the feature.** Small throwaway prototypes are
fine when they help you check a syntax or produce an example graphic.

## 1. Read the notes closely

Pull out of the notes:
- the feature's scope (which variants or strategies are wanted),
- every name Josh floats (keep them; they may be from earlier designs),
- every analogy or tension he points at (e.g. "it's a relational mark but also
  containment") — each becomes a question the proposal must answer,
- what he says he doesn't know.

If a name sounds like it came from earlier work ("we might have named these
X at some point"), search the repo, closed issues and PRs for it before guessing.

## 2. Survey what's already here

- **The codebase.** Find the nearest existing abstractions: marks, operators,
  strategy families (`Curve`, `Tile`, `Overlap`, …), the `STRATEGIES` table in
  gofish-ir, and how they cross to Python. Note what the new feature could reuse.
- **Issues and PRs.** Search open and closed issues for related work and
  prior decisions (`gh api "repos/gofish-graphics/gofish-graphics/issues?state=all&per_page=100"`
  and paginate; GraphQL is unavailable, so use REST). Recently finished
  features of similar shape (e.g. binning, overlaps) are the best model for
  structure and naming. List every related issue in the proposal.

## 3. Survey prior work outside GoFish

Start from Josh's list of related work he likes to cite
(TODO(pointer): link the file or memory entry that holds it) and cite from it
where it applies. Then widen out: look at how other systems and papers handle
the same thing: chart grammars
(Vega-Lite, Plot, ggplot2), diagramming systems (Penrose, Bluefish, TikZ,
Graphviz), set and hypergraph visualization, graphic design tools, and the
research literature. For each, record its model (what the user writes and what
the system decides) and its names. The goal is to learn from precedent, not to
copy it: say what each does well and what doesn't fit GoFish's composition model.

## 4. Lay out the approaches

Write 2–4 genuinely different approaches, not cosmetic variants. For each:
- **Syntax blocks** in JS (and Python where the shape differs), written as a
  user would write them for 2–3 representative examples.
- **Example graphics.** Show what the examples produce. Best: a quick prototype
  story rendered with the `iterate-example` skill. Otherwise: a hand-made SVG
  sketch, or a reference image from prior work with its source. Every approach
  needs at least one picture.
- **How it composes** with existing operators, coordinate transforms, animation,
  and the layout engine.
- **Trade-offs:** what it makes easy, what it makes awkward, new terms it adds,
  and the cost to extend it later (custom strategies, see #1101).

Answer every tension pulled out in step 1 explicitly, even if the answer is
"this stays fuzzy, and here's why that's fine."

## 5. Recommend

Pick one approach and argue for it against the design principles. Follow the
principles in CLAUDE.md and project memory first
(TODO(pointer): link the exact section or file). Absent anything there:
- composition mechanisms stay nearly fixed; the long tail grows as operators
  and strategies,
- orthogonal concepts, few new terms, names that match precedent where
  precedent is good,
- a closed set of declared kinds plus a function escape hatch, matching the
  other strategy families,
- the same shape in JS and Python.

End with the decisions Josh needs to make, phrased as short questions, and the
user-facing syntax changes he should review. Keep internal choices out of that
list unless they leak into the API.

## Output

Write the proposal to `proposals/<feature-slug>/proposal.md` (create the
directory), with images alongside it in the same folder. Lead with a
three-line summary and the recommendation, then the sections above. Then tell
Josh where it is and offer to open an issue labeled `API design` from it; don't
open one unasked.

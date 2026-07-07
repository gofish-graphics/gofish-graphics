---
title: "Research: Incremental Layout — the Design Space"
section: Speculative Notes
order: 62
status: speculative
---

# Research: incremental layout — the design space

**Question.** When a signal changes, the reactive layer
([Reactivity](/internals/frontend/reactivity)) currently re-runs the whole
pipeline — resolve → domains → layout → lower → paint — even if the change
could only possibly move one bar. What would it take to make the work
proportional to what actually changed, and how much of the current design is
already on that path? This is a survey of the prior art with a mapping onto
GoFish, not a committed plan.

**Verdict up front.** The best fit is _memoized queries over the pure
pipeline_ (Option B below, the salsa/red-green model), with the
relayout-boundary idea from production UI engines expressed as its cutoff
rule. The σ-affine work is quietly building the exact ingredient this needs:
a small algebraic summary (one affine map per axis per scope) whose equality
tells you when change propagation can stop. The reactive layer's registration
mechanism, scheduler, and paint tier all survive; only the body of the
"re-run everything" thunk gets replaced. The one prerequisite nothing else
can proceed without is **stable scope identity** across re-resolves.

## 1. What makes layout hard to incrementalize

Incremental computation in general is a solved-in-theory problem: record
which inputs each piece of the computation read, and when an input changes,
re-run only the pieces downstream of it. Layout resists the naive version of
this for three specific reasons.

**Information flows both ways through the tree.** Sizes are computed
bottom-up (a stack is as wide as its children's claims) while positions are
computed top-down (a child's pixel origin depends on where its parent put
it). In attribute-grammar vocabulary — worth learning because the best prior
art is stated in it — bottom-up values are **synthesized attributes** and
top-down values are **inherited attributes**. A change in one leaf's data can
therefore propagate _up_ (its size claim changes its parent's size) and then
back _down_ (the parent re-places every sibling). Any incremental scheme must
handle this V-shaped propagation, not just a downstream cone.

**Scales are long-range coupling.** One appended datum can extend a domain;
the domain feeds an axis scale; the scale repositions every mark on that
axis, including marks in distant subtrees. In the dependency graph, the
domain/scale node has an edge to almost everything. Incrementality here comes
entirely from **cutoffs**: recompute the domain cheaply, notice it is _equal_
to last time (the new point was interior), and stop. Without cutoffs, the
scale edge makes every change global.

**The tree itself changes.** Data-driven specs mean an input change can add
or remove marks, not just move them. Diffing computations over a changing
tree requires stable _keys_ — you must be able to say "this scope is the same
scope as last frame" or every change looks like total replacement. GoFish
today mints fresh uids on every resolve, which is exactly the wrong property.

## 2. Prior art

### Self-adjusting computation (Acar) and Adapton

The general theory: run the program once while recording a **dependency
graph** of which computations read which values; on change, re-execute only
the dirtied region, reusing memoized results elsewhere. Acar's self-adjusting
computation is the eager form; **Adapton** (Hammer et al., PLDI 2014) is the
demand-driven form — nothing recomputes until someone asks for its result,
which composes well with lazy or partially-observed outputs. **miniAdapton**
is a few hundred lines and shows the core is small: a memo table plus a
dirty/clean two-phase traversal. Jane Street's **Incremental** (and Bonsai on
top of it) is the same idea in production: an explicit DAG of incremental
nodes, a `stabilize` call that propagates changes in topological order, and
**cutoff nodes** that stop propagation when the recomputed value equals the
old one.

_Lesson for GoFish:_ the machinery is genuinely small; the design work is
choosing the node granularity and the cutoff points, not implementing the
propagation algorithm.

### Salsa and the rustc red-green algorithm

rust-analyzer's **salsa** (distilled from rustc's incremental query system)
reframes the DAG: the program is a set of pure **queries** (functions from
keys to values) over a database of inputs with revision counters. When an
input changes, a query's cached result is suspect ("red"); salsa re-runs its
_dependencies_ first, and if all of them produce values equal to before, the
query is marked clean ("green") **without re-running it** — this is
_early cutoff_ or "backdating." The queries stay ordinary pure functions; the
incremental layer is a memo table wrapped around them, and you can delete it
and the system still works, just slower.

_Lesson for GoFish:_ this is the model that fits a pipeline that is already
a pure function of the spec. Nothing about the pipeline's code changes; you
choose key/query boundaries and equality functions. It also degrades
gracefully — an un-keyed stage just recomputes.

### Incremental attribute grammars (Reps–Teitelbaum, Demers)

Layout-as-attribute-grammar is the oldest precise treatment of "V-shaped"
tree computations. The Cornell Synthesizer Generator line of work (Demers,
Reps, Teitelbaum, early 1980s) gives **optimal change propagation** for
attributed trees: after a subtree edit, re-evaluate exactly the attributes
whose values change, in a correct order, by following the grammar's
dependency structure. The key concept is the **characteristic graph** — a
per-node summary of how attributes flow through it, which lets propagation
skip entire subtrees whose interface attributes didn't change.

_Lesson for GoFish:_ "interface summary per node that gates propagation" is
the same move as salsa's cutoff and Flutter's boundary, discovered forty
years earlier. GoFish's per-scope affine carrier _is_ a characteristic
summary: it is the whole interface a scope presents to its parent on a
continuous axis.

### FTL / Superconductor (Meyerovich & Bodík)

FTL specifies layout as an attribute grammar and _compiles a schedule_ — a
static sequence of tree passes (some parallelizable) that evaluates all
attributes. The point for us is not parallelism but the factoring: once
layout logic is per-node equations over synthesized/inherited values, the
_order of evaluation_ becomes derived machinery rather than hand-written
passes, and both parallel and incremental schedules become compiler targets.
This is the spec/policy/schedule split explored in
[A Synthesis of UI, Diagram, and Chart Layout](/internals/design/layout-synthesis);
the σ-affine plan
([Plan: σ-affine unification](/internals/design/sigma-affine-simplification))
is moving GoFish's layout toward exactly this per-scope-equation shape.

### Production engines: dirty bits and relayout boundaries

Browsers and Flutter ship the pragmatic version. A mutated node calls
`markNeedsLayout`; the dirty flag bubbles **up** the retained render tree,
but stops at a **relayout boundary** — a node whose incoming constraints pin
its size (Flutter: `parentUsesSize == false` or tight constraints; CSS:
`contain: layout` and friends). At the next frame, layout re-runs only the
dirty boundaries' subtrees. The insight worth stealing is the boundary
condition itself: _if a node's inputs from above are unchanged and its
interface to above cannot change, no propagation crosses it in either
direction._

_Lesson for GoFish:_ a σ-scope whose incoming allocation (span) and axis
scale are unchanged, and whose outgoing size claim is unchanged, is a
relayout boundary. In a retained-tree design this is a dirty bit; in a query
design it is a cutoff. Same condition, two implementations.

### Fine-grained UI frameworks (Solid, Compose, SwiftUI)

Solid re-runs the smallest computation that read a changed signal; Compose
re-invokes the smallest **recomposition scope**, skipping composables whose
parameters are `equal`; SwiftUI's attribute graph memoizes view attributes
with equality gates. These frameworks answer "what re-executes" with _the
reads decide_ — which is exactly the read-location rule the reactive layer
already implements at chart granularity. But note what they are
incrementalizing: mostly _construction_ of a UI tree, with layout still a
separate (often whole-subtree) pass underneath. They are the right model for
GoFish's **resolve** stage (spec → tree) and the already-shipped paint tier,
not obviously for measure/arrange.

### Incremental view maintenance / differential dataflow

For the _data_ stage (`derive`, grouping, binning), the database literature
maintains query outputs under input deltas (differential dataflow,
DBSP). Almost certainly overkill for v1-scale data, but it names the honest
limit: a `derive` callback is an opaque JS function, so its output can only
be recomputed wholesale and _cutoff by equality_, never delta-maintained —
unless the transform is expressed in a vocabulary the engine understands
(the operator-DSL direction: `spread`/`group` semantics are known, arbitrary
`derive` is not).

## 3. Mapping onto GoFish

The pipeline as a chain of stages, with their natural incremental keys and
cutoff summaries:

| stage                            | function of                  | natural key                   | cutoff summary (stop if equal)       |
| -------------------------------- | ---------------------------- | ----------------------------- | ------------------------------------ |
| resolve (spec → tree)            | spec, signals read in spec   | chart (today) → scope subtree | subtree structural hash              |
| domain inference                 | data reachable per scale     | scale id                      | the domain interval                  |
| measure (size claims, bottom-up) | children's claims + own data | σ-scope × axis                | the scope's size claim               |
| arrange (placement, top-down)    | parent allocation + scale    | σ-scope × axis                | the scope's affine map (σ, baseline) |
| lower (display list)             | placed scope                 | scope                         | per-item geometry                    |
| paint                            | display items + live thunks  | attribute                     | _(already incremental via Solid)_    |

Two structural observations:

**The σ-affine carrier is the load-bearing summary.** After stages 0–4 of the
σ-affine plan, a scope's whole positional interface per continuous axis is
one affine map, `px(d) = pxMin + σ·(d − domainMin)`. That is a two-number
summary with a trivial equality test — precisely what Reps–Teitelbaum
characteristic graphs, salsa backdating, and Flutter boundaries all require.
"Did anything outside this scope need to know?" becomes "did (σ, baseline)
change?" The further the σ-affine unification goes, the smaller and more
uniform the cutoff summaries get; incremental layout is a consumer of that
project, which is the strongest argument that it should land first.

**Scales split the pipeline at a narrow waist.** Domains are a fold over
data (min/max/sum by scale); everything downstream depends on data only
_through_ the domain. That waist is where global coupling gets cut: memoize
domain inference per scale, and an interior data change (domain unchanged)
never reaches layout at all — only the changed scope's own measure re-runs.
Folds over group-structured measures (sum, count) can even be
delta-maintained (subtract the old value, add the new); min/max cannot
(removing the max forces a rescan) without an augmented structure, and a
plain recompute-with-cutoff is likely fine at chart scale.

## 4. Options

### Option A — Solid-ize the pipeline (Compose-style)

Make every node's measure/arrange a Solid memo; signals flow _through_ the
pipeline and fine-grained invalidation falls out of tracking.

- _For:_ one reactive substrate everywhere; no explicit keys (identity is the
  memo instance); the paint tier already works this way.
- _Against:_ the pipeline stops being a pure synchronous function — the
  property the whole serialization/parity/testing story leans on. The
  V-shaped inherited+synthesized flow does not map onto a single-direction
  reactive graph without encoding the evaluation schedule into effect
  ordering (glitch-prone; measure reads the parent's proposal, which reads
  children's claims). And it is all-or-nothing: half a reactive pipeline is
  worse than none.
- _Blocking fact:_ **resolve is async** (Python `derive` RPC, async marks),
  and Solid's dependency tracking is synchronous — the tracking context is
  lost at the first `await`. This is also why the reactive layer's ambient
  registrar is _not_ redundant re-implementation of `createComputed`: it is
  the async-safe version of it. Any consolidation of the manual
  `usedInSpec`/`specRuntimes` bookkeeping into Solid tracking is blocked on
  the same fact.

### Option B — memoized queries over the pure pipeline (salsa-style)

Keep the pipeline exactly as it is: pure functions. Wrap the stage boundaries
in the table above with a memo table keyed as shown, with early cutoff on the
summary equality. The reactive layer's dependency key refines from
input → chart to input → (stage, scope).

- _For:_ the pipeline stays pure, synchronous, testable, serializable; the
  incremental layer is an optimization that can be deleted (or disabled per
  render) without changing behavior — which also makes it verifiable by
  differential testing (run memoized and clean, diff pixels). Degrades
  gracefully: un-keyed stages recompute. Async-compatible (memo tables don't
  care about `await`). Directly consumes the σ-affine summaries.
- _Against:_ needs **stable scope keys** across resolves (see prerequisites);
  equality on floating-point summaries needs care (epsilon vs bitwise —
  bitwise is safer: the goal is "provably identical output", and an epsilon
  cutoff would _change_ pixels); memo tables need an eviction story; and the
  resolve stage itself (spec → tree) must either stay cheap or be keyed by
  subtree, which is the least-explored part.

### Option C — retained mutable tree with dirty bits (Flutter-style)

Keep a live render tree between frames; inputs mutate nodes and
`markNeedsLayout` bubbles to σ-scope boundaries; re-layout dirty subtrees in
place.

- _For:_ proven at massive scale; simple to reason about per-frame cost;
  boundaries are checked with one flag rather than a memo lookup.
- _Against:_ GoFish rebuilds an immutable tree per resolve — moving to a
  retained mutable tree is the largest possible architectural change, touches
  every operator, and forfeits the pure-function properties Option B keeps.
  The boundary _condition_ is identical to B's cutoff anyway; C is B with the
  memo table smeared into the tree.

**Recommendation:** B, adopting C's boundary condition as the cutoff rule and
keeping A only where it already ships (paint). Sequence it _after_ the
σ-affine unification has made per-scope summaries uniform.

## 5. What survives from the reactive layer (PR #671)

The current design was chosen so that v1's "re-run everything" is the coarse
end of a dial, not a dead end:

- **Read-location dependency registration** survives; only the key refines
  (input → chart becomes input → (stage, scope)). The ambient-registrar
  mechanism is the async-safe tracking primitive either way.
- **The rAF-coalesced scheduler** survives unchanged — incremental engines
  still coalesce and re-run at frame cadence; `invalidate()` just gets a
  finer payload.
- **Recorded scales / frame conversions** survive — they are already
  "read off what layout computed" rather than recomputed, which is the
  incremental discipline.
- **The paint tier** (live thunks in the display-item side table, Solid
  attribute effects) _is_ the leaf tier of any incremental engine.
- **Disposable:** the ~50-line body of the re-render thunk ("rebuild the
  whole tree through the builder"), replaced by "re-run red queries".

## 6. Prerequisites and open questions

1. **Stable identity (the gating prerequisite).** Scopes and marks need keys
   stable across re-resolves — derived from spec position × data key, not
   freshly minted uids. This is useful before any incrementality lands
   (e.g. it would also fix hit-test identity across re-renders and enable
   object constancy in animation) and is where the work should start.
2. **Where does resolve's incrementality come from?** Memoizing layout is
   pointless if every frame still rebuilds the full node tree from the spec.
   Options: keyed subtree memoization of the builder output (needs 1), or
   accepting resolve cost as O(spec) and only memoizing below it (probably
   fine: resolve is cheap relative to measure/solve today — worth measuring
   first).
3. **Equality discipline.** Bitwise equality on summaries preserves the
   pixel-equality gate; document that cutoffs must never be approximate.
4. **The solver.** Monotonic solve currently runs per scope; is a changed
   scope's solve independent enough to re-run alone, or do shared-axis
   constraint groups need their own query key? (Likely the latter: key by
   constraint component, not scope.)
5. **`derive` deltas.** Out of scope: opaque callbacks recompute wholesale
   and cut off by output equality. If the operator DSL ever grows
   engine-visible transforms, delta maintenance becomes possible per the
   differential-dataflow literature — a separate research thread.
6. **Memory.** Memo tables keyed by scope are bounded by spec size, but the
   _previous_ frame's values must be retained per rendered chart —
   effectively doubling layout-state residency. Fine for charts; audit for
   the 10k-mark case.

## Reading list

- Acar, _Self-Adjusting Computation_ (thesis, 2005) — the theory.
- Hammer et al., _Adapton: Composable, Demand-Driven Incremental Computation_
  (PLDI 2014); miniAdapton (2016) for the small core.
- Matklad, _Salsa_ / rustc dev guide's "incremental compilation in detail" —
  red-green marking and backdating.
- Reps, Teitelbaum, Demers, _Incremental Context-Dependent Analysis for
  Language-Based Editors_ (TOPLAS 1983) — optimal incremental attribute
  evaluation; characteristic graphs.
- Meyerovich & Bodík, _Fast and Parallel Webpage Layout_ (WWW 2010) and the
  Superconductor/FTL line — layout attribute grammars with compiled
  schedules.
- Flutter rendering docs: `RenderObject.markNeedsLayout`, relayout
  boundaries; CSS Containment spec — the production boundary rules.
- Jane Street, _Incremental_ (blog + library docs) — cutoffs and
  stabilization in practice.

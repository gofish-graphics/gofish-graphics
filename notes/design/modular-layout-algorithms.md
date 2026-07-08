# Modular Layout Algorithms

**Status:** speculative research survey (2026-07-01). Rewritten from scratch against primary
sources (d3-hierarchy, d3-sankey, dagre source; the original papers) — supersedes the earlier
draft. Companion to the internals essays [layout-synthesis](../../apps/docs/docs/internals/design/layout-synthesis.md)
and [constraint-semantics](../../apps/docs/docs/internals/design/constraint-semantics.md).

**Question.** Treemap, tidy tree, circle packing, Sankey, and layered graph layout (dagre) are
shipped everywhere as monolithic imperative procedures. Halide, TACO, and the pretty-printing
line of work each took a domain that looked like "inherently clever algorithms" and split it
into a small declarative spec plus a swappable strategy. GoFish already has a central constraint
engine — align/distribute/nest/position over monotone size claims, solved by one σ-inversion per
scope plus a difference-constraint placement pass. Could that engine (possibly extended) be the
substrate these five algorithms compile onto?

**Answer, compressed.** More of each algorithm is already inside GoFish's two semirings than the
"custom layout node" framing suggests — in three of the five cases the published algorithm is
_provably_ an evaluation strategy for a constraint system the engine can almost state. But the
analogy to Halide only becomes precise after splitting "schedule" into two different things the
layout literature conflates (§1). The residue that is genuinely outside any constraint engine is
small and always the same species: a discrete plan decision (grouping, ordering, alignment
commitment). That residue has a clean interface — it consumes solved geometry and emits operator
trees or ordering constraints — which is exactly where a Halide-style seam belongs.

---

## 1. The lens: three layers, not two

Halide's split is algorithm/schedule. Applied to layout naively, it wobbles: Halide schedules
never change the output image, whereas swapping squarify for slice-and-dice very much changes
the picture. The literature sorts cleanly once you use **three** layers:

1. **Spec** — the constraint system and (optionally) an objective. _"Leaf areas proportional to
   weights, nested axis-aligned rectangles, exhaust the parent."_ _"Minimize width subject to
   per-level non-overlap of rigid subtree silhouettes and parents centered over children."_
2. **Policy** — which point of the feasible set to return when the spec underdetermines the
   answer. Squarify vs. binary vs. strip are _policies_: all satisfy the treemap spec, they pick
   different tessellations. Tidy-tree symmetry (Kennedy's mean of the left-biased and
   right-biased solutions) is a policy. So are d3-sankey's sort orders, Brandes–Köpf's choice of
   which alignments to commit, and — inside GoFish today — the fill split and the weak-origin
   rule, which the internals essays already call "policy verdicts." Policies change the output,
   but only within the spec's feasible set.
3. **Schedule** — how the chosen point is computed. Output-invariant by definition. Contours +
   threads + mods vs. materialized per-level constraints (tidy tree); network simplex vs. LP
   (dagre ranking); Welzl move-to-front vs. an SOCP solver (enclosing circle); resquarify's
   frozen row plan re-evaluated with new numbers; greedy fits-check vs. Pareto dynamic
   programming (pretty printing, when the objective makes the optimum unique).

The prior art maps onto this frame as follows.

**Halide** (PLDI 2013) lives purely in layers 1+3: the algorithm language is restricted (pure
functions over infinite grids, feed-forward DAG) precisely so that _every_ schedule — tile,
fuse, vectorize, compute_at — is semantics-preserving, with interval-based bounds inference as
the fixed "checker" that makes any schedule executable. The lesson is not "add scheduling knobs";
it is **restrict the spec language until strategies can't change meaning, and invest in the one
inference pass that connects them** (bounds inference ≈ a layout engine's claim/proposal
protocol).

**TACO** (OOPSLA 2017) adds a second orthogonal strategy axis: not just loop order but **data
representation** (each tensor mode independently dense or compressed). Same index expression,
different formats, different generated loops. For layout the analogous second axis is the
_representation of geometric extent_ — scalar bbox vs. per-depth silhouette vs. circle — see §5.

**Exo / Elevate** reify schedules as user-authored sequences of verified rewrites: the fixed part
is the _checker_, not the strategy vocabulary. **FTL / Superconductor** (Meyerovich & Bodik, WWW
2010, PPoPP 2013) is the closest thing to "Halide for layout" that exists, and it is squarely in
our domain: layout spec = an **attribute grammar** over the document/scene tree (inherited
attributes flow down, synthesized flow up); schedule = a first-class term in a tiny grammar —
`parPre | parPost | recursive` traversals composed with `;` and `||`, each annotated with which
attributes it computes, checked against the grammar's dependences, with **holes that a
synthesizer completes and an autotuner profiles**. Their case studies include CSS (a 1132-line
grammar synthesized to a 9-pass parallel engine) and — directly on point — **a treemap specified
as an attribute grammar and synthesized to a 5-pass parallel schedule**, GPU-compiled to animate
100K+ nodes. What FTL could not express is equally instructive: anything iterative or
optimizing (force layouts, crossing minimization) is outside the attribute-grammar spec language
— the same restriction that bought the safety.

**Pretty printing** contributes the _policy_ layer's technology. Wadler's algebra is six
combinators, of which one — `group` = "flattened, if it fits, else broken" — is a **choice
operator**: a document denotes a _set_ of layouts and the evaluator picks one. The greedy
evaluator (Oppen, Wadler) is sound only because the fitness measure is monotone: if the
flattened first line overflows, no continuation rescues it. Bernardy (ICFP 2017) upgrades to the
optimal choice by summarizing each sub-layout with a small vector of monotone measures
`(height, maxWidth, lastWidth)` and doing dynamic programming over **Pareto frontiers** —
domination pruning is exact because all combinators are monotone in the measures. Porncharoenwase
et al. (OOPSLA 2023) then decouple the objective entirely (any monotone, composable "cost
factory" slots into the same DP). **Knuth–Plass** is the same shape a level down: box (rigid) /
glue (ideal ± stretch/shrink — affine slack, i.e. a soft interval constraint) / penalty (soft
constraint) as the spec IR; first-fit vs. total-demerits shortest path as two strategies for it.

The recurring pattern, in every system: **a restricted declarative spec; an order/monotonicity
property that the restriction guarantees; and strategies that are swappable _because_ the
property holds, certified by one fixed checker.** GoFish's engine already is such a system for
its fragment: the (max, +) claim algebra is the restricted spec language, monotonicity is the
guaranteed property, `Monotonic.inverse`'s three tiers (closed-form linear / exact convex
piecewise / bisection) are literally three schedules for one spec, selected by a normal-form
check. The question of this note is which parts of the five classics can be brought inside that
discipline.

---

## 2. Anatomy of the five algorithms

Each subsection: how the algorithm actually works (verified against source), then the
spec/policy/schedule split, then the verdict relative to GoFish's generators. Throughout,
"the engine" means: size claims folded in (max, +) and inverted once per scope; placement as a
forest of difference constraints in (min, +); no iteration, no objectives, no discrete search
(all three exclusions are by design, per the internals essays).

### 2.1 Treemaps

**Pipeline** (d3-hierarchy):

| step | what                                                                                             | data-flow shape                               |
| ---- | ------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 1    | `sum(value)`: node value = own + Σ children                                                      | bottom-up fold                                |
| 2    | `sort` (optional; squarify wants descending)                                                     | per-node local sort — _policy_                |
| 3    | `eachBefore(positionNode)`: parent rect known, call `tile(node, x0,y0,x1,y1)`                    | pure top-down; zero geometric feedback upward |
| 4    | padding: outer insets the tile region; inner via half-insets per depth, applied _after_ division | per-node affine inset                         |
| 5    | rounding                                                                                         | per-node quantization                         |

The entire variability surface is one strategy slot, the **tiling function**
`tile(parent, x0, y0, x1, y1)` — a local, stateless function that partitions a concrete
rectangle among children whose values are already summed. Variants:

- **Slice / dice** — 1-D proportional division: `k = extent/parent.value`, prefix-sum scan.
  This _is_ a value-proportional stack; the σ solve does it today.
- **Slice-and-dice** (Shneiderman 1992) — `(depth & 1 ? slice : dice)`: orientation is a static
  function of depth. This is a mosaic plot without axes (Wickham & Hofmann's "alternating
  hspines and vspines"), and GoFish's mosaic work already covers it.
- **Squarify** (Bruls et al. 2000) — greedy row building along the shorter side: keep adding the
  next child to the current row while the row's worst aspect ratio does not worsen
  (`worst(R,w) = max(w²r⁺/s², s²/(w²r⁻))`, `s = ΣR`); on worsening, close the row and recurse
  in the remaining rectangle. Global optimum is NP-hard; the greedy is a heuristic. **The
  structural fact that matters:** d3's `squarifyRatio` materializes each row as a synthetic node
  `{value, dice, children}` and then calls plain `treemapDice`/`treemapSlice` on it. Squarify's
  geometry is _nothing but_ slice/dice applied to a dynamically invented two-level tree.
- **Binary** — recursive weight-median bisection along the longer side; the split coordinate
  `xk = (x0·v_R + x1·v_L)/v` is affine; the median search is a binary search over prefix sums
  (a monotone inversion, not open-ended search).
- **Strip / pivot** (Bederson et al. 2002) — order-preserving variants; strip uses an
  average-aspect stopping rule plus an optional one-strip lookahead repair; pivot layouts end
  with an explicit _enumerate-and-choose_ ("try pivot/quad/snake, keep the best average ratio").
- **Resquarify** — freeze the row decomposition from a previous run; on data update, re-run only
  the proportional arithmetic within the frozen plan. **This is a genuine plan/execution
  separation already shipping in d3**: same spec, the plan cached as a schedule artifact,
  trading aspect quality for update stability.

**Split.** Spec: area ∝ weight, nested rectangles, exhaustion. Policy: the tiling function —
more precisely, tiling functions are **plan synthesizers**: pure functions
`(weights, container aspect) → a tree of oriented proportional stacks`, after which _all_ actual
geometry is solver-friendly 1-D proportional division. Schedule: resquarify's caching; d3's
padding-after-division (which breaks exact proportionality — a constraint engine solving
"fixed gaps + proportional flex" simultaneously, as `stack` with spacing already does, is
_strictly more principled_ than d3 here).

**Verdict.** Given the plan, a treemap is nested `stack`s with value-proportional claims and
constant gaps — fully inside the engine, and the engine fixes d3's padding approximation for
free. The plan decision is the residue: a greedy scan that must run _inside the top-down pass_
because it consumes the concrete remaining rectangle (its aspect ratio) mid-layout. Note the
engine-facing consequence: this residue does not need iteration, objectives in the solver, or
non-affine constraints — it needs a sanctioned place for a pure function to observe a proposal
and emit an operator subtree (§5, Option B). GoFish's current `treemap` node (wrapping
d3-hierarchy, imposing rects as scribbles) is the maximally opaque version of this; #541's
"emit constraints instead" is the halfway point; plan-synthesis is the full decomposition.

### 2.2 Tidy trees

**Pipeline** (d3 `tree.js` = Buchheim–Jünger–Leipert; Reingold–Tilford's aesthetic):

| step | what                                                                                                                                                                                                                           | data-flow shape                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1    | `firstWalk`: prelim x per node; for each new sibling subtree, `apportion` scans the two facing **contours** level by level, computes the max overlap deficit, shifts the subtree right by it                                   | bottom-up fold whose accumulator is the merged silhouette of siblings so far |
| 2    | `moveSubtree`: O(1) rigid shift via `mod` (deferred translation); intermediate siblings get an arithmetic-progression share recorded in O(1) (`shift`/`change`), realized later by `executeShifts` (a second-order prefix sum) | lazy translation bookkeeping                                                 |
| 3    | `secondWalk`: absolute x = prelim + Σ mods on root path; y = depth · k                                                                                                                                                         | top-down prefix sum                                                          |

**The load-bearing observation.** Because subtrees are **rigid** (identical subtrees render
identically — Kennedy's rule 4), the whole system collapses to one variable per subtree root:
every interior node's x is an affine function of its root's offset. The constraints are, for
each adjacent sibling pair and each shared depth d:

```
x_R − x_L ≥ rightContour_L(d) − leftContour_R(d) + separation
```

— a difference-constraint system over a sibling-ordered DAG, whose least solution is computed by
a greedy left-to-right scan taking a max over depths. That is a **max-plus system, monotone in
every input** — exactly the species GoFish's size fold solves, except the claim bubbling up is
not a scalar extent but a **per-depth vector** (the contour), merged pointwise and fit by a max
of differences. Contours, threads, and mods are then _pure schedule_: Kennedy's functional pearl
(JFP 1996) is the executable compositional spec in the middle (extents as explicit lists — an
associative merge monoid, fit as `max` over pairwise deficits, "absolute positions are a later
pass"); Walker/BJL/van der Ploeg are the same algorithm with progressively more aggressive
representations (threads = O(1) contour continuation; mod = the relative-coordinates change
Kennedy himself notes would make his O(n²) merge linear). BJL's paper title is literally the
schedule claim: _same layouts as Walker, linear time_. Van der Ploeg extends the spec (variable
node heights → contours compared over y-intervals) without changing its species.

**Split.** Spec: y stratified by depth (or by `stack` in y for the non-layered variant); minimum
width subject to per-level non-overlap of rigid silhouettes; parents centered over children.
Policy: which feasible point — the greedy left scan gives the _least_ solution; symmetric
tidiness is `mean(least, greatest)` (Kennedy computes both folds and averages; Walker/BJL
approximate by even redistribution). Note this "average the extremal solutions" policy is the
same trick Brandes–Köpf uses for graph x-coordinates — it recurs. Schedule: contours/threads/
mods/`executeShifts`; also the witness bookkeeping (`ancestor`/`nextAncestor`) exists only so
the greedy schedule can attribute shifts in O(1) — a solver never needs it.

**Two honest caveats.** (1) Rigidity is not an aesthetic freebie; it is the _compositionality
axiom_ that makes the problem a fold (dropping it gives narrower non-tidy layouts and, with
integer coordinates, NP-hardness — Supowit & Reingold 1983). In GoFish terms, rigidity =
"each subtree presents one claim and is placed as a unit," which the engine already assumes.
(2) The constraint set is per-_depth_, i.e. between nodes in _different_ layers of _different_
subtrees — GoFish's `distribute` gives non-overlap only between sibling bounding boxes on one
axis. Bounding-box tidy trees (gotree-style) are reachable today; contour-tight ones need the
richer claim carrier (§5, Option C).

**Verdict.** The strongest case of the five. The spec is already in the engine's semiring; what
is missing is only the _carrier_ of the claim (a per-depth vector instead of a scalar) and the
policy hook (choice of feasible point). No iteration, no discrete search anywhere.

### 2.3 Circle packing

**Pipeline** (d3 `pack`):

| step | what                                                                                                                                                              | data-flow shape                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1    | leaf radii `r = √value`                                                                                                                                           | pointwise map                                                           |
| 2    | `eachAfter`: pack each node's children in a local frame (front-chain greedy), compute smallest enclosing circle → that circle _is_ the node at the parent's level | bottom-up fold; per-node body = sequential greedy + geometric reduction |
| 3    | (padding) re-pack once with radii inflated by pad·(root.r/extent)                                                                                                 | one iteration of a fixed point                                          |
| 4    | `eachBefore`: `r *= k; x = parent.x + k·x_local` with `k = extent/(2·root.r)`                                                                                     | top-down affine cascade                                                 |

The front chain: circles inserted tangent to a chosen pair on the current outer boundary
(closed-form tangency: two quadratic distance equations), conflicts resolved by splicing the
chain and retrying, next pair chosen greedily closest to the centroid (Wang et al., CHI 2006).
The enclosing circle is Welzl/MSW — an LP-type problem whose spec is a tiny second-order cone
program (`min R s.t. |X − cᵢ| + rᵢ ≤ R`) and whose combinatorial algorithm is, again, a fast
exact schedule for it. Determinism comes from a fixed-seed LCG — **the schedule is pinned to
stabilize an underdetermined spec.**

**Split.** Spec: pairwise non-overlap, tangency/compactness, minimal enclosing circle, area ∝
value at leaves. Policy: insertion order and the greedy pair choice — and here, unlike tidy
trees, **the policy is most of the visible output**: any non-overlapping tangent packing
satisfies the spec, and shuffling input order changes the picture. Schedule: front-chain
representation, MSW move-to-front, the fixed seed.

**Verdict.** Two genuinely different halves. The _composition_ structure is engine-shaped: the
inter-level contract is exactly a claim ("children in a local frame → one radius"), and because
packing is homogeneous of degree 1 in the radii, the final scale-to-fit is a σ-style
one-unknown solve (`k · 2·root.r = extent`). **Homogeneity is the membership criterion** for a
foreign layout joining the affine cascade — and d3's own padding is the documented violation
(pixel padding breaks homogeneity, hence d3's pack-measure-repack, i.e. one fixed-point step:
monotone-with-affine-fast-path territory). The _interior_ of `packSiblings` — quadratic
tangencies, mutable chain, order-dependent greedy — is irreducibly foreign: no constraint
formulation recovers it, and unlike the other four there is no published "same spec, exact
solver" twin short of full optimization (the optimizing cousin is the Voronoi treemap: same
spec family, power-diagram iteration as strategy, gap-free). Keep it a leaf algorithm node
forever; the research content is the _contract_ it must satisfy (monotone, ideally homogeneous
face to the solve), not its decomposition.

### 2.4 Sankey

**Pipeline** (d3-sankey — a fixed six-stage function composition):

| step | what                                                                                                                                                                              | engine reading                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1    | resolve links, group by endpoint                                                                                                                                                  | relational join                                                        |
| 2    | `value = max(Σin, Σout)`                                                                                                                                                          | size claim per node                                                    |
| 3–4  | longest-path layering, both directions                                                                                                                                            | max-plus graph fold (twice)                                            |
| 5a   | column x from a **pluggable align policy** (`left/right/center/justify` — one-liners over the two ranks)                                                                          | `spread` on x; policy = data transform                                 |
| 5b   | `ky = min over columns of (extent − (n−1)·pad)/Σ value`                                                                                                                           | **shared scale = min of per-column affine fits — literally a σ solve** |
| 5c   | initial stack + even slack distribution per column                                                                                                                                | `stack` + `distribute`                                                 |
| 5d   | `iterations` rounds of alternating barycenter relaxation (span-weighted pulls toward link-straightness) + `resolveCollisions` (1-D push-apart from the middle, clamped to extent) | fixed-point iteration = projected coordinate descent                   |
| 6    | stack link stubs inside each node, ordered by far-endpoint y                                                                                                                      | `stack` inside each node                                               |

**Split.** Spec: heights = value·k with one shared k; no overlap within columns; containment;
links straight as possible; few crossings. Zarate et al. (PacificVis 2018) state the exact spec
as a MILP (ordering booleans + continuous positions) — d3's relaxation loop is a heuristic
strategy for it, with `alpha = 0.99^i` annealing and a final `beta = 1` pass that guarantees
feasibility. Policy: `nodeAlign`, `nodeSort`, `linkSort` — and note the design move: supplying
a sort **converts an optimized degree of freedom into a fixed one**. Schedule: sweep order,
iteration count, annealing constants.

**Verdict.** The decisive fact: **with `nodeSort` and `linkSort` given, the entire layout is
closed-form constraint evaluation** — spreads, stacks, and a min-of-affine-fits scale solve the
engine performs today. The iterative core is separable and optional, not load-bearing. So
Sankey factors as: _discrete ordering decision_ (optimize it, accept it from data, or accept it
from the user) _→ pure GoFish constraints_. Of the five, this is the cheapest high-fidelity
port: an algorithm node (or eventually a choice/objective pass) that outputs only _orders_,
feeding operators that already exist. It is also the cleanest illustration that the residue is
an ordering problem, not a geometry problem.

### 2.5 Layered graph layout (dagre / Sugiyama / ELK)

**Pipeline.** dagre's `runLayout` is a flat list of ~25 passes over one mutable graph, each with
pre/post-conditions stated as attribute-schema invariants (`rank` exists; every edge spans one
rank; `order` exists) — informally, IR levels. The spine: **acyclic** (reverse a feedback edge
set; tag for later restore) → **nesting graph** (compile _clusters_ into border dummy nodes +
minlen inflation — `nest` desugared into difference constraints) → **rank** → **normalize**
(split long edges into chains of dummy nodes so all later phases reason only about adjacent
layers; record `dummyChains`) → **order** → **position** → a stack of `undo`s that read
dummy coordinates back as bend points and restore reversed edges. Two structural facts: every
lowering pass is bracketed with an undo (lower/readback pairs — the same elaboration-with-
provenance move as GoFish chrome), and `rankdir` is implemented by transposing the graph before
and after (direction is a coordinate transform, not an algorithm parameter).

**The three hard phases:**

- **Rank.** Spec: minimize `Σ weight·(rank(w) − rank(v))` s.t. `rank(w) − rank(v) ≥ minlen` —
  an integer program whose constraint matrix is totally unimodular, so the LP relaxation is
  integral. dagre ships three interchangeable rankers for the one spec: `longest-path` (a
  max-plus fold — _feasibility is something GoFish's fold already computes_), `tight-tree`,
  `network-simplex` (Gansner et al. 1993). Same spec, three schedules of increasing optimality;
  the objective, not feasibility, is what the engine lacks.
- **Order.** Crossing minimization: NP-hard for even two layers; everyone sweeps
  barycenters/medians up and down against a cross-count until stale. Genuinely outside any
  affine fragment — permutation search. Notably dagre accepts ordering _constraints_
  (`{left, right}` pairs, subgraph atomicity) — the same vocabulary an ordering-aware
  `distribute` would take — and a `customOrder` escape hatch.
- **Position (x).** **The smoking gun for spec/strategy separation.** One spec — within-layer
  separations `x_{i+1} − x_i ≥ (w_i+w_{i+1})/2 + sep` (= `distribute`), plus a weighted-L1
  straightness objective `Σ Ω·ω·|x(u) − x(v)|` prioritizing dummy chains — and two published
  strategies: Gansner et al. solve it by _feeding an auxiliary graph to the same network
  simplex used for ranking_ (one engine, two phases — strong evidence both are the same
  constraint species), while Brandes–Köpf (2001) is a combinatorial O(V+E) pass: greedily
  commit conflict-free median _alignments_ (choosing which `align` constraints to activate),
  collapse aligned chains into blocks, compact the block graph with a max-plus fold (then a
  min-plus pull), do all four up/down×left/right symmetries, and **average the extremal
  candidates** — the tidy-tree symmetry policy again. Once the alignment choices are fixed,
  everything remaining in BK is monotone-affine. And y-positioning is literally
  `stack(layers, ranksep)` with per-layer max claims.

**ELK Layered** is the existence proof that this pipeline modularizes in production: five phase
_interfaces_ (cycle breaking, layering, crossing minimization, node placement, edge routing),
each with 2–7 registered implementations, plus ~57 intermediate processors slotted
before/between/after phases — and each phase implementation _declares which processors it
needs_, with an assembler unioning them into the final pipeline. That is dependency-driven
pipeline assembly, the closest thing in layout practice to Halide's "schedule pulls in its
lowering."

**Verdict.** Sugiyama was _born_ modular — the framework is literally named as four phases.
The engine-relevant reading: ranking and x-assignment are difference-constraint systems with L1
objectives (feasible today, optimal not); ordering is the irreducible discrete core; lowering
(dummy nodes, cluster borders) is an elaboration discipline GoFish already practices. A GoFish
Sugiyama would be: algorithm nodes for order (and optionally rank objectives), constraints for
everything else, `connect`/ribbons for edges through dummy positions.

---

## 3. The common factorization

Reading the five side by side, every one factors into the same five step species — and no
algorithm needs more than one instance of the "hard" species:

|                 | bottom-up fold                               | discrete plan (policy)                                                 | continuous solve                                         | top-down evaluation       | iteration                         |
| --------------- | -------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------- | --------------------------------- |
| **treemap**     | Σ values                                     | tile = plan synthesis (greedy rows / bisection / enumerate-and-choose) | proportional division + gaps _(σ solve)_                 | recursive rect assignment | —                                 |
| **tidy tree**   | contour merge _(max-plus, vector carrier)_   | symmetry = choice of feasible point                                    | least solution of max-plus fit                           | mod prefix-sum            | —                                 |
| **circle pack** | radius per node _(homogeneous face)_         | insertion order + tangent pair _(greedy, output-visible)_              | enclosing circle (SOCP); scale-to-fit _(1 unknown)_      | affine cascade            | 1 step (padding)                  |
| **sankey**      | node values; longest-path ranks _(max-plus)_ | node/link ordering                                                     | `ky` = min of affine fits _(σ solve)_; stacks            | link stub offsets         | optional (collapses when ordered) |
| **sugiyama**    | longest-path ranks _(max-plus)_              | edge reversal; crossing order; alignment commitment                    | separations + L1 straightness _(difference constraints)_ | dummy→bend readback       | order sweeps                      |

Three observations fall out.

**1. The continuous solve column is always GoFish's two semirings.** Proportional division,
min-of-affine-fits shared scales, difference constraints with max-plus least solutions,
one-unknown scale-to-fit — nothing in that column is outside (max, +)/(min, +) except the L1
_objectives_ (which choose among feasible points, i.e. are policy machinery, not new constraint
species).

**2. The "schedules" of the layout literature split exactly along the §1 line.** Output-
invariant schedules (threads/mods, BK-given-alignments, network simplex vs. LP, Welzl,
resquarify's cache) could be adopted or ignored freely — they are performance engineering.
Output-_selecting_ mechanisms (greedy rows, front-chain order, barycenter sweeps, even-
redistribution) are policies for underdetermined specs; the honest way to host them is the
pretty-printer way — a choice construct plus either a pinned deterministic policy or an
objective — not the Halide way.

**3. Iteration is never load-bearing.** Everywhere it appears it is a heuristic strategy for an
optimization spec (sankey relaxation ← MILP; order sweeps ← NP-hard crossing count; pack's
repack ← non-homogeneous padding), and in two of three cases there is a mode where it vanishes
entirely (sorted sankey; padding-free pack). GoFish's no-fixpoint rule survives this survey
intact: iteration belongs _inside_ algorithm nodes or _outside_ the engine (an optimizer that
emits orders/pins), never in the propagation core. This matches FTL, which got a browser's
worth of layout out of statically-ordered passes and handled the one global feature (floats) by
speculate-check-rerun at the schedule level.

Where each algorithm needs to touch the engine also classifies cleanly by _which pass hosts the
seam_: treemap's plan runs top-down (consumes proposals, emits subtrees); tidy tree and pack are
bottom-up (emit claims — vector-valued and circular respectively); sankey and sugiyama need a
pre-pass (emit orderings) before any geometry at all.

---

## 4. What GoFish already has

Worth stating plainly, because the survey kept landing on machinery that already exists:

- **The continuous solve**, both semirings, with the three-tier schedule in `monotonic.ts`
  (linear / convex-piecewise exact / bisection) selected by normal form — already an
  algorithm/schedule separation in miniature.
- **The policy concept**, named: fill splits and weak origins are documented as policy verdicts
  for under-determination. The engine has layer 2 of §1; it just has no _user-facing_ choice
  construct yet.
- **Elaboration with provenance** (chrome → ordinary nodes, re-resolved) — the same
  lower/readback bracket as dagre's normalize/undo and d3's synthetic row nodes.
- **The algorithm-node escape hatch**, semi-formalized: "custom layouts sit outside the
  generators but inside the language: arbitrary computation that emits claims, proposals, and
  placements under the same ownership rules" — with `treemap.tsx` on main as the (currently
  scribble-emitting) example and #541 as the plan to make it emit constraints.
- **Value-proportional division and shared scales** — the σ solve _is_ d3-sankey's `ky`
  computation and slice/dice's `k`, generalized.

And the known gaps, confirmed rather than discovered by this survey: no choice/`min` in the
claim algebra (would cost the convex fast path, not invertibility); no objectives; no ordering
decisions; scalar-per-axis claim carrier only; area/px² outside the per-axis algebra; no
inter-subtree (contour-level) separation constraints.

---

## 5. Design options

Ordered roughly by cost. These compose; they are not alternatives. No commitment implied — this
is the option space.

**A. Formalize the foreign-layout contract (small).** Write down what today's escape hatch must
promise: an algorithm node presents a _monotone_ face to the σ solve (constant box at minimum),
and joins the scale-to-fit cascade iff its output is _(positively) homogeneous_ in its inputs —
the criterion circle packing satisfies and pixel-padding violates. Bottom-up nodes (pack) need
frozen children; top-down nodes (treemap) need only the proposal; iterative nodes (force) need
a pinned box. Cheap, and it turns "escape hatch" into a checkable interface — the analogue of
Halide accepting an `extern` stage with declared bounds behavior.

**B. Plan synthesizers: algorithms that emit operator trees (medium; highest leverage-per-cost).**
Generalize d3's tiling interface: a pure function `(children's claims, proposed extent) → an
operator subtree over those children`, invoked during the top-down pass, its output then laid
out by the ordinary engine. Squarify becomes ~15 lines emitting nested oriented stacks; binary,
strip, pivot, slice-dice are trivial; resquarify falls out as _caching the emitted tree_. The
engine repays immediately: exact gap+proportion solving (better than d3's padding), and plans
whose leaves are ordinary marks compose with everything else (coords, embedding, selection).
This is #541 taken to its logical end, and the natural first probe: treemap-as-plan-synthesizer
with a pluggable `tile`.

**C. Enrich the claim carrier (medium-large; the tidy-tree unlock).** Two independent
extensions, both staying inside "monotone measures, max-plus composition":

- **`min`/choice in the algebra** — already analyzed (min ≡ the pretty-printer's `group`;
  monotone piecewise-linear is closed under min and still uniquely invertible; concrete
  implementation shadow = a difference-of-convex normal form in `monotonic.ts`, or route
  through `unknown` and lose printability). Ship predicate-guarded choice first; automatic
  selection needs the objective story.
- **Vector-valued claims** — the TACO move (representation as a strategy axis). A contour is
  a claim valued in per-depth max-plus vectors: merge = pointwise max/passthrough
  (associative, identity []), fit = max of pairwise differences, and Kennedy's paper is
  the reference semantics. The same generalization covers baselines-as-part-of-the-measure
  (already bubbled) and is where Bernardy's Pareto frontier appears _if_ choice and
  vector measures combine (incomparable branches). Without choice, vector claims alone keep
  the single-solution world and buy contour-tight tidy trees.

**D. Ordering as a first-class decision (large).** Sankey and Sugiyama both reduce to "decide
orders, then pure constraints." Options within the option: accept orders from data/user
(zero engine work — worth doing regardless, as the sorted-sankey fact shows); a `distribute`
that takes partial-order constraints (dagre's `{left, right}` vocabulary); an optimizer node
that owns a permutation variable and emits it (the MILP/heuristic choice hidden behind it, per
the cost-factory pattern). The solver core never sees a permutation in any variant.

**E. A schedule language proper (thesis-scale, speculative).** FTL's grammar
(`parPre | parPost | recursive`, `;`, `||`, holes + checker + autotuner) is a ready-made
starting point, and GoFish's pass list is already close to a term in it. The honest assessment:
this pays off for _parallel/incremental/GPU execution_ and for proving pass-order correctness —
not for expressiveness. None of the five algorithms needs it to be _expressed_; it is how you'd
make the whole engine fast and verifiable afterward. Park it until A–D create demand.

**Non-goals, deliberately.** Crossing-minimization search and front-chain interior geometry stay
foreign forever — one is NP-hard permutation search, the other order-dependent nonlinear
greedy; both are exactly what the restricted-spec lesson says to fence out, and both have clean
seams (an order; a radius) behind which to live. Simultaneous nonlinear constraint solving
(Penrose's territory) remains out of the language by design; Penrose marks the far end of the
spectrum — all spec, all optimizer, no schedule — and its cost profile is the argument for
staying tropical where possible.

---

## 6. If one probe had to be picked

Treemap-as-plan-synthesizer (Option B applied to the existing `treemap` node): smallest surface
(one new interface + a rewrite of an existing node), immediately user-visible (exact padding,
composability of leaves), exercises the top-down seam that pivot/strip/mosaic variants also
need, and produces the first hard evidence for or against the "plans + constraints" contract.
The tidy-tree carrier (Option C) is the theoretically richest follow-up — it is the one place a
classic algorithm sits _entirely_ inside the semiring, waiting only on the carrier.

---

## 7. Sources

**Read source code:** d3-hierarchy (`treemap/*` incl. `squarify.js`/`resquarify.js`/`binary.js`;
`tree.js`; `pack/{index,siblings,enclose}.js`, `lcg.js`), d3-sankey (`sankey.js`, `align.js`),
dagre (TypeScript `lib/`: `layout.ts`, `acyclic.ts`, `nesting-graph.ts`, `rank/*` incl.
`network-simplex.ts`, `normalize.ts`, `order/*`, `position/{index,bk}.ts`,
`coordinate-system.ts`), van der Ploeg's `non-layered-tidy-trees` reference `Paper.java`.

**Papers.** Treemap: Shneiderman TOG 1992; Bruls, Huizing & van Wijk 2000
(vanwijk.win.tue.nl/stm.pdf); Bederson, Shneiderman & Wattenberg TOG 2002 (ordered/strip/pivot,
quantum); Wickham & Hofmann, Product Plots, TVCG 2011. Tidy tree: Reingold & Tilford 1981;
Walker 1990; Buchheim, Jünger & Leipert GD 2002; Kennedy, "Functional Pearl: Drawing Trees,"
JFP 1996 (+ Gibbons, "Deriving Tidy Drawings," JFP 1996); van der Ploeg SP&E 2014; Supowit &
Reingold 1983 (NP-hardness); Zxch3n's tidy (Rust, O(depth) incremental). Pack: Wang, Wang, Dai
& Wang CHI 2006; Welzl 1991 / Matoušek–Sharir–Welzl 1996; Balzer & Deussen, Voronoi Treemaps,
InfoVis 2005. Sankey: Zarate et al., Optimal Sankey Diagrams via Integer Programming,
PacificVis 2018. Graphs: Sugiyama, Tagawa & Toda 1981; Gansner, Koutsofios, North & Vo, TSE
1993 (graphviz.org/documentation/TSE93.pdf); Brandes & Köpf GD 2001; ELK (eclipse.dev/elk;
arXiv 2311.00533 — 5 phases, ~57 processors). DSLs: Ragan-Kelley et al., Halide, PLDI 2013
(CACM 2018); Kjolstad et al., TACO, OOPSLA 2017; Ikarashi et al., Exo, PLDI 2022; Meyerovich &
Bodik WWW 2010 + Meyerovich, Torok, Atkinson & Bodik PPoPP 2013 (FTL schedule synthesis;
treemap-as-attribute-grammar case study) + Superconductor LASH-C 2013. Printing: Oppen TOPLAS
1980; Hughes 1995; Wadler 1998; Bernardy ICFP 2017; Porncharoenwase, Pombrio & Torlak OOPSLA
2023; Knuth & Plass SP&E 1981. Adjacent: Panchekha et al. (Cassius/Troika, formal CSS); Ye et
al., Penrose, SIGGRAPH 2020.

---
title: "Feasibility: Constraints as the Core Language"
section: Speculative Notes
order: 31
status: speculative
---

# Feasibility: Constraints as the Core Language

**Question.** Can every layout operator be expressed in terms of constraints, so
that the core language reduces to _layers of constraints, marks, and derived
marks_ (line/area/connect/enclose)? Concretely: the Bluefish analogy
`spread ≈ align + distribute` is roughly true — can it be made _exactly_ true,
possibly with more constraint kinds? And if so, what happens to the two pieces
of machinery Bluefish never had to face: the SwiftUI/Compose-style **proposed
size** ("size constraints") passed down during layout, and **underlying-space
resolution**?

**Verdict.** Feasible, with one specific architecture: constraints acquire a
_space-fold_ facet (a typing rule on underlying spaces, mirroring what each
operator's `resolveUnderlyingSpace` already does) and the **Layer becomes the
sole mediator** of the budget solve — composing its constraints' folds into a
claim, inverting that claim against its allotted size, and proposing per-child
sizes. A working prototype (see [Empirical evidence](#empirical-evidence)
below) reproduces `spread` exactly — including Monotonic-inversion auto-fit —
from `layer + align + distribute`. Three things do **not** reduce to today's
align/distribute and are the genuine design work: a _fill policy_ for
unclaimed children (the proposed-size slice), _size-setting_ constraints
(nest, treemap slots, min/max-pinned extents), and a principled replacement
for `sharedScale`'s mutation-based sibling sharing. None of them looks like a
blocker; each has a natural home in the same architecture.

This note subsumes the narrower
[#475](https://github.com/gofish-graphics/gofish-graphics/issues/475)
(constraints lack spread's auto-fit) and answers most of
[#354](https://github.com/gofish-graphics/gofish-graphics/issues/354)'s
questions; it builds on [[operators-vs-constraints]], whose "option 1:
operators compile to constraints" is the shape proposed here.

## What `spread` actually does beyond align + distribute

Reading `spread.tsx` against `constraints/align.ts` + `constraints/distribute.ts`,
the placement halves are already the same algorithm:

- spread's align step (`spread.tsx:357-365`, via `alignChildren`) ≅
  `Constraint.align` — pick a baseline from the first fixed child, move the
  rest (`constraints/align.ts`).
- spread's distribute walk (`spread.tsx:367-425`) ≅ `Constraint.distribute` —
  anchor on the first placed child, walk bidirectionally placing by
  min/center with spacing (`constraints/distribute.ts:32-104`). Even the
  fixed-child handling matches (spread warns on inconsistency; the constraint
  silently respects placement — a conflict-semantics choice, not a structural
  difference).

What spread does _in addition_ is exactly four mechanisms, and they are the
whole gap:

1. **The space fold** (`spread.tsx:112-229`). On the stack axis it composes
   children's claims: all-SIZE & data-driven → `SIZE(Monotonic.add(children) +
spacing·(n−1))` (edge mode; center mode is an `unknown` Monotonic over the
   first/last halves); all-SIZE constant + named → `ORDINAL`; all-POSITION →
   summed POSITION; `glue` (= stack) → children concatenated into a single
   anchored `POSITION(0, Σ run(1))`. On the cross axis it applies the
   alignment fold (`resolveAlignmentSpace`). Measures forget-merge
   (`forgetAllMeasures`) because spreading different fields is legitimate.
2. **The scale solve** (`spread.tsx:258-302`). Given its allotted size, it
   derives a scale factor by dispatching on its _own_ resolved space — SIZE →
   `domain.inverse(budget)`, POSITION → `budget / width(domain)`, DIFFERENCE →
   `budget / width` — and, when `sharedScale`, _mutates_ the inherited
   `scaleFactors` array so later siblings see it, and writes `scaleContext`.
3. **The budget slice** (`spread.tsx:304-327`). It proposes to each child
   `[slice, fullCross]` where the slice is `(budget − spacing·(n−1))/n` or
   weight-proportional (`stackWeights`). Important nuance: a data-sized child
   _ignores_ the slice (it computes `value · scaleFactor`); the slice is only
   consumed by "fill" children with no size claim of their own. The proposal
   is a fallback, not the primary sizing mechanism.
4. **Measure-and-report** (`spread.tsx:439-482`). Union the placed children's
   extents into `intrinsicDims`, return a partial translate (undefined unless
   pinned) — the "parent can place me" protocol. `Layer` already does this
   identically (`layer.tsx:495-512`), so this one is shared, not extra.

So the exact statement is:

> `spread = align + distribute + (space fold) + (budget solve) + (fill slice)`

and the reduction question becomes: can the last three live on the
constraint/layer side? The prototype says yes.

## Why the Bluefish analogy is only _roughly_ true

Bluefish's `StackV` really is cleanly `Align + Distribute` at the placement
level — Algorithm 1 in the paper separates into an x-line (align) and a y-line
(distribute), and §5.2.4 makes the split explicit. But two things stop the
analogy from being exact when transported to GoFish:

1. **Bluefish relations never size children.** The paper's own limitations
   section (§6.2, "Width and Height Alignment") calls this out: relations set
   positions only, sizes are fixed before layout, and the authors note UI
   frameworks solve sizing by letting parents query/propose child sizes — "We
   could adopt a similar approach." GoFish _did_ adopt that approach (the
   proposed-size pass), which is precisely the part with no Bluefish answer to
   copy. Splitting `StackV` into Align + Distribute in Bluefish also silently
   drops the `w: maxBy, h: sumBy + spacing` bbox that Algorithm 1 returns —
   tolerable there because nothing downstream solves against that bbox.
   In GoFish that composed extent is load-bearing: it is the Monotonic that
   auto-fit inverts.
2. **Bluefish has no underlying space.** Relations relate pixels; there are no
   domains, measures, or scale factors to resolve. GoFish's operators carry
   space-typing rules (`resolveUnderlyingSpace`), so "operator = constraints"
   demands those rules move somewhere.

Both gaps point at the same answer: the constraint primitives need a second,
_compositional_ facet beyond placement — a fold on underlying spaces — and the
Layer needs to mediate the down-flowing size negotiation.

## The unifying theory: folds, max-plus closure, and the budget adjoint

The pleasant surprise is that the needed algebra already exists in the
codebase, split across operators:

- **align / overlay fold = max/union.** `unionChildSpaces`
  (`alignment.ts:47-103`) folds all-SIZE children with `Monotonic.max`;
  `resolveAlignmentSpace` (`alignment.ts:110-179`) is the alignment-aware
  variant.
- **distribute fold = sum (+ constant).** `spread.tsx:192-203` folds with
  `Monotonic.add` and `Monotonic.adds(·, spacing·(n−1))`.
- **nest fold = inner + padding** — another `adds` (landed this round as
  `Constraint.nest`; prototyped on the gotree branch as `Constraint.contain`).

Sum, max, +constant, and scalar multiples of monotone functions are monotone
and closed under composition — a **max-plus algebra** over Monotonics. That
closure is the feasibility theorem in miniature: _the extent of any network of
align/distribute/nest constraints over children with monotone size claims
is itself a Monotonic, hence invertible, hence auto-fittable._ Nothing about
nesting or mixing the constraints breaks the solve; `spread`'s special status
evaporates.

The down-flowing "size constraint" then has a crisp characterization: the
**budget solve is the adjoint of the claim fold**. Bottom-up, the fold maps
child extents-as-functions-of-σ to the parent's extent-as-a-function-of-σ.
Top-down, the parent inverts the fold at its allotted budget to recover σ
(`Monotonic.inverse` is a Galois connection for monotone maps — exact where
invertible, best-approximation elsewhere) and pushes σ back through each
child's own claim to obtain that child's extent. The per-child _proposal_ is
just the child's claim evaluated at the solved σ — except for children with no
claim (UNDEFINED / "fill"), for which a **fill policy** must supply the answer
(equal slices today; the `stackWeights` variant has since been removed). The fill policy is genuinely extra
information beyond align + distribute — it is the flex-layout fragment of the
language — and it is the one place "spread = align + distribute" can never be
made literally true without adding _something_. The smallest something: the
distribute constraint carries the policy, and the Layer applies it to
unclaimed children only. (Weighted policies were later deleted; see
[[size-claims]] for where proportional sharing actually belongs.)

**Degrees of freedom: the "two of three" rule.** Per axis, every
spread/distribute situation is one budget equation —
`container = Σ childSizes(σ) + spacing·(n−1)` — and the folkloric rule
"spread works when two of {container, spacing, child sizes} are known" is
exactly the condition that the equation has **one free variable**, which is
exactly when one Monotonic inversion solves it. The model states the rule
precisely where the operator only gestures at it:

- container + spacing known → solve σ (auto-fit; the prototype's Fit pair) or
  slice fill children (the fill policy supplies the answer for claim-less
  children).
- child sizes + spacing known → the fold _is_ the container (shrink-to-fit /
  the upward claim).
- container + child sizes known → solve **spacing** (justify/space-between).
  Spread does **not** support this today — `spacing` is always a constant prop
  (`spread.tsx:49`); nothing in the codebase solves for it. In the fold model
  it is a one-line variant, not new machinery: hold σ fixed and the same fold
  is `Monotonic.linear(n−1, Σ sizes)` _in spacing_ — same inversion, different
  unknown (`distribute({ spacing: "auto" })`).
- all three known → over-determined: a consistency check (conflict-semantics
  bucket, residual 4).
- one known → under-determined: a policy must designate which unknown it
  fills — that is what equal-slices is. (E.g. data-driven
  children _plus_ auto spacing is two unknowns; σ must be pinned — say to an
  inherited shared scale — before spacing is solvable.)
- glue (stack) pins spacing ≡ 0, so the unknown must be σ or the container —
  consistent with `stack` exposing no spacing option.

Notably, `layer.tsx` is already most of the way to being this mediator: the
self-scaling-region path (`layer.tsx:317-349`) stashes a composed claim and
inverts it against the layer's own pixel box (`stashed.domain.inverse(size[dim])`)
to produce local `childScaleFactors`. The prototype below generalizes exactly
this — fold from constraints, invert against the _allotted_ size rather than
only an explicit `w`/`h`.

In this picture each constraint kind is a pair:

| facet                        | direction             | role                                                                                                 |
| ---------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| **space fold** (typing rule) | bottom-up, pre-layout | compose child claims into the layer's claim; merge measures (throw or forget per the existing rules) |
| **placement rule**           | post-child-layout     | emit pins/relations into `placementSolver.ts`, then commit atomically to each target                 |

and the Layer's layout becomes a fixed pipeline: resolve size → solve σ per
axis from the folded claim → propose per-child sizes (claim at σ, else fill
policy) → lay out children → apply placement rules → fill unplaced at
baseline → measure. `spread({dir, spacing, alignment, sharedScale})` compiles
to `Layer(children).constrain(c => [align({[cross]: alignment}, all),
distribute({dir, spacing}, all)])` and disappears as machinery, surviving only
as surface sugar — option 1 of [[operators-vs-constraints]], now with the
missing two facets identified.

This is also the underlying-space story for constraints in general: the folds
_are_ typing rules, and the measure-typed unification work (8f7e7a3e) already
defined the unification semantics they should use (`mergeMeasures` where
agreement is required, `forgetAllMeasures` where heterogeneity is legitimate).
Constraints stop being outside the type system — issue #475's gap — by
construction, not by patching.

## Empirical evidence

A working prototype (uncommitted, in the working tree of the
`sprightly-wobbling-cloud` worktree) implements the architecture above for the
"one distribute (+ optional align) covering all named children" shape and
demonstrates **exact** parity with `spread` on paired Storybook stories
(`stories/lowlevel/ConstraintParity.stories.tsx`), verified via `capture-one`
normalized-DOM diffs:

| pair                                                                             | result                                                                                                                                                             |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SpreadBar` vs `ConstraintBar` — data-driven heights, fixed widths               | exact match: both render `[x=0 w=40 h=75], [x=48 w=40 h=200], [x=96 w=40 h=125]`                                                                                   |
| `SpreadFit` vs `ConstraintFit` — data-driven widths auto-fit into a 200px budget | exact match: both render widths `53.8537, 89.7561, 40.3902` — the Monotonic-sum inversion reproduced bit-for-bit (Σ widths = 184.0, + 2·8px spacing = exactly 200) |

The Fit pair is the load-bearing one: it is precisely the case issue #475 says
constraints cannot express. `pnpm capture-diff main` shows zero geometry
changes to existing stories (the new path is gated on the recognized
constraint shape).

What it took — six mechanisms, all small, all in the places the theory
predicts:

1. `distributeSpaceFold` (`constraints/distribute.ts:63`) — the distribute
   fold, mirroring spread's stack-axis dispatch exactly (SIZE sum + spacing /
   ORDINAL / POSITION cases, forget-merged measures).
2. `alignSpaceFold` (`constraints/align.ts:23`) — delegates to spread's own
   `resolveAlignmentSpace` unchanged (shared anchor vocabulary).
3. `resolveConstraintFold` (`layer.tsx:81`) — recognizes the covered-children
   shape and returns per-axis space overrides + a budget descriptor.
4. Fold wiring in Layer's `resolveUnderlyingSpace` (`layer.tsx:417`) — applied
   _before_ the self-scaling stash loop, so an explicit-size layer gets a
   local scale from the folded space through the **already-existing**
   self-scaling machinery, with no new code.
5. Budget solve in Layer's `layout` (`layer.tsx:493`) — inverts the folded
   SIZE Monotonic against the _allotted_ size (generalizing the self-scaled
   recipe beyond explicit `w`/`h`); idempotent with the root's inversion.
6. `childSizeFor` (`layer.tsx:516`) — proposes spread's equal-slice budget to
   constrained children instead of Layer's blanket full-size proposal.

Two findings sharpen the theory:

- **The crux is the fold, not the walk.** Auto-fit parity required _no_ new
  inversion machinery — the root already inverts whatever SIZE claim reaches
  it, and the Layer's local solve is interchangeable and idempotent with it.
  The only thing constraints were missing was _reporting the same composed
  SIZE upward_ that spread reports. `sharedScale`/`scaleContext` never had to
  move. In other words: the placement halves were already equivalent; the
  entire semantic content of "spread beyond align + distribute" lives in
  `resolveUnderlyingSpace`.
- **The align-fallback divergence, now unified (#552).** Spread's legacy align
  walk and the constraint path once used different no-sibling fallbacks — spread
  seated the cross-axis baseline at `posScale(0)`, the constraint on the layer
  box (`{start: 0, middle: size/2, end: size}`) — coinciding at `"start"` but
  diverging at `"end"`/`"middle"`. The placement solver now owns the fallback
  and dispatches on the axis's underlying-space kind, not the call site: a
  posScale-carrying (POSITION) axis falls back to the scale origin
  `posScale(0)`, a pixel-pure axis to the layer-box edge. Spread and
  hand-written constraints both lower to that solver path, so the pairs are now
  exact at every anchor.

## Operator-by-operator reduction

| operator                      | reduces to                                      | notes                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spread` / `spreadX/Y`        | `align + distribute` + fold/solve/fill on Layer | demonstrated by the prototype, including auto-fit                                                                                                                                                                                                                                                                                                                                                                |
| `stack` / `stackX/Y`          | `distribute(spacing: 0, glue)`                  | glue is a _fold variant_, not a placement variant: same walk, but the fold emits anchored `POSITION(0, Σ run(1))` instead of a SIZE sum — the kind-switch that makes stacked bars an addressable position space. Needs a `glue` (or `mode: "glue"`) option on the distribute fold                                                                                                                                |
| `layer`                       | the substrate itself                            | its overlay fold is `unionChildSpaces` = the trivial (empty-constraint) case                                                                                                                                                                                                                                                                                                                                     |
| `scatter`, `position`         | `Constraint.position`                           | the domain-fragment fold already exists (`collectPositionDomains` → layer union, `layer.tsx:268-292`). Residual: `xMin/xMax`-style interval channels pin _two_ anchors on one axis, which sets a size from positions — today `place()` is write-once per axis, so this needs a size-setting rule (see below) or stays a mark channel                                                                             |
| `enclose`, `arrow`, `connect` | derived marks                                   | already the plan; `connect` is the canonical example (bbox derived from refs, no space claim of its own)                                                                                                                                                                                                                                                                                                         |
| `frame`                       | `layer` (or `coord`)                            | already sugar                                                                                                                                                                                                                                                                                                                                                                                                    |
| `group`                       | data combinator                                 | not a layout operator; untouched                                                                                                                                                                                                                                                                                                                                                                                 |
| `table`                       | `layer` + `grid` constraint (#548, done)        | a grid is the symmetric 2-D layout: cells partitioned into column tracks (x) and row tracks (y), each cell filling its track intersection. Extents are max-plus (track = max over its cells, total = Σ tracks + spacing); v1 is equal flex tracks (box-division), the table being the flex scope root. `table` now elaborates to `layer(cells).constrain(grid(...))` (`constraints/grid.ts`)                     |
| `treemap`                     | **does not reduce** to align/distribute         | d3 computes slot rects from data and _scales children into them_ — a global algorithm assigning positions _and sizes_. Either (a) keep as a custom layout node (Bluefish's answer: arbitrary layouts are nodes; constraints are the core, not the whole), or (b) recast as a _derived-constraint_ generator: run the algorithm, emit position constraints + size assignments. (b) needs size-setting constraints |
| `porterDuff`                  | stays                                           | a compositing/render concept, not layout                                                                                                                                                                                                                                                                                                                                                                         |
| `coord`                       | stays, orthogonal                               | coordinate transforms warp the space the constraint network solves in; the constraint reduction is what finally lets coord-wrapped constraint pipelines auto-fit (the #475 NestedPietree failure), because the Layer's solve runs regardless of whether content was assembled by operators or constraints                                                                                                        |

So the core language lands where the question hoped: **Layer (constraints) +
marks + derived marks + coord**, with operators as compile-time sugar. The
only container is Layer, which dodges the bbox-ownership ambiguity that made
Bluefish's unified relations awkward (§8.2 of the paper: "should Arrow's bbox
contain its endpoints?") — relations here never own boxes; the Layer they're
attached to does.

## The genuine residuals

These are the places where "yes, feasible" carries real design work rather
than mechanical migration.

**1. Size-setting constraints (the missing fourth kind).** Today's protocol is
single-assignment _positions_ (`place()` write-once per axis = Bluefish's
dimension-level ownership). Three pressures want single-assignment _sizes_
too: `nest` (outer's size := inner + padding — bottom-up), treemap-style
slot assignment (top-down), and Bluefish's own unsolved "width alignment"
(§6.2: make these elements equal-width — a max fold pushed back down, i.e.
exactly claim-at-solved-σ). All three are the same shape as the budget
adjoint: a size assignment derived from a fold. This should be designed once,
not three times. _Designed (June 2026): see [[size-claims]]_ — the verdict is
sizes-by-proposal (a size rule folded into space resolution when
scale-dependent, a dependency-ordered proposal otherwise), with the
linear-system bbox of #39 as the ownership ledger; a write-once post-layout
size facet on `Placeable` was evaluated and rejected (it is only safe for
leaves).

**2. The fill policy.** Where do `stackWeights` / equal-slices live? Options:
(a) on the distribute constraint (smallest; the prototype's choice); (b) as a
separate `Constraint.share`/flex kind, keeping distribute purely relational;
(c) on the child (`flex: n`, SwiftUI/CSS style). (c) matches UI-toolkit
intuition and keeps the constraint set per-axis pure, but moves layout
information onto marks; (a) is the pragmatic default. The prototype had to
re-derive spread's slice arithmetic inside Layer's layout; the lesson is that
the policy should travel _with the fold descriptor_ so spread and the
constraint path consume one shared budget allocator. Note the parity stories
could not exercise this (all their rects carried explicit sizes, which ignore
the slice) — fill children are exactly where an untested divergence would
hide, so the compiled form needs a fill-child parity story. _Resolved (June
2026): see [[size-claims]]_ — the weights/`stackWeights` arrays were deleted
outright (nothing used them), and a spike confirmed option (c) in its deep
form: a flex share is an ordinary SIZE claim in a reserved flex measure, the
standard inversion reproduces `allocateSlices` exactly, and the data+flex mix
is gated on the measure-keyed multi-space design (#547).

**3. `sharedScale` and scale sharing.** Spread's mutation of the inherited
`scaleFactors` array (first sibling solves, later siblings inherit) is
order-dependent and imperative — `layer.tsx` already pointedly refuses to copy
it ("never mutate the parent's `scaleFactors`"). The principled replacement is
_claim hoisting_: a shared scale exists iff the SIZE claim bubbles to the
common ancestor, which folds siblings with `max` and solves once; a local
scale exists iff the node absorbs its claim (self-scaling region). That makes
`sharedScale: true/false` a _scoping annotation on the claim_ rather than a
mutation, and it is the same mechanism the measure-keyed multi-scale-per-axis
idea wants. Migration can keep the mutation initially (the prototype does);
the hoisting redesign should ride with the multi-scale work.

**4. Composition and conflict semantics for general networks.** The operator
image (one distribute + one align per axis, covering all children) is total
and order-independent, so equivalence is exact there — the prototype's
recognizer deliberately bails to `unionChildSpaces` for anything else (e.g.
the existing `SubsetSelection` story, where a distribute touches a subset).
The general case needs a _per-axis composition algebra_ rather than an
override: two distributes over disjoint subsets compose to a `max` of their
sub-sums (two independent stacks overlaid); a distribute interleaved with a
`position`-pinned anchor must solve its sum _relative to_ the pin. The extents
remain max-plus (longest path through the network), so the solve stays
well-defined, but the current one-space-per-axis model has no way to say
"this fragment is a sub-stack" — that wants either sub-domain tagging (the
existing `ordinalGroupId` field gestures at this) or the measure-keyed
multi-scale-per-axis design, which this would share machinery with. Separately,
over-constraint needs a decision: today `place()` silently no-ops on the
second write and spread warns; Bluefish throws with ownership info. Recommend:
keep write-once ownership, upgrade the silent no-op to a structured error at
the Layer, and reject cycles as z-order already does (Kahn's algorithm).

**5. Order of application.** Resolved for known-size placement and span extents:
align, distribute, position, span, nest-centering, and grid constraints compose
into one per-axis relation graph and are solved independently of declaration
order. Span contributes an extent fact (`min`, `max`, hence `size`) before the
graph is emitted, so non-start anchors on spanned nodes reduce to the same
`min + offset` relations as known-size nodes. Strong pins and self-placement
anchor components; otherwise a deterministic weak-origin policy removes the
remaining translation degree of freedom. Proposal-dependent sizing (nest
proposals, grid track sizing, and the broader size-claim algebra) still runs
before this pass and is the remaining generalization.

## Complexity and what the "solver" actually is

**Asymptotics: unchanged.** The operator pipeline is one visit per node per
pass with O(children) work per node — O(N) total. The constraint form adds,
per layer: the fold (O(references)), the ref map (O(children)), and
`applyConstraints` (O(references)). Constraint references are part of the
input spec, and the compiled operator image emits exactly two references per
child per axis — so the totals stay O(N), with a small constant factor
(roughly one extra sweep and one map build per layer, on affected nodes only).
Even the _general_ algebra stays linear: longest-path extents and cycle
rejection on the constraint DAG are Kahn-style O(V+E), and conflict detection
under write-once ownership is O(1) per write. There is no fixpoint iteration
anywhere. (Bluefish's evaluation corroborates the architecture class: render
time linear in scenegraph size, paper Fig. 9.)

**The solve itself.** This is not a constraint solver in the Cassowary/Z3
sense. It is three stages: (1) a bottom-up symbolic fold — and here the
`Linear` fast path matters: `add`/`adds`/`smul` of linears fold to a single
closed-form `Linear` (`monotonic.ts:78-105`), so the common case (bar charts,
stacks of data-sized rects) inverts in O(1) with **zero** numeric search;
(2) a per-axis **one-unknown** inversion — closed-form for linear claims,
bracketed bisection hard-capped at ~70 closure evaluations for `unknown`
claims (`util.ts:9-54`; produced by center mode, `max` over different
intercepts, mixed compositions); (3) a per-axis equality-graph solve for
placement once each anchor's size offset is known (including span extents),
with atomic commit and contradiction diagnostics. So: Bluefish-class local
propagation for positions, plus an
analytic one-unknown size solve Bluefish lacked. The known superlinear
lurkers, both pre-existing and shared with operators today: nested
_non-linear_ folds make an ancestor's inversion cost O(subtree closure size · 70) (mitigated by the linear fast path; could memoize `run` per σ), and
`collectConstraintRefs`' descent into nested plain layers is O(subtree) per
layer in the worst case (memoizable). Neither is quadratic in spec size.

**Brittleness and linear-cost robustness fixes.** Today's constraint path is
brittle in five identifiable ways, none of which needs a cleverer solver:

1. _Declaration-order sensitivity_ — resolved for known-size placement and span
   extents by the per-axis relation graph. The remaining order boundary is
   proposal-dependent sizing: nest/grid proposal sizing still runs before
   placement rather than as one general relation system.
2. _Silent conflict swallowing_ — `place()` no-ops on the second write. Fix:
   record an owner per (node, axis) — O(1) per write — and report both
   writers, exactly Bluefish's `bboxOwners`.
3. _Divergent align fallbacks_ — `posScale(0)` vs layer box (found by the
   prototype). Fixed (#552): a single space-kind-dispatched fallback —
   posScale → scale origin, pixel-pure → box edge.
4. _Underdetermination hidden_ — children the constraints never reach are
   silently nailed at origin. Fix: a diagnostic listing them.
5. _Inversion failure modes_ — bisection's growth cap can fail and spread's
   `inverse(...) ?? 0` then zeroes the scale factor (content vanishes). Fix:
   seed the bracket from the claim evaluated at σ=1 and surface failures as
   structured warnings — O(1).

All five are bookkeeping, not solving; robustness here is a diagnostics
problem, not a performance trade. The one expressiveness ceiling to be honest
about: one-unknown-per-axis local propagation cannot express genuinely
simultaneous systems (the paper's equilateral-triangle example) — that is the
intentional boundary of the design, unchanged from today.

Finally, because compilation is deterministic, `spread` can always keep a
fused fast path (today's specialized code) guaranteed to produce identical
output to its compiled form — standard operator fusion. The numbers above
suggest it will not be needed.

## What this is _not_

- Not a constraint _solver_. Everything stays local propagation — the solve is
  one Monotonic inversion per axis per layer, preserving the
  one-pass-per-node, debuggable architecture (the Bluefish paper's §5.2
  argument against global solvers applies unchanged, as does its Basalt
  comparison: low-level constraint languages are viscous; ours stay bundled
  behind operator sugar).
- Not a removal of operators from the _surface_. `spread`/`stack` remain the
  v3 vocabulary; they become guaranteed-faithful sugar (per
  [[operators-vs-constraints]] option 1), which is also what keeps authoring
  viscosity low — the paper's §8.2 lesson is that making users assemble
  relations by hand pushes specs diffuse early.
- Not a claim that _every_ layout is constraint-expressible. Anything
  requiring discrete reflow against measured sizes (line wrapping) or global
  optimization stays a custom layout node. The claim is that the _core_ is
  constraints; custom nodes plug into the same fold/solve interface.

## Suggested staging (refactor-first)

1. ✅ **Consolidate the two align implementations** — done: spread and
   hand-written constraints now lower to the same placement solver. The
   end/middle fallback divergence was unified (#552): a single
   space-kind-dispatched fallback (posScale → scale origin, pixel-pure → box
   edge) replaced the old call-site policies.
2. ✅ **Constraint space folds + Layer budget solve** — done:
   `distributeSpaceFold` (full spread dispatch incl. glue/explicit-size),
   `alignSpaceFold`, `allocateSlices`, per-axis composition in the layer with
   max-union for uncovered overlay siblings, budget inversion with a warning
   on non-invertible folds. Parity certified for bar/fit/fill/weights/glue.
   Addresses #475. (`nest` was not revived here — it lives with the
   size-setting design, residual 1.)
3. ✅ **`spread`/`stack` on the shared machinery** — done as _delegation_
   rather than literal `Layer.constrain()` compilation: spread keeps its node
   type (home for sharedScale mutation, scaleContext, axisDir, reverse,
   explicit-dims translate, measure-and-report) but its fold, slicing, align
   walk, and distribute walk are the constraint implementations; the bespoke
   copies are deleted (−128 lines). `capture-diff` vs main: zero geometry
   changes. Literal compilation is now a small step if a reason for it
   appears, since both spellings already share one engine.
4. **`scatter`/`position` via `Constraint.position`** (fold already exists);
   design the size-setting facet alongside (residual 1; see also #541 for
   treemap as a derived-constraint generator on top of that facet).
5. **`table` as nested folds; revisit `sharedScale` as claim hoisting** with
   the multi-scale-per-axis design.

Each step is independently shippable and behavior-preserving at the story
level (1–3 verified so on the `unify-constraints-operators` branch). The
deferred remainder is tracked in
[#550](https://github.com/gofish-graphics/gofish-graphics/issues/550), with
sub-issues for size-setting constraints (#545), scatter/position (#546),
treemap (#541), the general composition algebra (#547), table (#548), and
sharedScale claim hoisting (#549).

## Python / IR implications

**Decision: the high-level IR stays the Python bridge target.** Operators
carry semantic information — _this is a spread of revenue by month_ — that a
compiled layers-plus-constraints form erases, and that information is exactly
what accessibility tooling (screen-reader navigation à la Olli / Data
Navigator, which the Bluefish paper's future-work section points at) and any
later analysis want to read. So the Python wrapper keeps serializing the
high-level vocabulary unchanged, and compilation to the constraint core
happens inside the JS engine, _after_ the bridge. The unification's machinery
is invisible to `gofish-ir`; its new surface _options_ are not — see below.

A serialized **core IR** (layers + constraints + marks, the post-compilation
form) remains a coherent artifact to define — it would be the natural input
for a non-JS renderer, a layout debugger, or an optimizer — but it is
deferred until such a consumer exists; today the in-memory compiled form _is_
the core, and inventing a wire format nothing reads would be speculative.
A corollary of the high-level-IR decision, per the maintainer's parity rule
("everything writable in JS should be writable in Python"): new _surface
options_ do cross the bridge even when the machinery doesn't. The
unification's `glue` (distribute constraint) is exposed to Python — wrapper
kwargs plus the typed `SpreadOperator` fields and validators in `gofish-ir` —
and the `ConstraintParity` stories have byte-identical Python ports
(`tests/python-stories/low-level-syntax/test_constraint_parity.py`). (The
`weights`/`stackWeights` options that also crossed the bridge here were
deleted in the [[size-claims]] round.) Parity
exemptions are reserved for stories that aren't pure gofish specs; "this only
tests the JS engine" is not a valid exemption reason.

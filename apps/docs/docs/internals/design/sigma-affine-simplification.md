---
title: "Plan: Unify Sizing/Positioning Around the σ-Affine Model"
section: Speculative Notes
order: 61
status: speculative
---

# Plan: unify sizing/positioning around the σ-affine model

Staged simplification of the layout engine, from vocabulary fixes to the #39
endgame. Each stage lands independently and is gated on **pixel equality**
across all stories (`capture-diff` as inner loop; the CI visual baselines as
the outer gate). No compatibility shims anywhere — callsites migrate in the
same change.

## The one equation, and three roles for one unknown

Every continuous axis is one affine map per σ-scope:

```
px(d) = pxMin + σ·(d − domainMin)          σ = pixels per data unit
```

Per node and axis there is one position unknown — the **baseline**, the screen
coordinate of the node's local data-0. Three things currently share the word
"origin" and must be kept distinct:

- **alignment** is a _constraint_: equations between baselines
  (`baseline_A = baseline_B`), or between other anchors for other alignments;
- **placement** (`free | determined | conflict`) is the _abstract value_: is
  the baseline subsystem under-determined / solvable / inconsistent — all that
  bottom-up space resolution can know, since pixels don't exist yet;
- **the intercept** is the _concrete value_: the solved shared baseline of a
  σ-scope, in pixels. It exists only after σ and the frame anchor resolve, and
  should always be a derived read (`posScale(0)`), never stored state.

False friend to never conflate: the `width` Monotonic's own intercept is the
σ-independent pixel part of an _extent_ (spacing, fixed chrome) — an intercept
of the size-vs-σ line, not of the data→screen map.

Root cause the stages chip away at: the placement solve gives each node **one**
unknown per axis (its `min`) while sizing runs in a **separate** σ-fold pass,
with the intercept held off-ledger in `transform.translate`. `span` and `grid`
are the two places that model can't express something, so each grew a bespoke
side-regime; the align guards and scale-forwarding rules are hand-maintained
consistency between the two passes.

---

## Stage 0 — vocabulary and docs (no behavior)

Write the equation and the three-roles framing into
`apps/docs/docs/internals/core/underlying-space.md`, plus one paragraph naming
the current two carriers honestly: `scaleFactors` carries only the slope σ for
unanchored extents (intercept implicit in baseline placement + translate);
`posScales` carries the whole map for anchored ones.

- Files: the essay; touch-ups to doc comments in `underlyingSpace.ts`,
  `solver/index.ts`.
- Gate: `pnpm --filter docs check-backlinks`, docs build.
- Size: small. Can ride along with Stage 1.

## Stage 1 — placement becomes a bare lattice, then a derived view

`placement.at` is stored redundantly: it always equals `dataDomain.min` (both
are built from the same `origin` argument in `CONTINUOUS()`,
`underlyingSpace.ts:153-165`; the one mutation site — nicing,
`_node.ts:729-736` — rewrites them in lockstep). Every reader consumes only the
tag except one: `positionNode.tsx:28`.

1. Drop the payload: `Placement = "free" | "determined" | "conflict"`.
   Rewrite `offsetSpace` (`positionNode.tsx:19-35`) to read
   `continuousInterval(space)?.min`. Delete `originOf` (zero callers).
2. Stop storing `placement` at all: it is in bijection with the shape of
   `dataDomain` (`free ↔ undefined`, `determined ↔ interval`,
   `conflict ↔ "delta"`) — make it a derived getter. The stored space is then
   `{ width, dataDomain, measure, … }` and the three-field lockstep at nicing
   collapses to two.
3. Naming: the builder `Origin` type (`number | "free" | "impossible"`) stays
   as constructor input but gets renamed to say what the number is (the domain
   min, not a zero point) — e.g. `anchor: number | "unanchored" | "delta"`.
   Bikeshed at implementation time; the constraint is that "origin" disappears
   from the space vocabulary.

- Files: `underlyingSpace.ts`, `positionNode.tsx`, `_node.ts` (nicing,
  `placementOn`, debug printer), `alignment.ts` (tag reads), essay.
- Gate: `capture-diff main` empty; typecheck.
- Size: small (≈ a day).

## Stage 2 — `span` folds into `position` (surface unification)

`span` is not a new concept: it is two `position` pins on two anchors of one
target. Give `position` an interval form and delete the eighth constraint type:

- `Constraint.position({ x: v })` — point (today's behavior);
- `Constraint.position({ x: [a, b] })` — interval; lowers to the edge-pin +
  extent path that `span` uses today.

Producers/consumers to migrate (the whole surface):

- `scatter.tsx:116-125` — emit interval-form `position` instead of
  `Constraint.span`;
- `constraints/index.ts` — factory, `ConstraintSpec` union,
  `collectPositionDomains` (merge the two branches at `index.ts:203-224`);
- `compose.ts` — the span-specific special cases (`spans` filter, presence
  test, `spanCover`) key on "position with interval form" instead;
- `src/tests/constraintConfluence.test.ts` — the one direct callsite.

The internal lowering machinery (edge pins, extent side-channel) stays until
Stage 5; this stage removes the _type_ and the parallel code paths that
dispatch on it. Not in the wire IR (span is created during JS elaboration;
scatter serializes as `xMin`/`xMax`), so no schema/Python work.

- Gate: pixel equality; `validate-python-ir` + `capture-python` untouched but
  run once to confirm.
- Size: small-medium.

## Stage 3 — contain `grid`

`grid` is a third layout regime, not a constraint: a grid layer exits the
pipeline at `layer.tsx:134-135` (space fold early-return), `layer.tsx:211-212`
(cell budget), with an exclusivity rule (`proposalPlan.ts:271-285`) no other
constraint needs. Latent inconsistency: placement applies _all_ constraints on
a grid layer while spaces/sizing see _only_ the grid, so `grid` + `position`/
`nest`/`align` silently half-applies (a datum position never gets a posScale
and its facts are dropped).

1. Close the cliff: throw on `grid` mixed with any non-z-order constraint.
   Honest error now; routing them through is Stage 6 work.
2. Demote `Constraint.grid` to `table`'s private elaboration target (it has no
   other producer). The public surface for grids is `table`.
3. Leave the flex-track limitation (equal tracks only) documented as is —
   content-sized tracks are the Stage 6 generalization, where a grid becomes
   2·(numCols+numRows) track variables in the linear system.

- Files: `proposalPlan.ts` (or the layer constraint intake), `constraints/index.ts`
  (factory removal), `table.tsx`, confluence test, essay.
- Gate: pixel equality; new throw covered by a unit test.
- Size: small.

## Stage 4 — one affine scale carrier (refactor-first enabler)

Replace the two parallel per-axis channels

```
scaleFactors: Size<number | undefined>                  // slope only
posScales:    Size<((d: number) => number) | undefined> // whole map, opaque
```

with a single per-axis affine scale record, e.g.

```
type AxisScale = { sigma: number; map?: { domainMin: number; pxMin: number } }
```

(exact shape decided at implementation; the requirements are: slope readable
alone, intercept explicit rather than closed over, and "anchored" = presence of
the map half). Unanchored consumers read `sigma`; anchored consumers evaluate
the map; `posScale(0)` — the intercept — becomes a one-line derived read.

What this dissolves:

- `positionTargetDims` + `childPosScalesFor`'s three-way pick
  (`proposalPlan.ts:287-363`): "a constraint consumed the scale that placed
  this child" becomes an explicit per-axis field decision instead of a
  reconstructed name-set;
- the dual stash logic in `buildChildScalePlan` (`proposalPlan.ts:205-257`),
  including making the #618 inherited-σ guard a statement about one object;
- every `computeSize(size, scaleFactor)` / `computeAesthetic(v, posScale)`
  pair dispatching on which channel happens to be defined.

Wide but mechanical: ~22 files mention the two carriers (Layout signature in
`_node.ts:150-157`, `gofish.tsx` root, `layer.tsx`, `spread.tsx`, coord
transforms, marks). Strictly behavior-preserving — the record is built from
exactly the numbers the two channels carry today.

- Gate: pixel equality across all stories (this is the stage where
  `capture-diff` earns its keep); no per-story exceptions.
- Size: medium (a few days). Do NOT bundle any behavior change into it.

## Stage 5 — rank-2 placement solve

Extend the relational placement solver from one unknown per (node, axis) to
the per-node box `(min, size)` — i.e., adopt the ledger/`BBox` cell _inside_
the cross-node solve (`placementSolver.ts`). The node-side ledger (`_node.ts`
`_bbox`) is already rank-2; only the cross-node pass is rank-1.

### Where rank-1 is baked in today

The fact vocabulary (`placementFacts.ts`) has four fact kinds — `pin`,
`relation`, `edge-pin` (span only), `participant` — and every one of them is
affine in a _single_ variable per node (`start`), because
`PlacementProgramLowerer.anchorOffset` (`placementProgramLowerer.ts:31-53`)
pre-evaluates every anchor to a numeric offset from `start` using the target's
_already-known_ size (`localAnchor`/`dims`) at lowering time. A target whose
size isn't known yet (a span target) can't be offset, hence the `spannedSize`
side-channel callback threaded through the lowerer, the `edge-pin` fact kind,
the `max → min − size` rewrite in `classifyAxisFacts`
(`placementSolver.ts:107-115`), and the post-solve `setExtent` re-application
(`placementSolver.ts:295-298`).

### The rank-2 design

1. **Anchor facts.** Facts reference `(node, anchor)` with
   anchor ∈ {min, center, max, baseline} (plus a size equation):
   `pin(node, anchor, value, owner)` and
   `relate(from(node, anchor), to(node, anchor), gap, owner)`. The
   align-anchor→box-anchor mapping (`BOX_ANCHOR`) stays in lowering, but _no
   numeric pre-evaluation happens there_ — offsets move into the solver.
   `edge-pin` and the `spannedSize` callback are deleted; span's two edges are
   ordinary `min`/`max` anchor pins.
2. **Per-node cells with two-tier authority.** Each (node, axis) gets a `BBox`
   (`constraints/bbox.ts` — the existing 2-unknown cell with named-owner
   conflicts). Constraint-owned equations are _strong_; the node's self-layout
   size and any self-placed min (today's
   `PlacementOwnershipPlan.initiallyPlaced`/`authoritative` sets) seed as
   _weak_ defaults that a strong rank-2 determination discards — which is
   exactly what `setExtent`'s ledger reset does today, made explicit as tiers
   instead of four hand-maintained name-sets.
3. **Two-phase solve per axis.**
   - _Cell closure:_ apply strong pins; a cell reaching rank 2 has its size
     determined (the span case); every other cell takes its weak layout size.
     After closure all participating sizes are known — reachable programs
     never leave a size free (align/distribute/nest/grid emit no size
     equations).
   - _Difference graph, unchanged:_ relation offsets are now computed inside
     the solver from closed cells (the same `localAnchorPoint` arithmetic
     `anchorOffset` does today, moved from lowering-time to post-closure).
     The BFS components, pin application, `distributeOriginFor` sequence
     origin, and normalized-origin fallback (`placementSolver.ts:222-251`)
     are preserved verbatim — that part of the solver is already general.
   - `baseline` participates in closure as `min + c` where `c` is a
     node-local constant from `localAnchor` (independent of the size unknown;
     a span-determined box has baseline ≡ min since its local frame resets to
     `[0, size]`).
4. **One commit path.** Every solved cell writes back through a single
   function — rank-2-determined → `setExtent({min, max})`, position-only →
   `pinAnchor(min)` — replacing the three-way branch at
   `placementSolver.ts:289-301`. `BBox` conflicts and graph conflicts merge
   into one named-conflict report shape (same owner/asserted/implied fields).
5. **Deletions.** `span.ts`'s `collectSpanExtents`/`SpanExtent`/
   `lowerSpanEdgePins`, the `edge-pin` fact kind, the `classifyAxisFacts`
   rewrite, `PlacementOwnershipPlan.spanPinned`, the `spannedSize` lowerer
   parameter, and the extent maps threaded through
   `lowerPlacementConstraints`/`solvePlacementConstraints`.

### Landing sequence (shadow-first, same discipline as the ledger)

- **5a.** Emit anchor-facts _alongside_ the current program; run the rank-2
  solve in shadow and assert it reproduces the rank-1 result across all
  stories (extend `GOFISH_SOLVER_CHECK`). No behavior. **Landed:** the lowerer
  emits both programs, `constraints/rank2Placement.ts` runs the two-phase solve
  and compares final `(min, size)` per (node, axis) against the shipped
  positions, and `tests/scripts/capture-sweep.ts` renders every story with the
  flag injected to collect any `[solver-check]`/`[bbox-conflict]` divergence.
- **5b.** Flip the commit path to the rank-2 solve. Pixel gate. **Landed:**
  `solvePlacementConstraints` now solves each `(node, axis)` box from the anchor
  program (cell closure → difference graph → single write-back: size-strong →
  `setExtent`, position-only → `pinAnchor`); the shadow inverted to check the
  old rank-1 result against the shipped rank-2 one, and the sweep stayed clean.
- **5c.** Delete the rank-1 path and the span side-channel. **Landed:**
  `span.ts` (`collectSpanExtents`/`SpanExtent`/`lowerSpanEdgePins`) and
  `rank2Placement.ts` are gone; the interval form's edges are ordinary strong
  anchor pins emitted by `position.ts`; `spanDatumInterval` folded into
  `position.ts`; the `edge-pin` fact kind, the rank-1 `PlacementProgram`, the
  `spannedSize` lowerer callback + `anchorOffset` branch, and
  `PlacementOwnershipPlan.spanPinned` are deleted. `differenceGraph.ts` is the
  only graph and the rank-2 solve is the only solve.

**Running the sweep.** With the workspace installed (`pnpm install`; the harness
aliases `gofish-graphics` to `src/`, so source edits render live without a
rebuild), run `pnpm --filter @gofish/tests capture-sweep`. It injects
`window.GOFISH_SOLVER_CHECK = 1` into every story, captures the browser
console, and exits non-zero listing each story that logged a `[solver-check]`
(rank-2 vs rank-1 placement divergence) or `[bbox-conflict]` (ledger
over-determination) line. A clean run is the 5a gate. Pass a substring to scope
to one story (`pnpm --filter @gofish/tests capture-sweep bar`).

### Non-goals, held explicitly

- The align `start`/`end`-as-baseline transfer function in _space resolution_
  (`alignment.ts:135-136`) is unchanged; it is only exact for `minCoeff = 0`
  boxes. The rank-2 solver computes the true placement for asymmetric boxes —
  observe any divergence under the shadow check first, then decide adoption as
  a separate visible change.
- Signed sizes stay magnitudes (`Math.abs` semantics preserved; sign is a
  layout fact carried by the local frame, not a solver unknown).
- No changes to the space folds (`compose.ts`) beyond what Stage 2 already
  re-keyed.

### Tests and gates

- Confluence test grows cases: interval-position + align on the same axis
  (both declaration orders), interval-position inside a distribute chain,
  authoritative override pins on rank-2 cells, and a conflict case asserting
  both owners are named.
- Gates: pixel equality across stories; `GOFISH_CONFLICT_CHECK` sweep clean;
  the 5a shadow assertion clean before 5b flips.
- Size: medium-large. Depends on Stage 4 only softly; do 4 first anyway (it
  simplifies what the solver hands back to scale consumers).

## Stage 6 — σ into the same system (the #39 endgame)

Fold the σ resolution into the same linear system, per scope. The two hooks
already exist: `BBox` key values are already σ-affine `Monotonic`s (the
"unified-propagation stage 1" note in `bbox.ts` — every caller just happens to
pass constants today), and `AxisScope`/`SolverBox` (`solver/index.ts`) is the
validated Phase-0 model.

### The sites that become one mechanism

σ (or its posScale twin) is solved today at four+ places, in a hand-ordered
priority. All become _one_ rule — **only a σ-scope root solves; everyone else
inherits**:

1. the root: `gofish.tsx:385-392` (`width.inverse` against the canvas),
   `posScaleFromSpace` at `gofish.tsx:371-377`, and the recentering writeback
   around `gofish.tsx:405-437`;
2. self-scaling regions (explicit pixel size on an axis):
   `buildChildScalePlan` step 2 (`proposalPlan.ts:205-216`);
3. composed constraint budgets: step 3 (`proposalPlan.ts:218-244`) — whose
   #618 propagate-vs-re-root guard is exactly the "intermediates must not
   re-root" rule, hand-written; it becomes structural;
4. shared-scale scopes: step 4 (`proposalPlan.ts:246-257`) + spread's
   `sharedScale` annotation;
5. coord boundaries (the scoped-resolution thread: bake/resolution must be
   boundary-recursive, not root-global).

σ-scope roots are therefore: the root, an explicit-pixel-size axis, a
`sharedScale` operator, a coord boundary. One `AxisScope` per (scope root,
axis): a registry of member cells; the **frame equation**
`content(σ) = allocated` solved once by `Monotonic.inverse`; the scope's
posScale and σ are _views_ of the solved system (the Stage-4 `AxisScale`
record becomes exactly this view: σ = slope, `map` = anchored `min` anchor +
pixel min; the intercept is `posScale(0)`, derived, never stored).

**The dual slope is transitional debt, eliminated here — not a keeper.**
Stage 4's `AxisScale.map` carries its own slope because today σ is solved in
the four+ places above against four different pixel budgets, so a mark can
read size-σ and position-slope from different extents on one axis (nicing
asymmetry, spacing's slope-vs-secant, sub-budget scopes vs an inherited map).
Stage 6's invariant is **one slope per σ-scope, by construction**: the frame
equation solves σ once at the scope root and the posScale is a derived view
of the same solve, so within a scope the two cannot disagree. The divergences
that remain must then become what they really are — two scopes on one axis
(keyed by measure: the multi-scale/dual-axis design), or explicit non-data
pixels (spacing as a piecewise gap, not a secant that papers over it).
`AxisScale` collapses back to a single-slope view when 6b/6c land; if it
still has two independent slopes after Stage 6, that is a bug in Stage 6.

### Sub-stages, each gated

- **6a — observe.** Extend `solver/shadow.ts` coverage to the modes it skips:
  center-mode distribute, pre-placed/data-positioned chains, nest, grid,
  coord scopes. Run all stories under `GOFISH_SOLVER_CHECK` until clean.
  No behavior change; this is the risk-retirement step and can start any time
  after Stage 5a exists.
- **6b — one solve site.** Move the root inversion + the three
  `buildChildScalePlan` steps behind a single scope-root API with the same
  numbers and priority. The #618 guard becomes "not a root → inherit".
  Pixel gate. **Landed:** `ast/solver/scopes.ts` holds a per-render
  `ScopeRegistry` (on the `RenderSession`) whose `solveSize` / `solvePosition`
  are the ONE place σ / posScale is derived; the render root (`gofish.tsx`),
  `buildChildScalePlan`'s self-scaled / constraint-budget / shared steps, and the
  coord boundary (`coord.tsx` `fitAxis`) all call it with bit-identical
  arithmetic. The #618 propagate-vs-re-root guard is now the structural
  "is this a scope root?" predicate in `buildChildScalePlan` (an intermediate
  budget skips the solve and inherits). `GOFISH_DUMP_SCOPES` prints one frame
  equation per scope. The sweep (`capture-sweep`) stayed clean and the
  coord/confluence tests (flat ≡ nested σ) pass, confirming goTree/polar render
  identically.
- **6c — σ-affine claims flow.** Marks/folds contribute width `Monotonic`s
  into cells instead of pre-multiplied numbers; evaluation defers to the
  scope boundary; the "evaluate at σ, hand concrete sizes down" double
  bookkeeping (`computeSize`'s scaleFactor path) collapses. Pixel gate.
- **6d — translate retirement (#39 stage 3-D).** Render consumes baked
  absolute coordinates through the `displayTranslate`/`translateString`
  chokepoints (`dims.ts:268-294` was written to make this a one-function
  change); the per-container `<g translate>` wrappers collapse. Expect benign
  DOM reshuffles — this is precisely the pixel-not-DOM gate case.
- **6e — grid as tracks.** A grid scope introduces `numCols + numRows` track
  cells; each cell(i, j) gets equations `cell.min = track.min` and
  `cell.size = track.size` per axis. Equal-flex is "all track sizes equal +
  Σ tracks + gaps = W" (today's `sliceExtent`, as equations); content-sized
  tracks are `track.size ≥ max(cell claims)` — note `max` leaves the linear
  fragment (piecewise claims; see the `monoEqual` two-point-probe caveat in
  `bbox.ts`), so this lands as an iterate-or-piecewise extension, and is the
  point where `table` gains content-sized tracks. The Stage-3 layer bypasses
  (space-fold early return, cell-budget special case, mixing throw) delete;
  `gridSpaces`' ORDINAL axes contribution stays but composes.
- **6f — determinacy from rank.** The Stage-1 `spacePlacement` view retires:
  free/determined/conflict is read off the scope system's baseline-subsystem
  rank/consistency. Space resolution keeps only data facts
  (`width`, `dataDomain`, `measure`). The align transfer functions become
  transfer functions _of the solver's abstract domain_, closing the
  "guards should be blindingly obvious" thread.

### Open design questions (resolve during 6, tracked now)

- **Authority model (#583):** Stage 5's weak/strong tiers may need a third
  tier (user-explicit vs constraint-derived) once σ-affine claims and
  placement claims live in one system.
- **Multi-measure scopes:** a scope keyed by (axis, measure) — the
  measure-keyed set of underlying spaces idea — would retire the
  childPosScales workaround and permit dual-axis charts; decide whether 6b's
  scope registry is keyed that way from the start.
- **Where scope state lives:** on the render session (like `toPixel`) vs a
  map keyed by scope-root uid; must survive resume/re-layout.
- **Piecewise claims:** `max`-composition (6e) and any future clamp break the
  two-point `monoEqual` probe; decide the claim representation before 6e.

### Debuggability requirement

Every scope must be dumpable as printable equations (`Monotonic.print` per
box key, one line per member cell, frame equation last) behind a debug flag —
the printable-equations bar the σ-affine model was chosen for.

- Gate: shadow-clean per covered mode before each flip; pixel equality at
  every flip; benign DOM reshuffles acceptable only at 6d.
- Size: large; each sub-stage is its own PR. This document is the map, not
  the schedule, for Stage 6.

---

## Order and dependencies

```
0 (docs) ─┐
1 (lattice) ─┐            independent quick wins, any order
2 (span→position) ─┤
3 (grid cliff) ─┘
4 (one scale carrier) ──► 5 (rank-2 placement) ──► 6 (σ in-system)
```

Stages 0–3 are each a small PR and can land this week in any order. Stage 4 is
the enabling refactor and should land alone, with nothing else in the diff.
Stage 5 consumes 4. Stage 6 consumes 4+5 and subsumes the leftovers of 2
(span's internal machinery) and 3 (grid's bypasses).

Wiki obligation: most touched files carry the `@wiki Underlying Space`
backlink — `underlying-space.md` must be updated in the same change for every
stage, and `constraints-as-core.md` / the solver notes for Stages 5–6
(`pnpm --filter docs sync-backlinks` when `covers:` changes).

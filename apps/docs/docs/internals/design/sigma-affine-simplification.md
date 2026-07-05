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
  (`baseline_A = baseline_B`), or between other facets for other anchors;
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
the per-node box `(min, size)` — i.e., adopt the ledger/`SolverBox` cell
_inside_ the cross-node solve (`placementSolver.ts`). The node-side ledger
(`_node.ts` `_bbox`) is already rank-2; only the cross-node pass is rank-1.

Payoffs, all deletions:

- interval-form `position` (née span) becomes two facet equations on one box —
  delete the extent side-channel: `collectSpanExtents`, the `spanExtentByKey`
  threading through `classifyAxisFacts` (`placementSolver.ts:107-115`), the
  post-solve `setExtent` re-application (`placementSolver.ts:295-298`), and
  `spanCover` in `compose.ts:269-281`;
- align anchors become facet-equality relations
  (`min/center/max = baseline + (minCoeff + k)·size`), making the
  determinacy question ("is this child already positioned?") a structural read
  instead of the `placementOn`/guard protocol;
- conflicts stay named: the box-level `BBox` conflict contract and the
  relation-graph conflict contract merge into one report.

Known behavior edge to decide explicitly (not silently): the current fold
treats `start`/`end` align as baseline-equivalent (`alignment.ts:135-136`),
which is only true for `minCoeff = 0` boxes. The rank view computes the true
answer for mixed-sign/asymmetric boxes. Ship the _engine_ in
compatibility-of-results mode first (pixel gate), then decide whether to adopt
the sharper transfer function as a separate, visible change.

- Files: `placementSolver.ts`, `placementLowering.ts`, `span.ts` (absorbed),
  `align.ts`, `compose.ts`, confluence test (which becomes the spec of the new
  solve).
- Gate: pixel equality; `GOFISH_CONFLICT_CHECK` clean across stories.
- Size: medium-large. Independent of Stage 4 in principle; do 4 first anyway
  (it simplifies what the solver hands back to scale consumers).

## Stage 6 — σ into the same system (the #39 endgame)

Fold the σ resolution into the same linear system, per scope
(`AxisScope`, `solver/index.ts`):

- facet values become σ-affine Monotonics; the **frame equation**
  `content(σ) = allocated` resolves σ once per σ-scope (this is already how
  `buildChildScalePlan` finds σ — `width.inverse` — just deferred to the
  boundary and made the only site);
- the Stage-4 `AxisScale` record becomes a _view_ of the solved scope
  (σ = slope, intercept = the scope's solved baseline at data-0);
- `transform.translate` completes its retirement into a projection of the
  ledger (#39 stage 3-D, already in motion);
- `grid` generalizes to track variables + equations (equal tracks = equal-flex
  special case; content-sized tracks = Σ-over-max rows in the same system),
  deleting the layer bypasses from Stage 3;
- `placement` (the Stage-1 derived view) retires as stored/derived _space_
  state entirely — determinacy is the rank/consistency of the baseline
  subsystem, read off the solve; space resolution keeps only the data facts
  (`width`, `dataDomain`, `measure`).

De-risking already exists: the Phase-0 spike (`solver/index.ts`), the shadow
checker (`solver/shadow.ts`, `GOFISH_SOLVER_CHECK`) — extend shadow coverage
mode-by-mode before each flip, same observe→assert discipline that landed the
ledger.

- Gate: shadow-clean per covered mode before flipping; pixel equality at each
  flip; benign DOM reshuffles acceptable per the established policy.
- Size: large; its own multi-PR plan when we get there. This document is the
  map, not the schedule, for Stage 6.

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

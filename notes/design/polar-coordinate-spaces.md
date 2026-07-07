# Design thread: robust coordinate spaces (polar, clock, warps) + embedding

Status: **exploratory design-space doc** (not a committed plan). Driving examples:
the 48 GoTree gallery stories now in `packages/gofish-gotree/` (see `GALLERY.md`).
The GoTree gallery is our reference grammar — it gives concrete examples to test
our theories of _embedding_ and _polar space_ against, which we've lacked before.

## The unifying frame

A `CoordinateTransform` is just a function `f: (x, y) → (screenX, screenY)` plus a
domain. The primitive we actually need is **robust coordinate mapping**: author any
path/region in coordinate space, then push its sampled points through `f`. Most of
this already exists (`transformPath`).

What this covers (all _coordinate mapping_, no skeleton warp needed):

- **closed-form warps** — `polar`, `clock`, `wavy`, `bipolar`, `arcLengthPolar`.
- **GoTree links** — a link is a path _in coordinate space_; render = sample + map
  through `f`. A "curve" / "arc" / "step" link in polar is authored as that path in
  (θ, r) and warped by polar. The GALLERY "curve→linear" gaps are NOT a warp problem
  — they're "the link is only authored as a straight segment in coord space, then
  bent by polar" instead of being given the right path shape _in coord space first_.
- **arc-length-midpoint-wrap** — "wrap the midpoint around a circle preserving arc
  length at the midpoint" is a **closed-form transform** (a shifted `arcLengthPolar`:
  x → arc length along the circle at radius `R₀ + y`, midpoint landing on `R₀`). It
  does **not** need a skeleton warp either.

### Bend / skeleton warp — explicitly deferred (maybe never)

A separate, more exotic capability: deform an _arbitrary_ edge shape so its
centerline follows a _target_ path, independent of the ambient coordinate space
(Inkscape "bend path" LPE, warpjs#15, Barraud; referenced from #75). Cool, but out
of scope — GoTree doesn't need it, and even the arc-length-midpoint case is a plain
coordinate transform. Recorded here so we don't reach for it prematurely.

Today this family is crippled by **hardcoding**, not by missing math:

- `coord.layout` (coord.tsx:156) hardcodes `size = [2π, min(w,h)/2 - padding]` with a
  `// TODO: only works for polar2 right now`. The angular budget is wired to exactly
  one full turn; the radius to `min(w,h)/2`.
- _Every_ transform hardcodes `domain: { max: 2π }` and `{ max: 100 }`. The radius
  100 is a magic placeholder (polarTransposed.ts even documents this). So no
  `centralAngle`, no data-driven radius, no inner radius.

## Decisions already made (from discussion)

- **Delete `polarTransposed`** — it's identical to `polar()` (both map x→θ), so the
  DSL's PolarAxis θ/r swap is a silent no-op. Real bug, not worth keeping (#618).
- **Delete `polar_DEPRECATED`** — textbook-math polar (0 at east, CCW); superseded.
  #502 already tracks migrating stories off it.
- **Keep `polar` and `clock`.** Intent: clock starts at 12 o'clock with the pie-chart
  orientation. ⚠️ Discrepancy to reconcile: in the _current_ code `polar` and `clock`
  have **identical** transforms (both `r·cos(−θ+π/2), r·sin(−θ+π/2)` — already 0-at-12,
  clockwise). So "clock = polar but starting at 12" is already true of `polar`, and
  `clock` is a duplicate. Resolution: make a single parameterized polar and expose
  `polar()` / `clock()` as **presets** (different default startAngle/direction).

## Scaffolded plan (phases, roughly ordered by leverage & risk)

### Phase 0 — Foundation: kill the hardcodes (low risk, unblocks everything)

- **0a (safe, do first):** Delete `polarTransposed`. `polar`/`clock`/`polarTransposed`
  are the _identical_ function today (`[r·sin θ, r·cos θ]`), so swapping its 11
  GoTree-story callsites + 1 test to `polar()` is a pure rename — zero visual change,
  provable via `capture-diff`. Removes the "broken no-op θ/r swap" bug.
- **0b (own chunk = #502):** Delete `polar_DEPRECATED`. Used by ~28 _core_ tests
  (pieChart, polarRibbon, scatterPie, …); it's a different function (`[r, θ]`,
  0-at-east, CCW), so migration rotates + axis-swaps each story — a real visual
  migration, exactly #502's plan. Do NOT fold into the hardcode work.
- **0c (couples to Phase 1):** Make `CoordinateTransform.domain` data-driven instead
  of `2π`/`100` literals (radial domain from the resolved underlying space; angular
  from a `centralAngle` option). Remove the `size = [2π, …]` hardcode in
  `coord.layout`. This is the literal "2π hardcoding" complaint — but "where does the
  angle come from" _is_ Phase 1's `centralAngle` design, so these land together.

### Phase 1 — Parameterized polar/clock (#618 polar options, #117, #535)

- `polar({ startAngle, centralAngle, direction, innerRadius, center })`; `clock()` as
  a preset. `innerRadius` gives donut holes / clock rims (ClockTree, TyreTree).
- Fixes #117 (r-axis 0 in the wrong place) via a real radial domain + innerRadius.
- Fold in #535: the explicit-size self-scaling rule must cover the coord branch.

### Phase 2 — Axis aliases r/θ (#1, #23) — DESIGN LOCKED

- **The transform declares its own aliases.** `polar()`/`clock()` declare
  `{ x: "theta", y: "r" }`; `linear()` declares none; others can declare their own.
- **Position aliases:** `theta` (=x), `r` (=y). **Size aliases:** `thetaSize` (=w),
  `rSize` (=h). Names chosen: full-word `theta`, single-letter `r`.
- **A context propagates aliases down from the `coord` node** (like `scaleContext`),
  **bounded to the coord scope** (hygienic); aliases **coexist** with `x`/`y`.
- **Marks + operators resolve alias keys to axes via the context** — `rect({ theta, r,
thetaSize, rSize })`, `spread({ by, dir: "theta" })`, `stack({ dir: "r" })`. No new
  operator names (the abandoned `stackR`/`stackT` route). `dir`/`by` accept aliases.
- **Axis renderer uses the aliases** for titles/labels (this is what makes #23 read).

### Phase 3 — **Embedding redesign** (needs co-design — see below; #542, #8)

The conceptual crux. Settle the point/line/area contract. Decoupled section below.

**Method: annotate the corpus, induce the rule (empirical, example-driven).**
Rather than design the rule top-down, hand-annotate every GoTree _polar_ example with
its ground-truth embed/warp status, then work backwards to the rule that reproduces
all of them. Concretely, for each example, per mark and per axis (θ and r):
classify as **point** (no extent warped — circle), **line** (one axis warped — a rect
edge sweeping an arc), or **area** (both warped — a wedge / annular sector); and
record _why_ (data-driven? mark kind? containment via `nest`?). The induced rule is
whatever recursive function over the tree reproduces the whole annotated table.

This is plausibly shaped like the **underlying-space resolution pass**: a recursive
walk over the whole tree that resolves each node's embed/warp status from its children

- its own kind (cf. the underlying-space-as-type-system thread). That also matches
  Direction #1 below — embedding as a first-class field inferred in its own pass. Build
  the annotation table first; it's both the spec and the test oracle for the rule.

### Phase 4 — Angular auto-fit (#618 dominant polar limiter)

- Allocate θ by subtree leaf-count (GoTree `SubtreeWidth: adaptive`) instead of a
  fixed per-level constant, so wide/deep trees stop overflowing the 2π budget.

### Phase 5 — (deferred) Skeleton/bend warp

- Arbitrary-shape-bent-to-target-path (warpjs#15). NOT needed for GoTree (links are
  coordinate mapping) or for arc-length-midpoint (a closed-form transform). Parked.

## Embedding — the part to co-design

### How it works today

A mark's render switches on which of its two dims are `embedded`:

- **neither embedded** → draw a **point**: transform the center, draw the shape at
  literal pixel size (circles as points).
- **one embedded** → draw a **line/path**: the embedded axis sweeps _through_ the
  transform (a straight edge becomes an arc); the other axis is pixel thickness.
- **both embedded** → draw an **area/region**: both axes swept (a wedge / annular
  sector). (rect as a 1D edge or 2D region depending.)

This is precisely GoTree's "circles are points, rectangles are lines/areas." The
`embedded` flag answers: _does this dimension's extent get warped by the coordinate
transform, or is it screen-space pixels at the warped center?_

### Why it's confusing

`embedded` is currently **inferred** from data-vs-aesthetic: `inferEmbedded`
(data.ts:293) sets `embedded: true` when a dim's size is a data value (with a
compatible/absent min). So one flag conflates three different questions:

1. Where does this number come from? (data vs constant)
2. Should this extent be warped by the coord, or stay pixel-sized?
3. Is this mark a point, a line, or an area?

These are not the same question, and coupling them is the source of the confusion.
It also overlaps #542 (ink vs logical extents) and #8 (edge/center mode).

### CONVERGED model (agreed — see `embedding-annotations.md` for the full writeup)

Embedding = **an axis's edges are positions in the manifold's coordinate space (preimage)**,
not screen offsets around a mapped center. Two independent OR'd routes:

- **Route A (relational, measure-free):** an edge-metric relation (`distribute`/`stack`/
  `nest`) pins edges as coordinate positions — works for dataless constant-size marks;
  center-metric pins only the center → ink.
- **Route B (intrinsic, measure-gated):** the mark's own size is denominated in the
  axis's spatial-scale measure → coordinate extent; foreign measure (bubble area) or
  pixel size → ink.
  point/line/area = #axes embedded by A or B. Implemented as a **recursive pass** (A
  propagates from relations; B is local via measure provenance, #534). `emX`/`emY` is a
  stand-in for missing #534 provenance → becomes a rare renamed escape hatch.

### Older framing (superseded by the above)

The choice isn't really a 4-way menu. Two separable sub-decisions:

1. **Make embedding a first-class, serialized IR field, inferred in its own pass.**
   Today `embedded` is a re-derived _layout-fold flag_ (not in the canonical IR, not
   serialized across the Python↔JS bridge), computed locally per mark. Lift it to an
   explicit field on the underlying-space/IR tree, inferred during a dedicated
   elaboration pass (like measure/space inference; cf. the type-system thread), so
   render and serialize just _read_ it. **How this differs from today:** mechanism is
   nearly the same; what changes is that the field becomes explicit + serialized +
   separately-inferred, and its _meaning_ shifts from "is this data-driven" to
   "**does this dim contribute a warped (logical) extent**" — decoupling the three
   conflated questions.

2. **Decide the inference rule + meaning** — the field means "warp this extent"
   (logical vs ink, #542). The rule that _sets_ it can start as today's heuristic
   (`inferEmbedded`), then be refined. Options for where the contract ultimately
   lives: the mark geometry kind (circle=point, rect=interval — GoTree's vocabulary),
   an explicit per-dim opt-in, or the full ink/logical box model (#542). Decision #1
   is independent of and can land before this is finalized.
   </content>
   </invoke>

# Nested Layer Tiers

## Status

Proposal. A concrete alternative to O2′ in `constraint-layout-evaluation.md`,
for the problem where a `connect` (or other ref-consuming "derived mark")
sits between two constraint steps. This is the recommended direction.

## Problem recap

The Bluefish pulley has a dependency chain:

```
shapes ──(constraints)──▶ placed ──▶ ropes read them ──▶ labels placed on ropes
```

`layer` resolves its body in fixed phases — lay out all children → apply
constraints → re-layout unconstrained children once. That can't sequence a
`connect` _between_ two constraint steps: a rope is a child, so it's laid out
in phase 1, before the constraints that place the circles it reads. Full
analysis: `constraint-layout-evaluation.md`.

## The idea

Express each dependency tier as a **nested `layer`**.

`layer` already means "fully place these children and expose a bounding box."
A finished layer is therefore a _placed unit_ — exactly the thing a later tier
needs to build on. So nest: an inner layer resolves the shapes; the next layer
out adds the marks that read them; the next adds marks that read _those_.

```
Layer([ Layer([ shapes ]).constrain(cluster),   // tier 1 — fully placed
        ...ropes,                               // tier 2 — read tier 1
        ...labels ])                            // tier 3 — read tier 2
  .constrain(labelConstraints)
```

No new concept, no "refresh" step — just `layer` used recursively. The ordering
that makes it work is structural and visible in the source, not hidden in a
constraint list. `Layer` nesting, `zOrder`, and `distribute`/`align`'s
anchor handling all work as-is — but it does require **one engine change**:
phase 3's re-layout pass had to go (see "What it removes — phase 3"). That
turned out to be required, not optional.

## Worked example — the pulley

Two layers. Tier 1 (shapes) is the inner layer; tiers 2 and 3 (ropes, labels)
share the outer layer — see "Where labels go" for why.

```ts
const ROPE = { stroke: "#774e32", strokeWidth: 3 } as const;

Layer([
  // ── tier 1: shapes — a finished, fully-placed unit ───────────────────
  Layer([
    rect({ w: 9 * r, h: 20, fill: "#C9C9C9" }).name("rect"),
    PulleyCircle({ r }).name("A"),
    PulleyCircle({ r }).name("B"),
    PulleyCircle({ r }).name("C"),
    Weight({ width: 30, height: 30, label: "W1" }).name("w1"),
    Weight({ width: 85, height: 30, label: "W2" }).name("w2"),
  ]).constrain((c) => [
    Constraint.distribute({ dir: "x", spacing: -r }, [c.A, c.B]),
    Constraint.distribute({ dir: "x", spacing: 0 }, [c.B, c.C]),
    Constraint.distribute({ dir: "y", spacing: 40 }, [c.B, c.rect]),
    // …rest of the cluster + weights…
  ]),

  // ── tier 2: derived marks — ropes that read the placed shapes ────────
  // zOrder(-1): laid out AFTER tier 1 (refs resolved) but painted BEFORE it
  // (the wheels draw over the rope ends). See "zOrder for paint order".
  Connect({ ...ROPE, target: [0.5, 0.5] }, [ref("rect"), ref("B")])
    .name("l0")
    .zOrder(-1),
  Connect({ ...ROPE, source: [0, 0.5], target: [0.5, 0.5] }, [
    ref("B"),
    ref("A"),
  ])
    .name("l1")
    .zOrder(-1),
  // …l2 … l6…

  // ── tier 3: labels — positioned relative to the ropes ────────────────
  text({ text: "x" }).name("t1"),
  // …t2 … t6…
]).constrain((c) => [
  Constraint.distribute({ dir: "x", spacing: 5 }, [c.l1, c.t1]), // l1 = anchor
  Constraint.align({ y: "middle" }, [c.l1, c.t1]),
  // …t2 … t6…
]);
```

Each layer's `.constrain()` names only its own direct children — `cluster` on
the inner layer, `labelConstraints` on the outer. No constraint reaches across
a layer boundary.

## Why it is staleness-free

The outer layer lays its children out in array order:

1. **Child 0 — the inner layer.** Laying it out runs _its_ `.constrain()`, so
   the shapes are fully placed; the inner layer then gets baseline-placed in
   the outer layer.
2. **Children 1…N — the ropes.** When `l1.layout()` runs, `ref("A")` resolves
   into the inner layer (refs descend through plain, non-component layers) and
   reads A at its _final_ position — inner-cluster translate plus the inner
   layer's own placement. The rope path is correct on the first pass.
3. **Outer `.constrain()`** then places the labels against ropes that are
   already correct.

The rule that makes this sound: **a derived mark must live in a tier strictly
outside the tier(s) that place its referents, and refs point inward.** Tiers
are plain `Layer`s (not `createMark` components) so refs can cross them.

## What it requires

Very little — the nesting works against today's engine. One real cost
(`zOrder`), and one thing that turns out _not_ to be a cost (anchors).

### Anchors already work — no anchor/target split needed

An earlier draft of this doc claimed `distribute`/`align` need a positional
anchor (`[anchor, ...targets]`) so the engine knows the rope is _read_, not
_written_. **That was wrong.** `applyDistribute`/`applyAlign` already pick the
anchor as "the first child already placed", where placed means `isPlacedOn` →
`dims.min !== undefined` → both `intrinsicDims.min` _and_ `transform.translate`
are set.

A `connect` returns `transform.translate: [0, 0]` from its own `.layout()`. So
the moment a rope is laid out it is _already placed_ — `isPlacedOn(l1)` is
true. `distribute([l1, t1])` therefore picks `l1` as the anchor automatically;
`t1` (a `text`, with no self-position) stays unplaced and the constraint
positions it. `constrainedNames` only governs _baseline_ placement — it never
makes `isPlacedOn` return false for a node that placed itself.

So any child can already be the anchor — whichever one is placed, by its own
layout, an earlier tier, or an earlier constraint. "Presence of a translation"
already _is_ the declarative check. No new API, no positional convention.

(The same correction applies to O2′ in `constraint-layout-evaluation.md`, which
also claimed an anchor/target split — neither approach needs it.)

### zOrder for paint order — the one real cost

Nesting couples declaration order to _both_ layout order and paint order. The
three paint tiers want `ropes < shapes < labels`, but the array order forced by
_layout_ is `shapes, ropes, labels` — the rope/shape pair is inverted. `zOrder`
overrides paint order (children sort by `(zOrder, index)`). Options:

- **Per-rope** — `r.zOrder(-1)` on each rope. Works today; one call per rope.
- **zOrder the shapes layer** — _doesn't quite work._ Pushing the shapes layer
  above the ropes also pushes it above the labels (same `z = 0` group), hiding
  any label that overlaps a wheel (the A/B/C letters). You'd then have to bump
  the labels too — no longer one call.
- **Group the ropes in a sub-layer** — `Layer([...ropes]).zOrder(-1)`: genuinely
  one call. But the ropes are then nested a level down, so the outer
  `.constrain()` can name them only if `collectConstraintRefs` descends into
  nested layers (see "Where labels go"). Clean, but coupled to that decision.

Longer term, a relative z-order constraint removes the magic integers entirely
— issue #451.

(The current flat implementation is the mirror image: it gets paint order free
from array order and pays for layout order with phase 3.)

## What it removes — phase 3 (DONE)

Phase 3 used to (1) re-layout every unconstrained child, then (2) place any
still-unplaced child at `(0,0)`. Step 1 — the re-layout pass — existed only
because, in a flat layer, a `connect` is laid out before the constraints run.

It turned out the re-layout pass actively **breaks** tiering, not just being
redundant: it re-lays-out the inner tier (resetting its transform), and the
follow-up "default unplaced to 0" then re-placed it with a `"min"` anchor
instead of the `"baseline"` anchor phase 1 uses — shifting the whole inner
layer by `-intrinsicDims.min`. The ropes (laid out once, in phase 1) ended up
disconnected from the shifted shapes.

So phase 3 is now reduced to **just step 2**: place any child the constraints
left unplaced, at the layer's baseline origin (`graphicalOperators/layer.tsx`).
The re-layout pass is gone. A flat spec that mixes constraint-placed shapes and
a `connect` no longer self-corrects — tiering is the prescribed way. Verified:
an A/B capture of all other `.constrain()` stories (Bottle, PythonTutor ×3,
Constraints ×5) is byte-identical before/after the change.

## Where labels go — two layers, not three

Labels live in the **same (outer) layer as the ropes**. A third, separate
layer for labels does not work cleanly: `collectConstraintRefs` only sees a
layer's _direct_ children, so an outermost `.constrain()` could not name ropes
nested one level down. Making ref-collection descend into nested layers would
fix that — and would be consistent with how `ref()` already descends — but it
blurs the invariant that each layer's constraints touch only its own children.
Two layers keep that invariant; three only pays off if we decide to make
constraint-ref collection descend.

That descent decision is worth more than just "labels in a third layer": it is
the _same_ change that unlocks the one-call `zOrder` form (grouping the ropes in
their own sub-layer). So it's really one question — _should a layer's
`.constrain()` be able to name non-component-nested descendants?_ — that governs
both the tier structure and the `zOrder` ergonomics.

## General pattern

`Layer([ finishedLayout, ...marksThatReadIt ])` is reusable beyond the pulley:
a node-link diagram is nodes (tier 1) → edges (tier 2) → edge labels (tier 3);
an annotated chart is plot (tier 1) → callouts (tier 2). "Take a fully-resolved
layout and add marks that read it" becomes a structural idiom.

## Comparison to O2′

Both fix the same bug; neither needs an anchor/target split (see "Anchors
already work"). They differ in where the dependency ordering lives:

- **O2′** — flat layer; ordering is implicit in the `.constrain()` list order;
  a `refresh` step re-derives a derived mark right before a constraint reads
  it. Paint order is free (array order); layout order is paid for with the
  refresh step.
- **Nesting** — ordering is structural and visible; no refresh step; phase 3
  is deleted. Layout order is free (structure); paint order is paid for with
  `zOrder`.

Nesting is more parsimonious w.r.t. the existing model — it introduces nothing
but recursive `layer` use — and it gives per-tier separation of constraints
that O2′'s single mixed list does not. Its costs are explicit `zOrder` and
deeper nesting.

## Open questions

- **Should `.constrain()` reach non-component-nested descendants?** One
  decision that governs both the three-layer tier structure and the one-call
  `zOrder` form (ropes in a sub-layer). `ref()` already descends this way;
  making `collectConstraintRefs` match would be consistent but widens what a
  layer's constraints can touch.
- **zOrder ergonomics.** Until the relative z-order constraint (#451) exists,
  the choice is per-rope `zOrder(-1)` or a rope sub-layer (above). Worth
  deciding which the pulley port should use now.
- **Discipline enforcement.** With phase 3 removed, a stale flat spec fails
  silently. Worth a dev-mode check: "derived mark reads a node placed by a
  constraint in the same layer"?
- **Depth.** Deeply tiered diagrams nest deeply. Probably fine — each level is
  a meaningful unit — but worth watching as examples grow.

## Implementation plan

**Status: executed.** Stage 0 (nested pulley), Stage 2's phase-3 change, and a
Stage 1 example (node-link) are done — per-stage notes below. The one surprise:
the phase-3 change was _not_ deferrable. The nested pulley does not render
correctly while the re-layout pass exists, so Stage 0 and Stage 2's phase-3
item turned out to be coupled — the engine change had to land first.

### Cross-tier references — use `createName`

A rope lives in the outer layer and references shapes in the inner layer.
String names are layer-scoped, so they may not reach across a layer boundary.
A `createName` token registers in the global `tokenContext`, and `ref(token)`
resolves across any boundary — so **every name a later tier reads must be a
`createName` token**:

```ts
const A = createName("A"),
  B = createName("B"),
  C = createName("C");
const rectN = createName("rect"),
  w1 = createName("w1"),
  w2 = createName("w2");
// inner tier:  PulleyCircle({ r }).name(A) …
// rope tier:   Connect(..., [ref(B), ref(A)]).name("l1") …
```

Names referenced only _within their own layer's_ `.constrain()` (the ropes
`l1…l6`, the labels `t1…t6`) can stay plain strings — `collectConstraintRefs`
already sees a layer's direct children. (Revisiting the scoping rules so plain
layer boundaries are transparent to string names is possible future work — out
of scope here; `createName` is the answer for now.)

### Stage 0 — Restructure the pulley as nested tiers (DONE)

`packages/gofish-graphics/stories/bluefish/Pulley.stories.tsx`, restructured to
`Layer([ Layer([shapes]).constrain(cluster), ...ropes, ...labels ])
.constrain(labelConstraints)`. Cross-tier shape names are `createName` tokens;
ropes carry `zOrder(-1)`; dimension labels are now anchored to the **ropes**
(`distribute([l1, t1])`) instead of the circles.

Not a pure story rewrite as first scoped — it needed the Stage 2 phase-3 change
(below) to render correctly. Verified by headless render against the reference.

### Stage 1 — Build more examples (node-link DONE)

- **Node-link / graph diagram** — `stories/lowlevel/NodeLink.stories.tsx`:
  nodes (tier 1) → `connect` edges (tier 2) → edge labels (tier 3). Built and
  rendering. Exercises the pattern end-to-end with cross-tier `createName`,
  `zOrder(-1)` edges, and a `createMark` node component.
- **Annotated chart** (`chart(...)` plot as tier 1) — _not done._ Deferred:
  using a data-driven `chart(...)` as a tier needs its own check of how the
  ChartBuilder composes as a layer child. Good next example.

### Stage 2 — Engine cleanup (phase 3 DONE)

1. **`collectConstraintRefs` descent** — _decided: not needed now._ Both
   examples use the two-layer form (each `.constrain()` names only its own
   direct children); the three-layer / one-call-`zOrder` variants that would
   require descent were not needed. Left as an open question.
2. **Phase 3 re-layout pass — removed.** Reduced to "place still-unplaced
   children at baseline" (see "What it removes — phase 3"). A/B-verified
   byte-identical on all other `.constrain()` stories. _Done._
3. **Dev-mode footgun check** — _not done._ Still worth adding: warn when a
   derived mark reads a node placed by a constraint in the _same_ layer (the
   now-silent stale-flat-spec case).

### Future / separate

- **Relative z-order constraint** — issue #451; removes the `zOrder` integer
  juggling.
- **Name-scoping revisit** — so cross-tier refs need not always be
  `createName`. Flagged, not scheduled.

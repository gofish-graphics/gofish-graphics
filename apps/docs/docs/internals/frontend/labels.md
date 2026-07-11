---
title: Labels
section: Frontend
order: 52
status: draft
covers:
  - packages/gofish-graphics/src/ast/labels/elaborate.tsx
  - packages/gofish-graphics/src/ast/labels/labelPlacement.ts
---

# Labels

`.label(accessor, options?)` attaches a text label to a mark or an operator's
groups. Like [axes](/internals/frontend/axes) and
[legends](/internals/frontend/legends), a label is **not a privileged render-time
overlay**. It is _elaborated_ into an ordinary `Text` shape, seated beside (or
inside) the labeled node via a `ref()` stand-in and ordinary `align`/`distribute`
constraints, wrapped in a `Layer` tier at the labeled node's **parent** — the same
technique `elaborateOrdinalAxis` uses for its ref-based tick labels. The layout
engine has no label-specific code at all.

## Why elaborate

Before this pass, `.label()` produced two divergent render paths:

- A `_label` field on the node, resolved post-layout by
  `GoFishNode.resolveLabels()` and lowered as a raw `DisplayList.TextItem`
  (`lowerLabelItems`, in the former `src/ast/labels/renderLabel.tsx`) alongside
  the labeled mark's own fragment — a special case bolted onto
  `INTERNAL_lower` (see [Layout & Render Passes](/internals/core/rendering)).
- A separate mark-level boolean `label: true` option on `rect`/`ellipse`/`circle`
  (deleted in stage 2 of this work, #741), which rendered the resolved fill
  value as hardcoded white 12px serif text via `valueLabelItems` — a second,
  entirely different label render path with its own styling and no options at
  all.

Both paths shared the same failure: a label computed at render time, from
heuristics (`inferLabelPosition`, `calculateLabelOffset`, `getLabelTextAnchor`,
`shouldShowLabel`) that tried to guess where the label should go and whether it
would fit, was **layout-inert**. It could not participate in space allocation:
an outset label was drawn in the SVG padding whether or not anything was there
to receive it, so a label near the chart edge was silently clipped rather than
making room for itself. And `shouldShowLabel`'s job — deciding whether a label
was "too big" for its target and should be hidden — existed only because the
label had no way to ask the layout engine for space in the first place. Once a
label is a real node, that heuristic has nothing left to do: it either fits in
the box the layout solve gives it (like any other shape) or it overflows
visibly, exactly like a `Text` node with a fill value written directly.

`.label()` on a node with no datum of its own (a group node — a spread's
per-key band, a stack's per-group child) is intentionally reused for both
per-instance and per-group labeling; see `resolveLabelTargets` below.

## The elaboration pass

`elaborateLabels` (`src/ast/labels/elaborate.tsx`) runs inside `gofish.tsx`'s
`layout()`, immediately after axis elaboration and before the
contentNode/title/legend passes — so a label's own bbox is folded into what
those later passes measure, and a label may target a node the axis pass just
wrapped. It has two phases:

1. **`resolveLabelTargets`** — a single top-down walk that pushes each node's
   `_labels` array down to its children whenever the node has children but no
   `datum` of its own: a plain group node merely relays its label to whichever
   descendant should actually carry it, while a node **with** a datum (a leaf
   shape, or a group combinator that stamped its own subdata — see
   [Operator Factory](/internals/frontend/operator-factory)) keeps its own
   label rather than propagating it further. This is exactly the
   "a node with its own datum keeps its own label" rule the old
   `GoFishNode.resolveLabels()` implemented, generalized from one label to an
   array. It is what makes `.label()` on an **operator** (`spread`, `stack`,
   `group`, ...) label the group rather than every leaf mark inside it: the
   operator factory stamps `datum` on each group leaf it produces, so the push-down
   stops there.
2. **`elaborateLabelsWalk`** — a bottom-up recursion. At each node `P`, every
   **direct child** still carrying a non-empty `_labels` (after step 1) is
   collected as a target; if any exist, `P` is wrapped once in a `Layer`
   holding its original content plus one `ref()` + `Text` pair per
   (target × spec). A labeled ROOT (no parent to wrap it) gets one final
   self-wrap in `elaborateLabels` itself.

## The parent-tier wrap invariant

The wrap happens at the labeled node's **parent**, never at the labeled node
itself. This is deliberate and mirrors the axis gutter invariant exactly
(labels must never shift the marks they describe, #493): wrapping a mark
individually would fold the label's bbox into the mark's own box, and an
outset label would then push stacked/box-driven siblings apart — a label on
one bar in a `stack` would widen that bar's slot and shove its neighbors. By
wrapping the parent instead, the marks' own layout is untouched; the label
`Text`s seat off already-placed `ref()` stand-ins in the tier above, so they
occupy space in the **parent's** bbox (which downstream passes — axis titles,
legends, the canvas size inference — see and reserve room for) without ever
perturbing sibling placement inside the parent.

Concretely, `wrapWithLabelTexts` builds:

```
wrap = Layer([ content.name("__labelContent"), ...refs, ...texts ])
```

and constrains it in this order (constraints apply in sequence and placement
is first-write-wins, so every later constraint sees its target already
placed):

1. `position({ x: 0, y: 0, anchor: "baseline" }, [content])` — pins the
   content at its own origin. The content is referenced by the label
   constraints below, and a constraint-referenced child skips the layer's
   phase-1 baseline placement; this re-states that placement explicitly, the
   same pin `elaborateAxes`/`elaborateLegend` use for the same reason.
2. Per target × spec, the constraints `buildLabelConstraints` derives from the
   spec's `LabelPosition` (below), relating the spec's `Text` to a
   `ref(target)` stand-in.

If a node being wrapped **also** carries its own `_labels` (pending for its
own parent), `elaborateLabelsWalk` hoists them onto the freshly built wrapper
rather than leaving them on the now-replaced original node, so the parent's
collection loop — which walks `node.children` by identity — sees them on the
node that actually occupies that slot.

## Position vocabulary → constraints

`LabelPosition` (`labelPlacement.ts`) is a hyphenated string,
`side-edge-align`, with two special whole tokens: `"center"` (dead center, no
edge) and the shorthand `"outset"` (= `outset-top-center`). `parseLabelPosition`
splits it into `{ side: "inset" | "outset", edge: "top"|"bottom"|"left"|"right",
align: "start"|"center"|"end" }`, defaulting side to `outset`, edge to `top`,
align to `center`.

`buildLabelConstraints` maps that parsed shape onto constraints against the
target's `ref()`:

- **`"center"`** is one `align({ x: "middle", y: "middle" })` — no offset, no
  side/edge logic at all.
- **`outset`** — the label sits just past the target's outer edge:
  `distribute({ dir, spacing: offset })` seats it flush with the edge plus a
  gap (ordinary edge-mode distribute, the library's default distribute
  semantics), and a plain `align` (no gap) positions the cross axis flush with
  the target's edge.
- **`inset`** — the label sits just _inside_ the target's edge. Flush-inset
  would need `spacing: 0`, but that reads as touching the edge, not sitting a
  visible `offset` px inside it — so inset uses the **fixed-pitch distribute**
  trick from #762 (the same mechanism the ridgeline ports and the fixed-pitch
  `distribute` anchor option shipped for): `distribute({ dir, anchor:
mainAnchor, spacing: inwardSpacing(mainAnchor, offset) })` relates the
  **same anchor** (`"start"` or `"end"`) on both the target ref and the label,
  with a constant pitch between them, rather than the default edge-to-edge
  gap. `inwardSpacing` just flips the pitch's sign so it always points inward:
  a positive pitch for a `"start"` anchor (bbox min, pads right/down into the
  shape), a negative one for `"end"` (bbox max, pads left/up). The cross axis
  either centers (`align(..., "middle")`, when `align: "center"`) or applies
  the same fixed-pitch trick again for a non-center inset alignment (e.g.
  `inset-top-start` — inside the top edge, pinned to the left).

`edgeAnchor`/`crossAlignAnchor` translate the position string's visual
vocabulary (`top`/`bottom`/`left`/`right`, and `start`/`end` for the cross
alignment) into the `AlignAnchor` values (`"start"`/`"end"`/`"middle"`) the
constraint system actually understands, in **this subtree's own authored
frame** — see frame flips below for why that translation isn't literal on
every axis.

## `frameFlips` and the rotation convention

x is never mirrored, so `left`/`right` map to bbox `start`/`end` literally.
y can be — a node whose own space is a position-like CONTINUOUS y gets
y-mirrored at bake (`elaborateAxes`'s `frameFlips`, `bake.ts`'s `declaredYUp`)
so that ascending data values read upward on screen. `edgeAnchor` and
`crossAlignAnchor` both take a `frameFlips` boolean (computed once per wrap by
`frameFlipsAt`, using the exact same predicate `elaborateAxes` uses: an
explicit chart-level `yUp`, an ancestor `coord` node, or this node's own
underlying space being CONTINUOUS on y) so that an authored `"top"` always
lands at the visual top, and an authored `align: "start"` on a left/right edge
always means the visual top, regardless of which way this particular subtree's
y axis happens to be mirrored.

The same `frameFlips` bit governs `rotate`. A label's `rotate` option is
authored as **literal screen-clockwise degrees** (Vega-Lite's convention),
independent of the subtree's own orientation. `Text` re-negates its own
`rotate` prop when its frame flips (`text.tsx`'s `flips ? -rotate : rotate`),
so `wrapWithLabelTexts` pre-negates with the identical `frameFlips` predicate
before handing the angle to `Text`, canceling that render-time negation and
landing back on the literal authored angle either way — the same
pre-negation trick `elaborateAxes` uses for `labelAngle` (see
[Axes](/internals/frontend/axes)).

## Auto-color

When a spec omits `color`, `autoLabelColor` picks one by resolving the target
node's own fill via `resolveColorChannel` — the identical resolution the
shape's own fill channel uses, so the label contrasts against the color
actually drawn (a categorical swatch, a continuous gradient's `scaleFn(value)`,
or a literal string), not some approximation of it. Inside the shape (`center`
or any `inset-*` position), the fill's LUV lightness picks white text on a dark
fill or a near-black tint of the fill's own hue on a light one; outside the
shape, the label is a darkened tint of the fill's hue at a fixed lightness (a
readable color on the white page background, distinct from but related to the
shape it labels). A target with no resolvable fill at all falls back to a
plain `"black"` (inside) or `"#333333"` (outside).

## Multi-label and typography options

Repeated `.label()` calls on the same node **append**: `GoFishNode.label()`
pushes onto an array (`(this._labels ??= []).push({ accessor, ...options })`),
so `_labels` is genuinely a list of independent specs, each with its own
accessor, position, and styling — not a single mutable slot. `LabelOptions`
carries `fontFamily`/`fontWeight`/`fontStyle` alongside the older
`position`/`fontSize`/`color`/`offset`/`rotate`; all three pass straight
through to the elaborated `Text`, which already measures font family/weight/
style for its own bbox, so no extra plumbing was needed to make them affect
layout correctly. `minSpace` — the old overlay path's fit-heuristic knob for
`shouldShowLabel` — has no elaboration-era equivalent and was dropped: a real
`Text` node doesn't need a hint about whether it fits, it just occupies the
space it measures.

## What this replaced

The former bespoke pipeline is gone:

- `src/ast/labels/renderLabel.tsx` (`lowerLabelItems`, the render-time overlay
  lowering) — deleted.
- The heuristics in the old `labelPlacement.ts` — `inferLabelPosition`,
  `calculateLabelOffset`, `getLabelTextAnchor`, `shouldShowLabel` — deleted;
  the file now holds only the pure, render-agnostic `LabelPosition` parsing and
  `resolveLabelText` (accessor resolution) that the elaborator calls.
- `GoFishNode._label` (a single optional `LabelSpec`) became `_labels` (a
  `LabelSpec[]`, internal-only), and `GoFishNode.resolveLabels()` became the
  module-level `resolveLabelTargets` in `elaborate.tsx`.
- The mark-level boolean `label: true` option on `rect`/`ellipse`/`circle` and
  its `valueLabelItems` lowering — deleted outright (#741 stage 2); every
  caller that used it (`Treemap`, `CircleTreemap`, `BarStackedWithLabels`, and
  their Python mirrors) migrated to
  `.label(field, { position: "center", color: "white", fontSize: 12 })`.

`.label()` itself, and the operator-level boolean shorthand (`label: false` to
suppress a group's inherited label — used by `Ribbon`), are unaffected: they
are a different, live mechanism (see
[`.label()` on operators](/js/api/core/mark#operator-label)) that sits above
this pass, not a remnant of what it replaced.

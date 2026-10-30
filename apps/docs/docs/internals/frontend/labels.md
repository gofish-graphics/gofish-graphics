---
title: Labels
section: Frontend
order: 52
status: draft
covers:
  - packages/gofish-graphics/src/ast/labels/elaborate.tsx
  - packages/gofish-graphics/src/ast/labels/labelPlacement.ts
  - packages/gofish-graphics/src/ast/labels/autoLabelColor.ts
  - packages/gofish-graphics/src/ast/labels/labelNode.tsx
  - packages/gofish-graphics/src/ast/labels/strategies.ts
  - packages/gofish-graphics/src/ast/labels/placeStep.ts
  - packages/gofish-graphics/src/ast/labels/collide.ts
  - packages/gofish-graphics/src/families/place.ts
---

# Labels

`.label(accessor, options?)` attaches a text label to a mark or an operator's
groups. Like [axes](/internals/frontend/axes) and
[legends](/internals/frontend/legends), a label is **not a privileged render-time
overlay**. It is _elaborated_ into an ordinary shape, a `label` node (text,
drawn as one mark; `labelNode.tsx`), seated beside (or inside) the labeled node via a `ref()` stand-in and ordinary `align`/`distribute`
constraints, in one `Layer` tier on the labeled node's **chart**, the content of
the nearest `chart()` around it — the same technique `elaborateOrdinalAxis`
uses for its ref-based tick labels. The layout
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
`layout()`, immediately after chrome elaboration, so a label may target a node
the chrome pass just wrapped. A label inside a node's content is inside that
node's chrome rings, so at layout time the rings seat their axes, titles, and
legend past it. It has three phases:

1. **`resolveLabelTargets`** — a single top-down walk that pushes each node's
   `_labels` array down to its children whenever the node has children but no
   rows of its own (no `datum`, or an empty one): a plain group node merely
   relays its label to whichever
   descendant should actually carry it, while a node **with** a datum (a leaf
   shape, or a group combinator that stamped its own subdata — see
   [Operator Factory](/internals/frontend/operator-factory)) keeps its own
   label rather than propagating it further. This is exactly the
   "a node with its own datum keeps its own label" rule the old
   `GoFishNode.resolveLabels()` implemented, generalized from one label to an
   array. It is what makes `.label()` on an **operator** (`spread`, `stack`,
   `group`, ...) label the group rather than every leaf mark inside it: the
   operator factory stamps `datum` on each group leaf it produces, so the push-down
   stops there. A mark that draws its own ink between or around its
   children keeps its label too: it says where its label goes
   (`labelPosition`, below), as `arrow` and the `line` connector do, and it
   is the thing labeled.
2. **`holdLabels`** — a pre-pass that takes every node's `_labels` off it,
   each spec resolved once to its position on its target (`positionOf`),
   into one list: a subtree's labels before those of the nodes that hold
   it, and siblings' in order. The target and the position travel with the
   spec from then on.
3. **The chart's layer** — each label goes to its home (`homeOf`): the
   nearest node above its target, the target included, that holds a
   chart's marks (`_chartContent`), or the render root when no `chart()`
   holds it. `chartBuilder.ts` sets `_chartContent` on the node a chart's
   mark resolves to and on the layer its frame holds, so in a `.layer()`
   chain the home is the target's own tier, and the transitions a tier
   draws over its marks (`time.transition()`) are outside it. Each home is
   wrapped once (`wrapWithLabels`) in a `Layer` holding its original
   content plus one `ref()` + `label` pair per (target × spec), and the
   wrapper takes the home's place in its parent. A home is wrapped after
   the homes inside it, so its chooser reads their labels, already placed,
   through refs.

A label's text comes from `resolveLabelText` (`labelPlacement.ts`). A field
expression is evaluated over the target's rows with `evalFieldValues`, given
the column's quantity (`resolveColumn`), so `field(name).sum()` in a label
checks that the column adds up, as it does in any channel: a column in a unit
without `CanAdd` throws (#1197, see
[Underlying Space](/internals/core/underlying-space)).

## A label is a layer on its chart

The wrap happens at the labeled node's chart, never at the labeled node
itself. This is deliberate and mirrors the axis gutter invariant exactly
(labels must never shift the marks they describe, #493): wrapping a mark
individually would fold the label's bbox into the mark's own box, and an
outset label would then push stacked/box-driven siblings apart — a label on
one bar in a `stack` would widen that bar's slot and shove its neighbors. By
wrapping the chart's content instead, the marks' own layout is untouched; the
label `Text`s seat off already-placed `ref()` stand-ins in the tier above, so
they occupy space in the **chart's** content (which its chrome rings — axes,
titles, legends — and the canvas size inference see and reserve room for)
without ever perturbing the marks' placement.

The home depends only on the charts around a mark, not on how its marks are
grouped: wrapping a labeled mark in a one-child `layer` draws the same
picture (asserted in `labelPlacement.test.ts`). A chart's labels paint above
all of its marks, and every chooser label of a chart is placed in one run.

The cost is that a label is not in its mark's subtree, though it is part of
the mark. So the pass records the link the other way, in both directions:
`target.INTERNAL_attach(label)` pushes each label `Text` onto its target's
`_attachments` and sets the label's `_attachedTo` to the target. A consumer
that takes a mark over takes its attachments with it; today that is
`time.transition()`, which moves a bar's label with the bar
(`src/ast/graphicalOperators/tween.tsx`). The other direction is for paint: a
label lowers under its mark's build-in animation (`INTERNAL_animate`), which it
finds through `_attachedTo`, so it follows its mark's timing
(`src/animation/paint.ts`).

Concretely, `wrapWithLabels` builds:

```
wrap = Layer([ content, ...refs, ...texts ])
```

and constrains it in this order (constraints apply in sequence and placement
is first-write-wins, so every later constraint sees its target already
placed):

1. `position({ x: 0, y: 0, anchor: "baseline" }, [content])` — pins the
   content at its own origin. The content is referenced by the label
   constraints below, and a constraint-referenced child skips the layer's
   phase-1 baseline placement; this re-states that placement explicitly, the
   same pin every chrome ring uses for the same reason: the label wrap is built
   with the same `wrapRing` (in `elaborationUtils.ts`).
2. Per target × spec at a position string, the constraints
   `buildLabelConstraints` derives from it (below), relating the spec's label
   to a `ref(target)` stand-in.
3. When any label is placed by the chooser, one `labelPlace` constraint over
   all of them, which the layer runs after its solve (see "Placement
   strategies" below).

An `arrow` whose children carry labels is still labeled at its end: its
own label keeps its target, the arrow, and is read through a `ref()` to it.

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
constraint system actually understands, in **the wrap's own axis order** — see
below for why that translation isn't literal on every axis.

## Axis direction and the rotation convention

x always runs with the pixels, so `left`/`right` map to bbox `start`/`end`
literally. y runs either way: the label constraints run in the wrapper's axis
order, whose y direction (`axisDirection` of the wrapped node, see
[Axis direction](/internals/layout/passes#axis-direction)) is `-1` for a continuous
y, which grows upward, and `+1` for one that reads top-down. `edgeAnchor` and
`crossAlignAnchor` take that direction, so an authored `"top"` always lands at the
visual top, and an authored `align: "start"` on a left/right edge always means the
visual top.

A label's `rotate` option is authored as **literal screen-clockwise degrees**
(Vega-Lite's convention), and the label node draws it as SVG's rotation, so it
passes through unchanged.

## The label node

The label node (`LabelText`, `labelNode.tsx`) measures its text the way `Text`
does (`estimateTextDimensions`), and its box is the text's box rotated by its
angle, centered on the node's local origin, so the box reads the same in either
y direction. Unrotated, it draws exactly as a `Text` of the same font: the
glyphs start at the box's left edge, on the baseline `ascent` below its top.
Rotated, the text turns about the box's center. A `Text` turns about its glyph
anchor instead, but once either box is placed the rotated text sits in the same
spot, because a rectangle's center is the center of its rotated bounding box.

It is its own node, not a `Text`, because a label holds state a placement may
write after layout: the angle it is drawn at and whether it is hidden. A
transition moves it rigidly, as it moves a `Text` (`RIGID_SHAPES` in
`tween.tsx`).

Its size is known before layout, so its claim (`resolveExtent`) is its box at
its base angle, centered on its origin, as a `Text` claims its own box. A label
a position string seats beside its mark therefore takes room in the layer that
holds it, and a chart's box holds the labels that reach past its plot. A label
the chooser places is ink instead (`inkOn` on both axes): the claim walk runs
before the chooser, so it cannot know where that label lands. Ink takes no
room; the render grows the canvas to hold it on an axis it gives no size, and
warns when it draws past a canvas it does (see `drawnOverflow` in
`gofish.tsx`).

## Placement strategies

`position` takes a position string, or a value of the `Place` family
(`families/place.ts`): `Place.around()`, `Place.along({ at, side, orient })`,
`Place.start()`, `Place.end()` and `Place.interior()`. A strategy reads the
target's `outline` geometry (see
[Layout Calculation](/internals/layout/passes)) and proposes candidate spots,
best first (`strategies.ts`):

- `around` takes the outline's extreme point in each of eight screen
  directions (Imhof's order, upper right first), and puts the label's box
  just past it, touching from the side the direction points to. Tied points
  form runs along the outline; a run stands for its middle (a ring that ties
  all the way round, like a bar thinner than the tie tolerance, has no ends,
  so it stands for the middle of its span across the direction), and of several
  runs (the two arm tips of a C facing right) the one nearest the middle of
  that side of the box wins, then the upper one.
- `along` takes spots on one outline: at `at` (a fraction of its length, its
  start, middle or end, or a named part such as a box's `x-max` edge), then
  sliding away by 3 px steps, nearest first, trying every listed side at a
  spot before sliding on. A level label beside the outline is moved off it
  along the side's normal until its box clears the outline; a sloped one is
  turned to the chord across its width, and skipped where the outline
  strays from the chord by more than 0.3 of its height. `above` and `below`
  have no spot where the outline is steeper than about 75°.
- `start` and `end` put a level label just past the first or last point of
  an open path, on the side the path heads.
- `interior` takes the spots inside a filled closed outline where the label's box
  (with 2 px padding) can grow largest: the room at a point is the scale at
  which the box centered there first touches the outline, its smallest
  weighted L∞ distance to an edge. A coarse grid finds the best cells and
  halving steps refine them. Only spots where the box fits at its own size
  are candidates. The edges are filed in a grid of cells sized to the
  label, and the room at a point reads the cells around it ring by ring,
  stopping once no unread edge can be nearer.

A strategy that needs geometry the target lacks is an error that names it
(`Place.interior needs a filled region; connect has an open one`). A
polygon with fill `"none"` has a closed outline but no filled region, so
`interior` is an error on it too.

`labelPlace` (`placeStep.ts`) is a private elaboration target like
`overlap`: the solver never sees it, and `applyConstraints` runs it after the
solve and after `overlap`, when the labeled marks are placed and their `ref()`
stand-ins can be read. It reads and writes in pixels through each
placeable's unoriented node (`rawPlaceable`), and reads a placed node's
outlines with `placedOutlines`, as `enclose` does. The labels of one `.label()`
call share one `group`: an identity made once per call, where the call is
recorded (the mark modifier's `bind`, an operator's label state, so a call
read back by `fromJSON` too), so two calls with the same accessor are two
calls. Every call of a chart is placed in one run, in the chart's label layer,
so the area they keep to is the chart's content: the plot area inside the
axes. A call's `start` and `end`
labels are placed first, each kind on its own (see below); the rest are
taken in data order, and each takes its first candidate that stays
inside the area the layer was given (`[0, size]` on each axis, so labels stay
off the axes around the plot) and whose box, grown by 1 px, covers no
obstacle. The strategies yield their candidates lazily, so the chooser stops
computing at the first free one. The obstacles sit in a uniform grid (`collide.ts`): the labeled
marks of the layer, as the ink each draws (the inside of a filled closed
outline, and the band its stroke `width` draws along every outline, open or
closed, so an unfilled closed outline is only its band), the label's own
mark as its outline's band only (so a label may sit inside its
region, and a label `"on"` a path may cover it), the labels placed so far
(by this step, or by the solve for a position string; a hidden one takes no
room), the labels of the charts inside the layer's chart, and the call's
`avoiding` nodes, read through fresh refs made once per call (`nodeRefs.ts`,
shared with `enclose`; a `selectAll` in `avoiding` is resolved where the
call is recorded, against the chart's named layers). A label with no free candidate is hidden: it draws nothing and
its box is empty at its mark's center. A `start` or `end` label has one
spot, past its path's end: the labels of one call whose boxes overlap in x
there slide apart vertically, a run at a time (`dodgeVertically`,
directlabels' `last.qp`), and labels apart in x keep the heights their ends
want. Each is then tested against the same obstacles as any label, and one
that covers an obstacle is hidden and counted. The area the layer was given
does not hold them: a path's end is where its label goes, often past the
area (a line chart's end labels take the margin), and the labels join the
layout's box. A seated label writes its
angle to the label node and its box with `setExtent`, so a sloped label's
box is its turned box. The render prints one `console.info` naming how many
labels each call hid (`reportHiddenLabels`, from `gofish.tsx`).

A position string never goes through the chooser, so it places exactly as
before. With no `position`, the default comes from the target's node
definition (`labelPosition`): `ellipse` gives `Place.around()` and `arrow`
`Place.end()` by convention; a connector (`line`, `ribbon`) and a `polygon`
give `"outline"`, which the chooser reads from the outline the mark draws
(`placeByOutline`): `Place.end()` for an open path, `Place.interior()` for a
filled region, `Place.around()` for a closed outline with no fill. Anything
else gets `"outset"`. Inside a coordinate space that is not linear (a polar `coord`),
outlines are not on the screen yet, so a default falls back to `"outset"` and
a strategy written out is an error that cites #1201. Before that, a strategy
is checked against the `Place` family with `checkStrategy` (an unknown kind,
an undeclared param or a value out of bounds throws the validator's own
message). The family's kinds and params are declared once in `STRATEGIES`
(`descriptors.ts`), which also gives the wire form, the Python `Place`
module, and the docs; a label's `avoiding`, `halo` and `background` are
`LABEL_OPTIONS` fields (see [Frontend IR](/internals/frontend/serialization)).

## Auto-color

When a spec omits `color`, `autoLabelColor` picks one when the label is drawn,
from the style its target painted. The label layer is a ring whose content, which
holds the target, paints before its labels, so the target has lowered by then. Nothing
reorders a ring's children: the content's own `.zOrder()` moves to the ring with its
key (`wrapPreservingIdentity`), since it orders the content among its own siblings,
and the label's nodes have no names, so no z constraint can reach them. Each lowering
records, as `GoFishNode.paintedStyle`, the style of the node's first own item that
puts down paint (a fill or a stroke). An own item with no paint of its own, such as a
scaled box's `group` or a compositor's `composite` or `mask`, is skipped, so a label
on a compositor gets the plain fallback below. Every `layout()` clears it, so it is
never left over from an earlier render. The label reads the drawn style (a
categorical swatch, a gradient's `scaleFn(value)`, a literal, at the opacity it was
drawn with), not a re-resolution of it.

The color is chosen once, at lowering, from that style at rest. A `live()` fill or
opacity that changes at paint time is not followed, and neither is a paint-time
animation's fade: the label fades with its mark. The page is assumed white, whatever
background the chart is shown or exported on. The color math lives in
`autoLabelColorForStyle` (`autoLabelColor.ts`) and runs on the color a renderer
paints: clipped to the sRGB gamut and rounded to 8 bits per channel.

Whether the label is inside is read from where it landed: its center is inside
one of its target's filled closed outlines. Inside an unfilled one the page shows
through, so it counts as outside. So a `"center"` label on a C-shaped polygon,
whose box center falls in the C's opening, is colored for the page, and a
`Place.interior()` label for the fill.

The label is read against the color directly behind its glyphs. That is the white
page, under the target's fill when the label is inside, under the label's
`background` box when it draws one, under its `halo` when it draws one, each
composited over the ones below it (culori's `blend`). The halo counts because it is
the stroke the glyphs sit in: the text is read against it, whatever lies under it.
The fill counts at the style's `opacity` times its `fillOpacity` times the fill's own
alpha, so a streamgraph's ribbons at `opacity: 0.8` are read at their lighter seen
colors. Overlapping marks under a translucent one are not composited.

The label is white or a dark color, whichever has the larger APCA contrast |Lc|
against that backdrop. A tie goes to the dark color. Inside the shape, the dark color
is a near-black tint of the fill's own hue (CIE LCh, D65; a gray fill has no hue, so
its tint is a near-black neutral). Outside, it is a darkened tint, at a fixed
lightness, of the hue and chroma of the target's ink: its fill, or its stroke when
the fill puts down no paint (a line, or a `"transparent"` fill). That names the
series the label belongs to; on the bare page white has no contrast, so the tint
always wins there. The tint reads the ink itself, not its composite: the ink's hue
and chroma name the shape's series at any alpha.

The contrast is APCA (APCA-W3 0.0.98G, the WCAG 3 candidate), as `apcaContrast` in
`colorModes.ts`: colorjs.io's implementation, vendored so the library does not pull
in the rest of colorjs.io. APCA rather than a lightness cutoff or a WCAG 2 ratio,
because mid-tone fills are where the two candidates are close, and there APCA tracks
readability better: Tableau green `#59a14f` scores Lc 64 with white text and 45 with
black, while WCAG 2 would pick black.

A fill or stroke that puts down no paint (`none`, `transparent`, alpha 0) or is not
a parseable color (`currentColor`, `url(#…)`) is not there: it adds nothing to the
backdrop, and with no ink the dark color is a plain `"black"` (inside) or
`"#333333"` (outside).

## Multi-label and typography options

Repeated `.label()` calls on the same node **append**: `GoFishNode.label()`
pushes onto an array (`(this._labels ??= []).push({ accessor, ...options, group: call })`),
so `_labels` is genuinely a list of independent specs, each with its own
accessor, position, and styling — not a single mutable slot. `LabelOptions`
carries `fontFamily`/`fontWeight`/`fontStyle` alongside the older
`position`/`fontSize`/`color`/`offset`/`rotate`; all three pass straight
through to the elaborated label node, which measures font family/weight/
style for its own bbox, so they affect layout correctly. `halo` (a white
text outline, SVG `paint-order: stroke`) and `background` (a filled box) are
drawn by the label node and count in its box. `minSpace` — the old overlay path's fit-heuristic knob for
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

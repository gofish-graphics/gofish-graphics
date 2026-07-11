---
title: Axes
section: Frontend
order: 50
status: draft
covers:
  - packages/gofish-graphics/src/ast/axes/elaborate.tsx
  - packages/gofish-graphics/src/ast/_node.ts
---

# Axes

GoFish draws axes — an axis line, tick marks, tick labels, and (for categorical
spaces) per-key labels — automatically from the position scales it infers. Axes
are **not a privileged node type**. They are _elaborated_ into ordinary GoFish
shapes (`rect`, `text`) and operators (`spread`, `layer`) wired together with
constraints (`align`, `distribute`, `position`), exactly the way the hand-drawn
axes in `stories/lowlevel/Axes.stories.tsx` are written by hand. The layout
engine has no axis-specific code at all.

## The elaboration pass

`elaborateAxes` (`src/ast/axes/elaborate.tsx`) runs inside `gofish.tsx`'s
`layout()`, _after_ `resolveUnderlyingSpace` (so domains are known) and
`resolveAxes` (which flags which node owns an axis on each dimension — and leaves
persistent `axisDemand` stamps that later gate demand-driven domain nicing at the
σ-scope solves, issue #659). Tick values come from `d3.nice` applied node-locally
to the owning node's POSITION domain — the same function the owning scope's
solve applies to the same union domain, so ticks and content agree by
construction. It walks the node tree **bottom-up**;
any node `resolveAxes` flagged (`axis.x` / `axis.y === true | "budget"`) is replaced
by up to two `Layer` tiers wrapping the original content plus the elaborated axis
shapes:

```
inner = Layer([ content.name("__axisContent"), ...continuous/difference shapes ])
root  = Layer([ inner.name("__axisInner"), ...ordinal labels ])
```

The **inner tier** holds the constraint-pinned axes (continuous/difference); the
**outer tier** holds the ordinal label rows, which need the inner tier fully laid
out so they can seat past its bounding box. In each tier the wrapped child is
pinned with `position({ x: 0, y: 0, anchor: "baseline" })` — a literal-pixel pin
at the origin, meaning "stay exactly where you were laid out". The pin exists
because the content is referenced by `distribute` constraints, and a
constraint-referenced child skips the layer's phase-1 baseline placement
(placement is first-write-wins, so constraints must run against unplaced
targets); the origin pin re-states that phase-1 placement explicitly. The anchor
must be `baseline`, not `start`: `start` pins the _bounding-box_ corner, which
slides the marks off the tick grid once the box overhangs the origin (nested
facet labels, negative bars).

Everything else then seats around the stationary content in **negative gutter
space** (into the SVG padding): the axis line distributes off the content's
near edge, tick marks align flush with the line, labels hang outward. Keeping
the content at its origin — rather than letting the gutter chain push it, as
the single-axis hand-drawn story does — is what keeps _two_ continuous axes on
one grid: a shifted content would land at `gutter + scale(v)` while the other
axis's datum-pinned ticks sit at `scale(v)`.

When both dimensions have position-like axes, each axis line is seated from the
other dimension's datum floor plus a fixed outward standoff. This is deliberately
different from seating at the content bbox: a niced scatter domain may extend
past the lowest/highest datum, and the axis should frame the plot-space corner
rather than the visible data extent. The standoff also keeps marks exactly on
the domain floor (for example, a histogram bin at `y = 0`) from straddling the
axis line.

### Which side the axis seats on

Each axis seats in a gutter on one cross-edge. The **default** target is the
CONVENTIONAL edge — a continuous/difference **x-axis renders at the visual
bottom**, a continuous y-axis at the left — regardless of whether the frame
y-flips (issue #143/#16/#629). `axisSide` (in `elaborationsFor`) turns that target
into the abstract `start`/`end` edge to author against: when the cross frame
mirrors (a CONTINUOUS cross y, a global `yUp`, or a `coord` ancestor — tracked by
the `underCoord` flag threaded down `elaborateAxes`), the near `"start"` edge lands
at the bottom, so keep it; otherwise (a horizontal bar's ordinal category y, a
faceted stack's ordinal facet y) the far `"end"` edge is the bottom. This is what
puts a horizontal bar's and a faceted small-multiple's value axis at the bottom
with no option — the pre-#629 behavior left them stranded at the top.

The public `axes: { x: { side: "start" | "end" } }` option is the **override**:
when specified it is honored **literally** (frame-relative: `"start"`=near,
`"end"`=far), bypassing the bottom-default so a caller can force the opposite edge.
`resolveAxisSides` returns `undefined` for an unspecified side precisely so the
elaboration can tell an explicit `"start"` apart from the default. The per-dim
side is threaded `elaborateAxes → elaborationsFor → elaborate{Continuous,
Difference,Ordinal}Axis`, and each seating decision reads the resolved edge:
`gutterConstraints` flips the `innerAlign` edge and the `distribute`/standoff
order, `tickMark` swaps the label/tick order so the tick still faces the content,
the ordinal label row flips its `distribute([label, content])` pair, and the axis
**titles** follow their axis to the same edge (see below).

Ordinal axes keep the plain `"start"` default (they flip with the content like a
category row, not to a fixed edge). Chart-level **axis titles** are chrome
(`elaborateAxisTitles`), so they reach the bottom by a different mechanism than the
content-embedded line — a box-mirror about the canvas when the frame flips, or a
direct far-edge seating (with the mirror suppressed) when it does not. `gofish.tsx`
computes the title's `sides` and the mirror-suppression (`xTitleSeatsFar`) to match
wherever `axisSide` put the line, so the two always land together.

### Label rotation (`labelAngle`)

The public `axes: { x: { labelAngle: number | number[] } }` option (#746, extended
to per-tier arrays afterward) rotates a tick or category label about its anchor,
authored **screen-clockwise** to match Vega-Lite's `labelAngle`. It is threaded the
same way `side` is —
`elaborateAxes → elaborationsFor → elaborate{Continuous,Ordinal}Axis → tickMark` /
`elaborateOrdinalAxis` — landing on the `Text` mark's `rotate` prop, which is
applied in the node's own **y-up world frame** and gets negated at render time
when that frame flips (`text.tsx`'s `flips ? -rotate : rotate`). Since
`elaborationsFor` doesn't know the bake-time flip decision, it pre-negates using
the same predicate `axisSide` already uses for its cross-flip check
(`yUp || underCoord || isCONTINUOUS(space[1])` — this is dim-independent: it's
really "does this node's own y mirror", not specific to the axis being labeled),
canceling the render-time negation so the label lands at the literal screen angle
regardless of the frame's orientation. There is no "auto" rotation mode (deferred
to #486) — this is a manual, always-on angle.

**The hanging-point rule.** `resolveLabelRotation` (`axes/elaborate.tsx`) turns
the authored angle `a` into a `LabelRotation` descriptor — `rotate` (the
frame-resolved value passed to `Text`), `trackAlign`, and `textAnchor` — that
governs how the label attaches to its tick/key along the TRACK axis (the axis's
own direction): the label is anchored at whichever of its points ends up nearest
the axis line, not at its rotated bbox's middle.

- `a` is `0`/`undefined`: `trackAlign: "middle"` — plain bbox-middle centering,
  IDENTICAL to the unrotated path (no rotation is even applied).
- `|a| === 90`: also `trackAlign: "middle"` — the rotated column's bbox middle
  already centers it horizontally on the tick.
- `0 < a < 90` (slants down-right): `trackAlign: "baseline"`, `textAnchor:
"start"` — the label hangs from its FIRST character (Vega-Lite's 45° look).
- `-90 < a < 0` (slants up-right): `trackAlign: "baseline"`, `textAnchor: "end"`
  — the label hangs from its LAST character (matplotlib's `ha="right"` look).

`"baseline"` is `AlignAnchor`'s existing "pin the target's own local origin"
mode (`_node.ts`'s `_pinAnchor`), and `Text`'s rotation is applied about that
same local origin (`text.tsx`), so pinning `"baseline"` pins the rotation pivot
directly — no bbox-edge arithmetic needed. `textAnchor` (a new `Text` prop)
picks which end of the pre-rotation label sits at that origin: `"start"` (the
default) puts the first character there, `"end"` puts the last character there,
so the SAME `"baseline"` anchor reaches either hanging corner depending on the
angle's sign. Accepted approximation: the origin sits on the label's baseline
(`dominantBaseline: "auto"`), not the ascender-top corner an idealized "nearest
point on the rotated bbox" derivation would use — the two differ by
`ascent·sin(a)`, a couple of pixels at these sizes, invisible in practice.

For an ordinal axis, `elaborateOrdinalAxis` expresses this directly:
`Constraint.align`'s anchor accepts a per-child array
(`[trackAlign, "middle"]`), so the label pivots to `"baseline"` while the key
node it tracks stays `"middle"`-anchored on its own extent — one constraint,
heterogeneous anchors. A continuous axis can't do the same by nesting the tick
and label into one `tickMark` node the way the unrotated/±90° path does: an
oblique label's rotated bbox is NOT symmetric about its pivot, so
`positionAxis`'s per-tick `Constraint.position(pos(v), [tick])` — which defaults
to `anchor: "middle"`, i.e. the target's bbox middle — would pin the PAIR's
lopsided union bbox middle at the data value instead of the pivot, dragging the
hanging point off the tick by however asymmetric the rotated label is. So for
an oblique continuous axis, `elaborateContinuousAxis` keeps the tick bare
(`tickRect`, unaffected by the label) and gives `positionAxis` a separate
`tickLabel` builder: the DATA pin still targets the bare tick alone, and the
label is a sibling related to it by the same heterogeneous
`Constraint.align` + a cross-axis `Constraint.distribute`, mirroring
`elaborateOrdinalAxis`'s approach. The unrotated/±90° path is untouched code
(still `tickMark` + `Spread`'s uniform `"middle"` alignment), not just untouched
geometry, so those angles stay pixel-identical to before the hanging-point rule.

**Per-tier selection.** A plain number applies uniformly to every tier of a
nested ordinal axis (a grouped bar chart's inner year row and outer city row
both rotate the same amount); an array is per-tier instead, indexed from the
INNERMOST tier outward — `angleForTier(opt, tier)` picks `opt` itself when it's
a number, or `opt[tier]` (possibly `undefined`, past the array's end) when it's
an array. `elaborationsFor` needs to know which tier index `tier` a given
ordinal-axis-owning node is, since **ordinal axes nest**: `resolveAxes` lets a
distinct ordinal grouping claim its own axis at every depth (`_node.ts`'s
`resolveAxes`), so a grouped bar chart has one node owning the city axis and,
independently, one sibling-node-per-city each owning that city's year axis — a
DEEPER call in the bottom-up `elaborateAxes` walk always elaborates an inner
tier before an ancestor elaborates an outer one on the same dim.

The tier index is computed by bubbling a per-dim `tierCounts: [number, number]`
UP through the recursion, exactly like `titleAnchors` bubbles up axis-line
anchors: `elaborateAxes` folds it as a `Math.max` over its own children's
returned `tierCounts` (a node's tier count only depends on ITS OWN subtree, so
sibling subtrees elsewhere in the tree — e.g. two independent grouped-bar
regions — don't interfere with each other), then calls `elaborationsFor` with
that folded value. Inside `elaborationsFor`, a node that claims an ordinal axis
on dim `d` reads `tier = tierCounts[d]` (0 for the first — innermost — claim
seen anywhere below it) as its OWN tier index, then increments
`tierCounts[d]` by one before returning, so an ancestor claiming the same dim's
next-outer tier reads the incremented count. Continuous/difference axes are
always single-owner and single-tier (`resolveAxes`: "Continuous: single-owner —
only the root-most unclaimed dim claims"), so they always resolve tier `0` —
i.e. the number, or `array[0]`.

The wrapper inherits the wrapped node's `key` and `_name`, so faceting and
external refs keep resolving to it. After the rewrite, the whole tree's underlying
space is recomputed (the cache is cleared); then normal layout runs, and each
σ-scope's solve nices its own domain on demand — there is no tree-wide nice pass.

Because the axis is now a **real shape occupying real space**, everything the old
bespoke pipeline hand-coded falls out of ordinary layout:

- **Cross-facet alignment** — facets are the same structure, so they line up.
- **Stacked outer/inner labels** — an inner facet's axis sits below its content,
  the outer facet's axis below the whole group; they stack naturally (the former
  `innerBaseline` 2×AXIS_WIDTH special case is gone).
- **Per-facet local scales** — each facet wrapper infers its own POSITION domain
  from its tick `position` constraints (`collectPositionDomains` → `layer.tsx`),
  so the old per-facet local-posScale special case is gone too.
- **Shared (overlay) axes** — a `"budget"` sibling is elaborated identically to the
  `true` owner; overlapping siblings simply overdraw the same axis, which keeps
  their content aligned without a reserved budget.

## The three kinds

`elaborateAxis` is a pure function (returns `{ nodes, constraints }`, no mutation),
one branch per axis flavor — the seam a future public API would override. Since
the #586 collapse POSITION and DIFFERENCE are no longer distinct space _kinds_
but two `origin` states of the single `continuous` kind, so the branches
dispatch on the `isPOSITION` / `isDIFFERENCE` / `isORDINAL` predicates rather
than a `kind` tag, and the data interval is read uniformly via
`continuousInterval(space)` (`[origin, origin + width.run(1)]`) instead of a
per-kind `.domain` / `.width` field:

- **POSITION (continuous, numeric origin)** — `d3.nice` + `d3.ticks` over the
  interval; an axis line
  (a 1px `rect` auto-spanning the domain via `datum` endpoints), and a
  `spread([text, tickMark])` per tick pinned with
  `Constraint.position({ [axis]: datum(v) })`. The gutter is negative space;
  the line seats one of two ways. When the **other** dim also carries a
  position-like axis, the line is pinned just outside that axis's scale floor —
  `position({ [cross]: datum(floor), anchor: "end", offset: -GAP })` — so the
  two lines frame the domain corner even when no datum reaches it (a scatter
  whose y domain is niced below the lowest point must not draw its x axis at
  the lowest point), while the fixed standoff keeps marks _at_ the floor (a
  y=0 histogram bin) from straddling the line. Otherwise
  `distribute([line, content])` seats it just past the content's bbox edge (a
  bar chart's y axis sits beside the bars). Either way,
  `align(end)` sets the ticks flush against the line (their inner edge _is_
  the tick mark, so the label text ends up offset by the tick + gap inside
  each tick's spread).
- **DIFFERENCE (continuous, `origin: "impossible"`)** — bare tick marks at the
  tick values over `[0, width.run(1)]`, plus plain-text labels
  showing the _delta_ between adjacent ticks, pinned at their midpoints
  (`position({ [axis]: datum(midpoint) })`). The delta labels have no tick of
  their own to provide an offset, so they `distribute` off the line (at the
  tick + gap distance) instead of aligning flush against it.
- **ORDINAL** — per key, a `text(key)` plus a `ref(keyNode)` stand-in bound
  directly to the laid-out key node. The label `align`s `middle` with its ref
  along the axis (tracking its mark), and `distribute`s against the wrapped
  content layer (`__axisInner`) in the gutter dimension — so all labels share
  one row seated past the _group's_ box (below the most-negative bar; below an
  inner facet's own label row), not each mark's own extent. This is the chain
  that makes nested facet labels stack: the inner row joins the facet's box,
  the facet boxes join the spread's box, and the outer row distributes against
  that. Key discovery uses `_ordinalKeyMap` (set by operators such as `table`)
  or a subtree walk by `node.key`.

## Unifying duplicate axes across self-scaled siblings

`resolveAxes` (`_node.ts`) is a top-down walk: a `claimed` map threads DOWN each
branch so a continuous axis is single-owner (root-most unclaimed wins) and an
ordinal axis nests by grouping signature. That map never crosses siblings,
which is fine when a group's children share their parent's ordinary
(non-self-scaled) space — the union already happened by the time the parent is
visited, so the parent claims once and every descendant sees the dim as
already taken. It breaks down for a **self-scaled** group: a `spread` whose
per-group children (e.g. a `scatter` given an explicit pixel `w`) each root
their own σ-scope reports `UNDEFINED` on that dim to its parent (see
[Underlying Space](/internals/core/underlying-space)'s self-scaling-region
section) — that is correct for sizing (the parent's auto-fit must not see a
foreign per-child scale), but it also means the parent has no domain to claim
an axis with, so each self-scaled sibling was left to independently claim (an
explicit `axes:{x:true}` override, having no ordinal-style dup check for the
continuous case, drew one redundant axis per sibling) or, without an override,
claim nothing at all (a ridgeline chart's dozen per-month density panels,
`stories/forwardsyntax/RidgelineChart.stories.tsx`, is exactly this shape).

The fix keys the unification on **signature equality**, the same trick the
ordinal branch already uses (`"o:<keys>"`), extended to self-scaled continuous
siblings:

- `layer.tsx` now stashes the real (anchored/difference) space it throws away
  for a self-scaled dim into `GoFishNode.selfScaledSpace`, alongside the
  `UNDEFINED` it reports upward. Its presence (`!== undefined`) is itself the
  "this dim is self-scaled" marker — there is no separate boolean. This does
  **not** change what layout sees — `_underlyingSpace` is still `UNDEFINED`
  there, so sizing/auto-fit is untouched; the stash is a side channel
  `resolveAxes` alone reads.
- A node whose own space collapsed to `UNDEFINED` on `dim` computes
  `sharedSelfScaledChildSignature`: if **every** direct child is self-scaled on
  `dim` with an **identical** signature (same `dataDomain` + `width` +
  `measure` — at least two children, so there's an actual sibling group), the
  node claims the axis itself, right there, instead of leaving each child to
  fend for itself. It stashes the representative shared space onto
  `GoFishNode.hoistedAxisSpace` (elaboration reads this as a fallback wherever
  `_underlyingSpace` is `UNDEFINED`, so it can still compute nice bounds and
  tick values) and claims the dim with the shared signature (`"c:<domain+width
+measure>"`) rather than the generic opaque continuous claim — so a
  descendant whose own self-scaled signature matches is recognized as the
  exact duplicate this hoist already drew (and suppressed), while a
  differently-scaled or non-self-scaled sibling is left alone.
- The same signature match gates the **override** branch's new duplicate
  check: an explicit `axes:{x:true}` on a self-scaled node is suppressed only
  when an ancestor's claim carries _that node's own_ self-scaled signature —
  never for the generic opaque claim a plain single-global-scale chart makes.
  This is what keeps small-multiples with genuinely **independent** per-facet
  scales (each self-scaled with a different domain, each explicitly opted into
  its own axis via `axes:{x:true}`) drawing one axis per facet exactly as
  before — only a facet whose scale is provably identical to its siblings'
  gets folded into the parent's single hoisted axis.

Mismatches (a sibling with a different domain, or a mix of self-scaled and
plain children) simply don't hoist — each child keeps whatever per-child claim
it would have gotten without this mechanism at all. The hoist is additive: it
only ever turns "no axis" or "one axis per sibling" into "one axis for the
group," never the reverse.

## The scale-sharing seam

The wrapper layer "owns" the POSITION axis via its tick `position` constraints, so
content and ticks resolve against one scale. `layer.tsx` forwards that scale
(`effectivePosScales`) to non-target content children whose own space is POSITION
(e.g. a scatter's points), while withholding it from the ticks (placed by the
constraint) and from SIZE content (bars), whose alignment would break if a posScale
leaked in. This per-child decision is what lets a data-positioned chart and its
elaborated axis share a coordinate frame.

## Axis titles

Axis titles are elaborated too, by a second pass in the same file —
`elaborateAxisTitles`. It differs from `elaborateAxes` in kind: where the axis
pass wraps _every_ node that owns an axis anywhere in the tree, the title pass is
a single wrap at the chart root carrying **at most one title per dim**. The two
title strings are resolved by `gofish.tsx`'s `layout()` from the chart-level
`axes` options plus the inferred `axisFields` (the field names the chart builder
mapped to each axis), and `layout()` calls the pass only when at least one is
present.

A title is placed **relative to the axis shape it describes**, not the plot. The
axis pass already builds an axis-line node per position-like dim; `AxisElaboration`
carries it as an optional `anchor`, and `elaborateAxes` bubbles those lines up the
recursion as a per-dim `titleAnchors` pair. Any dim a node owns an axis on is
**claimed** outright: the slot is overwritten with that node's own anchor — the
axis line for a position-like axis, or `undefined` for an **ordinal** one, which
has no spanning line. Because the walk is bottom-up, the **root-most** owner wins —
so a chart-level title describes the outermost axis, not an inner facet's. The
clearing matters for faceted charts: the root owns the ordinal facet axis while
each facet owns a continuous axis on the _same_ dim, and without the claim the
first facet's line would bubble past the root and drag the title onto one
subchart; with it, the title falls back to the plot node — the span of the whole
ordinal group. (Multiple same-dim owners across _sibling_ facets are ambiguous:
they overwrite the same slot, so the last-visited one wins. Disambiguating that —
a per-facet title — is out of scope; a comment in the source flags it.)

`elaborateAxisTitles` then wraps the content in one more `Layer` and centers each
title on its anchor:

- The anchor per dim is `anchors[dim] ?? plotNode` — the axis line if one exists
  (continuous/difference), else the plot node. The fallback covers **ordinal**
  axes (just a label row, no spanning line, UNDEFINED space elaborates nothing)
  and untitled-axis dims: the plot's own bbox stands in.
- It is referenced with a `ref(anchorNode)` stand-in — the same direct-node `ref`
  form `elaborateOrdinalAxis` uses. The title layer is outermost, so by the time
  the constraints read the ref the axis line / plot is already placed; the ref
  resolves to that placement, so `align({ [dim]: "middle" }, [ref, title])` moves
  only the title onto the line's center.
- A `distribute` then seats the title GAP (`TITLE_CONTENT_GAP = 8`) outside the
  **full** content bbox — past the tick/ordinal label rows, not just the plot —
  so it never overlaps them. Listing the title _before_ the content in the pair
  makes `distribute`'s backward walk place the title's far edge outside the
  content's near edge.
- The y-title is built with the `Text` `rotate: 90` option so it reads
  bottom-to-top in the left gutter; the x-title is horizontal below the plot.

The two builders `xAxisTitle` / `yAxisTitle` are **pure, exported functions** —
the customization seam, exactly like `elaborateAxis` for the axes and
`legendColumn` for the legend.

`elaborateAxisTitles` runs in `layout()` **before** the legend wrap: the legend
seats itself off the titled content's bbox, so the title must already be in
place — and conversely the title's centering must never see the legend column
(it would drag the title off-center). The pre-title content node is also what
defines the inferred canvas when `w`/`h` are omitted, so a long title can't
inflate it. See [Layout & Render Passes](/internals/layout/passes) and
[Legends](/internals/frontend/legends).

## What this replaced

The former bespoke pipeline — `shapes/axis.tsx` (custom `GoFishNode`s with
hand-written SVG `render()`), plus ~260 lines of axis budget / `innerBaseline` /
content-shift / per-facet local-posScale machinery in `_node.ts` and a baseline
cancellation in `spread.tsx` — has been deleted. `resolveAxes` remains (it
feeds the pass, and its persistent `axisDemand` stamps drive the demand-driven
per-scope domain nicing at the σ-scope solves); the former `resolveNiceDomains`
tree walk is gone (issue #659 — nicing now happens once per σ-scope, at the
solve). The chart-level `axes` option
still drives both the axis pass and the title pass above. Axis titles used to
render as raw `<text>` elements in `gofish.tsx`'s `render()` behind fixed
40px margins; that bespoke path is gone too, replaced by the title elaboration
described above. Polar/coord axes are still drawn by `coord.tsx` and are not yet
elaborated.

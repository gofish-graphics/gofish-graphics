---
title: Axes
section: Frontend
order: 50
status: draft
covers:
  - packages/gofish-graphics/src/ast/axes/elaborate.tsx
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
`layout()`, _after_ `resolveUnderlyingSpace` (so domains are known), `resolveAxes`
(which flags which node owns an axis on each dimension), and `resolveNiceDomains`
(so tick values come from the rounded domain). It walks the node tree **bottom-up**;
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
pinned with `align({ x: "baseline", y: "baseline" })` — a _baseline_ (origin)
pin, meaning "stay exactly where you were laid out". The pin exists because the
content is referenced by `distribute` constraints, and a constraint-referenced
child skips the layer's phase-1 baseline placement (placement is first-write-wins,
so constraints must run against unplaced targets); the baseline pin re-states
that phase-1 placement explicitly. It must be `baseline`, not `start`: `start`
pins the _bounding-box_ corner, which slides the marks off the tick grid once
the box overhangs the origin (nested facet labels, negative bars).

Everything else then seats around the stationary content in **negative gutter
space** (into the SVG padding): the axis line distributes off the content's
near edge, tick marks align flush with the line, labels hang outward. Keeping
the content at its origin — rather than letting the gutter chain push it, as
the single-axis hand-drawn story does — is what keeps _two_ continuous axes on
one grid: a shifted content would land at `gutter + scale(v)` while the other
axis's datum-pinned ticks sit at `scale(v)`.

The wrapper inherits the wrapped node's `key` and `_name`, so faceting and
external refs keep resolving to it. After the rewrite, the whole tree's underlying
space is recomputed (the cache is cleared) and re-niced; then normal layout runs.

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
one branch per underlying-space kind — the seam a future public API would override:

- **POSITION (continuous)** — `d3.nice` + `d3.ticks` over the domain; an axis line
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
- **DIFFERENCE** — bare tick marks at the tick values, plus plain-text labels
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

## The scale-sharing seam

The wrapper layer "owns" the POSITION axis via its tick `position` constraints, so
content and ticks resolve against one scale. `layer.tsx` forwards that scale
(`effectivePosScales`) to non-target content children whose own space is POSITION
(e.g. a scatter's points), while withholding it from the ticks (placed by the
constraint) and from SIZE content (bars), whose alignment would break if a posScale
leaked in. This per-child decision is what lets a data-positioned chart and its
elaborated axis share a coordinate frame.

## What this replaced

The former bespoke pipeline — `shapes/axis.tsx` (custom `GoFishNode`s with
hand-written SVG `render()`), plus ~260 lines of axis budget / `innerBaseline` /
content-shift / per-facet local-posScale machinery in `_node.ts` and a baseline
cancellation in `spread.tsx` — has been deleted. `resolveAxes` and
`resolveNiceDomains` remain (they feed the pass); the chart-level `axes` option and
axis _titles_ are unchanged (titles still render in `gofish.tsx`'s `render()`; folding
them into the elaboration is future work). Polar/coord axes are still drawn by
`coord.tsx` and are not yet elaborated.

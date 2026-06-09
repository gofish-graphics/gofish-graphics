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
by a `Layer` wrapping the original content plus the elaborated axis shapes:

```
Layer([ content.name("__axisContent"), ...axisShapes ]).constrain(...)
```

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
  `Constraint.position({ [axis]: datum(v) })`. The gutter flows from a zero-size
  anchor (`align` to the cross-start edge) → tick labels → line → content, so the
  gutter width emerges positively (the hand-drawn `ContinuousYAxis` used its title
  for this anchor role).
- **DIFFERENCE** — same geometry, but the labels are the _delta_ between adjacent
  ticks placed at their midpoints (`position({ [axis]: datum(midpoint) })`).
- **ORDINAL** — a `spread([text(key), ref(keyNode)])` per key, where `ref(keyNode)`
  binds directly to the laid-out key node so the label tracks the content with no
  constraints at all. Key discovery uses `_ordinalKeyMap` (set by operators such as
  `table`) or a subtree walk by `node.key`.

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

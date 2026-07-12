---
title: Three Surfaces
section: Design Evolution
order: 10
status: draft
covers:
  - packages/gofish-graphics/src/lib.ts
---

# Three Surfaces, One Tree

`src/lib.ts` exports three different surfaces for writing the same chart. The
rest of the wiki treats only the latest of them — the `chart(...).flow(...)
.mark(...)` fluent builder — as _the_ frontend. This essay is the place where
the other two are still spoken about, and where the history of how the API
landed where it did is recorded.
The module also re-exports a few lodash data helpers (`groupBy`, `sumBy`,
`orderBy`, `meanBy`) for convenience; those are implemented with per-helper
entrypoint imports so the public surface is stable in native ESM runtimes.
Alongside them it exports two datum-projection helpers for reading fields off a
selection's refs: `pluck(source, path)` returns the **un-collapsed** multiset of
distinct values at a path ("every value here"), while `project(source, path)`
(the public name for the internal `projectPath`) is its **collapsing**
counterpart — the single value when the row-bag agrees on the field (the same
homogeneity collapse `by:` performs), else `undefined`. Reach for `project` to
read a field off the datum a mark is bound to (e.g. inside a `.zOrder(d => …)`
callback) without indexing `pluck(...)[0]`; reach for `pluck` when the field is
genuinely multi-valued in the bag.

A naming note before anything else: internally, these surfaces were "v1",
"v2", and "v3", and a lot of code still uses those names. The wiki has
otherwise retired the version-numbered framing — it papered over the fact that
all three desugar onto the same core AST, and made the newest surface sound
provisional in a way it isn't. They are three _surfaces_ over one core, not
three _versions_ of a library that supersedes itself.

Casing is the user-visible seam between the surfaces. The capitalized,
component-style surface owns the capitalized names (`Rect`, `Stack`, `Layer`,
…), so the fluent builder is deliberately lowercase-only: its entry point is
`chart`, with no capitalized `Chart` alias — that alias was removed to keep
the casing convention unambiguous (capital `Layer`, for instance, still
exports, but only as the capitalized-surface combinator, distinct from the
fluent builder's `.layer()` method). The fluent surface also carries the
operators used inside `.flow(...)` — `spread`, `stack`, `scatter`, `group`,
`derive`, `resolve`, and `join` (`resolve` dereferences reference columns into
drawn node refs, driving the ribbon / node-link / labeling patterns via
`.layer()` + `resolve`; `join` is a one-to-many equi-join relating two data
tables on a shared key).

Connectors are no longer a surface of their own. The standalone `connect` /
`connectX` / `connectY` operators (and the capitalized `Connect`) were removed;
a connector is now the _combinator form_ of an ordinary mark — `line` (center)
or `ribbon` (edge band, formerly the `area` mark) — invoked with an explicit
array of `ref(...)` children. The shape of the drawn path is a single `curve`
key, backed by the pluggable router registry that `lib.ts` re-exports from
`ast/graphicalOperators/routers` (`registerRoute` / `getRoute` / `resolveCurve`
and the built-in `straight` / `bezier` / `orthogonal` / `arc` / `perfectArrows`
routers). `curve: "auto"` smooths automatically on continuous axes — see
[Underlying Space](/internals/core/underlying-space) for the positioning-space
test that decides this.

The fluent builder went through the same consolidation one layer up. It
briefly had its own `.connect(connectorMark)` method — sugar for threading a
single ref-consuming mark under a chart's own marks. That method has since
been deleted too: `.layer()` was generalized to hand every tier the previous
tier's marks as scope, uniformly, so a bare `line()`/`ribbon()` passed
directly to `.layer()` does what `.connect()` used to. The common
re-partition case (`.layer(ribbon({}))` fused over a chart's own flow) needs
no option at all now — a fused connector splits at the flow's own grouping
by default (issue #752's default-grouping rule), which is what used to need
a separate `group()` step; naming a different path tier explicitly is
`along` (e.g. `.layer(ribbon({ along: "species" }))`), not a `by` option.
`.layer()` is now the one way to overlay a connector, at every level — the
fluent-builder method, the general `chart()`-tier form, and the low-level
combinator form described above all funnel through it. See
[`.layer()`](/js/api/core/layer) for the current API.

## Planned contents

- The three surfaces side by side — the same chart in each.
- What each surface was reacting to; the lesson the next one carried forward.
- The fluent builder as the recommended surface, and how the other two desugar
  onto the same AST.
- The migration story, and what (if anything) is planned for the older
  surfaces.

## Source

`covers:` is `packages/gofish-graphics/src/lib.ts`. After editing, run
`pnpm --filter docs sync-backlinks` to regenerate the `@wiki` comment.

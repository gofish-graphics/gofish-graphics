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

Casing used to be the user-visible seam between the surfaces. The capitalized,
component-style surface once had a capitalized spelling for most operators, and
many of them were plain aliases of a lowercase export (`StackX` for `stackX`,
`Frame` for `frame`, `Arrow` for `arrow`, `GoFish` for the `gofish` render
terminal, and so on). Those aliases were removed (#416), so that surface has
collapsed into the lowercase low-level combinator form. The fluent builder was
already lowercase-only: its entry point is `chart`, with no capitalized `Chart`
alias. The node-level operators that the lowercase ones are built from
(`Spread`, `Layer`, `Treemap`, the region-compositing node operators, and so
on) take already-built nodes and return a node. They used to be exported as a
capitalized second spelling, but they are now internal (#146): each lowercase
operator works both inside `.flow(...)` and as a combinator over marks, and a
`createMark` body may return that combinator's mark directly, because
`createMark` resolves whatever its body returns the same way a combinator
resolves a child. The async map over a collection, once the capitalized
`For`, is now the lowercase `map`, so a capital letter now means only a
namespace: the factory namespaces `Constraint` (constraints) and `Schema`
(column types for `chart`'s `schema` option), `Calendar`, a namespace of
calendar partitions for a time axis's `rows` (#1057), and the strategy
families described below. The fluent
surface also carries the
operators used inside `.flow(...)` — `spread`, `stack`, `scatter`, `group`,
`treemap`, `pack`, `derive`, `resolve`, and `join` (`treemap` takes a tiling
strategy object such as `Tile.squarify()` as its `tile`, never a string, and
`scatter` takes an overlap strategy such as `Overlap.separate()` or
`Overlap.jitter()` the same way; `resolve` dereferences reference columns into
drawn node refs, driving the ribbon / node-link / labeling patterns via
`.layer()` + `resolve`; `join` is a one-to-many equi-join relating two data
tables on a shared key).

Connectors are no longer a surface of their own. The standalone `connect` /
`connectX` / `connectY` operators (and the capitalized `Connect`) were removed;
a connector is now the _combinator form_ of an ordinary mark — `line` (center)
or `ribbon` (edge band, formerly the `area` mark) — invoked with an explicit
array of `ref(...)` children. The shape of the drawn path is a single `curve`
key, backed by the internal router registry in
`ast/graphicalOperators/routers`, which `lib.ts` does not export: the curve
family is closed, like `Tile` and `Overlap` (user-defined strategies are
designed in #1101). Every curve is a call in the `Curve` family:
`Curve.linear()`, `Curve.bezier()`, `Curve.orthogonal()`, `Curve.arc()`,
`Curve.perfectArrows()`, and the curves that thread a whole run,
`Curve.step()`, `Curve.monotone()`, `Curve.smooth()` and
`Curve.catmullRom()`. A `line` with no `curve` smooths automatically
on continuous axes — see [Underlying Space](/internals/core/underlying-space)
for the positioning-space test that decides this.

`background` is a second lowercase name for `enclose`: `lib.ts` exports the
same factory under both names, so a `background(...)` call builds and
serializes the same `"enclose"` node. The Python package
mirrors this with `background = enclose` in `gofish/ast.py`.

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

One export is deliberately not a bare name: `time`, the animation surface, is a
single namespace object holding `time.sequence`, `time.history` and
`time.transition` (with the build-in's `time.stagger` and `time.parallel`). The
animation design note's §9.1 decision is that temporal constructs get their own
vocabulary rather than a `dir: "t"` on the spatial operators, and the namespace
is that decision made visible at the import site — `spread` and `line` stay
spatial readings, and their temporal twins are reached through `time.`. Like the
rest of the reactive layer, it is JavaScript-only: a sequence owns a `timer()`
clock, which is a live signal with no Python bridge. `interpolate` sits beside
it as a bare name rather than inside the namespace, because it is not a temporal
construct at all: it is a pure function over rows, the data-space reading a
`derive` hands an ordinary chart.

The build-in prototype (draft PR #901) adds a second namespace beside it,
`Animation`. The split is WHEN against WHAT: `time.stagger` and
`time.parallel` say when a chart's pieces enter, and `Animation.grow`,
`Animation.fadeIn`, `Animation.wipe` and the rest say how each one looks while
it does. The effects are named by what they do, not by the phase they are used
in, so the same value serves `enter` or `exit`. It is JavaScript-only for the
same reason `time` is. `time` stays lowercase because it holds operators;
`Animation` is capitalized because its members are option values, which makes
it a strategy family.

An option whose value is one choice from a set of named strategies, at least
one of which takes arguments, gets one **strategy family** (#1013): `Overlap`
(`scatter`'s `overlap`), `Tile` (`treemap`'s `tile`), `Curve` (the `curve` of
`line`, `ribbon`, `time.transition` and `Animation.tween`, and
`interpolate`'s `method`), `Bin` (the cells of `struct({ x, y }).bin(...)`),
`Coord` (a chart's or a layer's `coord`), `Color`
(a chart's `color`), and `Animation` (`.transition()`'s `enter`, `exit` and
`update`). Each family is one module with a lowercase file name,
`src/families/<name>.ts`, which `lib.ts` binds under the capitalized name with
`export * as Curve from "./families/curve"`, the same mechanism as
`Serialize`. The same module is published as the subpath
`gofish-graphics/curve`, so `Curve.monotone` and
`import { monotone } from "gofish-graphics/curve"` are one function. The
family's own type lives inside it under the family's name, `Curve.Curve`.
Strategies are not also exported at the top level, so the lowercase `coord`
combinator and the lowercase `color` object of named colors keep their names.
An option with one strategy has no option at all: `pack` always packs
enclosing circles. Python mirrors the families as modules bound the same way
(`from . import curve as Curve` in `gofish/__init__.py`).

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

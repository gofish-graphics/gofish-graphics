---
title: The Mark Factory
section: Frontend
order: 20
status: draft
covers:
  - packages/gofish-graphics/src/ast/withGoFish.ts
  - packages/gofish-graphics/src/ast/channels.ts
  - packages/gofish-graphics/src/ast/marks/chart.ts
---

# `createMark`: turning a shape into a frontend mark

`createMark` is the factory that wraps a low-level shape function (`Rect`,
`Ellipse`, `Petal`, `Text`, `Image`) and produces the frontend mark (`rect`,
`ellipse`, `petal`, `text`, `image`) used inside `chart(...).mark(...)`.

It lives at `src/ast/withGoFish.ts:419`.

The design is inspired by Krist Wongsuphasawat's **Encodable** ("Encodable:
Configurable Grammar for Visualization Components", IEEE VIS 2020 —
[arxiv:2009.00722](https://arxiv.org/abs/2009.00722)), which factors a
visualization component's grammar into per-component channel declarations
plus a parser that turns user-supplied encoding specs into rendering
parameters. `createMark` is the same idea adapted to GoFish's shape +
node-tree model (see "Prior art" at the bottom of this doc).

This file explains what `createMark` does, why it exists, and how to add a new
mark by calling it.

## What it does

A low-level shape takes plain pixel-space numbers:

```ts
Rect({ w: 50, h: 100, fill: "tomato" });
```

A frontend mark takes _data-aware_ inputs — either a plain value, or a field name to
pull from the data:

```ts
rect({ w: 50, h: "value", fill: "category" });
//        ^^         ^^^^^^^         ^^^^^^^^^^
//        literal    sum the         look up category
//                   "value" field   in the color palette
```

`createMark` is the bridge. You give it the low-level shape and a per-prop
**channel annotation** describing how that prop encodes data; it returns a
function that performs the encoding at render time and forwards the resulting
shape props to the underlying low-level builder.

## Anatomy of a `createMark` call

From `src/ast/shapes/rect.tsx:631`:

```ts
export const rect = createMark(Rect, {
  w: "size",
  h: "size",
  fill: "color",
  stroke: "color",
});
```

Two arguments:

1. **The low-level shape function** (`Rect`). Takes `ShapeProps`, returns a
   `GoFishNode`. This is the thing that actually allocates layout and renders.
2. **Channel annotations** (`{ w: "size", h: "size", fill: "color", ... }`).
   A partial map from prop name → channel type. Props not in this map pass
   through unchanged.

The factory's signature (`withGoFish.ts:419`):

```ts
function createMark<ShapeProps, C extends ChannelAnnotations<ShapeProps>>(
  shapeFn: (opts: ShapeProps) => GoFishNode,
  channels: C
): <T>(opts: DeriveMarkProps<ShapeProps, C, T>) => NameableMark<T | T[] | ...>;
```

## Channel types

Two are wired up today, both defined at `src/ast/channels.ts`:

| channel   | accepts                                 | does                                                                 |
| --------- | --------------------------------------- | -------------------------------------------------------------------- |
| `"size"`  | `number \| (keyof T & string) \| Value` | string → `inferSize` (sums field across data); number → pass-through |
| `"color"` | `string \| (keyof T & string) \| Value` | string → `inferColor` (color palette lookup if field, else literal)  |

If your prop should be a position offset (mean rather than sum), see the
`inferPos` helper — `createOperator` uses it via channel annotations of its
own; `createMark` could grow a `"pos"` channel the same way if a future shape
needs one.

`inferSize` and `inferPos` are two instantiations of one numeric-inference
factory, `inferNumeric(agg)` — they differ only in the aggregation (`sumBy`
vs `meanBy`, imported through lodash's per-helper entrypoints so this path is
safe under native ESM). Both take an optional third argument, a resolved `Measure`: a
string/`field()` accessor's produced value is tagged with its unit-of-measure
so the underlying-space layer can unify scales per measure (see
[Underlying Space](/internals/core/underlying-space)). When the caller doesn't
pass one (e.g. `createMark`'s size channel), the inferer resolves it locally
via `resolveMeasure(data, accessor)` — explicit `field(name, measure)`
annotation, else transform provenance riding the data array (`bin()` tags its
output), else the field name as a weak default; a contradictory
annotation-vs-provenance pair throws at the channel. `createOperator` hoists
`resolveMeasure` to once per channel and passes the result down, since the
accessor and provenance are loop-invariant across split entries.

A prop that does not appear in the annotations map (e.g. `Rect.cornerRadius`)
is passed through to `shapeFn` exactly as the user wrote it.

## What happens at render time

Walking `withGoFish.ts:431-477`:

1. **Unwrap the input.** Marks are called with one of three shapes —
   `T` (single datum), `T[]` (array), or `{ item, key }` (an item paired with a
   key set by an upstream operator). Step 1 normalizes them to `(d, key)`.
2. **Wrap to an array.** `data = Array.isArray(d) ? d : [d]`. The `infer*`
   helpers all expect an array.
3. **Apply each channel.** For each prop in the user's `markOpts`:
   - `Value`-wrapped (`v(...)`) → pass through unchanged. (Already final.)
   - `"size"` channel → `inferSize(markValue, data)`. If `markValue` is a
     string, sum that field across `data`; if a number, use as-is.
   - `"color"` channel → `inferColor(markValue, data)`. If the string matches
     a field in the first datum, wrap it as a `Value` so the color scale
     picks it up; otherwise treat the string as a literal color.
   - **Coordinate-space axis aliases** (`theta`/`r`/`thetaSize`/`rSize`, the
     `KNOWN_ALIAS_KEYS`) aren't declared channels, but carry the same value
     semantics as the canonical dims they resolve to, so `createMark` infers
     their channel by suffix: a `<name>Size` alias aggregates as a `"size"`
     channel (`inferSize`), a position alias (`theta`/`r`) as a `"pos"` channel
     (`inferPos`). This happens here, before the [alias-resolution
     pass](/internals/layout/passes#pass-5-5-coordinate-space-alias-resolution)
     moves the resolved value onto the canonical `x/y/w/h` facet — so
     `rSize: "field"` aggregates exactly like `h: "field"`. The `__axisFields`
     hint (used to infer axis titles) also falls back to the alias field names.
   - Anything else → pass through.
4. **Call the low-level shape.** The encoded shape props go into `shapeFn`,
   producing the `GoFishNode`.
5. **Tag the node** with `name = key` and `datum = d` so downstream
   coordinators (`ref` / `selectAll`, label placement) can find it back.

### `live()` channels

A `color` or `raw` channel value may be a `live(...)` reactive callback (the
[reactivity layer](/internals/frontend/reactivity)); `channels.ts` widens those
two channel unions to accept a `LiveValue`. When the channel loop sees one, it
does two things: it evaluates the callback **once, untracked and under the
`inLiveEval` flag**, to get the resolve-time value the pipeline measures and
infers scales with (so its input reads wire event dispatch but do _not_ become
pipeline dependencies), and it stashes the raw callback on the produced node as
`__gfLive[channel]`. Lowering (`_node.ts`) later bakes that callback, bound to the
node's datum, into the paint-time side table so paint re-evaluates it reactively.
`circle` (in `marks/chart.ts`) gives its `fill` the same live-only treatment.

## `.name()`, `.label()`, `.zOrder()`, and `.translate()`

`createMark` returns a `NameableMark`, which is the base mark plus chainable
methods:

- `mark.name("layerName")` — registers each produced node into the chart's
  layer context so `selectAll("layerName")` can pull the array of refs (or
  `ref("layerName")` the single node, when the layer holds exactly one). It also
  stashes the passed name on the returned mark function via `stashLayerName`
  (defined in `chartBuilder.ts`, called by every `.name()` implementation), so
  `.layer()`'s producer-tier auto-naming can detect a user-chained name
  without parsing the `__serialize` tag. (An earlier `ChartBuilder.connect()`
  method used this same stashed name; it was deleted in favor of
  [`.layer()`](/js/api/core/layer), which generalizes the pattern to every
  tier — see below.) `LayerBuilder.wireTiers()` looks for the stashed name on
  the previous tier's mark the same way `.connect()` used to.
- `mark.label(accessor, options?)` — calls `node.label(...)` on every produced
  node, deferring label placement to the layout phase.
- `mark.zOrder(value)` — sets each produced node's paint-order hint, where
  `value: ZOrderValue<T> = number | ((datum: T) => number)`. A callback is
  evaluated against the per-instance datum, so paint order can be data-driven
  (e.g. raise one category over the rest) without splitting the mark into
  separately-named layers; the [bake pass](/internals/layout/coord-flattening)
  orders each layer's children by `(zOrder, index)`. The constant form
  round-trips through the IR; a callback is dropped from the emitted IR (like a
  function `.label` accessor).
- `mark.translate({ x?, y? })` — wraps the produced node in a structural
  translation node. This is deliberately not equivalent to merging `x`/`y` into
  the mark's own options: a mark or operator may already give `x`/`y`
  domain-specific channel meanings.

These methods wrap or rebuild the base mark rather than mutating it, so naming,
labeling, or positioning one mark never affects another.

These methods are not hand-rolled here. `createMark` calls `nameableMark`,
which is one application of the shared **modifier factory** in
`createOperator.ts`: a `createModifier({ name, apply, tag? })` config plus
`attachModifiers(base, configs)`. `apply(node, layerContext, datum, ...args)`
mutates each produced node (once per node — every slice for an expand mark like
`cut`) and receives the per-instance datum, so a modifier like `.zOrder` can
derive a value from the data; `tag` stamps metadata on the
wrapped mark function once (propagating the `__serialize` tag and stashing the
layer name — a mark no longer carries an axis-field tag, since axis titles now
derive from each node's resolved space `measure`).
`attachModifiers` wires the set onto the base and
adds the export terminals (`render` / `toSVG` / `toSVGElement` / `save` /
`toDisplayList`) from the shared `terminals.ts` registry, re-decorating each
method's result with the same set so chains stay extensible and the mark-kind tag
rides along. `.name()`
defers its layer registration via a `__layerRegistration` tag collected in a
single post-resolve DFS walk (`collectLayerRegistrations`), so registry order
follows parent-iteration order, not async-completion order. The same factory
backs `makeConstrainableMark` (which adds `.constrain()`) and the combinator
marks — one wiring, not three copies.

`.translate()` is structural: `attachModifiers` maps the base mark to a new mark
whose produced node is wrapped by a translation node. This keeps the modifier
independent from the wrapped mark's channel grammar.

## Adding a new mark

Suppose you write a new low-level shape `Diamond({ w, h, fill, stroke })`.
The high-level `diamond` mark is one line:

```ts
export const diamond = createMark(Diamond, {
  w: "size",
  h: "size",
  fill: "color",
  stroke: "color",
});
```

Now consumers can write:

```ts
chart(data).mark(diamond({ w: "value", fill: "category" }));
```

…and the encoding (sum `value`, look up `category` in the palette) happens
for free. Anything Diamond's `ShapeProps` adds that isn't a "size" or "color"
channel — say `rotation: number` — passes through verbatim.

## Adding a new channel type

Today's channels are `"size"` and `"color"`. To add (say) `"angle"`:

1. Add `"angle"` to the `ChannelType` union in `channels.ts`.
2. If a numeric aggregation fits, instantiate the existing factory —
   `export const inferAngle = inferNumeric(meanBy)` (or whatever aggregation
   makes sense) — and measure tagging comes along for free. Otherwise write
   `inferAngle(accessor, data, measure?)` next to it with the same signature.
3. Extend `DeriveMarkProps`'s conditional with the input type for `"angle"`.
4. Extend the `if (channelType === "size") ... else if (channelType === "color")`
   chain in `withGoFish.ts` to handle it.

`createOperator` has its own channel handling
(see [The Operator Factory](/internals/frontend/operator-factory)) and would need
the same treatment if the new channel should be available in operator opts as
well.

## `createRelationalMark`: connectors as marks

`line` and `ribbon` (`src/ast/marks/chart.ts`) are not built on `createMark` —
they aren't a single low-level shape with channel-annotated props, they're a
connector that consumes _other_ marks' produced nodes. They're built on the
sibling factory `createRelationalMark(type, produce)`, where `produce(opts,
children)` builds the underlying `connect` node; everything else is shared
dual-form plumbing the factory handles once for both `line` and `ribbon`.

`createRelationalMark` dispatches on the shape of its arguments into four call
forms:

- **Low-level combinator form** — an explicit `children: GoFishAST[]` array is
  passed as the second argument (used standalone inside a manual
  `layer([...])`). Connects exactly those children.
- **Pairwise `{ from, to }` form** — `opts.from`/`opts.to` name two columns
  holding refs; one connector per row (node-link edges), after
  [`resolve`](/js/api/operators/resolve) has turned endpoint ids into refs.
- **Bag form** — applied directly to a `GoFishRef[]` (e.g. `selectAll(...)`
  or the previous tier's marks via `.layer()`): one connector through all the
  refs, UNLESS the mark is fused over a flow, in which case `ChartBuilder`
  computes a split and partitions the bag with `splitEntries` — the same
  helper `group()`'s `split` hook uses — producing one connector **per
  group** (e.g. `ribbon({})` fused over `stack({ by: "species" })` draws one
  band per species; see "Default grouping" below). A refs-bag chart spells
  the same split structurally instead, via an upstream `group()`.

### zBelow-by-default paint order

Every node a relational mark produces, in every call form above, is tagged
with the operand nodes/refs it was built from (`tagRelationalOperands`, which
stashes `__relationalOperands` on the node). The `layer` combinator
(`graphicalOperators/layer.tsx`) reads that tag and installs a default
`zBelow(self, operand)` paint-order **constraint** — not a hardcoded z-index —
so the connector paints under whatever it references. Because it's a real
constraint, it composes with any other constraint in the layer; an explicit
`.zOrder(...)` or `.constrain(...)` chained on the connector's own mark
overrides the default (the tag is only consulted when neither has been set).
This is what lets `line()`/`ribbon()` sit under the marks they connect with no
zOrder incantation needed, in every call form including the low-level
combinator one.

### Blank-fusion: `.mark(R(opts))` sugar

The bag form above is also reachable through a syntactic rewrite at
`ChartBuilder.mark()` (`src/ast/marks/chartBuilder.ts`): placing a relational
mark directly in `.mark()` position elaborates to an invisible anchor tier
plus a connector tier —

```
.mark(R(opts))  ⇒  .mark(blank(anchor(opts))).layer(R(opts))
```

`anchor(opts)` is exactly `opts`'s `{w, h, emX, emY}` subset (`pickAnchorOpts`
in chart.ts) — the rest (fill, stroke, curve, `along`, …) stays on the
connector unchanged, since `produce` only reads the fields it knows about.
The factory tags every bag-form mark it returns with a `__relationalFusable =
{ opts, inferred, makeAnchor }` descriptor (`makeAnchor` is a pre-bound
`blank(...)` call, kept out of chartBuilder.ts to avoid a chart.ts ↔
chartBuilder.ts import cycle); `modifierMethod` in createOperator.ts
propagates the tag through `.name()`/`.label()`/`.zOrder()` chaining so those
still target the connector. The pairwise `{from, to}` form is never tagged.

`ChartBuilder.mark()` only rewrites when the chart's own data still needs
anchors drawn for it (`!usesPreviousLayerMarks() && !(data instanceof
GoFishRef)`) — a relational mark applied directly to an already-drawn refs
bag (`chart(selectAll("bars")).mark(ribbon(opts))`, or an empty-scope
`chart()` tier inside `.layer(...)`) keeps its direct bag-form meaning
unfused, since there's nothing to anchor; `along` on either of those, or on
the pairwise form, is a builder-time error rather than a silent no-op
(`rejectAlongWithoutFlow` in chartBuilder.ts, and the pairwise branch in
chart.ts). A split connector's `fill` may be a shared field name rather than
a literal color; `resolveGroupFill` in chart.ts resolves it per group via
`inferColor` (same channel helper `createMark` uses) before it reaches
`Connect`, reading a representative row off the group's ref bag.

### Default grouping: a fused connector's split, and `along`

A fused relational mark doesn't fall back to one connector through the whole
bag — it gets a **default split and travel direction computed from the flow
it fuses over** (issue #752; full rule in
`notes/design/relational-mark-default-split.md`). This is what lets a
ridgeline write `ribbon({ h: "count" })` with no split option at all, when
`spread({ by: "month", dir: "y" })` already said the grouping one line up,
and what makes the barley slope chart draw one line per `site`×`variety`
instead of a single zigzag across every panel. Relational marks have no
option that spells the split directly — `by` was removed entirely; the only
option is `along`, which names the flow tier that becomes the path (the
split is always the complement, and is never user-spelled).

The computation happens in `ChartBuilder`, not `chart.ts`, because it needs
`this.operators` — the flow tiers assembled by `.flow(...)` — which only the
builder has in hand. Two call sites run it:

- The `.mark(R(opts))` blank-fusion rewrite (above), right before it splits
  `opts` into anchor and connector.
- `ChartBuilder.layer(child)`, when `child` is a bare relational-mark tier
  (`.mark(blank({h})).layer(ribbon({}))`) consuming _this_ tier's own marks —
  the two-tier form the sugar above elaborates into.

Both guard on the same "fuses over THIS chart's own flow" boundary
`dataNeedsAnchors` already checks — `!usesPreviousLayerMarks() &&
!dataIsRefs(this.data)` — so a refs-bag chart (`chart(selectAll(...))`) or the
nested `chart().flow(group({by})).mark(line())` idiom never gets a default
injected; both keep their pre-#752 meaning exactly, and using `along` on
either throws instead (see the previous section).

Crucially, the computed default is written into a **separate mutable cell**,
`inferred`, not into `opts` — `tagRelationalFusable` stamps `{ type, opts,
inferred, anchorKeys, makeAnchor }`, and `opts` stays the untouched record of
what the user wrote (the same object `__serialize.opts` reads, so mutating it
would corrupt the emitted IR and make an inferred split look
user-specified). The connector's mark closure reads the split off `inferred`
only — there's no `opts.by` to check anymore — and resolves `dir = opts.dir
?? inferred.dir`. The by-split-vs-plain-bag dispatch that used to happen at
`createRelationalMark` call time happens _inside_ the closure, at
bag-arrival time: the computation can only run after the mark is constructed
(it needs the rest of the flow), so the branch it feeds has to be decided
later too.

The rule itself, briefly: resolve a travel axis (an explicit `dir`; else a
data-driven `h`/`w` on the mark or its anchor tier — `h` puts the value in y
so travel is x, and vice versa; else the innermost flow tier that positions
anchors) and a path tier (the innermost tier positioning along the travel
axis). `along`, when given, replaces this whole resolution: `findTierIndexByAlong`
(chartBuilder.ts) scans the flow tiers for one whose `by` names the given
field (`tierFieldName` matches a string `by` on itself, a `field(...)`
accessor on `.name`, and never a function-form `by` — the design note's
"Matching" clause), and throws, naming the field and the flow's available
keys, if none match. The matched tier's travel axis mirrors
`classifyOperator`'s own arrangement/value split (`alongTravelAxis`): an
arrangement tier (`spread`/`stack`) travels its own `dir`; anything else
(a scatter) travels flow order, leaving `dir` unset so `line`/`ribbon`'s own
`?? "x"` applies — an explicit `opts.dir` still wins over either.

Either way, once the path tier index is settled, the path tier's own `by`
orders the path and never splits; every _other_ flow tier's `by` becomes one
term of a synthesized composite split key (`ChartBuilder`'s
`computeDefaultBy`, built from `splitKeyFn` in datumProjection.ts — the same
projection-through-`GoFishRef.datum` helper `splitEntries` uses, so
string/field/function `by` forms behave identically to a real operator `by`).
One subtlety `chartBuilder.ts`'s `classifyOperator` has to resolve that the
design note's step-3 prose doesn't spell out: a `spread`/`stack` tier's `dir`
is the axis it _lays its groups out along_, so a bare fallback (no `h`/`w`,
no explicit `dir` anywhere) resolves the travel axis to that SAME axis
(walking the arrangement is the natural path); a `scatter`'s `x`/`y` are
literal per-item coordinates — a value channel exactly like `h`/`w` — so the
travel axis there is the axis it does _not_ position. Both resolutions are
validated against the design note's worked examples (its own "Intended?"
column), not just its prose.

The paint fix from the same design note rides along for free: split and
plain-bag now share one code path in `createRelationalMark`'s bag-form mark,
so `resolveGroupFill` runs on both — per group on the split branch (where
it's a no-op safety net, since each group is homogeneous by construction),
and over the _whole bag as one group_ on the plain-bag branch, where it now
throws a loud, specific error if a field-valued `fill` disagrees across the
bag instead of silently painting whatever the first row happens to have.

## Prior art

`createMark` is most directly inspired by **Encodable** (Wongsuphasawat,
IEEE VIS 2020 — [paper](https://arxiv.org/abs/2009.00722),
[code](https://github.com/kristw/encodable)). Encodable's
`createEncoderFactory({ channelTypes, defaultEncoding })` produces an
`Encoder` that the component author uses internally; users of the
component supply encoding specs (field, scale, format) that the encoder
resolves into rendering parameters. The shape map is one-to-one:

| Encodable                                  | `createMark`                                        |
| ------------------------------------------ | --------------------------------------------------- |
| `createEncoderFactory({ channelTypes })`   | `createMark(shapeFn, channels)`                     |
| `channelTypes: { x: "X", color: "Color" }` | `channels: { w: "size", fill: "color" }`            |
| `Encoder` returned to component author     | `Mark<T>` returned, called per datum                |
| `ChannelEncoder` parses field/literal      | `inferSize`/`inferPos`/`inferColor` parse the value |

GoFish's twist is that a mark also produces a node in a layout AST rather
than a render directly, and the channel set is smaller (`size`, `pos`,
`color`) — Encodable's vega-lite-flavored channel taxonomy is richer.
[The Operator Factory](/internals/frontend/operator-factory) extends the same pattern
to layout operators (split + per-partition application). Operator channels add
one layout-only wrinkle: entry-position channels may opt into categorical
`discrete` placement, which produces layout slots rather than datum-scaled
positions.

## Pointers

- The factory: `src/ast/withGoFish.ts:419`.
- The channel helpers (`inferSize`, `inferPos`, `inferColor`) and the
  `DeriveMarkProps` conditional: `src/ast/channels.ts`.
- The five existing call sites: `rect`, `ellipse`, `petal`, `text`, `image`
  in `src/ast/shapes/`.
- The companion factory for layout operators:
  [The Operator Factory](/internals/frontend/operator-factory).
- The factory's optional `serialize` config (third argument) tags the
  produced mark with `__serialize` metadata that the frontend-IR emitter
  reads — see [Frontend IR (Serialization)](/internals/frontend/serialization).
- Encodable: paper [arxiv:2009.00722](https://arxiv.org/abs/2009.00722),
  source [github.com/kristw/encodable](https://github.com/kristw/encodable).

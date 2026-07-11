---
title: The Operator Factory
section: Frontend
order: 30
status: draft
covers:
  - packages/gofish-graphics/src/ast/marks/createOperator.ts
  - packages/gofish-graphics/src/ast/marks/terminals.ts
---

# `createOperator`: turning a layout into a frontend operator

`createOperator` is the factory that wraps a low-level layout node-builder
(`Spread`, `Scatter`, `Table`, `Frame`) and produces the frontend operator
(`spread`, `scatter`, `table`, `group`, plus `stack` as a thin wrapper over
`spread`) used inside `chart(...).flow(...)` and as a combinator inside
`.mark(...)`.

It lives at `src/ast/marks/createOperator.ts`.

The design is inspired by Krist Wongsuphasawat's **Encodable** ("Encodable:
Configurable Grammar for Visualization Components", IEEE VIS 2020 —
[arxiv:2009.00722](https://arxiv.org/abs/2009.00722)). `createOperator`
extends Encodable's per-component channel-grammar pattern to layout
operators: the channel system carries over verbatim, with a `split` step
added in front and a `combine` (low-level layout) step added behind. See
"Prior art" at the bottom of this doc for the mapping.

This doc explains what the factory does, why it has two call shapes, and how
to add a new operator. It assumes you've read
[The Mark Factory](/internals/frontend/mark-factory) — this is the same idea
applied to layout containers instead of leaf shapes.

## 1. The two call shapes every operator has

Every layout operator is a single function that you can call in two ways:

```ts
// (A) Combinator form — pass marks directly:
spread({ dir: "x" }, [m1, m2, m3]);

// (B) Operator form — used inside .flow():
chart(data)
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }));
```

| form           | what varies   | what's shared               | meaning                                               |
| -------------- | ------------- | --------------------------- | ----------------------------------------------------- |
| **combinator** | n marks       | one datum                   | "arrange these n marks horizontally"                  |
| **operator**   | n data slices | one `mark`, one outer datum | "for each group of data, build a mark; arrange those" |

In combinator form, the user provides the array (of marks). In operator form,
`split` produces the array (of data slices) from `by`. Either way, the
factory ends up with N children to hand to the same low-level layout. The two
forms aren't strictly category-theoretic duals — they're two ways of getting
to the same N-children-then-layout shape, with different sources of the
multiplicity.

`createOperator` produces both forms from one config. Disambiguation is by
arg shape: a second positional argument means combinator form; no second
arg means operator form.

Both forms also get the standard structural `.translate({ x?, y? })` modifier.
It wraps the operator's produced node instead of merging `x`/`y` into the
operator's own options. That distinction matters for operators like `scatter`:
`scatter({ by: "lake", x: "lake" }).translate({ y: 50 })` keeps `x: "lake"` as
scatter's discrete placement encoding, while `y: 50` belongs to the outer
translation wrapper.

The operator (traversal) form also gets `.label(accessor, options?)` — see
section 7 below. Unlike `.translate`, it's operator-form-only: the combinator
form has no `split` step to attach a per-group label to.

## 2. The split → fmap → combine shape

Pick any layout operator and you'll find the same three steps — a fan-out
into N pieces, followed by a fan-in back to a single node:

::: gofish example:internal-operator-factory-pipeline hidden
:::

1. **Split.** Partition the data into pieces. For `spread`, this is
   "groupBy `by`-field"; for `table`, it's the cartesian product of two
   fields; for `group`, it's groupBy. For `scatter` with no `by`, it's
   "one piece per item".
2. **fmap.** Apply the user's mark to each piece, producing one
   `GoFishNode` per piece.
3. **Combine.** Hand the array of nodes to the low-level layout function
   (`Spread`, `Table`, `Scatter`, `Frame`), which positions them.

The combinator form skips `split` entirely — the user already supplied the
array of marks. The factory loops over them, applies each to the shared
datum, and hands the resulting nodes to the same `combine` step.

## 3. Anatomy of a `createOperator` call

From `src/ast/graphicalOperators/spread.tsx:430`:

```ts
export const spread = createOperator<any, SpreadOptions>(Spread, {
  split: ({ by }, d) =>
    by ? splitEntries(by, d) : new Map(d.map((r, i) => [i, r])),
  channels: { w: "size", h: "size", size: { type: "size", entry: true } },
});
```

Three pieces:

1. **The low-level layout function** — `Spread`, the existing
   `createNodeOperator`-built node builder that already knows how to position
   children along an axis. This is the **combine** step.
2. **`split(opts, d)`** — partition `d` into an ordered `Map<key, subdata>`.
   Insertion order matters (it determines layout order). When `by` is omitted,
   each item becomes its own one-element group. `spread`/`stack`/`group`/
   `scatter` all delegate to the shared `splitEntries` helper
   (`datumProjection.ts`, #700) rather than a bare `Map.groupBy`: it groups by
   `by` first (a `field(...)` accessor groups by its `.name`, identically to a
   bare string), then applies any pipeline ops the accessor carries — see
   [Field expressions](/internals/core/underlying-space#field-expressions-a-pipeline-orthogonal-to-channel-aggregation)
   for the domain-op (`sort`/`reverse`/`bin`) semantics. `by`-string/function
   callers are unaffected — they carry no ops, so `splitEntries` reduces to
   the old `Map.groupBy` behavior.
3. **`channels`** (optional) — per-opt data-aware encodings. Same idea as
   `createMark`'s channels: `w: "size"` means the user can pass a field name,
   and the factory will apply `inferSize` before handing opts to `Spread`.

That's it. Both call shapes (operator and combinator) fall out of the
factory.

## 4. What happens at render time

### Operator form (`spread({ by, dir })` inside `.flow(...)`)

Walking `createOperator.ts:391-415`:

1. **Split** — `cfg.split(opts, d)` partitions the input into a
   `Map<key, subdata>`. (Some operators, like `table`, also return `keys` —
   row/column labels that get merged into the layout opts.) Each array leaf is
   then re-tagged with `d`'s measure provenance (`copyMeasureProvenance`): a
   leaf is a fresh sub-array that wouldn't otherwise inherit the
   `MEASURE_PROVENANCE` symbol, so without this a _mark_ channel applied per
   leaf would lose a transform's measure (e.g. a bin's `start`/`end`/`size`) and
   fall back to the literal field name — see [underlying
   space](/internals/core/underlying-space) and #534.
2. **fmap** — for each `(key, subdata)` entry, call the user's mark with
   that subdata and a parent-prefixed key (`${key}-${i}`). The result is
   resolved to a `GoFishNode`. `node.setKey(...)` makes downstream
   coordinators able to look it back up. When `by` is a string **or a
   `field(...)` accessor** (its `.name`), each produced leaf is also stamped
   with `__splitBy` recording that field — the innermost grouping wins (a
   `??=`-style guard means an already-stamped node keeps its value). This is
   what lets a later `resolve(cols, { from })` infer its match key for free:
   it reads `__splitBy` off the resolved node to learn which field that node
   was grouped by (`scatter({ by: "id" })` ⇒ join on `id`), so the user need
   not restate the key. A function `by` has no field name to record, so
   `resolve` errors there unless given an explicit `key`.
3. **Apply channels** — `applyChannels` runs `inferSize` / `inferPos` /
   `inferColor` on annotated opts. For an entry-flagged channel
   (`{type, entry: true}`), the inference runs once per split entry,
   producing an array of values (one per child); otherwise it aggregates
   over all of `d` and produces one value.
4. **Strip factory keys** — `by` and `debug` never reach the low-level
   layout; remove them from opts.
5. **Inject the grouping measure** — `by` is stripped, but a grouping operator
   needs its field to name the ORDINAL axis it builds. So the resolved per-axis
   grouping field (`cfg.axisFields?.(opts)`, e.g. `{ x: "lake" }`) is passed
   through to the low-level layout in opts as `axisMeasures`, where the node
   builder stamps it onto the ORDINAL space's `measure` — the discrete analogue
   of a continuous channel's field becoming its space's measure. That measure is
   the sole source for the axis title (a continuous space's unit or an ordinal
   space's grouping field); there is no longer any field-name title _hint_ or
   fallback (the former `__axisFields` tag is gone).
6. **Combine** — call the low-level `layout` with the encoded opts and the
   array of child nodes.

### Combinator form (`spread({ dir }, [m1, m2, m3])`)

Same machinery, simpler:

1. Apply each mark in `marks` to the same `d`. Marks may be any of:
   `Mark<T>` functions, already-resolved `GoFishNode`s (e.g. `ref(...)`),
   or a `Promise<Mark<T>[]>` (e.g. when produced by SolidJS `For(...)`).
2. Apply channels (no per-entry inference — there's no split).
3. Strip factory keys.
4. Combine.

## 5. Channels in operator opts

The factory's channel system mirrors `createMark`'s, with one extra spec
shape — entry-flagged channels:

```ts
channels: {
  w: "size",                          // aggregate over all data, one value
  x: { type: "pos", entry: true },    // per-entry, produces array of values
}
```

| spec                                           | what it does                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `"size"` / `"pos"` / `"color"`                 | aggregate over all of `d`, produce one value (single number/string)                  |
| `{ type: "size", entry: true }`                | run once per split entry, collect into array (one value per child)                   |
| `{ type: "pos", entry: true, discrete: true }` | for nonnumeric categorical fields, emit evenly spaced discrete placement coordinates |
| user passed an array                           | already final form — pass through unchanged                                          |

`scatter` uses `entry: true` for `x`/`y`/`xMin`/`xMax`/`yMin`/`yMax` so a
field name like `x: "miles"` becomes a per-group mean position
(`src/ast/graphicalOperators/scatter.tsx:336`). Its point channels also set
`discrete: true`, so a grouped nonnumeric field such as `x: "lake"` becomes a
slot coordinate instead of an invalid numeric mean.

**Windowed `normalize()` on an entry-flagged `size` channel.** `spread`/
`stack` declare `size: { type: "size", entry: true }` (#700 Phase 2) — a
per-entry stack-axis extent, one value per split entry, that `Spread` wraps
each child in its own sized `layer` with (see [Underlying
Space](/internals/core/underlying-space#space-filling-spines-normalize-self-scales-a-stacking-axis)
for the layout side). When that channel's value carries a `field(...)
.normalize()` op (checked via `hasNormalizeOp`), `applyChannels` takes a
different path than plain per-entry inference: it splits the pipeline at
`normalize` (`splitAtNormalize`, `fieldExpr.ts`) and runs only the PRE
expression through the ordinary per-entry channel evaluation — one raw value
per split entry, exactly as any size accessor would produce — then hands
that whole array to `applyEntryNormalize`, which replaces it with each
entry's share of their sum. The **window** `applyEntryNormalize` shares over
is exactly the operator's own split entries, which is why this lives in
`createOperator.ts` rather than in `fieldExpr.ts` itself: only the factory
knows what "this operator's entries" means. `channels.ts` gains no knowledge
of `normalize` from this — it's `applyChannels` and `fieldExpr.ts` splitting
the responsibility, not a third aggregation mode bolted onto `inferSize`.

## 6. Adding a new operator: a worked example

Suppose you want a `wrap` operator that lays children out left-to-right
with line wrapping at a max width. (This isn't a real GoFish operator
today — it's an example.)

You already have the low-level node builder, `Wrap`, written with
`createNodeOperator`. Then:

```ts
export type WrapOptions = {
  by?: string;
  maxWidth: number;
  spacing?: number;
};

export const wrap = createOperator<any, WrapOptions>(Wrap, {
  split: ({ by }, d) =>
    by ? Map.groupBy(d, (r) => r[by]) : new Map(d.map((r, i) => [i, r])),
});
```

Both forms now work without further code:

```ts
// Operator form:
chart(items)
  .flow(wrap({ by: "category", maxWidth: 400 }))
  .mark(rect({ w: "size" }));

// Combinator form:
wrap({ maxWidth: 400 }, [m1, m2, m3, m4]);
```

If `Wrap` accepts a width-per-child, you'd add `channels: { width: "size" }`
so consumers can pass a field name there.

If your operator needs to feed extra data (like `colKeys`/`rowKeys`) into
the layout opts, return the wrapped `{entries, keys}` form from `split`
instead of a bare Map — see `table.tsx:228` for an example.

Operators created with `createOperator` automatically support
`.translate({ x?, y? })`. You do not implement this per operator; the factory
composes the ordinary split/channel/combine pipeline with a structural
translation wrapper around the produced node.

## 7. `.label()` on the operator (traversal) form

`stack({ by: "class", dir: "y" }).label(accessor, options?)` labels each
**group** the split produces, rather than each mark instance. It is not
built on the `createModifier`/`attachModifiers` system section 8 describes
(that system decorates a _mark_; the operator form needs to affect the
_execution_ of a still-being-called operator, after `.label()` has already
returned). Instead:

- `dual`'s operator branch closes over a `let labelState` that starts
  `undefined`. `.label()` (`attachLabelOption`) mutates it; the operator's
  execution closure reads the current value each time it runs (once per
  `.flow()` render), so `.label()` can be called any time before render,
  in any position in the chain.
- In the per-leaf loop (where `applyMark` turns one split leaf into node(s)),
  if `labelState` is set, every node the leaf produced gets `node.datum ??=
leaf` (the leaf's own subdata — usually the rows array `split` handed it)
  and `node.label(labelState.accessor, labelState.options)`. Stamping
  `datum` here is what makes the label-elaboration pass's `resolveLabelTargets`
  gate ("a node with its own datum keeps its own label instead of propagating
  it to children") fire at the group level — the same effect the pre-#702 manual workaround achieved
  by hand (see the "Label on Spread" story, which now uses the operator
  form instead).
- `.translate()` wraps the operator in a _new_ function object (`translated`
  in `translateOperator`), so `.label()` needs to reach the SAME `labelState`
  regardless of which wrapper the caller holds. `translateOperator` doesn't
  attach a fresh label-modifier — it delegates: `translated.label(...)`
  calls the base operator's own `.label(...)`, which mutates the base
  operator's closed-over `labelState`. That's what makes both
  `.translate().label()` and `.label().translate()` work identically.
- `resolveLabelText` (`ast/labels/labelPlacement.ts`) resolves the accessor
  in one of three ways, depending on both the accessor's shape and the
  datum's shape:
  - A **bare string** over the group's array-of-rows datum must be constant
    across every row (true by construction for a `by`-field, since every row
    in the group shares that value) — `resolveLabelText` throws a loud error
    if it isn't, rather than silently reading just the first row. Over a
    scalar (non-array) datum it just reads the field directly.
  - A **`field(...)` aggregate** (`field("count").sum()`/`.mean()`/`.count()`/
    `.distinct()`) folds the group's rows to one value via `evalFieldValues`
    (the same evaluator the `by`/`size`/`pos` channel pipelines use) — this is
    the spelling for a group-total or group-mean label.
  - A **function** accessor is the raw escape hatch: it receives the whole
    leaf (the rows array) and returns whatever it wants, e.g.
    `(rows) => rows.length`.
- Serialization mirrors the mark-side `labelModifier`'s `tag` hook (the
  accessor-shape logic is factored into a shared `labelIRField` helper,
  checked in order string → field-expression → function): a string accessor
  becomes `tag.label = {accessor, ...options}`; a `field(...)` accessor
  serializes via its own `.toJSON()` (the `FieldExprWire` shape) into
  `tag.label = {accessor: {type: "field", name, measure?, ops?}, ...options}`;
  a function accessor warns and is dropped from the emitted IR (functions
  aren't serializable). `.translate()`'s wrapper has no tag of its own by
  default (the wrapped function is new), so `translateOperator` copies the
  base operator's `__serialize` tag onto the wrapper and stamps
  `tag.translate` — without that copy, a translated operator would silently
  serialize as the opaque `{type: "derive"}` fallback, losing both
  `translate` and any chained `.label()`.

## 8. The relationship with `createMark`

The two factories are siblings:

|                  | wraps                               | output                                    |
| ---------------- | ----------------------------------- | ----------------------------------------- |
| `createMark`     | a leaf shape (`Rect`, `Ellipse`, …) | a `Mark<T>` (one node from one datum)     |
| `createOperator` | a layout (`Spread`, `Scatter`, …)   | a dual-mode operator (one node from many) |

Both use channel annotations to encode opts; both produce mark types
supporting `.name(...)` and `.label(...)` chaining. That chaining is wired by
the **modifier factory** that also lives in this file — `createModifier` +
`attachModifiers` — a single config-driven system shared by `nameableMark`
(combinator marks), `createMark` (leaf marks), and `makeConstrainableMark`
(layer / Porter-Duff marks, which add `.constrain()`). `.name(...)` also
stashes the passed name on the returned mark function via `stashLayerName`
(defined in `chartBuilder.ts`, called by the `name` modifier's `tag` hook), so
[`.layer()`](/js/api/core/layer)'s producer-tier auto-naming can detect a
user-chained name without parsing the `__serialize` tag. (An earlier
`ChartBuilder.connect()` method used this same stashed name; it was deleted
in favor of `.layer()`, which generalizes the pattern to every tier — see
[The Mark Factory](/internals/frontend/mark-factory#createrelationalmark-connectors-as-marks).)

`modifierMethod` also propagates any `__relationalFusable` tag from the base
mark onto the wrapped one (alongside the `__kind` tag it already carried) —
the blank-fusion descriptor `createRelationalMark` stamps on bag-form /
by-split-form relational marks (see
[The Mark Factory](/internals/frontend/mark-factory#blank-fusion-mark-r-opts-sugar)).
Without this, `ribbon(opts).name("area")` would lose the tag the moment
`.name(...)` wraps it in a new function, and `.mark(ribbon(opts).name("area"))`
would silently stop fusing.

A modifier's `apply(node, layerContext, datum, ...args)` receives the
**per-instance datum** the mark was called with — the same value the shape
factory saw — so a modifier can produce a _data-driven_ value rather than a
constant. `nameModifier` / `labelModifier` / `constrainModifier` ignore it, but
`zOrderModifier` uses it: `.zOrder(value)` takes a `ZOrderValue<T> = number |
((datum: T) => number)` and, when handed a callback, evaluates it against this
datum to set each produced node's paint-order hint. That is what lets paint
order be data-driven (e.g. raise one category over the rest) without splitting a
mark into separately-named layers — the callback runs once per replicated
instance, and the [bake pass](/internals/layout/coord-flattening) already orders
each layer's children by `(zOrder, index)`. A constant hint round-trips through
the IR; a callback can't be serialized, so its `tag` hook drops it from the
emitted IR (the same as a function `.label` accessor).

The **export terminals** — `render`, `toSVG`, `toSVGElement`, `save`,
`toDisplayList` — are the dual of modifiers: where a modifier mutates the
produced node and returns a chainable mark, a terminal _resolves_ the surface to
a final `GoFishNode` and calls through to that node's method, ending the chain.
They live in their own registry (`terminals.ts`): a `TERMINALS` list plus
`attachTerminals(target, resolveNode)`, where each surface supplies only its own
node-resolution strategy (a combinator mark resolves by calling itself with
`undefined`; a `withGoFish` promise resolves by awaiting). Both `attachModifiers`
here and `addRenderMethod` in `withGoFish.ts` call `attachTerminals`, so the set
of terminals is defined once — adding one (as `toDisplayList` was) touches a
single list and lands on every surface at once, instead of being hand-rolled per
surface (which previously left `toDisplayList` off the combinator surface
entirely).

A second flavor, `attachTransformModifiers`, handles methods that map a mark to
a _different_ mark rather than mutating its nodes — e.g. `image(...).cut(opts)`
maps the image to an expand-kind `cut` mark (which slices the source into N
nodes 1:1 with data, built on the pure `cut(source, opts)` array primitive).
Because the transform replaces the mark before any node exists, it wraps the
existing `.name()`/`.label()` methods to re-apply itself, keeping `.cut`
available across a naming/labeling chain.

Expand marks consume a whole group at once, so the operator (traversal) form
hands them a single leaf containing all rows regardless of its own `split`
config. An expand mark therefore turns each group's rows into an _array_ of
nodes, whereas a `by`-grouped operator needs exactly one child node per group —
so an expand mark can't hang directly under a `by`-operator, and that case
throws. The fix is to interpose a layout operator between the grouping and the
expand mark (`.flow(spread({ by }), stack({ dir }))`): the inner operator
consumes the expand mark and collapses each group's slices into one node, which
the outer `by`-operator then arranges.

Naming-wise: `createOperator` is the frontend factory; the low-level helper
that produces `Spread`, `Scatter`, etc. is `createNodeOperator`
(`withGoFish.ts:297`). The "node" prefix reflects that it returns a function
whose output is a single `GoFishNode`, not the dual-mode shape that
`createOperator` returns.

## 9. Prior art

`createOperator` extends the per-component channel-grammar pattern from
**Encodable** (Wongsuphasawat, IEEE VIS 2020 —
[paper](https://arxiv.org/abs/2009.00722),
[code](https://github.com/kristw/encodable)) to layout operators. The
channel system maps onto Encodable's directly — see
[The Mark Factory](/internals/frontend/mark-factory)'s "Prior art" section for the
mark-level table. `createOperator` adds two pieces Encodable doesn't have:

| step                       | what it does                                          | Encodable analogue                                                                           |
| -------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `split`                    | partition the input data into an ordered Map          | none — Encodable encodes a single component, not a layout                                    |
| `channels`                 | parse user opts into rendering parameters             | `Encoder` / `ChannelEncoder`                                                                 |
| `layout`                   | combine partitioned children into one node            | none — Encodable's encoders feed a renderer outside the grammar layer                        |
| `entry: true` channel flag | per-partition aggregation (e.g. mean x of each group) | extension; closest analogue is Encodable's per-channel scale resolution against grouped data |

The two-call-shapes design (combinator and operator/traversal) — where the
multiplicity comes from the marks array vs. the data partitions — is novel
to `createOperator`; Encodable doesn't address layout multiplicity.

## 10. Pointers

- The factory: `src/ast/marks/createOperator.ts`.
- Existing operators (each colocated with their low-level layout):
  - `spread` and `stack` — `graphicalOperators/spread.tsx`.
  - `scatter` — `graphicalOperators/scatter.tsx`.
  - `table` — `graphicalOperators/table.tsx`.
  - `group` — `graphicalOperators/group.ts` (sibling of `frame.tsx`,
    extracted to keep the chartBuilder ↔ createOperator import graph
    acyclic).
- The companion mark factory: [The Mark Factory](/internals/frontend/mark-factory).
- The `serialize` config field tags the produced operator with
  `__serialize` metadata the frontend-IR emitter reads — see
  [Frontend IR (Serialization)](/internals/frontend/serialization).
- Encodable: paper [arxiv:2009.00722](https://arxiv.org/abs/2009.00722),
  source [github.com/kristw/encodable](https://github.com/kristw/encodable).

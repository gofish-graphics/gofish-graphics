---
title: Frontend IR
section: JSON Formats
group: Frontend
order: 10
status: stable
covers:
  - packages/gofish-ir/src/frontend/schema.ts
  - packages/gofish-ir/src/frontend/validate.ts
  - packages/gofish-ir/src/frontend/jsonSchema.ts
  - packages/gofish-ir/src/frontend/descriptors.ts
  - packages/gofish-ir/src/frontend/nonFinite.ts
  - packages/gofish-graphics/src/serialize/toJSON.ts
  - packages/gofish-graphics/src/serialize/fromJSON.ts
  - packages/gofish-graphics/src/serialize/registry.ts
  - packages/gofish-graphics/src/ast/wire.ts
  - packages/gofish-python/scripts/generate.ts
---

# The Frontend IR

A portable JSON representation of a GoFish chart specification, captured
at the source level (`chart(data).flow(...).mark(...)`) before macro
expansion and elaboration. Three consumers:

- **[Olli][olli]** — accessibility adapter. Walks the IR to expose mark
  boundaries, labels, and axes to assistive technology. Its existing
  Bluefish adapter has to capture imperative execution to reconstruct
  this; a declarative IR sidesteps that.
- **The Python wrapper.** Builds the same IR and ships it across
  anywidget. The schema package makes it official; the JS deserializer
  is shared. See [The Jupyter Bridge & RPC](/internals/python/bridge)
  for the transport and § Bridge extensions below for the Python-side
  sentinels that extend the canonical schema.
- **Future internal tooling** — debuggers, alternative renderers,
  parity-test harnesses.

## What ships in v0

| Artifact                                                                                                | Path                                                                       |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Construct descriptor table (single-source field lists)                                                  | `packages/gofish-ir/src/frontend/descriptors.ts`                           |
| Schema types + validator + canonical examples                                                           | `packages/gofish-ir/src/frontend/`                                         |
| JSON Schema (Draft 2020-12)                                                                             | `packages/gofish-ir/dist/frontend/v0.json` (build artifact)                |
| JS-side emitter (`Serialize.toJSON`, `ChartBuilder.toJSON()`)                                           | `packages/gofish-graphics/src/serialize/toJSON.ts`                         |
| JS-side deserializer (`Serialize.renderIR`, `buildChart`, `mapMark`, …)                                 | `packages/gofish-graphics/src/serialize/fromJSON.ts`                       |
| Deserializer factory table, keyed by the descriptor table                                               | `packages/gofish-graphics/src/serialize/registry.ts`                       |
| Generated Python factory layer (checked in, CI freshness-checked)                                       | `packages/gofish-python/gofish/_generated.py` (from `scripts/generate.ts`) |
| Generated Python strategy families (checked in, CI freshness-checked)                                   | `packages/gofish-python/gofish/{tile,overlap,curve}.py` (same script)      |
| Hand-written Python residue (dispatch, bridge, DataFrame conversion), emits IR validated against schema | `packages/gofish-python/gofish/ast.py`                                     |

v0 matches the existing widget wire format exactly — lowercase `type`
discriminators, `__combinator` flag on combinator-form marks, channel
slots accept the existing strings/numbers/sentinels. The design
improvements summarized in [§ Future evolution](#future-evolution)
(PascalCase rename, ChannelExpr-only IR, `__combinator` removal,
per-stage sibling schemas) are deferred to subsequent breaking
releases.

## Dumping the IR from a spec

JavaScript:

```ts
import { chart, spread, rect, Serialize } from "gofish-graphics";
import { Frontend } from "gofish-ir";

const c = chart(data)
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(rect({ h: "count" }));

// Three call shapes, all returning Promise<FrontendIRDocument>:
const doc = await c.toJSON(); // method on ChartBuilder
const doc2 = await Serialize.toJSON(c); // standalone function
const doc3 = await Serialize.toJSONLayer(opts, [a, b]); // for Layer combinators
const doc4 = await Serialize.toJSONRawMark(mark, opts); // for bare marks
```

`toJSON` is async because combinator-form marks may carry their child
list as a `Promise<Mark[]>` (e.g. from `map(...)` helpers); the emitter
resolves these to walk into them.

Python (via the wrapper):

```python
from gofish import chart, spread, rect

builder = chart(data).flow(spread(by="lake", dir="x")).mark(rect(h="count"))
doc = builder.to_ir()      # canonical entry point — returns a dict
doc = builder.to_dict()    # alias
```

Validate either against the schema:

```ts
import { Frontend } from "gofish-ir";
const result = Frontend.validate(doc);
if (!result.valid) console.error(result.errors);
```

The validator has one mode: an unknown field is an error, wherever it sits.

## The document at a glance

A document is a wrapper that names the schema version, the stage, and
the root:

```ts
type FrontendIRDocument = {
  irVersion: 0;
  ir: "gofish-frontend";
  $schema?: string; // optional canonical URL
  root: ChartIR | LayerIR | RawMarkIR;
};
```

The root types mirror the fluent builder shapes:

- `ChartIR` — `{ type: "chart", data?, operators?, mark, options?, zOrder? }`
- `LayerIR` — `{ type: "layer", charts, options?, relate? }` (each `charts`
  tier is a `ChartIR`, or a `RawMarkIR` for a component-level annotation tier
  from the `chart(...).layer(mark)` builder chain)
- `RawMarkIR` — `{ type: "raw-mark", mark, options? }`

`data` is either `{type: "inline", rows}`, `{type: "select", layer}`,
`{type: "external", id?}`, or `{type: "previous-tier"}` — the last marks an
empty `chart()` scope inside a `builder: true` layer chain ("inherit the
previous tier's marks"). The deserializer maps it to the JS
`PREVIOUS_LAYER_MARKS` sentinel so the real `LayerBuilder.wireTiers()` derives
the auto-naming + `selectAll` wiring at resolve time — the producer's
auto-minted layer name never appears in the IR (mirroring how a relational
mark's zBelow-by-default paint order stays a resolve-time constraint rather
than a serialized field). Operators are a flat list (`derive`, `resolve`,
`join`, `filter`, `spread`, `stack`, `group`, `scatter`, `table`, `log`, `treemap`,
`pack`). `treemap`'s `tile` is a strategy object made by a call in the `Tile`
family (`Tile.squarify({ ratio })`, `Tile.slice()`, `Tile.dice()`,
`Tile.binary()`, `Tile.sliceDice()` in both languages). Every strategy has
one shape, `{ kind, ...params }`, which is both the JS value and the wire
form, e.g. `{ "kind": "squarify", "ratio": 1 }`, and the JS layout
dispatches on `kind`. `scatter`'s `overlap` (the `Overlap` family) and a
`line` or `ribbon` `curve` (the `Curve` family:
`{ "kind": "arc", "direction": "down" }`) work the same way; a bare curve name
is not a curve. The families are namespaces in the two surfaces only; the
wire carries the plain objects. Their kinds and params are declared once, in
the `STRATEGIES` table (below). Note `join`
inlines its right-hand table as JSON rows, so unlike `derive` it round-trips
without a bridge. `filter` round-trips the same way when its predicate is a
field predicate: `field(name).between(lo, hi, { closed })` returns a row
predicate that also carries its description, so the operator goes on the wire
as `{ "type": "filter", "predicate": { "field": "day", "between": [100, 120],
"closed": "right" } }`. The predicate is its own value, not an op in the field
expression's `ops`. A `filter` over a hand-written JS predicate has no wire
form and emits the opaque `derive`. A `derive`'s `schema` (`derive(fn, { schema })`, Python
`derive(fn, schema={...})`) is plain data, the wire form of a chart's
`schema`, and the registry passes it to the rebuilt `derive`, which applies
it to the rows the Python callback returns. (A `derive` once also carried a
measure `provenance` map for the rows of the `bin()` data helper; both are
gone, #1058.) A binned key, `field("date").bin(Calendar.month)`, is an op in
the field expression's `ops`: `{ "op": "bin", "partition": { "unit": "month",
"step": 1 } }`, where the partition is a Calendar value's wire form,
`{ "step" }`, or `{ "thresholds" }` (`PartitionIR`), and an op with no
`partition` bins into about 10 cells. A partition with a JS `format`
function has no wire form, and serializing it is an error. Marks are a tree — leaves
(`rect`, `circle`, `blank`, `ellipse`, `petal`, `text`,
`image`, `polygon`, plus the Python-bridge `mark-fn`), combinators (with
`__combinator: true` and a `children` array — `layer`, `spread`, `stack`,
`arrow`, `position`, `line`, `ribbon`, `treemap`, `pack`, and the Porter-Duff family),
refs, or the two self-discriminating wrapper marks `offset` and `cut` (below).
`position` is `enclose`'s undecorated sibling: it sets a single child's
min-corner `(x, y)` in the parent's coordinates and draws nothing of its own
(no hull, no styling) — a workaround for `enclose`'s convex-bbox-hull-only
styling limits, added for the bluefish Topology story's combinator trees.

Operators and marks may also carry `translate: {x?, y?}`. This is canonical
frontend IR, not a Python-only bridge sentinel: it records the structural
`.translate({x?, y?})` modifier and the JS deserializer reapplies it as a
runtime chain.

`offset` — `{ type: "offset", x?, y?, children: [<node>] }` — wraps a single
child and shifts it by `(x, y)` render-pixels without moving the bounds it
advertises to its parent; it maps to the public `offset` operator.

`cut` — `{ type: "cut", source: <mark>, dir, size?, inset? }` — slices a single
`source` mark into N clipped sub-shapes along `dir`. `size` is a field-name
string (per-row weights) or an array of absolute-pixel numbers and `datum()`
flex-weights; omitted means equal slices. It has **two deserialization surfaces
over one JS core**, dispatched by context so extent resolution (flexbox sizing,
absolute-vs-weight mixing, measure-unit checks) lives in ONE place, JS-side:

- used as a chart `.mark(...)` → the expand-mark form (`cutMark` /
  `source.cut(opts)`), so a chart flow treats it as an expand mark;
- used as a **combinator child** (inside a Spread/Stack `children` array) → the
  deserializer expands it in place into its N slice nodes — the pure
  `cut(source, opts)` returns a `Promise<GoFishNode>[]` that combinators accept
  directly as children (see `mapMarkChildren` in `fromJSON.ts`).

**`mark-fn` over refs** (#591) — a Python `.mark(fn)` callback isn't limited
to receiving plain data rows: when the callback's `data` is a bag of
`GoFishRef`s (e.g. the `.layer(chart().flow(group(...)).mark(fn))` shape that
labels a bar chart's totals), each `GoFishRef` argument crosses the RPC
serialized as an `{"__inputRef": i, "datum": <rows>}` sentinel rather than as
a live node reference — a `GoFishRef` is a class instance over the render's
layer registry, not JSON. `serializeMarkFnInput` in `fromJSON.ts` builds these
sentinels from the real ref array right before the RPC call and keeps that
array in closure; the Python side (`_InputRef` in `gofish/ast.py`) wraps each
sentinel back into an object whose `.datum` reads naturally. The callback may
return a `ChartBuilder` (as before) or — new — a bare `Mark`, wired as
`{"type": "raw-mark", "mark": <mark-tree>}` (the same shape `Mark.to_ir()`
uses at the top level), which lets it embed one of its `_InputRef` arguments
directly in the returned layout (mirroring JS `spread({...}, [d[0],
text(...)])`). `mapMark` resolves any `{"__inputRef": i}` sentinel found
inside that returned mark tree back to `inputRefs[i]` — the _original_ live
`GoFishRef` from the closure, not a reconstructed stand-in, so the ref's
identity (and anything already registered against it, e.g. a name from an
earlier tier) survives. A `.name(...)` call on the Python `_InputRef` (#556)
rides along as a `name` field on the sentinel and is applied to the resolved
ref before it's returned, since `GoFishRef.name()` mutates in place — this is
how a per-slice label overlay (`Cut.stories.tsx::ImageCutWithLabels`) can
`.relate(...)` against a ref it only received through the bridge. Each call asks Python again and builds
its own mark, so an `__inputRef` always resolves against that call's own refs.

The plain leaf-form `ref` node carries names the same way: `RefMarkIR`
declares an optional `name`, emitted by Python's `_RefProxy.to_dict()` when
the ref was renamed and re-applied by the deserializer's `mapMark` via the
same mutate-in-place `GoFishRef.name()`.
This is what lets a named ref stand-in, such as `ref(token).name("a")`,
serve as a constraint operand from Python exactly as from JS: without the wire
`name`, the reconstructed ref would not answer to `"a"` and the constraint
would fail to resolve.

There is no `connect` field on the wire. `.layer(...)` — the one way to
overlay a connector — always serializes as an ordinary `LayerIR` tier: an
empty `chart()` scope crosses as a `ChartIR` whose `data` is
`{type: "previous-tier"}` (above), and a bare relational mark used directly
crosses as a plain `RawMarkIR` wrapping that mark's ordinary `MarkIR` — `by`,
where present, is just another field in the `line`/`ribbon` mark's own option
bag, the same as `stroke` or `opacity`, not a separate IR shape. Elaboration
(naming the previous tier's mark, wiring the next tier to `selectAll(thatName)`,
and defaulting the connector to `zBelow`) is entirely JS-side, done at resolve
time by `LayerBuilder.wireTiers()`: no name is minted or leaked into the JSON,
and the zBelow default is applied as a paint-order constraint rather than
serialized as a field, so it composes with any explicit `.zOrder(...)` or
`.relate(...)` the reader adds on top.

A chart's **coordinate transform** rides the IR as a small spec the deserializer
maps back to the JS factory by `type` — e.g. `{ type: "polar", innerRadius,
centralAngle, startAngle, direction, center }`. `fromJSON.ts` reconstructs it by
calling `Coord.polar(coordSpec)` / `Coord.clock(coordSpec)` and passing the whole spec
through (the factory ignores the `type` key), so a parameterized polar/clock —
donut hole, partial fan, start angle — round-trips without per-option plumbing.

Channel values (`h`, `w`, `fill`, …) accept bare primitives (the
shorthand path) or one of three explicit tagged objects:

- `field(name)` → `{type: "field", name}` — per-row accessor, scaled.
- `datum(x)` → `{type: "datum", datum: x, measure?}` — inline value, scaled.
- `literal(x)` → `{type: "literal", value: x}` — inline constant, not scaled.

These three mirror Vega-Lite's `field` / `datum` / `value` trichotomy.

### Non-finite numbers

JSON has no `Infinity`, `-Infinity` or `NaN`. `JSON.stringify` writes them as
`null`, and Python's `json.dumps` writes a bare `Infinity`, which `JSON.parse`
rejects. So the IR carries each one as a tagged object, the canonical form of
MongoDB Extended JSON:

```json
{ "$numberDouble": "Infinity" }
{ "$numberDouble": "-Infinity" }
{ "$numberDouble": "NaN" }
```

It is one mechanism for every number in the document (an option such as
`noise`'s `smoothing`, a channel value, a data row), at the serialization
boundary, with no per-field rule:

- A writer encodes the whole document as it makes it: JS `toJSON` (through
  `Frontend.encodeIR`, gofish-ir's `frontend/nonFinite.ts`) and Python
  `to_ir()` (`gofish/_nonfinite.py`). The test derive server encodes the
  infinities in what it sends the same way.
- A reader decodes in one place, `Serialize.readIR` (`fromJSON.ts`), which
  parses JSON text if it is given text and decodes the tags. `renderIR` reads
  the root it is given through it, the parity harness's HTTP bridge reads each
  derive response through it, and `buildChart` reads its own arguments
  through it. The other reconstruction functions (`mapMark`,
  `mapOperator`, ...) take what `readIR` returns.
- The validator accepts the tagged `Infinity` and `-Infinity` wherever it
  expects a number, through one check (`isIRNumber`), and the JSON Schema has
  one shared `Number` def that every number field points to. A tagged `NaN`
  where a number is expected is an error: a NaN option is always a bug. Data
  rows are untyped, so a NaN there round-trips.
- The test derive server keeps its old rule for a NaN in rows: it sends
  `null`, which is how pandas' missing value reads in JS.

The tag was chosen over protobuf's JSON mapping (a bare string `"Infinity"`
in a number field) because a string already means a field name in a channel
value, so a bare string would be ambiguous there; a tagged object is not, in
any position.

### `.relate()` clauses

A `layer` combinator mark (and a `LayerIR`) carries its `.relate()` callback as
`relate: RelateClauseIR[]`, the callback's clauses in order, already
evaluated on the authoring side. A clause is a `ConstraintIR`
(`{ type, options?, refs }`, the operands as names) or a `MarkIR` that draws
(`arrow`, `enclose`, a relational `line`, ...), whose children may include
`{ type: "ref", selection: "name" }` refs to the layer's names. The two are
told apart by `refs`: a constraint always carries it and a mark never does
(`isConstraintIR`, which the validator uses too). Both readers (`fromJSON.ts`
and the parity harness, which both go through `fromJSON.ts`) rebuild a constraint with the same `constraintFromIR`
and hand the list back through `.relate(() => clauses)`, so the
layer schedules the clauses exactly as it would for a JS author. The field was
called `constraints`, and held constraints only, before the `.constrain()` →
`.relate()` rename.

## A worked example

```ts
chart(seafood)
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(rect({ h: "count", fill: "species" }).name("bars"))
  .render(container, { w: 500, h: 300, axes: true });
```

```json
{
  "irVersion": 0,
  "ir": "gofish-frontend",
  "root": {
    "type": "chart",
    "data": {
      "type": "inline",
      "rows": [
        /* seafood */
      ]
    },
    "options": { "w": 500, "h": 300, "axes": true },
    "operators": [{ "type": "spread", "by": "lake", "dir": "x" }],
    "mark": {
      "type": "rect",
      "name": "bars",
      "h": "count",
      "fill": "species"
    }
  }
}
```

The bare `"count"` and `"species"` strings use the shorthand path; the
runtime resolves them as field accessors. Writing
`h: field("count"), fill: field("species")` would emit the explicit
tagged-object form instead.

### A combinator-form example

```ts
chart(data).mark(
  layer([
    rect({ w: 100, h: 40, fill: "steelblue" }),
    text({ text: "label", fontSize: 14 }),
  ])
);
```

```json
{
  "irVersion": 0,
  "ir": "gofish-frontend",
  "root": {
    "type": "chart",
    "data": {
      "type": "inline",
      "rows": [
        /* ... */
      ]
    },
    "operators": [],
    "mark": {
      "type": "layer",
      "__combinator": true,
      "children": [
        { "type": "rect", "w": 100, "h": 40, "fill": "steelblue" },
        { "type": "text", "text": "label", "fontSize": 14 }
      ]
    }
  }
}
```

The `__combinator: true` flag tells the deserializer to dispatch this
node through the combinator factory registry (`layer`, `spread`,
`arrow`, `position`, `line`, `ribbon`, `treemap`, `pack`, Porter-Duff) rather than the
leaf-mark registry — same `type` discriminator namespace, different code path.

## The descriptor table — one authored source for construct field lists

Before the change described in this section, a construct's field list
(what keys `rect` or `spread` accept, which are required, what they
default to) was hand-duplicated across four places: the TS type in
`schema.ts`, the field checks in `validate.ts`, the `$defs` in
`jsonSchema.ts`, and the Python factory in `ast.py`. They drifted —
`OPERATOR_TYPES` listed `"treemap"` while the `OperatorIR` union and the
JSON Schema enum omitted it, and the hand-written Python `rect()` exposed
`rs=`/`ts=` kwargs that don't exist anywhere in JS (the real names are
`rSize`/`thetaSize` at the time; they serialized, passed the open-world validator, and
were silently dropped at render).

[`descriptors.ts`](https://github.com/gofish-graphics/gofish-graphics/blob/main/packages/gofish-ir/src/frontend/descriptors.ts)
collapses three of those four into one authored table: one entry per
construct (operator, leaf mark, combinator mark, coord transform) listing
its fields in a small type DSL (`t.string`, `t.number`, `t.enum(...)`,
`t.literal(v)` for exactly one value, such as the `false` in an axis
title's `string | false`, `t.channel(...)` for a `ChannelValue` slot, `t.ref("AxesOptions")` for a
pointer at a named type, and so on — see the file's `t`/`ch`
exports). Shared field groups (`boxDims`, the ten closed x/y/w/h box channels plus the open `dims` bag
keyed by axis name; `paint`, the five paint channels) are declared once and pulled
into a mark's entry by reference, so most mark entries list only the
fields genuinely their own.

Three smaller tables sit beside the construct entries. `OPTION_TYPES` declares
the nested option objects a field points at by name, in the same type DSL:
today `AxesOptions` (a boolean, or `{x, y}`), `AxisOptions` (a boolean, or
`{title, side, labelAngle}`), `AxisInterval` (`{min, center, max, size,
embedded}`), `AxisDimsValue` (a channel value or an `AxisInterval`, the
value of a `dims` entry), `FieldPredicate` (`{field, between, closed}`,
the predicate of `filter`), `Calendar`, and one entry per strategy family. A
`t.ref(name)` resolves against it first, so the validator, the JSON Schema,
and the Python generator all read one declaration of each. `ChartOptions` is
one of them: `t.object(CHART_OPTIONS)`, the chart-level options (`w`, `h`,
`coord`, `color`, `axes`, `legend`, `padding`, `schema`), mirroring the JS
`ChartOptions`. The validator walks `ChartIR.options` as
`t.ref("ChartOptions")`, the JSON Schema emits its `$def` with the others,
the Python generator builds `_chart_opts` from `CHART_OPTIONS`, and the docs
build the chart options table from it (`::: gofish-ref ChartOptions`).

`STRATEGIES` declares the strategy families whose values cross the wire:
`Tile`, `Overlap`, `Curve` and `Bin`. For each it lists the kinds, each with its
params (types, defaults and docs), and the presets: a factory that makes a
kind with some params already set, such as `Overlap.sina()`, which is
`noise` with `smoothing: "silverman"`. Each family derives its
`OPTION_TYPES` entry, a union of one object per kind with a literal `kind`,
so the strategy options are `t.ref("Tile")`, `t.ref("Overlap")` and
`t.ref("Curve")`, and a struct's bin op takes `OPTION_TYPES.Bin`. A param
may carry bounds, `t.num({ min: 0, finite: true })` for a pixel padding or
`t.num({ exclusiveMin: 0, finite: true })` for a hex radius, which the
validator and the JSON Schema (`minimum`, `exclusiveMinimum`) check. When a
value matches no branch of an untagged union, and only one branch is of the
value's kind (a number for `Bin.hex`'s `radius: number | { x, y }`), the
validator reports that branch's own findings (`expected a number above 0`).
A union whose branches are all tagged by the same field is checked against
the one branch its value's tag names: a strategy's `kind`, or the `type` of
a hand-authored ref that declares a `tag` in `AUTHORED_REFS` (`"field"` for
`FieldAccessor`, `"struct"` for `StructAccessor`). So `partition`'s `by`, a
field accessor or a struct, reports what is wrong with a bad bin, not that
no shape matched. The JS
layout checks a strategy where it reads it, with `checkStrategy(family,
value, where)` from `validate.ts`, the same walk the validator runs over a
whole document. So an unknown kind, an undeclared param, and a value out of
bounds each fail in one place, whether the strategy came from a factory, a
hand-written object, or Python IR. `Coord` and `Color` are families on the
two surfaces but not in this table: a coordinate transform is a JS object of
functions, rebuilt from a `type`-tagged config (`COORDS`), and a color scale
is tagged by `_tag` and takes its one argument by position.

`schema.ts` keeps the TypeScript types of the strategies, `TileIR`,
`OverlapIR`, `CurveIR` and `BinIR`, by hand, and each family's JS type is one of them
(`Curve.Curve` is `CurveIR`). `descriptors.test.ts` checks that their kinds
and params agree with `STRATEGIES`. Every family is closed: there is no
public way to add a kind, so every strategy can cross the wire (user-defined
strategies are designed in #1101).

A named type may say which Python class builds a value of it (`pyClass`):
`FieldPredicate` here, and `FieldAccessor` and `StructAccessor` in
`AUTHORED_REFS`, the list of refs to hand-authored shapes (a struct key,
`{ type: "struct", fields: { x, y }, ops? }`, is walked by its own walker,
whose bin op is checked against `OPTION_TYPES.Bin`). Such a value already carries its wire keys, so
the Python generator passes it through. One function, `pyType` in
`descriptors.ts`, gives the Python type of a field: the generated factory
signatures (the strategy modules' too) annotate with it and the Python docs
tables print it, so the two agree. A ref prints as its `pyClass` when it has
one, else as the Python type it stands for (`AxesOptions` is `bool | dict`).
A strategy family's entry names its Python namespace (`pyFamily`: `Tile`,
`Overlap`, `Curve`): the docs print that name, since users write
`Tile.squarify(...)`, and a signature annotates the value it makes (`dict`),
since a namespace is not a type.

**What's still authored, not in the table**: the envelope
(`ChartIR`/`LayerIR`/`DataIR`/`MarkIR` union, `ChannelValue`,
`ConstraintIR`, `LabelIR`, `TranslateIR`) and `cut`/`offset`/
`ref` — these are structural or recursive shapes rather than flat field
bags, and stay hand-written in `schema.ts` and `jsonSchema.ts` (the parts
of those files the doc comment marks as "stays hand-written below").
Constraints likewise stay authored.

A `dims` option is `t.record(t.ref("AxisDimsValue"))`: each value is a bare
`ChannelValue` or an interval object with only
`min`/`center`/`max`/`size`/`embedded` keys. The two are told apart by a tag.
A channel value that is an object always carries one (`type` for
`field(...)`, `datum(...)`, and literals, or the `__gofish_lambda` bridge
sentinel), so an untagged plain object is an interval. `validate.ts` exports
that test as `isAxisInterval`, and its channel check rejects an untagged
object, so the generic union walk reads an untagged object only as an
interval and reports a misspelled anchor or a mistyped one.
The renderer's `dims.ts` imports `isAxisInterval` and the key list
`AXIS_INTERVAL_KEYS`, so the wire and the renderer share one definition; a
test checks that the key list matches the `AxisInterval` declaration.
The keys of `dims` are axis names that only mean something inside the enclosing
coordinate space, so the wire keeps them open and carries them verbatim; the
same goes for `spread`/`stack`'s `dir`, which is a plain string on the wire.

Six consumers read the table:

- **`validate.ts`** interprets it generically — a single walk over each
  descriptor's resolved fields instead of a per-type imperative switch.
  Operators, leaf marks, and a combinator mark's `options` are all checked
  the same way: an unknown field or a wrong-shaped known one is an error.
  Leaf marks used to only warn, during a rollout that ended once every
  Python story validated with no warnings. The Python bridge fields the
  renderer reads (`__scope`, `__datum`, `__key`) are declared in
  `MARK_BASE_FIELDS` like any other field, so nothing is exempt by name.
- **`jsonSchema.ts`** builds one `$def` per operator (`SpreadOperator`,
  `TableOperator`, …) and one per leaf mark (`RectMark`, `TextMark`, …)
  from the table (`buildOperatorDefs()` / `buildLeafMarkDefs()`), and one
  per named option type (`buildOptionTypeDefs()`), merged into the
  hand-written `$defs` object. These `$defs` stay
  `additionalProperties: true`: the published schema keeps the open wire
  contract, and rejecting an unknown field is `validate.ts`'s job.
- **The JS emitter** (`toJSON`) filters what reaches the wire through it.
  A factory tags its options as the caller passed them; `wireOpts` keeps
  only the keys `acceptedFields(kind, type)` lists, and drops any function
  value, since a callback has no JSON form. So a key the descriptor does not
  know never reaches the IR, and a construct with no descriptor (such as
  `time.transition`) has no IR form: `toJSON` throws.

  `acceptedFields` (in `descriptors.ts`) is the one statement of which keys an
  options object takes on the wire: the descriptor's fields plus the base fields
  that sit in the same object. An operator's and a leaf mark's options are spread
  onto the node, so all of `OPERATOR_BASE_FIELDS` or `MARK_BASE_FIELDS` sit
  beside them. A combinator mark nests its options under `options`, where only
  `COMBINATOR_OPTIONS_BASE_FIELDS` (`debug`) ride; its other base fields sit on
  the node. The emitter keeps these keys, and the validator checks an operator
  or leaf-mark node against them. On a leaf mark, the base fields that Mark
  methods set (`name`, `label`, `relate`, `zOrder`, `translate`) are checked by
  their own walkers, so the check of the mark's channels skips them. The
  emitter writes each `field(...)` or `datum(...)` instance in its plain
  `toJSON()` form, so the document it returns validates as the wire carries
  it. It does this in the same pass that encodes non-finite numbers
  (`Frontend.encodeIR`), which shares unchanged subtrees, so inline rows are
  not copied, and leaves a value whose `toJSON()` is a primitive (a `Date`,
  a Temporal value) as it is.

- **The JS deserializer** (`registry.ts`) rebuilds a wire type through
  the factory its descriptor names — see § Modularity below.
- **`gofish-python/scripts/generate.ts`** emits the mechanical part of the
  Python wrapper from the same table — see
  [§ Generating the Python factory layer](#generating-the-python-factory-layer)
  below.
- **The docs site** generates every API reference page's options table
  from it. A page under `apps/docs/docs/{js,python}/api/` writes
  `::: gofish-ref rect` under its `## Parameters` heading, and the
  container (`docs/.vitepress/markdown-it-gofish-ref.ts`) renders the
  construct's `doc` line plus an Option/Type/Default/Description table —
  JS field names and a TS-ish type on a JS page, snake case kwarg names
  (from `pyKwarg`, see § Generating the Python factory layer) and a
  Python type on a Python page, with the shared groups (`boxDims`,
  `paint`) folded into a collapsed block. So an option's one-line
  description lives in its `doc` string and reaches the reader and the
  generated Python docstring from there. `apps/docs/scripts/check-api-coverage.mjs`
  closes the loop in CI: every construct in the table has a page in both
  languages, and every name a page references is a real construct.

## The JSON Schema

The schema is Draft 2020-12. Its envelope (`Root`, `ChartIR`, `LayerIR`,
`DataIR`, `ChannelValue`, `ConstraintIR`, `LabelIR`, and friends) is
hand-written; the per-operator and per-leaf-mark `$defs` are generated
from `descriptors.ts` at call time (see the previous section) and merged
in. It lives in source at
[`packages/gofish-ir/src/frontend/jsonSchema.ts`](https://github.com/gofish-graphics/gofish-graphics/blob/main/packages/gofish-ir/src/frontend/jsonSchema.ts)
and is emitted as a JSON artifact during build to
`packages/gofish-ir/dist/frontend/v0.json`. See
[Full JSON Schema](/internals/frontend/schema-json) for the rendered
document.

The high-level structure:

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id":     "https://gofish.graphics/schema/frontend/v0.json",
  "type":    "object",
  "required": ["irVersion", "ir", "root"],
  "additionalProperties": false,
  "properties": {
    "irVersion": { "const": 0 },
    "ir":        { "const": "gofish-frontend" },
    "$schema":   { "type": "string" },
    "root":      { "$ref": "#/$defs/Root" }
  },
  "$defs": {
    "Root":       { "oneOf": [ChartIR, LayerIR, RawMarkIR] },
    "ChartIR":    { /* type, data, operators, mark, options, zOrder, ... */ },
    "LayerIR":    { /* type, charts, options, ... */ },
    "RawMarkIR":  { /* type, mark, options, ... */ },
    "DataIR":     { "oneOf": [/* inline, select, external, previous-tier */] },
    "OperatorIR": { /* GENERATED oneOf: SpreadOperator | StackOperator | ... | TreemapOperator */ },
    "MarkIR":     { "oneOf": [LeafMarkIR, CombinatorMarkIR, RefMarkIR, OffsetMarkIR, CutMarkIR] },
    "LeafMarkIR": { /* GENERATED oneOf: RectMark | CircleMark | ... */ },
    "LabelIR":      { "oneOf": [/* boolean shorthand, array of {accessor, position, fontSize, ...} specs */] },
    "ConstraintIR": { /* type, options, refs */ },
    "ChannelValue": { "oneOf": [/* primitives, field, datum, literal, bridge sentinels */] },
    "ChartOptions": { /* GENERATED from CHART_OPTIONS: w, h, coord, color, axes, ... */ },
    "AxesOptions":  { /* GENERATED from OPTION_TYPES, as are AxisOptions, AxisInterval, AxisDimsValue, FieldPredicate */ }
  }
}
```

The validator at
[`validate.ts`](https://github.com/gofish-graphics/gofish-graphics/blob/main/packages/gofish-ir/src/frontend/validate.ts)
covers the same shapes, generically interpreting the descriptor table as
described above, plus the structural checks for the hand-authored parts
(e.g. `table.by` requires `{x, y}`). A field typed with a named option type,
such as the `axes` override on `spread`/`stack`/`scatter`, is walked by the
same generic interpreter against its `OPTION_TYPES` entry, and so is a
chart's `options`, against `CHART_OPTIONS`. A nested object rejects a key it
does not declare. A tagged union (every branch an object with a literal
`kind`, as a strategy family is) is walked by the branch its `kind` picks, so
an unknown kind gets its own error. Any other union accepts a value when any
branch does, each branch checked into a probe context of its own, which is
why the JSON Schema writes a union as `anyOf`, not `oneOf`.

## Generating the Python factory layer

The `treemap` drift mentioned above ran the opposite direction from what
you'd guess: `treemap` isn't a stray entry that needs deleting from
`OPERATOR_TYPES` — it's confirmed as a genuine dual-form construct (a real
Python story sizes with `h: "fare"` through the `.flow()` operator form),
so the fix added a `TreemapOperator` member to the `OperatorIR` union and
its JSON Schema enum, matching what `descriptors.ts` already modeled.

[`packages/gofish-python/scripts/generate.ts`](https://github.com/gofish-graphics/gofish-graphics/blob/main/packages/gofish-python/scripts/generate.ts)
imports the same `descriptors.ts` table (via the `gofish-ir/frontend`
package export, so it needs `pnpm --filter gofish-ir build` to have run
first) and emits `gofish/_generated.py` and the strategy family modules
`gofish/tile.py`, `gofish/overlap.py` and `gofish/curve.py` (from
`STRATEGIES`) — checked into the repo, with a
CI freshness check (`pnpm --filter gofish-python gen` then `git diff
--exit-code`) rather than a build-time step, matching the "commit the
generated Python" norm Altair and Plotly.py both follow.

Python kwargs are in snake case, while the wire stays in camel case. One
function in `descriptors.ts`, `pyKwarg(fieldName)`, gives each field's
Python name: the field name in snake case (`strokeWidth` becomes
`stroke_width`, `emX` becomes `em_x`), with a trailing underscore when that
is a Python keyword (`from` becomes `from_`). Every generated function lists
its `(wireKey, pyName)` pairs and builds its IR dict under the wire key, so
`rect(stroke_width=2)` serializes as `{"strokeWidth": 2}`, and
`rect(strokeWidth=2)` is a `TypeError`. The docs options tables call the
same function. Hand-written wrappers take `**options` and pass them to a
generated core, so none renames by hand: `.label(accessor, **options)` on
marks and operators calls `_label_opts`, built from `LABEL_OPTIONS` (the
options of a `LabelSpecIR`, which the JSON Schema's `LabelIR` and the
validator also read), and `line`/`ribbon` call `_line_opts`/`_ribbon_opts`.

A nested option dict follows the same rule, by its declared type. The
generator compiles a field's type into a small Python literal that records
only its key structure: for an object, each Python key (from `pyKwarg`)
paired with its wire key and the shape of its value. A field whose type has
no option keys compiles to nothing and its value passes through as is. The
generated module holds one entry per named option type (`_OPTION_TYPES`) and
one interpreter, `_to_wire`, which every generated function calls on such a
field. So `chart(data, axes={"x": {"label_angle": 45}})` serializes as
`{"axes": {"x": {"labelAngle": 45}}}`, and an undeclared key, including the
camelCase `"labelAngle"`, is a `TypeError` that names the expected keys.
Python's `chart()` now goes through a generated `_chart_opts` core built from
`CHART_OPTIONS`, so an unknown chart keyword is a `TypeError` too. The
`axes` option of `.render(...)`, on a chart, a mark, or a layer, goes through
`_to_wire` as well (in the widget constructor), so it is spelled and checked
as in `chart()`.

The conversion is driven by the declared type, never by the dict itself, so
dicts whose keys are data keep them: a `record` type's keys (a `schema` keyed
by column name, the axis names of `dims`) are never renamed, and a field
typed `any` (`color=Color.palette({...})` keyed by category, `coord`) passes
through whole. A channel value built by `field(...)` or `datum(...)` is a
dict already in wire form, so `_to_wire` passes it through by its class
wherever it appears. That is how a `dims` entry works: `field("x")` passes
through, and any other dict is an interval whose keys are checked
(`dims={"theta": {"width": 2}}` is a `TypeError`). Two rules keep this
honest. A union may have only one branch that a dict could match (a channel
branch does not count, for the reason just given), or generation fails,
since `_to_wire` would have to guess. The one exception is a tagged union: when every dict branch is an
object whose `kind` field is a literal or enum, and no two branches share a
`kind` value (a strategy family: treemap's `tile`, `{kind: "squarify",
ratio?}` or `{kind: "slice"}` or ...; scatter's `overlap`; a `curve`), the generator emits a
`("tagged", "kind", {kind_value: branch_shape})` shape, and `_to_wire` picks
the branch by the dict's `kind`. A missing or unknown `kind`, or a key that
branch does not declare (`ratio` on `slice`), is a `TypeError`. And a `t.ref` must name either an `OPTION_TYPES` entry or one of the
few refs the generator lists as already in wire form (today only
`FieldAccessor`, built by `field(...)`), or generation fails, so a new nested
type has to be declared before Python can take it.

It emits:

- Closed-signature **leaf mark** factories (`rect`, `circle`, `ellipse`,
  `petal`, `text`, `image`, `polygon`, `blank`) — pure kwargs-collection
  plus wire-key rename, with docstrings from each field's `doc`. An
  undeclared kwarg is a `TypeError` on all of them; none takes `**kwargs`.
- Compositing-quartet and other **combinator-only** marks — the
  Porter-Duff-style renames (`inside`→`intersect`, `xor`→`exclude`,
  `out`→`subtract`, `atop`→`paint`) come from the descriptor's `pyName`,
  killing four previously hand-copied wire-name tables.
- `_opts(...) -> dict` **cores** for the dual-form constructs (`spread`,
  `stack`, `scatter`, `group`, `table`, `treemap`, `line`, `ribbon`,
  `layer`, `pack`, the polar coord family), with separate combinator-form
  cores for `spread`, `stack`, and `treemap` (their combinator entries add
  `key`; `spread` and `stack` also include the whole `boxDims` group, since
  JS `Spread` spreads its `FancyDims` into its box), and `_chart_opts` for
  `chart()` and the chart-tier `layer([...])` — just the kwargs→dict half. The
  polymorphic operator-vs-combinator dispatch stays hand-written in
  `ast.py`, calling into these generated cores.
- One module per **strategy family** in `STRATEGIES` (`gofish/tile.py`,
  `gofish/overlap.py`, `gofish/curve.py`, `gofish/bin.py`), bound in
  `__init__.py` under the family name (`Tile`, `Overlap`, `Curve`, `Bin`): one factory per kind and per
  preset, named by `pyKwarg` (`Tile.slice_dice()`, `Curve.catmull_rom()`).
  Each returns `{"kind": ..., **params}` with snake_case param keys, and the
  option it is passed to renames them to wire keys through the family's
  `_OPTION_TYPES` entry, like any nested option dict, so
  `Curve.perfect_arrows(pad_end=4)` reaches the wire as
  `{"kind": "perfectArrows", "padEnd": 4}`. Each factory checks its params
  at the call, with checks the generator writes from each param's type
  (`pyParamChecks` in `generate.ts`): a value of the wrong Python type raises
  a `TypeError`, and a value out of bounds or not in an enum raises a
  `ValueError` that names the call and the kwarg
  (`Overlap.separate(padding=...) must be >= 0, got -1`). An unknown kwarg is
  a `TypeError` from the signature. A dict param (`Bin.hex`'s
  `radius={"x": 2, "y": 500}`) has its keys and each value checked the
  same way, and a table param (an array of records: `Bin.voronoi`'s
  `seeds`) is read first with `to_records`, so a dataframe works too, and
  goes on the wire as dict rows. These are the same constraints
  `checkStrategy` checks on the JS side, read from the same table, so Python
  users see the error at the line that made it.

`derive`/`resolve`/`join`/`filter` (real RPC-bridge/ref-shape/DataFrame/
predicate logic) and
`field`/`datum`/`normalize`/`repeat`/`ref`/`select_all`
(not in the descriptor table at all) stay fully hand-written in `ast.py`, as
do the `Color` and `Coord` family modules (`color.py`, `coord.py`),
alongside the builder chain, `_RefProxy`, `DatumValue` arithmetic, and the
widget/RPC layer — see
[Design space: generating the Python wrapper](/internals/design/python-wrapper-codegen)
for the full hand-written-residue accounting and what's still deferred
(the `.layer()`/relate-ref-walk follow-ups).

Generating this layer fixed real drift along the way: the hand-written
`rect()` had exposed phantom `rs=`/`ts=` kwargs (see the descriptor-table
section above) that the generator's output doesn't have; `text()` lost a
phantom `fontWeight` and a phantom `label` kwarg that don't exist on the
JS factory, and gained the box-dims channels it was missing.

## Modularity — the registry pattern

Each operator and leaf-mark factory takes an optional `serialize`
config; the factory attaches the produced value's wire form with `withWire`
(`ast/wire.ts`). The emitter (`toJSON`) reads the tag at walk time. Adding a
new operator is a one-line config change to its existing factory call,
not a switch-statement edit.

```ts
// graphicalOperators/spread.tsx
export const spread = createOperator<any, SpreadOptions>(Spread, {
  split: ({ by }, d) => /* ... */,
  channels: { w: "size", h: "size" },
  axisFields: ({ by, dir }) => /* ... */,
  serialize: "spread",                 // <-- new
});

// shapes/rect.tsx
export const rect = createMark(Rect, { w: "size", h: "size", /* ... */ }, "rect");
//                                                                          ^^^^^^
```

Combinator-form marks (`spread([m1, m2])`, Porter-Duff, etc.) tag with
`__combinator: true` and stash the child marks on the tag so the
emitter can walk them. Untagged operators emit as opaque
`{type: "derive"}`; untagged marks throw. The tag holds the options as the
caller passed them, and the emitter filters them through the descriptor (see
the descriptor-table consumers above), so a factory never lists its own
fields.

The way back is one table. `FACTORIES` in `registry.ts` maps each wire
type to the public factory that rebuilds it, and
`rebuild(kind, type, opts, { children, bridge })` calls it: it returns
`undefined` unless the descriptor table declares that type for that kind, and
the kind decides the call. An operator or a leaf mark is `factory(opts)`; a
combinator mark is `factory(opts, children)`. A dual-form construct such as
`spread` or `line` therefore has one entry for both forms, and the compositing
wire types map to their renamed factories (`inside` to `intersect`, and so on).
Only an `OPERATOR_BUILDERS` entry sees the bridge.

Five operators keep a hand-written builder in `OPERATOR_BUILDERS`, because
their IR is not their factory's options object: `derive` (it calls a Python
lambda through the bridge and puts back the rows' measure provenance),
`resolve` (the IR names a layer, the factory takes a selection), `join` and
`log` (their factories take positional arguments), and `filter` (the IR
describes a field predicate, the factory takes the predicate function, which
`fieldPredicate` builds from that description). `mark-fn`, `cut`,
`offset` and `ref` are rebuilt structurally in `fromJSON.ts`'s `mapMark`.
The serialize test fails when a descriptor has no factory or a factory has no
descriptor.

User-defined custom marks via the no-channels `createMark((data, props) => …)`
overload are an open question (deferred to v0.1+ — Olli treats them as
opaque semantic boundaries via the `name` field).

## Future evolution

v0 publishes the existing widget wire shape so consumers can ship
against a typed schema today. Subsequent breaking releases will layer
in the design improvements:

- **PascalCase rename** (`"Rect"` over `"rect"`, etc.) — matches
  ESTree/Babel convention; one lockstep migration across Python + JS +
  Olli per the no-back-compat policy.
- **`__combinator` removal** — discriminate operator-form vs
  combinator-form by position (inside `operators[]` vs inside the mark
  tree's `children`) rather than a flag.
- **`ChannelExpr`-only IR** — the fluent API would desugar all shorthand
  strings to `field()` at construction time; the IR sees only the
  canonical tagged-object form.
- **Multi-stage sibling schemas** — distinct frontend / core /
  rendered schemas in the same package, with a one-way `elaborate`
  transform between them. Mirrors Vega-Lite → Vega and Lean
  `Syntax` → `Expr`. Reserved as namespace; nothing ships under
  `Core` or `Rendered` yet.
- **Inline `meta?` annotations** — per-node optional slot for
  later-pass info (underlying-space classification, source positions,
  scale resolution). Open-typed; the slot is reserved in v0,
  unset by emitters.

## Bridge extensions (Python widget)

The Python wrapper emits a few sentinels that are not part of the
public schema — they extend it for the round-trip across anywidget:

| Sentinel            | Meaning                                                               |
| ------------------- | --------------------------------------------------------------------- |
| `{__gofish_lambda}` | A Python callable; the JS deserializer wires it to an async accessor. |
| `{__gofish_token}`  | A hygienic-name token; resolved via a per-render token map.           |
| `__scope: true`     | The `@mark` decorator's scope-wrap signal.                            |
| `__datum` / `__key` | `bind_data()` pre-binding for Treemap-style invocation.               |

A `{__gofish_lambda}` sentinel may sit at any depth of a channel option, not
only as a top-level channel: for each option whose descriptor type can hold
a channel (`carriesChannel`), the generated Python factory wraps every
callable it finds in the option's plain dicts and lists
(`dims={"r": {"size": lambda d: ...}}`), and `unwrapOpts` resolves the
sentinels at any depth of both mark and operator options. When the Python
`Mark` or `Operator` is built, one walk of its options (`_scan_options`)
records the accessors per option and raises a `TypeError` for a callable in
any other option (`spread(by=lambda d: ...)`), since the JS side resolves
accessors only in channels. Serializing and registering the accessors read
that record, so only the options that hold one are walked again. The Python
option walks share one copy-on-write `walk` (`_nonfinite.py`), which keeps
unchanged values as the same objects. The accessor JS
builds has only a batch form (`RESOLVE_ROWS`): channel inference is
synchronous, so the mark factory and the operator factory first resolve every
Python accessor in a channel over the rows they are about to infer from
(`resolveChannelAccessors` in `channels.ts`), with one `applyLambda(id, rows)`
call per accessor, and inference reads the resolved values (#1080). That works
the same in every channel kind, size and position included. It is the one
place a Python accessor crosses the bridge, and calling one per row throws. A
JS `async (d) => ...` accessor is not supported: only Python accessors are
resolved this way. When no channel holds a Python accessor, nothing is awaited
or copied.

Python's `datum(x)` emits the canonical `{type: "datum", datum: x}` shape
directly — no bridge sentinel needed.

Olli and other pure-JS consumers don't see these — they're a
`FrontendIRWithBridge` extension declared in the Python widget code
(see [The Jupyter Bridge & RPC](/internals/python/bridge)).

### One renderer, two hosts

Two hosts render Python IR: the notebook widget
(`packages/gofish-python/widget-src/index.ts`) and the Python parity harness
(`tests/harness/main.ts`). Both call the same function,
`Serialize.renderIR(root, container, renderOptions, { bridge, tierRows })`
in `fromJSON.ts`, which dispatches on the root (chart, layer, bare mark) and
renders it. What differs between the hosts is only transport:

- **Callbacks.** The widget's `DeriveBridge` sends rows as Arrow over
  anywidget traitlets; the harness's sends them as JSON in an HTTP POST to
  `tests/scripts/derive-server.py` (`/derive/<id>`).
- **Rows.** Both hosts ship each chart tier's rows the same way: Python's
  `tiers_arrow_bytes` (`gofish/ast.py`) gives one Arrow IPC stream per tier
  (one for a chart, one per child for a layer, none for a bare mark), and
  each crosses as a list of base64 strings. The widget sends the list in its
  `tier_arrow` trait; the derive server returns it as `tierArrow` beside the
  builder's own `to_ir()`, which it returns untouched. Both decode it with
  `decodeTierRows` (`widget-src/arrowDecode.ts`, which the harness imports
  as the `gofish-python/arrowDecode` package export) and pass the result as
  `tierRows`. Data in the IR wins over `tierRows`. The decode converts each
  column once by its Arrow type: a tz-aware timestamp becomes epoch
  milliseconds and marks the column as a time (`HasCalendar` in its zone,
  attached with `Serialize.setColumnTypes`); a naive timestamp or a date is
  a wall-clock value, so it becomes an ISO string without an offset and is
  marked `HasCalendar` in UTC, which `applySchema` reads in the zone the
  chart declares for the column, as it reads the same string from JS data.
  The decode attaches types and converts no time to an instant itself:
  every reader of decoded rows runs `applySchema` with its own schema
  before it reads a value. A tier is chart data; a callback's rows go
  through `applyLambdaTyped` (`registry.ts`), which a `derive` (with its
  `schema`) and a lambda accessor both call, so a single-datum derive's
  result and an accessor's result hold epoch milliseconds. A list becomes a
  plain array, a struct a plain object, a 64-bit integer a JS number, and a
  null stays `null`. No schema names a value inside a list or a struct, so
  a time there decodes to epoch milliseconds (a naive timestamp or a date
  read in UTC, as a chart with no zone reads it), and a list of structs, a
  list of rows, carries its own column types (`HasCalendar` in the
  timestamp's zone, or UTC). A float NaN stays NaN: GoFish never reads NaN as missing. Only a
  pandas DataFrame's NaN crosses as null, because pandas defines NaN as the
  missing value of its float columns and pyarrow's `from_pandas` follows
  that rule. A column whose rows mix types (a string in one, a number in
  another) is a loud error in `to_arrow_table`, never a silent coercion.
  [The one exception](https://github.com/gofish-graphics/gofish-graphics/issues/1088)
  is a chart that a mark function returns: it comes back over the derive
  RPC, so the derive server inlines its rows in the IR as
  `{type: "inline", rows}`.
- **Render options.** These are the JS `.render(container, options)` options:
  `w`, `h`, `axes`, `padding`, `debug`. The widget reads them from its traits,
  which the Python `.render(...)` call sets; the harness reads the story's
  render-options dict. `axes` and `padding` stay unset unless the caller
  passed them, so a chart's own `axes` option (or a layer chain's root
  tier's) decides, and the default padding applies.

The layer cases live in `renderIR` too: `builder: true` rebuilds the real
`LayerBuilder`; otherwise the tiers go to the JS `layer(options, tiers)`
combinator with the layer's options as they are, and its `relate` clauses are
rebuilt once and handed to `.relate(...)`. A tier named with
`chart(...).name(n)` carries `name` on its `ChartIR`, which `buildChart`
applies with `ChartBuilder.name`, so the clauses can refer to it. Python's
`layer([...], **options)` takes exactly JS `layer`'s options; `padding` is a
render option in both languages.

## Prior art

The schema-shape and modularity decisions draw on four sources:

- **[ESTree][estree]** and **[Babel `@babel/types`][babel-types]** — the
  tagged-union JSON ast pattern and the `defineType` registry. Babel's
  registry primitive in `packages/babel-types/src/definitions/utils.ts`
  is the model for the `serialize` config on `createOperator` /
  `createMark`. ESTree's universal `type: string` discriminator is the
  convention v0 follows (lowercase to match the existing widget wire
  format; PascalCase is the v0.1+ target).

- **[Vega-Lite][vega-lite]** — the closest precedent for a JSON chart
  spec. Lessons stolen: separate authoring / runtime schemas
  (`vega-lite-schema.json` vs `vega-schema.json`) — informs the
  multi-stage sibling-schemas plan. `$schema` URL versioning. Lessons
  rejected: signature-key discrimination (VL's negative `hasProperty`
  checks in `src/transform.ts:680` are brittle) and closed mark sets
  (VL marks are a fixed const-object; GoFish's registry pattern is
  open).

- **[GHC's Trees-That-Grow][ttg-note]** — pass-parameterized in-memory
  AST. Lesson: even GHC doesn't serialize its phase-tagged `HsSyn`; it
  serializes a separate flatter IR (`.hie` files). The IR you emit is
  not the AST you keep. TTG's per-constructor extension fields inform
  the inline `meta?` slot. The phantom `Pass` type parameter is
  rejected for a JSON wire format where TypeScript can't enforce
  exhaustiveness anyway.

- **[Lean 4 `Syntax` / `TSyntax`][lean-syntax]** — pre-elaboration
  `Syntax` and post-elaboration `Expr` are structurally distinct
  inductives, not one type with a phase flag. The macro-expansion
  boundary is a type-level cut. Same conclusion as Vega-Lite reached
  from the opposite side: multi-stage means sibling schemas.

[olli]: https://github.com/umwelt-data/olli
[olli-bluefish]: https://github.com/umwelt-data/olli/blob/jzong/olli-solid/packages/olli-adapters/src/BluefishAdapter.ts
[estree]: https://github.com/estree/estree
[babel-types]: https://github.com/babel/babel/tree/main/packages/babel-types
[vega-lite]: https://github.com/vega/vega-lite
[ttg-note]: https://gitlab.haskell.org/ghc/ghc/-/blob/master/compiler/Language/Haskell/Syntax/Extension.hs
[lean-syntax]: https://github.com/leanprover/lean4/blob/master/src/Init/Prelude.lean

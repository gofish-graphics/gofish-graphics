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
  - packages/gofish-graphics/src/serialize/toJSON.ts
  - packages/gofish-graphics/src/serialize/fromJSON.ts
  - packages/gofish-graphics/src/serialize/registry.ts
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
| JS-side deserializer (`Serialize.buildChart`, `mapMark`, …)                                             | `packages/gofish-graphics/src/serialize/fromJSON.ts`                       |
| Operator/mark factory registry                                                                          | `packages/gofish-graphics/src/serialize/registry.ts`                       |
| Generated Python factory layer (checked in, CI freshness-checked)                                       | `packages/gofish-python/gofish/_generated.py` (from `scripts/generate.ts`) |
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
list as a `Promise<Mark[]>` (e.g. from `For(...)` helpers); the emitter
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
const result = Frontend.validate(doc, { strict: true });
if (!result.valid) console.error(result.errors);
```

`strict: true` rejects unknown fields (for tests + CI); the default
permissive mode ignores them for forward-compatible reading.

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

The root types mirror the v3 fluent builder shapes:

- `ChartIR` — `{ type: "chart", data?, operators?, mark, connect?, options?, zOrder? }`
- `LayerIR` — `{ type: "layer", charts, options? }` (each `charts` tier is a
  `ChartIR`, or a `RawMarkIR` for a component-level annotation tier from the v3
  `chart(...).layer(mark)` builder chain)
- `RawMarkIR` — `{ type: "raw-mark", mark, options? }`

`data` is either `{type: "inline", rows}`, `{type: "select", layer}`,
`{type: "external", id?}`, or `{type: "previous-tier"}` — the last marks an
empty `chart()` scope inside a `builder: true` layer chain ("inherit the
previous tier's marks"). The deserializer maps it to the JS
`PREVIOUS_LAYER_MARKS` sentinel so the real `LayerBuilder.wireTiers()` derives
the auto-naming + `selectAll` wiring at resolve time — the producer's
auto-minted layer name never appears in the IR (mirroring how `connect` keeps
its resolve-time markers out of the JSON). Operators are a flat list (`derive`, `resolve`,
`join`, `spread`, `stack`, `group`, `scatter`, `table`, `log`) — note `join`
inlines its right-hand table as JSON rows, so unlike `derive` it round-trips
without a bridge. Marks are a tree — leaves
(`rect`, `circle`, `blank`, `ellipse`, `petal`, `text`,
`image`, `polygon`, plus the Python-bridge `mark-fn`), combinators (with
`__combinator: true` and a `children` array — `layer`, `spread`, `stack`,
`arrow`, `line`, `ribbon`, `treemap`, and the Porter-Duff family), refs, or the
two self-discriminating wrapper marks `offset` and `cut` (below).

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

- used as a chart `.mark(...)` → the v3 expand-mark form (`cutMark` /
  `source.cut(opts)`), so a chart flow treats it as an expand mark;
- used as a **combinator child** (inside a Spread/Stack `children` array) → the
  deserializer expands it in place into its N slice nodes — the pure
  `cut(source, opts)` returns a `Promise<GoFishNode>[]` that combinators accept
  directly as children (see `mapMarkChildren` in `fromJSON.ts`).

`ChartIR.connect` is the optional connector mark from the v3 builder's
[`.connect(line())`](/js/api/core/connect) sugar. It carries an ordinary
`MarkIR` — no special shape — and elaboration is entirely JS-side: at resolve
time `ChartBuilder.resolve()` rewrites the chart into a layer holding the
chart's mark plus a sibling layer that refs those nodes and draws the connector
with `zOrder(-1)`. When the chart's mark carries a string `.name(...)`, the
targets are that registered layer (the manual `selectAll(name)` semantics);
otherwise the produced nodes are tagged directly with a resolve-time Symbol
marker — no name exists to mint or leak, so the JSON stays the user's spelling.

A chart's **coordinate transform** rides the IR as a small spec the deserializer
maps back to the JS factory by `type` — e.g. `{ type: "polar", innerRadius,
centralAngle, startAngle, direction, center }`. `fromJSON.ts` reconstructs it by
calling `polar(coordSpec)` / `clock(coordSpec)` and passing the whole spec
through (the factory ignores the `type` key), so a parameterized polar/clock —
donut hole, partial fan, start angle — round-trips without per-option plumbing.
The parity render harness (`tests/harness/main.ts`) rebuilds it the same way.

Channel values (`h`, `w`, `fill`, …) accept bare primitives (the
shorthand path) or one of three explicit tagged objects:

- `field(name)` → `{type: "field", name}` — per-row accessor, scaled.
- `datum(x)` → `{type: "datum", datum: x, measure?}` — inline value, scaled.
- `literal(x)` → `{type: "literal", value: x}` — inline constant, not scaled.

These three mirror Vega-Lite's `field` / `datum` / `value` trichotomy.

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
`arrow`, `line`, `ribbon`, `treemap`, Porter-Duff) rather than the leaf-mark
registry — same `type` discriminator namespace, different code path.

## The descriptor table — one authored source for construct field lists

Before the change described in this section, a construct's field list
(what keys `rect` or `spread` accept, which are required, what they
default to) was hand-duplicated across four places: the TS type in
`schema.ts`, the field checks in `validate.ts`, the `$defs` in
`jsonSchema.ts`, and the Python factory in `ast.py`. They drifted —
`OPERATOR_TYPES` listed `"treemap"` while the `OperatorIR` union and the
JSON Schema enum omitted it, and the hand-written Python `rect()` exposed
`rs=`/`ts=` kwargs that don't exist anywhere in JS (the real names are
`rSize`/`thetaSize`; they serialized, passed the open-world validator, and
were silently dropped at render).

[`descriptors.ts`](https://github.com/gofish-graphics/gofish-graphics/blob/main/packages/gofish-ir/src/frontend/descriptors.ts)
collapses three of those four into one authored table: one entry per
construct (operator, leaf mark, combinator mark, coord transform) listing
its fields in a small type DSL (`t.string`, `t.number`, `t.enum(...)`,
`t.channel(...)` for a `ChannelValue` slot, `t.ref("AxesOptions")` for a
pointer at an authored envelope `$def`, and so on — see the file's `t`/`ch`
exports). Shared field groups (`boxDims`, the 14 box-geometry/coord-alias
channels; `paint`, the five paint channels) are declared once and pulled
into a mark's entry by reference, so most mark entries list only the
fields genuinely their own.

**What's still authored, not in the table**: the envelope
(`ChartIR`/`LayerIR`/`DataIR`/`MarkIR` union, `ChannelValue`,
`ConstraintIR`, `LabelIR`, `TranslateIR`, `AxesOptions`) and `cut`/`offset`/
`ref` — these are structural or recursive shapes rather than flat field
bags, and stay hand-written in `schema.ts` and `jsonSchema.ts` (the parts
of those files the doc comment marks as "stays hand-written below").
Constraints likewise stay authored.

Three consumers read the table:

- **`validate.ts`** interprets it generically — a single walk over each
  descriptor's resolved fields instead of a per-type imperative switch.
  **Operators keep their original exact accept/reject behavior**: an
  unknown field or a wrong-shaped known one is a hard validation error,
  same as before the refactor. **Leaf marks only warn**, never reject, on
  an unknown or mistyped field — a deliberate rollout stance. Leaf-mark
  channel lists were previously open-world in the IR (`[key: string]:
unknown`) even though they aren't really open on the JS side (a mark's
  real channels are exactly its factory's destructured options); flipping
  straight to strict rejection risked breaking specs that happen to rely
  on a field the descriptor entry hasn't caught up to yet. The warning
  period is the mechanism for finding those gaps safely; once the
  enumerated lists have been checked against the story corpus, leaf marks
  flip to strict like operators. Until then, don't read "validated"
  against a leaf mark's field list as "guaranteed accepted."
- **`jsonSchema.ts`** builds one `$def` per operator (`SpreadOperator`,
  `TableOperator`, …) and one per leaf mark (`RectMark`, `TextMark`, …)
  from the table (`buildOperatorDefs()` / `buildLeafMarkDefs()`), merged
  into the hand-written `$defs` object. Operator `$defs` are
  `additionalProperties: false` (schema-level strict, matching
  `validate.ts`'s operator behavior); leaf-mark `$defs` stay
  `additionalProperties: true` so an external strict consumer of the
  published schema doesn't start rejecting documents our own validator
  only warns about.
- **`gofish-python/scripts/generate.ts`** emits the mechanical part of the
  Python wrapper from the same table — see
  [§ Generating the Python factory layer](#generating-the-python-factory-layer)
  below.

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
    "ChartIR":    { /* type, data, operators, mark, connect, options, zOrder, ... */ },
    "LayerIR":    { /* type, charts, options, ... */ },
    "RawMarkIR":  { /* type, mark, options, ... */ },
    "DataIR":     { "oneOf": [/* inline, select, external, previous-tier */] },
    "OperatorIR": { /* GENERATED oneOf: SpreadOperator | StackOperator | ... | TreemapOperator */ },
    "MarkIR":     { "oneOf": [LeafMarkIR, CombinatorMarkIR, RefMarkIR, OffsetMarkIR, CutMarkIR] },
    "LeafMarkIR": { /* GENERATED oneOf: RectMark | CircleMark | ... */ },
    "LabelIR":      { /* accessor, position, fontSize, ... */ },
    "ConstraintIR": { /* type, options, refs */ },
    "ChannelValue": { "oneOf": [/* primitives, field, datum, literal, bridge sentinels */] }
  }
}
```

The validator at
[`validate.ts`](https://github.com/gofish-graphics/gofish-graphics/blob/main/packages/gofish-ir/src/frontend/validate.ts)
covers the same shapes, generically interpreting the descriptor table as
described above, plus the structural checks for the hand-authored parts
(e.g. `table.by` requires `{x, y}`, `spread`/`stack`/`scatter` accept an
`axes` override of shape `AxesOptions`). It runs in permissive mode by
default (unknown fields ignored, for forward-compat) and strict mode in
CI tests — "strict" here composes with the operator-reject/leaf-mark-warn
split above, it doesn't override it.

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
first) and emits `gofish/_generated.py` — checked into the repo, with a
CI freshness check (`pnpm --filter gofish-python gen` then `git diff
--exit-code`) rather than a build-time step, matching the "commit the
generated Python" norm Altair and Plotly.py both follow. It emits:

- Closed-signature **leaf mark** factories (`rect`, `circle`, `ellipse`,
  `petal`, `text`, `image`, `polygon`, `blank`) — pure kwargs-collection
  plus wire-key rename, with docstrings from each field's `doc`.
- Compositing-quartet and other **combinator-only** marks — the
  Porter-Duff-style renames (`inside`→`intersect`, `xor`→`exclude`,
  `out`→`subtract`, `atop`→`paint`) come from the descriptor's `pyName`,
  killing four previously hand-copied wire-name tables.
- `_opts(...) -> dict` **cores** for the dual-form constructs (`spread`,
  `stack`, `scatter`, `group`, `table`, `treemap`, `line`, `ribbon`,
  `layer`, the polar coord family) — just the kwargs→dict half. The
  polymorphic operator-vs-combinator dispatch stays hand-written in
  `ast.py`, calling into these generated cores.

`derive`/`resolve`/`join` (real RPC-bridge/ref-shape/DataFrame logic) and
`palette`/`gradient`/`field`/`datum`/`normalize`/`repeat`/`ref`/`selectAll`
(not in the descriptor table at all) stay fully hand-written in `ast.py`,
alongside the builder chain, `_RefProxy`, `DatumValue` arithmetic, and the
widget/RPC layer — see
[Design space: generating the Python wrapper](/internals/design/python-wrapper-codegen)
for the full hand-written-residue accounting and what's still deferred
(closing the deserializer-registry/parity-harness generification, the
`.layer()`/constrain-ref-walk follow-ups).

Generating this layer fixed real drift along the way: the hand-written
`rect()` had exposed phantom `rs=`/`ts=` kwargs (see the descriptor-table
section above) that the generator's output doesn't have; `text()` lost a
phantom `fontWeight` and a phantom `label` kwarg that don't exist on the
JS factory, and gained the box-dims channels it was missing.

## Modularity — the registry pattern

Each operator and leaf-mark factory takes an optional `serialize`
config; the factory tags the produced value with `__serialize`
metadata. The emitter (`toJSON`) reads the tag at walk time. Adding a
new operator is a one-line config change to its existing factory call,
not a switch-statement edit.

```ts
// graphicalOperators/spread.tsx
export const spread = createOperator<any, SpreadOptions>(Spread, {
  split: ({ by }, d) => /* ... */,
  channels: { w: "size", h: "size" },
  axisFields: ({ by, dir }) => /* ... */,
  serialize: { type: "spread" },        // <-- new
});

// shapes/rect.tsx
export const rect = createMark(Rect, { w: "size", h: "size", /* ... */ }, "rect");
//                                                                          ^^^^^^
```

Combinator-form marks (`spread([m1, m2])`, Porter-Duff, etc.) tag with
`__combinator: true` and stash the child marks on the tag so the
emitter can walk them. Untagged operators emit as opaque
`{type: "derive"}`; untagged marks throw.

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
- **`ChannelExpr`-only IR** — the v3 API would desugar all shorthand
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

Python's `datum(x)` emits the canonical `{type: "datum", datum: x}` shape
directly — no bridge sentinel needed.

Olli and other pure-JS consumers don't see these — they're a
`FrontendIRWithBridge` extension declared in the Python widget code
(see [The Jupyter Bridge & RPC](/internals/python/bridge)).

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

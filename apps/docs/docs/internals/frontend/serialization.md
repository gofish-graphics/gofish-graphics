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
  - packages/gofish-graphics/src/serialize/toJSON.ts
  - packages/gofish-graphics/src/serialize/fromJSON.ts
  - packages/gofish-graphics/src/serialize/registry.ts
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

| Artifact                                                      | Path                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| Schema types + validator + canonical examples                 | `packages/gofish-ir/src/frontend/`                          |
| JSON Schema (Draft 2020-12)                                   | `packages/gofish-ir/dist/frontend/v0.json` (build artifact) |
| JS-side emitter (`Serialize.toJSON`, `ChartBuilder.toJSON()`) | `packages/gofish-graphics/src/serialize/toJSON.ts`          |
| JS-side deserializer (`Serialize.buildChart`, `mapMark`, …)   | `packages/gofish-graphics/src/serialize/fromJSON.ts`        |
| Operator/mark factory registry                                | `packages/gofish-graphics/src/serialize/registry.ts`        |
| Python emit (existing `to_dict()`), validated against schema  | `packages/gofish-python/gofish/ast.py`                      |

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
import { Chart, spread, rect, Serialize } from "gofish-graphics";
import { Frontend } from "gofish-ir";

const chart = Chart(data)
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(rect({ h: "count" }));

// Three call shapes, all returning Promise<FrontendIRDocument>:
const doc = await chart.toJSON(); // method on ChartBuilder
const doc2 = await Serialize.toJSON(chart); // standalone function
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

- `ChartIR` — `{ type: "chart", data?, operators?, mark, options?, zOrder? }`
- `LayerIR` — `{ type: "layer", charts, options? }`
- `RawMarkIR` — `{ type: "raw-mark", mark, options? }`

`data` is either `{type: "inline", rows}`, `{type: "select", layer}`, or
`{type: "external", id?}`. Operators are a flat list (`derive`, `spread`,
`stack`, `group`, `scatter`, `table`, `log`). Marks are a tree — leaves
(`rect`, `circle`, `line`, `area`, `blank`, `ellipse`, `petal`, `text`,
`image`, `polygon`, plus the Python-bridge `mark-fn`), combinators (with
`__combinator: true` and a `children` array — `layer`, `spread`, `stack`,
`arrow`, `connect`, `treemap`, and the Porter-Duff family), or refs.

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
`arrow`, `connect`, `treemap`, Porter-Duff) rather than the leaf-mark
registry — same `type` discriminator namespace, different code path.

## The JSON Schema

The shipped schema is Draft 2020-12, hand-written, ~280 lines. It lives
in source at
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
    "DataIR":     { "oneOf": [/* inline, select, external */] },
    "OperatorIR": { /* type enum: derive | spread | stack | group | scatter | table | log */ },
    "MarkIR":     { "oneOf": [LeafMarkIR, CombinatorMarkIR, RefMarkIR] },
    "LabelIR":      { /* accessor, position, fontSize, ... */ },
    "ConstraintIR": { /* type, options, refs */ },
    "ChannelValue": { "oneOf": [/* primitives, field, datum, literal, bridge sentinels */] }
  }
}
```

The validator at
[`validate.ts`](https://github.com/gofish-graphics/gofish-graphics/blob/main/packages/gofish-ir/src/frontend/validate.ts)
covers the same shapes plus per-operator field constraints (e.g.
`spread.dir ∈ {"x","y"}`, `table.by` requires `{x, y}`, `spread`/`stack`/`scatter`
accept an `axes` override of shape `AxesOptions`). It runs in
permissive mode by default (unknown fields ignored, for forward-compat)
and strict mode in CI tests.

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

---
title: Using the Frontend IR
section: JSON Formats
group: Frontend
order: 20
status: draft
---

# Using the Frontend IR

> **The IR is unstable.** This page exists so contributors and the
> handful of external consumers (Olli, debugger tooling) have something
> concrete to point at when the question comes up. The schema will get
> breaking renames before it stabilizes — see
> [Frontend IR (Serialization)](/internals/frontend/serialization) for
> the design and what's coming. Don't link this page from user-facing
> docs.

The IR is a JSON document describing a GoFish chart specification before
macro expansion. You can:

- **Emit** it from a JS `ChartBuilder` or a Python `chart(...)` call.
- **Consume** it back into a live `ChartBuilder` (the widget does this).
- **Validate** it against the canonical schema.

## Emit (JavaScript)

```ts
import { Chart, spread, rect, Serialize } from "gofish-graphics";

const builder = Chart(data)
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(rect({ h: "count" }).name("bars"));

// Method on the builder — calls Serialize.toJSON under the hood.
const doc = await builder.toJSON();
```

Four entry points, all returning `Promise<FrontendIRDocument>`:

| Call                                               | When to use                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `builder.toJSON()`                                 | Most common — a `ChartBuilder` from `chart(...).flow(...).mark(...)`.          |
| `Serialize.toJSON(builder)`                        | Same, standalone form.                                                         |
| `Serialize.toJSONLayer(options, [chartA, chartB])` | A multi-chart layer combinator. Pass the layer options and the inner builders. |
| `Serialize.toJSONRawMark(mark, options?)`          | A bare mark used without a chart wrapper.                                      |

All entry points are async because combinator-form marks may carry their
child list as a `Promise<Mark[]>` (e.g. from `For(...)` helpers); the
emitter resolves these to walk into them.

## Emit (Python)

```python
from gofish import chart, spread, rect

builder = chart(data).flow(spread(by="lake", dir="x")).mark(rect(h="count"))
doc = builder.to_ir()      # canonical entry — returns a dict
doc_alias = builder.to_dict()  # equivalent
```

`LayerBuilder.to_ir()` and bare `Mark.to_ir()` work the same way.

The Python IR carries
[bridge-extension sentinels](/internals/frontend/serialization#bridge-extensions-python-widget)
(`__gofish_lambda`, `__gofish_token`, `__scope`, `__datum`, `__key`) that
the canonical schema doesn't include — they're for round-trip with the
widget. Pure-JS consumers shouldn't see them.

## Consume

Going the other way — turning an IR back into a runnable `ChartBuilder`
on the JS side:

```ts
import { Serialize } from "gofish-graphics";

const resolveToken = Serialize.makeTokenResolver();
const builder = Serialize.buildChart(
  chartIR,
  /* data rows for inline charts */ data,
  /* bridge for Python lambdas — optional */ undefined,
  resolveToken
);

await builder.render(container, { w: 500, h: 300, axes: true });
```

For finer-grained reconstruction:

| Function                                              | Returns              |
| ----------------------------------------------------- | -------------------- |
| `Serialize.buildChart(chartSpec, data, bridge?, tok)` | `ChartBuilder<any>`  |
| `Serialize.mapOperator(opSpec, bridge?)`              | `Operator<any, any>` |
| `Serialize.mapMark(markSpec, bridge?, tokenResolver)` | `Mark<any>`          |

The `bridge` argument is a `Serialize.DeriveBridge` — required only if
the IR contains `derive` operators or `{__gofish_lambda}` sentinels
(both Python-bridge concerns). A pure-JS-emitted IR doesn't need one;
pass `undefined`. The widget's bridge implementation lives in
`packages/gofish-python/widget-src/index.ts` if you need a reference.

`makeTokenResolver()` returns a fresh per-render resolver that mints
stable JS `Token` instances for the `{__gofish_token, __tag}` sentinels
the Python wrapper emits.

## Validate

```ts
import { Frontend } from "gofish-ir";

const result = Frontend.validate(doc, { strict: true });
if (!result.valid) {
  console.error(result.errors);
  // [{ path: "$.root.mark.label.accessor", message: "expected string, got null" }, ...]
}
```

- **Strict mode** rejects unknown fields. Use this in tests and CI.
- **Permissive mode** (the default) ignores unknown fields. Use this
  for forward-compatible reading — consumers should not break when the
  schema grows.

The JSON Schema artifact is at `packages/gofish-ir/dist/frontend/v0.json`
(emitted during build); use it with any external validator (Python
`jsonschema`, Ajv, language servers, etc.). The
[Full JSON Schema](/internals/frontend/schema-json) page renders the
whole document inline if you just want to read it.

## What round-trips and what doesn't

`toJSON → validate → fromJSON → render` works for the standard library:
spread, stack, scatter, group, table, log; rect, circle, line, area,
blank, ellipse, petal, text, image, polygon; layer, arrow, connect,
treemap, Porter-Duff; refs, named layers via `.name("...")`, chained
`.label(accessor, options)`, chart options, constraints. The round-trip
is verified end-to-end against every storybook chart in CI.

The current gaps:

- **JS-only `derive(fn)`** emits as `{ type: "derive" }` with no
  `lambdaId` (function bodies don't serialize). `mapOperator` throws on
  deserialize with a message explaining why. The Python wrapper emits
  derives with a `lambdaId` keyed into the bridge registry — those
  round-trip fine through the widget.
- **`Token` names** from `.name(createName("foo"))` aren't carried into
  the IR by `toJSON` yet (string names are). Tokens need a stable
  per-document id scheme; deferred. `mapMark` does resolve the
  Python-side `{__gofish_token}` sentinels via the token resolver.
- **`arrow` / `connect` / `treemap` combinator-form marks** are built
  via a different factory (`createNodeOperator`) and aren't tagged in
  v0. The widget still deserializes them — only emit-from-JS misses
  them. The emitter throws "encountered an untagged mark" if you try
  to `toJSON` a chart using one. v0.1+ work.
- **User-defined custom marks** via the no-channels
  `createMark((data, props) => …)` overload emit as `{ type: "rect" }`
  or whatever shape they wrap; the original component identity is not
  recovered. Olli treats `name` as a semantic boundary, which works
  around this for accessibility use cases.

## When to use the API

Three legitimate cases today:

- **Debugging.** Dump the IR for a chart to compare what your fluent
  code produced against what you expected. The schema is small enough
  to scan by eye.
- **Cross-language parity tests.** The `validate-python-ir` script in
  `tests/scripts/` shells `derive-server.py` for each Python story, wraps
  the response into a `FrontendIRDocument`, and validates it against
  the canonical schema in CI.
- **The Olli adapter.** Olli walks the IR to expose mark boundaries,
  labels, and axes to assistive technology. The bridge-extension
  sentinels are stripped before Olli sees the document.

If you find yourself reaching for the API for any other reason, ask
in #gofish before relying on the shape — it's likely to change.

## Pointers

- [Frontend IR (Serialization)](/internals/frontend/serialization) —
  schema design, multi-stage plans, prior-art lineage.
- [The Jupyter Bridge & RPC](/internals/python/bridge) — the
  anywidget transport, RPC, and the Python-widget sentinels documented
  in the Frontend IR essay's "Bridge extensions" section.
- Source: `packages/gofish-ir/src/frontend/{schema,validate,jsonSchema,examples}.ts`,
  `packages/gofish-graphics/src/serialize/{toJSON,fromJSON,registry}.ts`.
- Validator at runtime: `Frontend.validate(doc, { strict?: boolean })`.
- JSON Schema artifact: `packages/gofish-ir/dist/frontend/v0.json` (build output).

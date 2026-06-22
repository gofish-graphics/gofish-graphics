# gofish-ir

Serialized intermediate representation (IR) for GoFish chart specifications.

This package provides the canonical TypeScript types, runtime validator, and
(coming soon) JSON Schema for the JSON-serializable form of a GoFish chart —
the artifact produced by the v3 fluent API at construction time, consumed by
downstream tools (the renderer, the Python bridge, and the Olli accessibility
adapter).

## Status

**v0 — frontend stage only.** This release publishes the IR captured at the
_frontend_ of the GoFish compiler: the chart specification before macro
expansion and elaboration. The schema matches the existing widget wire
format exactly (lowercase `type` discriminators, `__combinator` flag on
combinator-form marks, channel slots accept strings/numbers/sentinels). This
is intentional — v0 is "publish what already exists" so consumers can ship
against a typed schema today.

Subsequent breaking releases will layer in the design improvements documented
in the architecture essay at
[`apps/docs/docs/internals/frontend/serialization.md`](../../apps/docs/docs/internals/frontend/serialization.md):
PascalCase type tags, the `field`/`datum`/`literal` channel-expression split,
the `__combinator` removal, side-table-free inline annotation, etc. Each is a
lockstep migration across Python + JS + Olli.

## Usage

```ts
import { Frontend } from "gofish-ir";

const spec: Frontend.FrontendIRDocument = {
  irVersion: 0,
  ir: "gofish-frontend",
  root: {
    type: "chart",
    data: { type: "inline", rows: [{ category: "A", value: 5 }] },
    operators: [{ type: "spread", by: "category", dir: "x" }],
    mark: { type: "rect", h: "value" },
  },
};

const result = Frontend.validate(spec);
if (!result.valid) {
  console.error(result.errors);
}
```

## Design

See
[`apps/docs/docs/internals/frontend/serialization.md`](../../apps/docs/docs/internals/frontend/serialization.md)
for the full design discussion: schema-shape decisions, multi-stage strategy,
prior-art lineage (ESTree/Babel, GHC HsSyn/HIE, Lean Syntax/Expr, Vega-Lite),
and what v0.1+ will change.

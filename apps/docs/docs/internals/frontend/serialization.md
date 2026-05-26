---
title: Frontend IR (Serialization)
section: Frontend
order: 80
status: speculative
---

# The Frontend IR

This essay sketches a serialized intermediate representation (IR) for GoFish's
frontend syntax — the form a chart author writes via `chart(data).flow(...).mark(...)`,
captured _before_ macro expansion, lowering, or elaboration. It is a portable JSON
artifact, intended for three audiences:

- **[Olli][olli]**, an accessibility library that consumes declarative chart
  specifications and exposes their semantic structure (named marks, labels, axes,
  hierarchy) to assistive technology. Olli's existing Bluefish adapter ([source][olli-bluefish])
  has to capture Bluefish's imperative execution to recover this structure, which
  is brittle. A declarative IR sidesteps that.
- **The Python wrapper.** A natural compilation target — Python already builds
  something IR-shaped and ships it across the anywidget bridge to the JS runtime
  (see [Python · The IR Bridge](/internals/python/ir)). Promoting that ad-hoc
  shape to a first-class schema lets the two halves share types.
- **Future internal tooling** — debuggers, serialized-scenegraph testers,
  alternative renderers, parity-test harnesses. The bias is _write the format
  consumers want_, not _dump the in-memory AST_.

The design is intentionally pre-implementation — this page is a record of the
options considered and the path recommended. When v0 lands, this essay flips
from `speculative` to `draft` and grows a `covers:` list pointing at the real
code.

## Background: why this isn't trivial

Two facts shape everything below.

### Fact 1 — Today, frontend intent is captured as closures, not as a tree

The v3 builder pipeline is _executed_, not _constructed_. `chart(data)` returns a
`ChartBuilder`; `.flow(op1, op2)` accumulates two `Operator<T,U>` functions —
opaque closures over their options. `.mark(m)` accumulates a `Mark<T>` function.
`.resolve()` runs the operators continuation-passing-style over the mark, then
calls the composed mark on the data, producing a `GoFishNode` tree — the
elaborated, post-encoding scenegraph the layout engine walks.

The fluent surface collects no data structure beyond the operator/mark array and
options. **User intent lives inside lambdas**, not in any inspectable value.

The Python wrapper has the same shape on paper but solves the inspectability
problem by building explicit objects: Python's `Mark`, `Operator`, `ChartBuilder`
classes hold structured `kwargs` and emit `{"type": "…", ...}` dicts via
`to_dict()`. The TS widget at `packages/gofish-python/widget-src/index.ts`
consumes those dicts via `mapMark` / `mapOperator` / `buildChart`, the
`ChartSpec` / `MarkSpec` / `OperatorSpec` interfaces defining the wire shape.

So **a de-facto frontend IR already exists**, in two halves, undocumented and
factored awkwardly:

- Python emits it (`gofish-python/gofish/ast.py`).
- JS consumes it (`gofish-python/widget-src/index.ts`).
- Nothing on the pure-JS side emits it.

The task this essay describes is therefore not "design an IR from scratch." It
is **extract that schema, add a JS-side emitter, and document it**.

### Fact 2 — Macros (in the strong sense) don't exist yet either

The brief talks about labels and axes being macro-expanded into primitive
marks. Read the code and you find this is aspirational: today, `node.label(...)`
sets a `LabelSpec` field on the same node, which the renderer emits inline at
draw time; axes are read from `chart` options and emitted inline by the `Frame`
renderer. They are _render-time concerns_, not separate nodes in any tree.

That means "the frontend stage" today is _almost_ the same as "what the user
typed" — there is no discrete elaboration pass to be the cut-line. We are
defining the cut, not observing it. The serialized format is the thing that
fixes where the line will be.

## Design space

Five questions need answers; the rest of the essay defends one path through them.

1. **Schema shape.** Tagged-union JSON, pass-parameterized AST, or untyped tree
   with typed views?
2. **Where the code lives.** In `gofish-graphics`, a new package, or per-stage
   packages?
3. **Modularity.** How does adding a new operator extend the IR?
4. **Multi-stage future.** Where do post-elaboration, underlying-space
   annotations, pre-render forms live?
5. **Versioning.** How is the schema evolved without breaking consumers?

### 1. Schema shape — closed tagged-union JSON

Three candidates exist in the prior art:

**(a) Tagged-union JSON** — every node is a flat object with a discriminator
field. The pattern of [ESTree][estree] and [Babel][babel-types] for JS ASTs,
and [Vega-Lite][vega-lite] for chart specs. Each node type is a TypeScript
interface; `node.type === "Spread"` narrows the union.

**(b) Pass-parameterized AST** — one node type per construct, with a type
parameter ranging over compilation passes; per-constructor _extension type
families_ attach pass-specific payloads. This is [GHC's "Trees That
Grow"][ttg-note] (`compiler/Language/Haskell/Syntax/Extension.hs`), the
mechanism by which `HsExpr p` carries `RdrName` after parsing, `Name` after
renaming, and `Id` after typechecking, with the same constructors throughout.

**(c) Untyped tree with typed views** — one open `Syntax = node(kind, args[]) |
atom | ident | missing` representation; per-category typed views (`TSyntax k`)
constrain access in the host language without changing the runtime shape. This
is [Lean 4][lean-syntax] (`src/Init/Prelude.lean:4942`).

Each shape on the same example, `chart(seafood).flow(spread({by: "lake", dir:
"x"})).mark(rect({h: "count", fill: "species"}).name("bars"))`:

```jsonc
// (a) Tagged-union JSON
{
  "type": "Chart",
  "data": { "type": "Inline", "rows": [...] },
  "operators": [
    { "type": "Spread", "by": "lake", "dir": "x" }
  ],
  "mark": {
    "type": "Rect",
    "h":    { "type": "Field", "name": "count" },
    "fill": { "type": "Field", "name": "species" },
    "origin": { "name": "bars" }
  }
}
```

```jsonc
// (b) Pass-parameterized
{
  "type": "Chart", "pass": "frontend",
  "operators": [{ "type": "Spread", "pass": "frontend", "by": "lake", "dir": "x", "x": {} }],
  "mark":      { "type": "Rect",   "pass": "frontend", "h": "count", ..., "x": {} }
}
```

```jsonc
// (c) Lean-style open tree
{ "kind": "Chart", "args": [
    { "kind": "Inline.data", "args": [...] },
    { "kind": "operators",   "args": [
        { "kind": "Spread", "args": ["lake", "x"] }
    ] },
    { "kind": "Rect", "args": ["count", "species"], "annotations": { "name": "bars" } }
] }
```

The decision: **(a) closed tagged-union JSON**.

Why not (b)? Two independent prior-art reports converge on this: GHC's
phase-parameterized in-memory AST [is famously never serialized][ttg-note]. The
serialized form is `.hie` files (`compiler/GHC/Iface/Ext/Types.hs`), a
_different_ IR that collapses across passes and uses a side-table for
per-node type info. Lean 4 likewise has no canonical JSON form of `Syntax` —
the LSP info-view sends pretty-printed text. Even the canonical pass-tagged
ASTs decline to wear their pass-tags on the wire. TTG's value is type-checked
exhaustiveness in the host language; JSON has no equivalent, and TypeScript's
phantom-`Pass` parameter would only inflate every type without giving Python
or Olli anything.

Why not (c)? Lean's open shape is forced by Lean being a general meta-language:
every macro author invents new node kinds. GoFish's operator/mark vocabulary is
finite and library-owned. The price of openness — opaque `args` arrays, typed
views available only in the host language — would buy nothing.

The shape is the same as the existing widget IR. The discriminator field is
**`type`**, matching ESTree/Babel and the v1/v2 widget interfaces; not `kind`,
which is reserved for the small internal `UnderlyingSpace` tagged union
(`underlyingSpace.ts:18-51`) and for runtime tag bundles in the layout core.

#### Closed enumeration + named escape hatches

Choosing (a) at the schema level still leaves a question: is the _set_ of node
`type`s closed or open? The library's standard library of marks and operators is
finite — the trichotomy is then closed-tree-shape **plus** closed-standard-library
**plus** a small set of named escape-hatch constructors:

- The standard library — `Rect | Circle | Line | … | Spread | Stack | …` — is a
  finite TypeScript union with full narrowing, JSON Schema `oneOf` + `const`
  validation, and exhaustive pattern-match for Olli.
- Extension happens through **named escape-hatch constructors**: `CustomMark`
  (for user-defined marks built via `createMark`) and `CustomOperator` (for
  any user-defined operator). Each is a known `type` the schema reserves;
  the payload is `{ type: "CustomMark", name: string, props, children? }`
  (parallel for `CustomOperator`). Olli recognizes the escape-hatch type
  as a semantic boundary without needing to know specific names.

This is essentially Lean's `Syntax.node(kind, args)` openness — but the opening
lives in two named slots rather than at every node, which preserves type
narrowing and JSON-Schema validation for the 90% case while not closing the
door on user extension. The registry from §3 is then "the standard library is
built by the same `defineOperator` / `defineMark` pattern internally; user code
calling `createMark(...)` lands on `CustomMark` at emit time."

### 2. Package layout — one schema package, co-located emitters

Four candidates:

| Option                | Schema                                                       | Emitter / Deserializer                    |
| --------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| A. In-tree            | `gofish-graphics/src/serialize/`                             | same                                      |
| B. One new package    | `gofish-ir` (just exports types)                             | `gofish-ir` (also exports emitter)        |
| C. Per-stage packages | `gofish-frontend-ir`, `gofish-core-ir`, `gofish-rendered-ir` | each package                              |
| D. Hybrid             | `gofish-ir` types + validator                                | emitters live with the code they describe |

(A) pushes Olli into depending on `gofish-graphics` to consume the schema —
that pulls SolidJS, the rendering engine, and font utilities. Multi-megabyte for a
consumer that wants types only.

(C) is premature: stage boundaries are not yet sharp (today there is no
post-elaboration form), and shipping three packages before two consumers exist
is build-system churn without payoff.

(B) and (D) are close. The chosen path is **(D) hybrid**:

```
packages/gofish-ir/                          NEW. types + validator + JSON Schema.
  src/frontend/{schema,validate,examples,index}.ts
  src/index.ts                               Re-exports `Frontend` namespace.

packages/gofish-graphics/src/serialize/      NEW directory.
  toJSON.ts                                  Walk ChartBuilder → FrontendIR (the new JS emitter).
  fromJSON.ts                                Refactored from widget-src/index.ts.
  registry.ts                                Per-operator / per-mark IR registry (see §3).

packages/gofish-python/widget-src/index.ts   Trim: delete duplicated mapMark/mapOperator/
                                             buildChart, import from gofish-graphics/serialize.
```

The schema is small and stable and wants its own light package so Olli depends
on types-only. The emitters and deserializers are large, change with the
surface API, and want to live next to that API — Babel's `@babel/types`
[`packages/babel-types/src/definitions/`][babel-types-defs] is the model. The
Python `ast.py` emits IR-shaped dicts today; in a later step it gains a mirror
`gofish_ir` Python package, but for v0 it just emits-as-before with a
documentation pointer at the JS schema.

If multi-stage IRs ever land (§4), `gofish-ir` grows additional sub-namespaces
(`Core`, `Rendered`); package boundaries don't need to move.

### 3. Modularity — the Babel registry pattern, hand-written

The brief asks for modularity "like the rest of the system." Reading the
codebase, the rest-of-the-system pattern is:

- Marks are added via [`createMark(shapeFn, channels)`](/internals/frontend/mark-factory)
  in a per-shape file under `shapes/`.
- Operators are added via [`createOperator(layoutFn, config)`](/internals/frontend/operator-factory)
  in a per-operator file under `graphicalOperators/`.

So "modular" means one factory call per module, with the runtime _and_ the
metadata (channels, axis fields, …) produced from a single declarative config.
The IR should follow suit: extend each factory's config with an optional
`serialize` block, and let the factory tag the produced operator/mark with the
IR descriptor.

[Babel's `defineType`][babel-types-utils] is the proven recipe at scale: one
declarative call per node type writes into module-level maps
(`VISITOR_KEYS`, `NODE_FIELDS`, `BUILDER_KEYS`, `ALIAS_KEYS`). At Babel's scale
(~200 node types) the TS interfaces are _codegenned_ from the registry. GoFish
has ~20 operators and ~10 marks; codegen is overkill. **Hand-write the TS
interfaces; adopt the registry idea.**

Sketch:

```ts
// packages/gofish-graphics/src/ast/graphicalOperators/spread.tsx
export const spread = createOperator<any, SpreadOptions>(Spread, {
  split: ({ by }, d) => /* ... */,
  channels: { w: "size", h: "size" },
  axisFields: ({ by, dir }) => /* ... */,
  serialize: {
    type: "Spread", // IR discriminator
    // shape?: (opts) => Partial<IRPayload> — default: copy opts verbatim
  },
});
```

The factory, on each call, tags the returned operator function with
`(operator as any).__serialize = { type: "Spread", opts }`. This piggybacks on
the same metadata-attachment mechanism `__axisFields` already uses
(`createOperator.ts:407`).

`ChartBuilder.toJSON()` walks `this.operators`, reads each operator's
`__serialize` tag, and emits the IR. An operator without a tag — e.g. one built
via `derive(fn)` from a user-supplied function — falls back to `{type:
"Derive"}` with an optional `source?: string` debug field; the function body is
not serializable.

Adding a new operator becomes a one-line change to its existing factory call.
Olli ships against the registry, not a hardcoded switch — a third party
defining a custom operator can register it and consumers can introspect.

GoFish thereby **improves on Vega-Lite's design**: VL's marks are a closed
const-object (`src/mark.ts:11-28`); third parties cannot add marks without
forking and special-casing `PRIMITIVE_MARKS` / `PATH_MARKS` / `isRectBasedMark`
([vega-lite][vega-lite]). The registry approach inverts that.

### 4. Multi-stage future — sibling schemas across stages, inline annotations within a stage

The user has stated three eventual stages: pre-macro (Olli's stage), post-macro
/ post-elaboration (with explicit axis / label nodes), and pre-render (with
resolved scales and positions). They also want to attach **underlying-space-type
annotations** somewhere between pre-macro and post-elaboration.

Two questions, not one: _how do distinct stages relate?_, and _how does a single
stage carry annotations added by later passes?_

#### Distinct stages → sibling schemas

The two strongest prior-art signals say "two types, not one type with a flag":

- **Vega-Lite and Vega are wholly separate JSON schemas in separate packages** —
  `vega-lite/build/vega-lite-schema.json` (authoring) and
  `vega/packages/vega-schema/vega-schema.json` (runtime) — sharing zero types.
  The compile pipeline at `src/compile/compile.ts:43-65` is a one-way
  transform. VL's internal `NormalizedSpec` is TS-only, not published. See
  [vega-lite][vega-lite].
- **Lean splits pre-elaboration `Syntax` from post-elaboration `Expr` as two
  distinct inductives** — not one inductive with a pass tag
  (`src/Lean/Expr.lean:298` vs `src/Init/Prelude.lean:4942`).

Adopt this. Frontend, Core, and Rendered stages each get their own root
document type, living in the same `gofish-ir` package as `frontend/`, `core/`,
`rendered/` sub-namespaces; cross-stage helpers (`elaborate`, `layout`) live
there too.

#### Within a stage → inline annotations (default), side-tables (asymmetric exception)

Three candidates for how a later pass attaches per-node metadata (underlying
spaces, resolved scales, source positions, name-resolution scopes):

**(i) Inline annotation.** Each node carries an optional `meta?` slot. Later
passes write `node.meta.space`, `node.meta.scale`, etc. This is the
[Trees-That-Grow][ttg-note] pattern: per-constructor extension fields _on the
node itself_ (`compiler/Language/Haskell/Syntax/Expr.hs:330-356`). It is also
how ESTree carries `loc`, how Babel carries `loc`/`start`/`end`/`range`/`extra`
on `BaseNode`, and how Lean carries `SourceInfo` on every `Syntax` constructor.

**(ii) Side-table.** Tree stays byte-identical; annotations live in top-level
dictionaries keyed by stable node IDs:

```json
{
  "root": { /* tree */ },
  "spaces": { "<nodeId>": { "type": "SIZE", ... } }
}
```

This is GHC's `.hie` file pattern (`compiler/GHC/Iface/Ext/Types.hs`, `Note
[Efficient serialization of redundant type info]`) — a _separate_ IR from
TTG, used for _serialization_, motivated by **dedup of large recurring type
payloads**.

**(iii) Sibling schemas all the way down.** Treat each annotation pass as its
own stage with its own schema. Too heavy; rejected immediately.

The honest tradeoffs:

|                                                                 | Inline (TTG, ESTree, Lean)               | Side-table (GHC HIE)                        |
| --------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| Annotation locality (debug-ergonomic)                           | yes                                      | cross-reference by ID                       |
| Stable node IDs required on every node                          | no                                       | yes — emitter must thread; bloats JSON      |
| Dedup of recurring payloads                                     | no                                       | yes — but only matters for _large_ payloads |
| Byte-identical tree across passes                               | no — but consumers ignore unknown fields | yes                                         |
| Multiple annotation passes write independently                  | tree mutation (or rebuild)               | each pass owns its dict                     |
| Cross-node refs (e.g. scope links)                              | awkward                                  | natural                                     |
| Externally-produced annotations (sourcemap-style separate-file) | awkward                                  | natural                                     |

For GoFish, **inline wins on every dimension that's load-bearing here**:

- Annotations are small. `UnderlyingSpace` is `{type: "SIZE"|"POSITION"|...}`
  — a handful of bytes per node. GHC's dedup rationale (Haskell types are
  large structural objects) doesn't transfer.
- No stable-ID infrastructure to build. Threading deterministic IDs through
  the emitter, keeping them stable across re-emits, defining what changes
  invalidate them — all real cost for no payoff today.
- Locality matters. An Olli adapter or a debugger reads `node.meta?.space`
  next to the node it's classifying.
- Consumers ignore unknown fields anyway. The "byte-identical tree" promise
  is partly mythical: a forward-compat consumer behaves the same whether new
  data lands on the node or in a sibling dict.

**Decision: inline by default**, via an optional `meta?: Meta` slot on every
node. `Meta` is a small open record of well-known optional fields, defined
incrementally as each annotation pass lands. v0 leaves `Meta` absent
everywhere.

**Side-tables remain available as an opt-in for asymmetric cases**: cross-node
references that don't fit a tree shape (name-resolution scopes pointing across
the tree), annotations produced by a _separate process_ and shipped as a
separate file (sourcemap-style), or payloads large enough that dedup measurably
wins. None apply to GoFish today; none get reserved slots in v0.

No stable IDs in v0. If a future consumer needs them (round-trip diffing
keyed by node, a Python ↔ JS cross-reference scheme), they can be added
without a breaking change.

### 5. Versioning — `$schema` URL with major aliasing, no compat shims

Vega-Lite's `$schema` pattern (`scripts/deploy-schema.sh`) deploys a stable URL
with major-version aliases:
`https://vega.github.io/schema/vega-lite/v6.json` → `v6.4.json` → `v6.4.3.json`.
Authors usually pin to the major; the latest minor wins.

Adopt the same:

- Top-level `irVersion: 0` (integer) on every IR document.
- Optional `$schema` URL: `https://gofish.graphics/schema/frontend/v0.json`.
- No compat layer between major versions — GoFish has near-zero external
  users; lockstep migrations are cheap.
- Additive changes (new operator, new opt) do not bump the version.
- Validator with a `strict` flag: default-permissive (unknown fields ignored)
  for forward-compat reading; strict in CI and Python tests.

JSON Schema is generated from TypeScript types via `ts-json-schema-generator`
(Vega-Lite's approach), or hand-written at v0 since the schema is small.

## Schema sketch

Concrete TypeScript shape for v0 (frontend stage). Discriminator field is
`type`. Every node mixes in an optional `origin` (the user-supplied
`.name("bars")` and any captured source location) and an optional `meta` slot
reserved for annotations attached by future passes (§4).

```ts
// packages/gofish-ir/src/frontend/schema.ts (sketch)

export type FrontendIR = {
  irVersion: 0;
  ir: "gofish-frontend";
  $schema?: string;
  root: RootIR;
};

export interface BaseIRNode {
  origin?: Origin;
  meta?: Meta; // reserved for later-pass annotations; unset in v0
}

export interface Origin {
  name?: string; // .name("bars")
  sourceLoc?: { file: string; line: number; column: number };
  stack?: string; // optional builder-time capture
}

export interface Meta {
  // Reserved slots. v0 leaves Meta absent everywhere; later passes populate
  // the relevant field. Open-typed so a custom pass can add its own key
  // without a schema bump.
  space?: SpaceAnnotation; // populated by underlying-space resolution
  scale?: ScaleAnnotation; // populated by scale resolution
  [key: string]: unknown;
}

export type RootIR = ChartIR | LayerIR | RawMarkIR;

export interface ChartIR extends BaseIRNode {
  type: "Chart";
  data: DataIR;
  options?: ChartOptionsIR;
  operators: OperatorIR[];
  mark: MarkIR;
  as?: string; // sugar for origin.name
}

export type OperatorIR =
  | ({
      type: "Spread";
      by?: string;
      dir: "x" | "y";
      spacing?: number /* ... */;
    } & BaseIRNode)
  | ({ type: "Stack"; by?: string; dir: "x" | "y" /* ... */ } & BaseIRNode)
  | ({
      type: "Scatter";
      by?: string;
      x?: ChannelExpr;
      y?: ChannelExpr /* ... */;
    } & BaseIRNode)
  | ({ type: "Group"; by: string } & BaseIRNode)
  | ({ type: "Table"; by: { x: string; y: string } /* ... */ } & BaseIRNode)
  | ({ type: "Derive"; source?: string } & BaseIRNode)
  | ({ type: "Log"; label?: string } & BaseIRNode)
  | ({
      type: "CustomOperator";
      name: string;
      opts: Record<string, unknown>;
    } & BaseIRNode); // reserved escape hatch (§1)

export type MarkIR = LeafMarkIR | CombinatorMarkIR | RefIR | CustomMarkIR;

export interface LeafMarkIR extends BaseIRNode {
  type:
    | "Rect"
    | "Circle"
    | "Line"
    | "Area"
    | "Blank"
    | "Ellipse"
    | "Petal"
    | "Text"
    | "Image"
    | "Polygon";
  // channel-valued props (h, w, fill, …) — see ChannelExpr
  [key: string]:
    | ChannelExpr
    | string
    | number
    | boolean
    | null
    | undefined
    | unknown;
  label?: LabelIR;
  constraints?: ConstraintIR[];
  zOrder?: number;
}

export interface CombinatorMarkIR extends BaseIRNode {
  type:
    | "Spread"
    | "Stack"
    | "Layer"
    | "Arrow"
    | "Connect"
    | "Over"
    | "Inside"
    | "Xor"
    | "Out"
    | "Atop"
    | "Mask"
    | "Treemap";
  options?: Record<string, unknown>;
  children: MarkIR[];
  label?: LabelIR;
  constraints?: ConstraintIR[];
  zOrder?: number;
}

export interface RefIR extends BaseIRNode {
  type: "Ref";
  selection: string | (string | number)[];
}

export interface CustomMarkIR extends BaseIRNode {
  type: "CustomMark";
  name: string;
  props: Record<string, unknown>;
  children?: MarkIR[]; // opaque to v0 consumers; deserializers register by name
}

export type ChannelExpr =
  | { type: "Field"; name: string }
  | { type: "Datum"; value: number | string | boolean } // per-row value; scaled
  | { type: "Literal"; value: number | string | boolean }; // constant; not scaled

// ... ChartOptionsIR, LabelIR, ConstraintIR, DataIR, LayerIR, RawMarkIR
```

Three notes on this vocabulary:

- **`ChannelExpr` is a three-way trichotomy** mirroring [Vega-Lite][vega-lite]'s
  `field` / `datum` / `value` distinction (see issue [#266][gh-266] for the
  in-repo discussion):

  |        | constant                              | per-row                             |
  | ------ | ------------------------------------- | ----------------------------------- |
  | named  | —                                     | `field("count")` — accessor, scaled |
  | inline | `literal(5)` — constant, _not_ scaled | `datum(5)` — per-row value, scaled  |

  The v3 frontend API exposes all three constructors. The `h: "count"`
  shorthand is sugar that the builder eagerly desugars to `field("count")` at
  construction time. **The IR therefore sees only one canonical form per
  channel slot** — no validator-time string-vs-field disambiguation, no
  two-shapes-on-the-wire. Authors can disambiguate explicitly when needed
  (`literal("0.5")` for a column-name-looking string literal, `field("0.5")`
  for a literal-looking field name).

- **Custom marks are first-class but opaque.** `{type: "CustomMark", name:
"boxAndWhisker", props, children?}` lets Olli treat the name as a semantic
  boundary without recursing. A consumer that wants to expand a custom mark
  registers a deserializer by name, parallel to the widget's existing
  `COMBINATOR_FACTORIES`.

- **Hygienic names (`Token`s) survive as runtime references**, not as IR nodes.
  The deserializer's `makeTokenResolver` pattern works unchanged.

## Operator and mark registry (concrete)

The factory extensions:

```ts
// packages/gofish-graphics/src/ast/marks/createOperator.ts (additions)
export type OperatorConfig<Datum, Options> = {
  split: (opts: Options, d: Datum[]) => SplitResult<Datum>;
  channels?: ChannelAnnotations<Options>;
  axisFields?: (opts: Options) => { x?: string; y?: string };
  // NEW:
  serialize?: {
    type: string; // "Spread", etc.
    shape?: (opts: Options) => Record<string, unknown>; // default: spread opts verbatim
  };
};
```

`createMark` gets the same treatment:

```ts
// packages/gofish-graphics/src/ast/withGoFish.ts (additions)
export function createMark(
  shapeFn: ShapeFn,
  channels?: ChannelAnnotations,
  serialize?: {
    type: string;
    shape?: (props: any) => Record<string, unknown>;
    childKeys?: string[];
  }
): MarkFactory;
```

`toJSON(chart)` walks the chart and emits a `FrontendIR`. For each operator,
read the `__serialize` tag (a falsy tag means opaque — emit `{type: "Derive"}`).
For each mark, read the `__serialize` tag too; recurse into `children` for
combinator marks (the registry's `childKeys` says which slots are
child-bearing).

`fromJSON(ir)` is the existing `mapMark` / `mapOperator` / `buildChart` from
`widget-src/index.ts`, moved into `gofish-graphics/src/serialize/`. The widget
then imports it instead of duplicating; the JS API now has a working
deserializer too.

## A worked example

The motivating snippet, as the v0 IR:

```ts
chart(seafood)
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(rect({ h: "count", fill: "species" }).name("bars"))
  .render(container, { w: 500, h: 300, axes: true });
```

becomes:

```json
{
  "irVersion": 0,
  "ir": "gofish-frontend",
  "$schema": "https://gofish.graphics/schema/frontend/v0.json",
  "root": {
    "type": "Chart",
    "data": {
      "type": "Inline",
      "rows": [
        /* seafood */
      ]
    },
    "options": { "w": 500, "h": 300, "axes": true },
    "operators": [{ "type": "Spread", "by": "lake", "dir": "x" }],
    "mark": {
      "type": "Rect",
      "origin": { "name": "bars" },
      "h": { "type": "Field", "name": "count" },
      "fill": { "type": "Field", "name": "species" }
    }
  }
}
```

(The v3 API would express the channel slots as `field("count")` /
`field("species")` — or accept the `h: "count"` shorthand and desugar it
eagerly before any IR is produced. The IR sees only the explicit form.)

## v0 scope and non-goals

**In scope.** Frontend IR only. Operators: Spread, Stack, Scatter, Group,
Table, Log, Derive. Marks: Rect, Circle, Line, Area, Blank, Ellipse, Petal,
Text, Image, Polygon, plus the combinators Layer, Spread-as-mark, Arrow,
Connect, Treemap, and Porter-Duff. Refs, Tokens, Labels, Constraints, Chart
options (`w`, `h`, `axes`, `color`, `coord`). Round-trip tests against the
existing storybook stories: `toJSON(chart) ∘ fromJSON ∘ render` produces a
byte-identical SVG.

**Not in scope, by design.**

- **No Core / Runtime IR.** Underlying-space resolution, scale resolution,
  layout — all out of scope. They'll get their own essays and their own
  sub-namespaces in `gofish-ir/` when they land.
- **No populated `meta` annotations.** The `meta?` slot is reserved on every
  node; v0 emitters leave it unset.
- **No CustomMark expansion.** Custom marks emit `{type: "CustomMark", name,
props}` and stop. Consumers handle them out-of-band.
- **No inline-function serialization.** `derive(fn)` emits `{type:
"Derive", source?: <text>}`; the function body is gone. Pure-JS consumers
  that want to round-trip a derive keep the original code around. The Python
  bridge already extends with `{__gofish_lambda: id}` for its RPC use; that
  bridge sentinel stays in the _Python-bridge schema extension_ (a separate
  type alias), not the canonical schema.
- **No Python deserializer.** One-way (Python → IR → JS) is the existing flow.
  The inverse (IR → Python ChartBuilder) can wait.

## Risks and open questions

**The `type` rename.** The widget IR already uses `type`. The Python `to_dict()`
output also uses `type` in most places — verify and align in one mechanical
commit. No compat shim, per the project policy.

**Custom-mark / custom-operator escape hatches.** The schema reserves
`CustomMark` and `CustomOperator` as named escape-hatch constructors (§1).
Custom marks built via `createMark((data, props) => …)` already exist in user
code and must land here. Custom operators do not yet have a user-facing
factory (today `createOperator` is library-internal); the `CustomOperator`
slot is reserved for the day one ships. v0 emits _only_ known kinds from the
standard library plus `CustomMark`; emitting `CustomOperator` is unreachable
until a public operator-factory exists.

**Audit of non-`createOperator` operator producers.** The factory-based tagging
mechanism only works for operators that go through `createOperator`. Direct
producers like `derive` (`chart.ts:37`), `log` (`chart.ts:70`), and combinator
marks built via `nameableMark` need explicit serialize tags inserted at their
construction sites. ~6 spots; tractable but easy to miss one.

**Custom marks as opaque boxes.** Worked examples in the pipeline-syntax essay
show `pie`, `boxAndWhisker`, `violin`, `area` defined via `createMark((data,
props) => layer([...]))`. v0 emits these as `{type: "CustomMark", name}` —
fine for Olli (a semantic boundary), but a debugger that wants the expansion
gets nothing. A future `serializableMark(fn, {type, expand?})` factory could
let authors choose between opaque and self-expanding. Out of scope for v0.

**Sub-`Core` IR is not yet designed.** Post-elaboration almost certainly needs
_different_ operator constructors (e.g. an `Axis` node, not just an `axes:
true` option). Core IR will be a sibling schema with its own constructors; v0
makes no commitments to its shape. The Frontend IR preserves the surface
verbatim; the Core IR designer starts from a clean slate.

**Source positions.** A future pass populates `meta.loc` on each node; the
slot is reserved from day one even though unset in v0. Capturing the location
at build time requires `Error().stack` or a language-server hook, which has
Node-vs-browser quirks; defer until a consumer asks.

## Implementation roadmap

| Step | Deliverable                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------- |
| 1    | `packages/gofish-ir/` skeleton — `FrontendIR` types, hand-curated example, `validate`             |
| 2    | Refactor `widget-src/index.ts` → `gofish-graphics/src/serialize/fromJSON.ts` (no behavior change) |
| 3    | Extend `createOperator` / `createMark` with `serialize` config; tag all built-ins                 |
| 4    | Write `toJSON(chart)` emitter; round-trip tests against the storybook                             |
| 5    | Validator passes against existing Python `to_dict()` fixtures; fix schema gaps                    |
| 6    | This essay flips `speculative` → `draft`; `covers:` populated; backlinks regenerated              |
| 7    | Sketch an Olli adapter against the schema (external; informs v0.1)                                |
| 8    | Release `gofish-ir@0.1.0` alongside the next `gofish-graphics` release                            |

## Prior art consulted

These citations are the load-bearing ones — readers researching adjacent
decisions should start here:

- **[ESTree spec][estree]** and **[Babel `@babel/types`][babel-types]**:
  the tagged-union + registry pattern this design adopts.
- **[Vega-Lite][vega-lite]**: the JSON-chart-spec precedent. Lessons learned —
  use an explicit `type` discriminator (VL's signature-key approach in
  `src/transform.ts` forces brittle negative-checks); separate authoring and
  runtime schemas; `$schema` URL versioning. Lessons rejected — closed
  `Mark` set; unordered `encoding` bag (GoFish `.flow()` is ordered).
- **[GHC's Trees-That-Grow][ttg-note]** (`compiler/Language/Haskell/Syntax/Extension.hs`):
  pass-parameterized in-memory AST with per-constructor extension fields _on
  the node_. Lesson learned — annotations go inline, not in a separate
  side-table; this informs the `meta?` slot in §4. The `.hie` file format
  (`compiler/GHC/Iface/Ext/Types.hs`, `Note [Efficient serialization of
redundant type info]`) is a _separate_ IR that uses side-tables; its
  motivation is dedup of large type payloads, which doesn't transfer to
  GoFish's small annotations. Lesson rejected — phantom `Pass` parameter on
  every node in the wire format.
- **[Lean 4 `Syntax` / `TSyntax`][lean-syntax]** (`src/Init/Prelude.lean:4942-5044`):
  the prototypical macro-stage AST with phantom-typed views. Lesson learned —
  pre-elaboration and post-elaboration are structurally _different types_, not
  one type with a flag (`Syntax` vs `Expr`). Lesson rejected — open tree
  shape; phantom-typing for a JSON IR without quasiquotation.

[olli]: https://github.com/umwelt-data/olli
[olli-bluefish]: https://github.com/umwelt-data/olli/blob/jzong/olli-solid/packages/olli-adapters/src/BluefishAdapter.ts
[estree]: https://github.com/estree/estree
[babel-types]: https://github.com/babel/babel/tree/main/packages/babel-types
[babel-types-defs]: https://github.com/babel/babel/tree/main/packages/babel-types/src/definitions
[babel-types-utils]: https://github.com/babel/babel/blob/main/packages/babel-types/src/definitions/utils.ts
[vega-lite]: https://github.com/vega/vega-lite
[ttg-note]: https://gitlab.haskell.org/ghc/ghc/-/blob/master/compiler/Language/Haskell/Syntax/Extension.hs
[ghc-hie]: https://gitlab.haskell.org/ghc/ghc/-/blob/master/compiler/GHC/Iface/Ext/Types.hs
[lean-syntax]: https://github.com/leanprover/lean4/blob/master/src/Init/Prelude.lean
[gh-266]: https://github.com/gofish-graphics/gofish-graphics/issues/266

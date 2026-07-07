---
title: "Design Space: Generating the Python Wrapper"
section: Speculative Notes
order: 62
status: speculative
---

# Design space: generating the Python wrapper from a single source of truth

Today the Python wrapper is written by hand (in practice: by AI, feature by
feature), following the six-step round-trip checklist in `CLAUDE.md`. That
checklist exists because one construct is currently described in **at least
six hand-maintained places**: the JS factory, the deserializer registry, the
parity harness switch, three IR-schema encodings (`schema.ts`, `validate.ts`,
`jsonSchema.ts`), and the Python factory. This doc surveys how much of that
could be generated mechanically, from what source, and what the options are.

## What the audit found

**The Python wrapper** (`packages/gofish-python/gofish/`, ~3,460 LOC):

- Of 45 public names, **~29 (~64%) are purely mechanical**: kwargs collected
  into a `{"type": tag, **opts}` dict, sometimes with a wire-key rename
  (`from_` → `"from"`, `intersect` → `"inside"`). These total well under 500
  LOC and are exactly what a generator would emit.
- The **majority of LOC is infrastructure** a generator would keep hand-written:
  `Mark`/`ChartBuilder`/`LayerBuilder` copy-on-write plumbing, `_RefProxy`
  attribute magic, `DatumValue` arithmetic (`datum(v) + 6`), the derive/lambda
  RPC bridge, the widget/traitlets layer, DataFrame⇄Arrow conversion, and the
  179-line d3 `bin` port (needed only because `derive()` runs in Python and
  must byte-match JS bin edges).
- Confirmed **avoidable elaboration** (the wrapper does more than a shallow
  port needs):
  - `_wire_layer_tier` re-derives the `.layer()` auto-naming + `selectAll`
    rewiring in Python, even though the `builder: true` IR tag exists
    precisely so JS's `LayerBuilder` can own that logic.
  - `ConstrainableMark.constrain` re-implements the JS
    `collectConstraintRefs` tree-walk (documented as a mirror of
    `ast/constraints/index.ts`) so callbacks get refs synchronously.
  - The empty-placeholder Arrow table construction is copy-pasted ~4×.
  - Four wire-name tables (Porter-Duff-style compositing renames, constraint
    type strings, mark type strings, operator type strings) are hand-copied
    from `schema.ts`.

**The IR schema** (`packages/gofish-ir/src/frontend/`):

- The three encodings are genuinely hand-duplicated, not derived, and are
  **already drifting**: `OPERATOR_TYPES` includes `"treemap"` but the
  `OperatorIR` union and the JSON Schema enum omit it.
- Richness is asymmetric. **Operators** are fully typed, doc-commented
  discriminated interfaces in `schema.ts` — an excellent codegen source.
  **Leaf marks are deliberately open** (`[key: string]: unknown`): per-shape
  channel lists (rect's `w,h,fill,rx,…,theta,r`) exist only in the JS factory
  option types — which are inline `FancyDims<T>` unions, not clean exported
  interfaces — and are hand-mirrored in Python. **Coord transforms aren't in
  the IR at all** (they ride the untyped chart `options` bag), even though
  their TS option types (`PolarOptions`) are ironically the _cleanest_
  extraction targets in the codebase (exported alias, JSDoc per field,
  visible defaults).
- The emitted JSON Schema (`dist/frontend/v0.json`) is the _least_ rich
  encoding — a flat option bag per operator, no per-mark fields — so
  "generate from the JSON Schema" à la Altair does not work on today's
  artifact without enriching it first.

## Prior art

- **Altair** is the canonical precedent: its entire low-level API
  (`schema/core.py`, `channels.py`) is generated from the Vega-Lite JSON
  Schema by a ~custom script (`tools/generate_schema_wrapper.py` +
  `schemapi`), with docstrings taken from schema `description` fields; the
  ergonomic `alt.Chart` layer (`api.py`) is hand-written on top.
- **Plotly.py** does the same from plotly.js's `plot-schema.json`
  (`codegen/` emits `graph_objs/` + `validators/`; `basedatatypes.py` is the
  hand-written residue).
- **Both commit the generated Python** to the repo — pip-installability
  without a JS toolchain, IDE navigation, and reviewable diffs on schema
  bumps. Regeneration is a maintainer script + a "never hand-edit generated
  files" rule. This is the community norm; nobody generates at build time.
- **No off-the-shelf tool fits.** `datamodel-code-generator` / `quicktype`
  emit validation-model _classes_, not kwargs factory _functions_; TypeSpec
  targets RPC clients and would be a second source-of-truth DSL; nobody ships
  a TS-types→Python-kwargs generator. Every real precedent is a small custom
  generator (a few hundred lines) walking a schema-like artifact — which is
  the part AI-generated well once, and then never needs AI again.
- Negative result worth noting: **pyecharts and the anywidget ecosystem are
  fully hand-written**. Codegen pays off when the schema churns and is
  centrally owned — which `git log` says is exactly our situation (#617,
  #637, #642, #654 all reshaped the IR recently).

## The design space

### Option A — descriptor table as the single source (recommended)

Add one declarative table to `gofish-ir`, e.g. `descriptors.ts`: one entry
per construct (operator, mark, coord transform, constraint) listing
`{ type, kind, fields: [{ name, wireName?, pyName?, type, required?,
default?, doc }] }`, where `type` is a small type DSL (`"string"`,
`"number"`, `enum(...)`, `channel`, `axes`, …).

Generate from it:

1. **Python factories** (`gofish/_generated.py`, checked in) — kwargs
   signatures, wire-key renames (`from_`→`"from"` comes from
   `pyName`/`wireName`, killing the hand-copied rename tables), docstrings
   from `doc`.
2. **`jsonSchema.ts`** — per-construct `$defs` instead of today's flat bag.
3. **`validate.ts`'s per-type field checks** — either generated, or better,
   replaced by a ~100-line generic interpreter that walks the descriptor
   (types like `"x"|"y"` enums and `number | [number, number]` are exactly
   what the current imperative checks re-state).
4. **`schema.ts` types** — generated so TS consumers keep real types; or
   keep `schema.ts` authored and check it against the table in CI.
5. Optionally the **deserializer registry maps** and the **parity harness
   switch** — or make both generic (construct-by-type keyed off the table),
   deleting two more checklist steps.

The CLAUDE.md checklist steps 2a, 3, and 4 collapse to "add one descriptor
entry"; the AI/manual work per feature drops to the genuinely novel parts.
This is the Altair architecture with the source of truth moved from a JSON
Schema to a richer native table (we need defaults, dual naming, and doc
text — JSON Schema can carry those but a TS table is easier to author and
typecheck).

Cost: designing the small type DSL; a one-time enumeration decision for
marks (below); ~a few hundred lines of generator (plain script, run via
`pnpm --filter gofish-ir gen`, guarded by a CI `check-gen` exactly like the
existing `check-ir-schema` / `check-backlinks` pattern).

### Option B — extract from `schema.ts` via the TS compiler API

Skip the new table; point ts-morph at the existing interfaces and emit
Python. Works today for operators and constraints; marks fall back to
`**kwargs`; coord transforms could be extracted from their (clean) option
types in `gofish-graphics`.

Cheaper to start, but: TS types can't carry defaults or Python-specific
kwarg names without inventing JSDoc tag conventions (a worse table); it
leaves the `validate.ts`/`jsonSchema.ts` triplication untouched; and it
inherits `schema.ts`'s gaps. Fine as a proof of concept, but it converges
on Option A the moment you want docstrings and renames.

### Option C — Altair-literal: generate from the emitted JSON Schema

Only viable after enriching `jsonSchema.ts` to per-construct `$defs` — at
which point the enrichment work _is_ Option A's table, just written in a
clumsier language. Mentioned for completeness; not recommended as the
driver (though A naturally produces a rich JSON Schema as one of its
outputs, which external tooling gets for free).

### Option D — don't generate; make the wrapper too thin to need it

Push the shallow-port ideal to its limit: a generic
`def _op(type, **kwargs)` / `_mark(type, **kwargs)` plus a ~50-line
name→wire-tag table, and move the remaining Python-side elaboration
(layer wiring, constraint walk) to JS. Nearly zero drift surface, but
users lose signatures, autocomplete, and docstrings — the things that make
a Python API feel native — and the IR triplication remains. Not
recommended alone, but its _refactor half_ is the right first step for
every option.

## The mark-channel decision — resolved: enumerated (closed)

Leaf marks are open-world in the IR today, but they aren't _really_ open on
the JS side either: a mark's channels are exactly the destructured options of
its factory plus the `FancyDims` box channels plus the coord aliases in
`KNOWN_ALIAS_KEYS`. Everything else is silently ignored. Case in point,
found while grounding this doc: **the current Python `rect()` exposes `rs=`
and `ts=` kwargs that exist nowhere in JS** (the real alias names are
`rSize`/`thetaSize`) — they serialize, pass the open-world validator, and
are dropped on the floor at render. A closed list turns that class of bug
into an autocomplete error.

Decision: **enumerate channels per mark in the descriptor**, built up
incrementally. Two things keep the maintenance cost low:

- **Shared field groups.** Most channels aren't per-mark. `boxDims` (the
  14 `FancyDims`/alias channels: `x, cx, x2, w, emX, y, cy, y2, h, emY,
theta, thetaSize, r, rSize`) and `paint` (`fill, stroke, strokeWidth,
opacity, filter`) are declared once and included by reference; a mark
  entry then lists only its genuinely own fields (rect: `rx, ry,
aspectRatio`).
- **An explicit escape hatch instead of open kwargs.** If raw SVG
  passthrough is ever needed, it gets one named kwarg (e.g. `svg={...}` /
  a `style` dict), not `**kwargs` — autocomplete and closed-world checking
  survive.

Strictness rolls out gradually: the generated Python signatures are closed
immediately (that's where autocomplete lives); `validate.ts` can start
warning rather than rejecting unknown leaf-mark fields until the enumerated
lists have been proven against the story corpus, then flip to strict.

## What a descriptor entry looks like

Grounded in the real factories (`graphicalOperators/spread.tsx`,
`shapes/rect.tsx`, `dims.ts`). The table is plain TS data in
`packages/gofish-ir/src/frontend/descriptors.ts`, typechecked against a
small field-type DSL (`t.*`):

```ts
// Shared field groups — declared once, included by reference.
const boxDims = group({
  x: ch.num("Left edge position."),        cx: ch.num("Center x."),
  x2: ch.num("Right edge position."),      w: ch.num("Width."),
  emX: { type: t.boolean, doc: "Embed x in the parent's x space." },
  y: ch.num(), cy: ch.num(), y2: ch.num(), h: ch.num(),
  emY: { type: t.boolean },
  // Coord aliases (KNOWN_ALIAS_KEYS) — resolved to x/y/w/h by resolveAliases.
  theta: ch.num(), thetaSize: ch.num(), r: ch.num(), rSize: ch.num(),
});

const paint = group({
  fill:        ch.color("Fill color, or a field name for a color scale."),
  stroke:      ch.color("Stroke color. Defaults to `fill`."),
  strokeWidth: { type: t.number, default: 0 },
  opacity:     { type: t.number, default: 1 },
  filter:      { type: t.string, doc: "Raw SVG filter attribute." },
});

// --- an operator entry ---------------------------------------------------
operator("spread", {
  doc: "Arrange children along `dir` with spacing, aligning them on the cross axis.",
  fields: {
    by:          { type: t.string, doc: "Field to partition rows by." },
    dir:         { type: t.enum("x", "y"), required: true },
    spacing:     { type: t.number, default: 8, doc: "Gap between children, px." },
    alignment:   { type: t.alignment, default: "baseline" },
    sharedScale: { type: t.boolean, default: false },
    mode:        { type: t.enum("edge", "center"), default: "edge" },
    reverse:     { type: t.boolean, default: false },
    glue:        { type: t.boolean, default: false,
                   doc: "Stack semantics: children glued, sizes sum; spacing forced to 0." },
    axes:        { type: t.ref("AxesOptions") },
  },
});

// --- a mark entry ---------------------------------------------------------
mark("rect", {
  doc: "A rectangle. Box geometry via the shared dims channels.",
  include: [boxDims, paint],
  fields: {
    rx:          { type: t.number, default: 0, doc: "Corner radius, x." },
    ry:          { type: t.number, default: 0 },
    aspectRatio: { type: t.number,
                   doc: "w/h ratio to enforce; the constraining axis wins when both are data-driven." },
  },
  // base fields (key, name, label, zOrder, translate, constraints) are implicit
});

// --- a rename entry (kills the hand-copied tables) -------------------------
mark("inside", {
  pyName: "intersect",          // Python spells it intersect(); wire type stays "inside"
  kind: "combinator",
  doc: "Clip the lower layers to the top layer's silhouette.",
  fields: { ... },
});
```

`ch.num(doc?)` / `ch.color(doc?)` are shorthand for
`{ type: t.channel(number|color) }` — a `ChannelValue` slot accepting a
literal, a field name, or a `datum()` wrapper. Python-keyword collisions
declare `pyName` per _field_ the same way (`{ pyName: "from_", wire: "from" }`
on `line`'s `from` field).

From the `rect` entry the generator emits, mechanically:

```python
def rect(*, x=None, cx=None, x2=None, w=None, emX=None,
         y=None, cy=None, y2=None, h=None, emY=None,
         theta=None, thetaSize=None, r=None, rSize=None,
         fill=None, stroke=None, strokeWidth=None, opacity=None, filter=None,
         rx=None, ry=None, aspectRatio=None,
         key=None, label=None) -> Mark:
    """A rectangle. Box geometry via the shared dims channels.

    Args:
        rx: Corner radius, x. Default 0.
        aspectRatio: w/h ratio to enforce; ...
        ...
    """
    return _leaf("rect", locals())
```

plus a `Rect` `$def` in the JSON Schema (closed property list), the
`knownFields` row + typed checks in the validator, and the `LeafMarkIR`
member type in `schema.ts` — one authored entry, four generated artifacts.
Note the emitted signature is exactly today's hand-written `rect()` minus
its two phantom kwargs (`rs`, `ts`) and plus the four coord aliases it was
missing — i.e., the generator's first diff already fixes real drift.

## Recommended staging

1. **Shallow-port refactor (no codegen yet).** Move `_wire_layer_tier`'s
   auto-naming/`selectAll` wiring JS-side behind the existing
   `builder: true` tag; evaluate doing the same for the constrain ref-walk;
   dedupe the placeholder-Arrow helper. Shrinks and regularizes the residue
   so the generated/hand-written boundary is clean.
2. **Descriptor table + Python generator** for operators, constraints,
   coord transforms, and permissive marks. Generated file checked in;
   `pnpm gen` + CI check. Delete the four hand-copied rename/type tables.
3. **Retarget `jsonSchema.ts` + `validate.ts`** (generate or interpret from
   the table); fix the `treemap` drift in passing. Update the
   `/internals/frontend/serialization` essay (it currently documents the
   hand-written-triplication state).
4. **Optional, incremental:** enumerate mark channels; generify the
   deserializer registry and parity-harness switch off the same table.

Steps 1–2 alone get the stated goal ("~80% generated, Python as a dumb
pass-through"); 3–4 are where the checklist itself starts shrinking.

## Hand-written residue (permanent, by design)

Callback/lambda bridge (`derive`, mark-fn, accessor sentinels), widget +
RPC + save/display, DataFrame⇄Arrow (incl. the Int64 downcast), `DatumValue`
arithmetic, `_RefProxy`, the builder chain itself (`.flow/.mark/.layer/…` —
thin methods over generated factories), and the d3 `bin` port (until/unless
binning becomes a declarative operator resolved JS-side, which would delete
it).

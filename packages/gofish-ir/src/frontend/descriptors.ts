// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * GoFish Frontend IR — construct descriptors (Stage 1 of the Python-wrapper
 * codegen design, see apps/docs/docs/internals/design/python-wrapper-codegen.md).
 *
 * This is the single-source table of "what fields does construct X have" for
 * operators, leaf marks, combinator marks, and coordinate transforms. It is
 * grounded directly in the JS factories (`gofish-graphics/src/ast/**`) — see
 * each entry's `doc` / field list for the source it was transcribed from.
 *
 * Consumers (this stage and later ones):
 *  - `validate.ts` interprets these descriptors generically instead of a
 *    hand-written per-type field-check switch (operators: errors; leaf marks:
 *    warnings only, per the gradual-rollout decision in the design doc).
 *  - `jsonSchema.ts` builds per-construct `$defs` from these descriptors.
 *  - A later stage generates the Python factory functions from this table.
 *
 * Out of scope for this table (stay hand-authored in `schema.ts` /
 * `jsonSchema.ts` / `validate.ts`, per the design doc's staging): `cut`,
 * `offset`, `ref`, constraints, and the envelope types (ChartIR, LayerIR,
 * DataIR, ChannelValue, LabelIR, TranslateIR, AxesOptions). Those are
 * structural/recursive shapes rather than flat field bags, and are cheap to
 * keep authored.
 */

// ---------------------------------------------------------------------------
// Field-type DSL
// ---------------------------------------------------------------------------

/** The primitive kind a `ChannelValue` slot may carry, purely descriptive —
 *  every channel accepts the full `ChannelValue` union on the wire (literal,
 *  field name, datum()/sentinel forms); `inner` only documents the literal's
 *  expected JS type for docgen (e.g. Python's generated signature/docstring). */
export type ChannelInner = "number" | "string" | "boolean" | "color";

export type FieldType =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "any" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "channel"; inner: ChannelInner }
  | { kind: "ref"; name: string }
  | { kind: "union"; options: readonly FieldType[] }
  | { kind: "array"; items: FieldType }
  | { kind: "tuple"; items: readonly FieldType[] }
  | { kind: "object"; fields: Readonly<FieldGroup> }
  | { kind: "record"; valueType: FieldType };

export interface FieldSpec {
  type: FieldType;
  /** Required on the wire. Default: optional (false). */
  required?: boolean;
  /** Informational only — documents the JS factory's default for docgen; the
   *  wire format omits absent fields (no default-filling on read). */
  default?: unknown;
  doc?: string;
  /** Wire key, when it differs from the descriptor's field name. */
  wire?: string;
  /** Python kwarg name, when it differs from the field name (keyword
   *  collisions: `from` → `from_`). */
  py?: string;
}

export type FieldGroup = Record<string, FieldSpec>;

/** The small type DSL referenced by the design doc as `t.*`. */
export const t = {
  string: { kind: "string" } as FieldType,
  number: { kind: "number" } as FieldType,
  boolean: { kind: "boolean" } as FieldType,
  /** Escape hatch for JS-only shapes not worth modeling precisely yet
   *  (perfect-arrows' `ArrowOptions`, a `Curve` factory-call value, an
   *  `AnchorSpec`, a JS function accessor). */
  any: { kind: "any" } as FieldType,
  enum: (...values: string[]): FieldType => ({ kind: "enum", values }),
  channel: (inner: ChannelInner = "number"): FieldType => ({
    kind: "channel",
    inner,
  }),
  /** A reference to an authored envelope `$def` (AxesOptions, LabelIR,
   *  ConstraintIR, TranslateIR, ...) — those stay hand-written in schema.ts /
   *  jsonSchema.ts; this just points at them by name. */
  ref: (name: string): FieldType => ({ kind: "ref", name }),
  union: (...options: FieldType[]): FieldType => ({ kind: "union", options }),
  array: (items: FieldType): FieldType => ({ kind: "array", items }),
  tuple: (...items: FieldType[]): FieldType => ({ kind: "tuple", items }),
  object: (fields: FieldGroup): FieldType => ({ kind: "object", fields }),
  /** `Record<string, valueType>` — a string-keyed bag with no fixed key set
   *  (e.g. `derive`'s `provenance`: output field name → measure string). */
  record: (valueType: FieldType = { kind: "string" }): FieldType => ({
    kind: "record",
    valueType,
  }),
};

/** `ch.num(doc?)` / `ch.color(doc?)` / `ch.str(doc?)` — shorthand for a bare
 *  `ChannelValue` slot of the given literal flavor. */
export const ch = {
  num: (doc?: string): FieldSpec => ({ type: t.channel("number"), doc }),
  color: (doc?: string): FieldSpec => ({ type: t.channel("color"), doc }),
  str: (doc?: string): FieldSpec => ({ type: t.channel("string"), doc }),
};

/** Declare a shared field group (included by reference from multiple
 *  construct entries). Identity function — it exists so callsites read as
 *  the design doc's `group({...})`. */
export function group(fields: FieldGroup): FieldGroup {
  return fields;
}

// ---------------------------------------------------------------------------
// Construct descriptors
// ---------------------------------------------------------------------------

export type ConstructKind =
  | "operator"
  | "leaf-mark"
  | "combinator-mark"
  | "coord";

export interface ConstructDescriptor {
  /** The wire discriminator (the node's `type` tag). */
  type: string;
  kind: ConstructKind;
  /** Python-facing factory name, when it differs from the wire `type` — the
   *  Porter-Duff-style compositing renames (inside→intersect, xor→exclude,
   *  out→subtract, atop→paint). The wire `type` is unchanged either way. */
  pyName?: string;
  doc?: string;
  /** Shared field groups folded in (e.g. `boxDims`, `paint`). */
  include?: FieldGroup[];
  /** This construct's own fields (in addition to any `include`d groups). */
  fields: FieldGroup;
}

/** Merge a descriptor's included groups and own fields into one flat map.
 *  Own fields win on a name collision (there shouldn't be any in practice). */
export function resolveFields(d: ConstructDescriptor): FieldGroup {
  const merged: FieldGroup = {};
  for (const g of d.include ?? []) Object.assign(merged, g);
  Object.assign(merged, d.fields);
  return merged;
}

function makeDef(kind: ConstructKind) {
  return (
    type: string,
    spec: Omit<ConstructDescriptor, "type" | "kind">
  ): ConstructDescriptor => ({ type, kind, ...spec });
}

const operator = makeDef("operator");
const leafMark = makeDef("leaf-mark");
const combinatorMark = makeDef("combinator-mark");
const coordTransform = makeDef("coord");

// ---------------------------------------------------------------------------
// Structural base fields — every node of a given family carries these.
// Declared once here (informational — consumers hardcode the same list
// rather than merge it into each entry, mirroring how `walkBaseFields` /
// `LeafMarkIR`'s shared fields already work in schema.ts/validate.ts).
// ---------------------------------------------------------------------------

/** Every leaf/combinator/ref/offset/cut mark carries these (LeafMarkIR /
 *  CombinatorMarkIR common fields in schema.ts). Combinator marks also carry
 *  `children` (required) and wrap their own fields in `options` on the wire. */
export const MARK_BASE_FIELDS: FieldGroup = group({
  name: { type: t.string, doc: 'Layer name, from `.name("...")`.' },
  label: { type: t.ref("LabelIR") },
  constraints: { type: t.array(t.ref("ConstraintIR")) },
  zOrder: { type: t.number },
  translate: { type: t.ref("TranslateIR") },
  debug: {
    type: t.boolean,
    doc: "Dev-only flag: on the shape marks (rect, circle, ellipse, petal, text, image, polygon, blank) it logs the mark's key and datum to the console as the mark is built. It changes nothing about what is drawn; the connector marks accept it and ignore it.",
  },
});

/** The base fields the Python generator exposes as leaf-mark kwargs (the
 *  rest of MARK_BASE_FIELDS ride Mark methods: `.name()`, `.z_order()`,
 *  `.translate()`, `.constrain()`, `.label()`). Labeling a leaf mark is done
 *  exclusively via the `.label(accessor, options?)` chain — there is no
 *  leaf-mark `label` kwarg. */
export const PY_LEAF_BASE_KWARGS: FieldGroup = group({
  debug: MARK_BASE_FIELDS.debug,
});

/** Every operator carries these (BaseIRNode + TranslatableIR in schema.ts).
 *
 *  `label` is the `.label(accessor, options?)` chain (createOperator.ts's
 *  `attachLabelOption`) available on every dual-mode operator (spread/stack/
 *  group/scatter/table/treemap). `log` doesn't carry this field at all — it
 *  isn't built via `createOperator` and never gets `.label()`; its own
 *  console-prefix option is the unrelated `prefix` field on `LogOperator`.
 *  The `accessor` a `LabelIR` object carries may be a bare string (must be
 *  constant across the group's rows — true by construction for a `by`-field —
 *  or it throws) or a `field(...)` aggregate (`.sum()`/`.mean()`/etc.) folding
 *  the group's rows to one value, e.g. `.label(field("count").sum())`. */
export const OPERATOR_BASE_FIELDS: FieldGroup = group({
  label: { type: t.ref("LabelIR") },
  translate: { type: t.ref("TranslateIR") },
  debug: {
    type: t.boolean,
    doc: "Dev-only flag every operator accepts and currently ignores — it is dropped before layout. Use the `log` operator to print the rows at a point in the flow.",
  },
});

// ---------------------------------------------------------------------------
// Shared field groups
// ---------------------------------------------------------------------------

/** The 14 `FancyDims`/coord-alias channels (`dims.ts` XYWHDims +
 *  KNOWN_ALIAS_KEYS). Included wholesale by marks whose factory spreads a
 *  bare `...fancyDims: FancyDims<MaybeValue<number>>` (rect, ellipse, petal,
 *  text, image, treemap, layer's `Layer(dims, children)` form). Marks that
 *  destructure a fixed subset (blank, circle) declare their own fields
 *  instead of including this group. */
export const boxDims: FieldGroup = group({
  x: ch.num("Left edge position."),
  cx: ch.num("Center x."),
  x2: ch.num("Right edge position."),
  w: ch.num("Width."),
  emX: { type: t.boolean, doc: "Embed x in the parent's x space." },
  y: ch.num("Top/bottom edge position (y-up: bottom)."),
  cy: ch.num("Center y."),
  y2: ch.num("Other y edge position."),
  h: ch.num("Height."),
  emY: { type: t.boolean, doc: "Embed y in the parent's y space." },
  // Coordinate-space aliases (KNOWN_ALIAS_KEYS) — resolved to x/y/w/h by
  // resolveAliases once the enclosing coord's declared aliases are known
  // (polar: theta→x position, r→y position).
  theta: ch.num("Angular position alias (polar coord's x)."),
  thetaSize: ch.num("Angular extent alias (polar coord's w)."),
  r: ch.num("Radial position alias (polar coord's y)."),
  rSize: ch.num("Radial extent alias (polar coord's h)."),
});

/** `rect`'s full paint group (the only leaf mark that supports all five —
 *  ellipse/petal/circle support a strict subset and declare their fill/
 *  stroke/strokeWidth directly rather than including this group). */
export const paint: FieldGroup = group({
  fill: ch.color("Fill color, or a field name for a color scale."),
  stroke: ch.color("Stroke color. Defaults to `fill`."),
  strokeWidth: { type: t.number, default: 0, doc: "Stroke width in pixels." },
  opacity: { type: t.number, default: 1, doc: "Opacity, 0 to 1." },
  filter: { type: t.string, doc: "Raw SVG filter attribute." },
});

/** The shared groups above, with the heading a docs consumer shows them under.
 *  Membership is tested by FieldSpec identity (`resolveFields` copies the same
 *  spec objects), so a docs table can split a construct's own fields from the
 *  groups it includes — see `markdown-it-gofish-ref.ts` in apps/docs. */
export const SHARED_FIELD_GROUPS: ReadonlyArray<{
  label: string;
  fields: FieldGroup;
}> = [
  { label: "Box dimensions", fields: boxDims },
  { label: "Paint", fields: paint },
];

// ---------------------------------------------------------------------------
// Operators (all 9) — grounded in schema.ts interfaces + validate.ts's
// per-type checks + the v3 factories in graphicalOperators/ and marks/chart.ts.
// ---------------------------------------------------------------------------

export const OPERATORS: Record<string, ConstructDescriptor> = {
  derive: operator("derive", {
    doc: "Opaque user transformation (`derive(fn)`). Function bodies aren't serializable; the IR carries a bridge handle when the Python widget is the producer.",
    fields: {
      lambdaId: {
        type: t.string,
        doc: "Python-bridge handle for the remote callable.",
      },
      provenance: {
        type: t.record(t.string),
        doc: "Measure provenance a transform (e.g. bin) declares for its output columns — output field name → measure.",
      },
    },
  }),

  resolve: operator("resolve", {
    doc: "Dereference reference columns into the drawn nodes they name (`resolve(cols, { from, key? })`).",
    fields: {
      cols: {
        type: t.array(t.string),
        required: true,
        doc: "Local columns holding references to resolve in place.",
      },
      from: {
        type: t.string,
        doc: "The `selectAll(layerName)` of a prior layer whose nodes the columns are matched against.",
        py: "from_",
      },
      key: {
        type: t.string,
        doc: "Explicit match field; defaults to the producing operator's `by`.",
      },
    },
  }),

  join: operator("join", {
    doc: "One-to-many equi-join of the incoming rows against an inlined `right` table on a shared `on` key.",
    fields: {
      on: {
        type: t.string,
        required: true,
        doc: "Shared key field matched between the incoming rows and `right`.",
      },
      right: {
        type: t.array(t.object({})),
        required: true,
        doc: "The right-hand table, inlined as JSON rows.",
      },
    },
  }),

  spread: operator("spread", {
    doc: "Arrange children along `dir` with spacing, aligning them on the cross axis.",
    fields: {
      by: {
        type: t.union(t.string, t.ref("FieldAccessor")),
        doc: "Field to partition rows by; also accepts a field(...) accessor carrying domain ops (sort/reverse/bin).",
      },
      // IR truth: optional here even though Python's spread() requires dir —
      // matches validate.ts's optionalField("dir", ...) today.
      dir: { type: t.enum("x", "y"), doc: "Direction to spread along." },
      spacing: {
        type: t.number,
        default: 8,
        doc: "Gap between children, px.",
      },
      alignment: {
        type: t.string,
        default: "baseline",
        doc: 'Cross-axis alignment ("start" | "middle" | "end" | "baseline").',
      },
      sharedScale: {
        type: t.boolean,
        default: false,
        doc: "Share one scale across all children.",
      },
      anchor: {
        type: t.enum("edge", "start", "middle", "end", "baseline"),
        default: "edge",
        doc: "Whether spacing is measured between facing edges (edge), or as a fixed pitch between the named anchor point on each child.",
      },
      reverse: {
        type: t.boolean,
        default: false,
        doc: "Reverse the children's order along dir.",
      },
      glue: {
        type: t.boolean,
        default: false,
        doc: "Stack semantics: children glued, sizes sum; spacing forced to 0.",
      },
      axes: { type: t.ref("AxesOptions") },
      // Data-driven operator extent (#4/#20): the v3 spread operator carries
      // `w`/`h` (field/datum-driven cross-axis sizing) and `size` (#700 Phase
      // 2 — per-entry stack-axis extent, field/datum-sized children).
      // `COMBINATOR_MARKS.spread` also carries `w`/`h` for the low-level
      // Spread combinator's FancyDims. `size: field(<name>).normalize()`
      // (a field accessor with a `normalize` pipeline op) is the
      // space-filling spine (mosaic/marimekko) that replaced the old
      // `normalize: true` layout flag.
      w: ch.num("Data-driven cross-axis extent (field/datum-sized children)."),
      h: ch.num("Data-driven cross-axis extent (field/datum-sized children)."),
      size: ch.num(
        "Per-entry stack-axis extent (field/datum-sized children); a field(...).normalize() accessor makes it a space-filling spine."
      ),
    },
  }),

  stack: operator("stack", {
    doc: "`spread({ glue: true })` under its own wire tag — children glued together (touching, no gaps).",
    fields: {
      by: {
        type: t.union(t.string, t.ref("FieldAccessor")),
        doc: "Field to partition rows by; also accepts a field(...) accessor carrying domain ops (sort/reverse/bin).",
      },
      dir: { type: t.enum("x", "y"), doc: "Direction to stack along." },
      // Real producers pass spread's options through (the JS `stack` is a
      // literal `Spread({...props, glue: true})` forward, and stories emit
      // `stack(spacing=2)`), so the wire accepts them and the validator
      // type-checks them when present — restoring the shared
      // spread/stack switch-case behavior the descriptor split dropped.
      spacing: {
        type: t.number,
        doc: "Forwarded to the underlying spread. Glue semantics force the effective gap to 0; accepted for spread-parity.",
      },
      glue: {
        type: t.boolean,
        doc: "Spread-parity passthrough; stack always glues regardless.",
      },
      alignment: {
        type: t.string,
        default: "baseline",
        doc: 'Cross-axis alignment ("start" | "middle" | "end" | "baseline").',
      },
      sharedScale: {
        type: t.boolean,
        default: false,
        doc: "Share one scale across all children.",
      },
      anchor: {
        type: t.enum("edge", "start", "middle", "end", "baseline"),
        default: "edge",
        doc: "Whether spacing is measured between facing edges (edge), or as a fixed pitch between the named anchor point on each child.",
      },
      reverse: {
        type: t.boolean,
        default: false,
        doc: "Reverse the children's order along dir.",
      },
      axes: { type: t.ref("AxesOptions") },
      // Data-driven extent + space-filling spine — see `spread` above.
      w: ch.num("Data-driven cross-axis extent (field/datum-sized children)."),
      h: ch.num("Data-driven cross-axis extent (field/datum-sized children)."),
      size: ch.num(
        "Per-entry stack-axis extent (field/datum-sized children); a field(...).normalize() accessor makes it a space-filling spine."
      ),
    },
  }),

  group: operator("group", {
    doc: "Partition rows by `by` into a flat `Frame` (no layout beyond grouping).",
    fields: {
      by: {
        type: t.union(t.string, t.ref("FieldAccessor")),
        required: true,
        doc: "Field to group rows by; also accepts a field(...) accessor carrying domain ops (sort/reverse/bin).",
      },
    },
  }),

  scatter: operator("scatter", {
    doc: "Position each child at an explicit (x, y) point or [min, max] span in data space.",
    fields: {
      by: {
        type: t.union(t.string, t.ref("FieldAccessor")),
        doc: "Field to partition rows by; also accepts a field(...) accessor carrying domain ops (sort/reverse/bin).",
      },
      x: ch.num("Point position, x."),
      y: ch.num("Point position, y."),
      xMin: ch.num("Range form: left/bottom edge, x."),
      xMax: ch.num("Range form: right/top edge, x."),
      yMin: ch.num("Range form: left/bottom edge, y."),
      yMax: ch.num("Range form: right/top edge, y."),
      alignment: {
        type: t.string,
        default: "baseline",
        doc: "Cross-axis alignment for the axis without an explicit position.",
      },
      axes: { type: t.ref("AxesOptions") },
      w: ch.num(
        "Fixed cross-axis extent, or a field name sizing this operator's own box from data."
      ),
      h: ch.num(
        "Fixed cross-axis extent, or a field name sizing this operator's own box from data."
      ),
    },
  }),

  table: operator("table", {
    doc: "Arrange cells in a `numCols`-wide grid (or a `{x, y}` keyed grid via `by`).",
    fields: {
      by: {
        type: t.object({
          x: { type: t.string, required: true },
          y: { type: t.string, required: true },
        }),
        required: true,
        doc: "Grouping fields for the column/row keys — the table operator can't run without both.",
      },
      spacing: {
        type: t.union(t.number, t.tuple(t.number, t.number)),
        default: 0,
        doc: "Cell gap: a single number for both axes, or [x, y].",
      },
      numCols: {
        type: t.number,
        doc: "Explicit column count (falls back to the number of distinct column keys).",
      },
    },
  }),

  log: operator("log", {
    doc: "Debug pass-through: logs each row (optionally under `prefix`) and forwards it unchanged.",
    fields: {
      prefix: { type: t.string, doc: "Console prefix string." },
    },
  }),

  // Dual-form like spread/stack/scatter/group/table — also usable as a
  // low-level combinator mark (see COMBINATOR_MARKS.treemap, which reuses
  // this field list). Confirmed as a genuine `.flow()` operator by a real
  // Python story (atom/titanic-unit-dots), which is why it's here despite
  // the design doc's audit assuming it was combinator-only — see the note
  // on `OPERATOR_TYPES` in schema.ts.
  treemap: operator("treemap", {
    doc: "d3-hierarchy treemap layout over the flow's rows, fare/weight-proportional.",
    fields: {
      // Both forms take the same `TreemapProps`, which spreads `FancyDims` —
      // `Treemap` runs the whole bag through `elaborateDims`, so the box's
      // position (`x`/`y`) and size (`w`/`h`) are both real options. Only
      // `w`/`h` carry channel annotations (`createOperator`'s `channels`), so
      // those two resolve data-driven values; `x`/`y` pass through as literals.
      // The polar aliases (theta/r/...) are deliberately NOT here: `Treemap`
      // never calls `extractAliasCandidates`, so they would not resolve.
      x: ch.num(
        "Left edge of the box the treemap tiles into, in the parent's space (pixels). Omitted, the parent places the treemap."
      ),
      y: ch.num(
        "Top/bottom edge (y-up: bottom) of the box the treemap tiles into, in the parent's space (pixels). Omitted, the parent places the treemap."
      ),
      w: ch.num(
        "Width of the box the treemap tiles into; a number is pixels, a data-driven value scales through the layout. Omitted, the treemap fills the slot its parent allots."
      ),
      h: ch.num(
        "Height of the box the treemap tiles into; a number is pixels, a data-driven value scales through the layout. Omitted, the treemap fills the slot its parent allots."
      ),
      by: {
        type: t.union(t.string, t.ref("FieldAccessor")),
        doc: "Field to partition rows by (like spread/group); also accepts a field(...) accessor carrying domain ops (sort/reverse/bin/dropNulls). Without `by`, one leaf is emitted per row.",
      },
      paddingInner: {
        type: t.number,
        default: 0,
        doc: "Padding between sibling rectangles.",
      },
      paddingOuter: {
        type: t.number,
        default: 0,
        doc: "Padding around the outer edge of the treemap.",
      },
      round: {
        type: t.boolean,
        default: true,
        doc: "Round pixel positions and sizes.",
      },
      tile: {
        type: t.enum(
          "squarify",
          "slice",
          "dice",
          "binary",
          "slicedice",
          "squarifyCircle"
        ),
        default: "squarify",
        doc: "Tiling strategy.",
      },
      sort: {
        type: t.enum("asc", "desc", "none"),
        default: "desc",
        doc: "Sort leaves by weight before layout.",
      },
      size: ch.num(
        "Per-leaf weight driving tile area (entry-flagged per split entry); a field name aggregates (sums by default) per group."
      ),
      flipY: {
        type: t.boolean,
        default: false,
        doc: "Mirror leaf layout top-to-bottom within the treemap box.",
      },
      leafIntrinsicRadiusField: {
        type: t.string,
        doc: "When set, each leaf is laid out in a square of side min(leafW, leafH, 2*datum[field]).",
      },
    },
  }),
};

// ---------------------------------------------------------------------------
// Leaf marks — enumerated channels, grounded in shapes/*.tsx + the mark-fn
// bridge + chart.ts's circle/blank/line/ribbon factories.
// ---------------------------------------------------------------------------

export const LEAF_MARKS: Record<string, ConstructDescriptor> = {
  rect: leafMark("rect", {
    doc: "A rectangle. Box geometry via the shared dims channels.",
    include: [boxDims, paint],
    fields: {
      key: { type: t.string, doc: "Internal per-node key override." },
      rx: { type: t.number, default: 0, doc: "Corner radius, x." },
      ry: { type: t.number, default: 0, doc: "Corner radius, y." },
      aspectRatio: {
        type: t.number,
        doc: "w/h ratio to enforce; the constraining axis wins when both are data-driven.",
      },
      // A v3-mark-factory-wide dev flag (`FACTORY_ONLY_KEYS` in
      // marks/createOperator.ts strips `by`/`debug` before layout, generically
      // — not a rect-only feature). Documented per-mark (matching `blank`'s
      // existing note) rather than as a base field since only the
      // console.log-on-construction marks (rect/circle/ellipse/petal/blank)
      // wire it through today. Found while grounding the Python generator:
      // the hand-written Python wrapper already exposes it on all four.
      debug: {
        type: t.boolean,
        doc: "Dev-only flag: logs this mark's key and datum to the console as it is built. It changes nothing about what is drawn.",
      },
    },
  }),

  circle: leafMark("circle", {
    doc: "A circle, drawn as an aspect-locked ellipse. Does NOT support the boxDims positioning channels directly (JS `circle()` in marks/chart.ts destructures only r/fill/stroke/strokeWidth/opacity) — position it via `spread`/`scatter`.",
    fields: {
      r: ch.num("Radius; becomes w=h=2r on the underlying ellipse."),
      fill: ch.color("Fill color, or a field name for a color scale."),
      stroke: ch.color("Stroke color. Defaults to `fill`."),
      strokeWidth: {
        type: t.number,
        default: 0,
        doc: "Stroke width in pixels.",
      },
      opacity: {
        type: t.number,
        default: 1,
        doc: "Opacity, 0 to 1, applied to fill and stroke. In JS it may also be a per-datum accessor or a `live(...)` value; only a literal number crosses the wire.",
      },
      debug: {
        type: t.boolean,
        doc: "Dev-only flag: logs this mark's key and datum to the console as it is built. It changes nothing about what is drawn.",
      },
    },
  }),

  ellipse: leafMark("ellipse", {
    doc: "An ellipse. Box geometry via the shared dims channels; paint is a strict subset of `paint` (no filter).",
    include: [boxDims],
    fields: {
      fill: ch.color("Fill color, or a field name for a color scale."),
      stroke: ch.color("Stroke color. Defaults to `fill`."),
      strokeWidth: {
        type: t.number,
        default: 0,
        doc: "Stroke width in pixels.",
      },
      opacity: { type: t.number, default: 1, doc: "Opacity, 0 to 1." },
      aspectRatio: {
        type: t.number,
        doc: "w/h ratio to enforce. When both dims are data-driven, the constraining axis is used.",
      },
      debug: {
        type: t.boolean,
        doc: "Dev-only flag: logs this mark's key and datum to the console as it is built. It changes nothing about what is drawn.",
      },
    },
  }),

  petal: leafMark("petal", {
    doc: "A polar-only wedge/petal shape (Petal.tsx). Box geometry via the shared dims channels.",
    include: [boxDims],
    fields: {
      fill: ch.color("Fill color, or a field name for a color scale."),
      stroke: ch.color("Stroke color. Defaults to `fill`."),
      strokeWidth: {
        type: t.number,
        default: 0,
        doc: "Stroke width in pixels.",
      },
      debug: {
        type: t.boolean,
        doc: "Dev-only flag: logs this mark's key and datum to the console as it is built. It changes nothing about what is drawn.",
      },
    },
  }),

  text: leafMark("text", {
    doc: "A text label. Box geometry via the shared dims channels positions the text anchor.",
    include: [boxDims],
    fields: {
      key: { type: t.string, doc: "Internal per-node key override." },
      text: {
        type: t.channel("string"),
        required: true,
        doc: "Text content (raw channel — a literal, field name, or accessor).",
      },
      fill: {
        ...ch.color("Fill color, or a field name for a color scale."),
        default: "black",
      },
      stroke: ch.color("Stroke color."),
      strokeWidth: {
        type: t.number,
        default: 0,
        doc: "Stroke width in pixels.",
      },
      filter: { type: t.string, doc: "Raw SVG filter attribute." },
      fontSize: { type: t.number, default: 12, doc: "Font size in pixels." },
      fontFamily: {
        type: t.string,
        default: "system-ui, sans-serif",
        doc: "Font family.",
      },
      fontStyle: {
        type: t.string,
        doc: 'Raw CSS font-style (e.g. "italic").',
      },
      fontWeight: {
        type: t.union(t.number, t.string),
        doc: 'CSS font-weight (e.g. 300, 700, "bold").',
      },
      debugBoundingBox: {
        type: t.boolean,
        default: false,
        doc: "Draw the text's bounding box, for layout debugging.",
      },
      rotate: {
        type: t.number,
        default: 0,
        doc: "Rotation in degrees, applied in the chart's y-up world frame about the text anchor.",
      },
      textAnchor: {
        type: t.enum("start", "middle", "end"),
        default: "start",
        doc: "Where the text anchor — the local origin `rotate` pivots about and dims channels position — sits along the string: its first character, center, or last character.",
      },
    },
  }),

  image: leafMark("image", {
    doc: "An embedded raster/SVG image. Box geometry via the shared dims channels.",
    include: [boxDims],
    fields: {
      key: { type: t.string, doc: "Internal per-node key override." },
      href: { type: t.string, required: true, doc: "Image URL or data URI." },
      filter: { type: t.string, doc: "Raw SVG filter attribute." },
      opacity: { type: t.number, doc: "Opacity, 0 to 1." },
      preserveAspectRatio: {
        type: t.string,
        default: "xMidYMid meet",
        doc: "Raw SVG preserveAspectRatio value.",
      },
      debug: {
        type: t.boolean,
        doc: "Dev-only flag: logs this mark's key and datum to the console as it is built. It changes nothing about what is drawn.",
      },
    },
  }),

  polygon: leafMark("polygon", {
    doc: "A closed polygon defined by local-coordinate points (y-up), given literally or read from a field. No dims channels — the bbox is computed from `points`.",
    fields: {
      points: {
        type: t.union(t.array(t.tuple(t.number, t.number)), t.string),
        required: true,
        doc: "Vertex list, at least 3 points — either a literal ring, or the name of a field holding one ring per row (which is how one mark draws a whole basemap).",
      },
      fill: { type: t.string, default: "black", doc: "Fill color." },
      stroke: { type: t.string, doc: "Stroke color. Defaults to `fill`." },
      strokeWidth: {
        type: t.number,
        default: 0,
        doc: "Stroke width in pixels.",
      },
      opacity: {
        type: t.number,
        default: 1,
        doc: "Opacity, 0 to 1, applied to both fill and stroke.",
      },
      debug: {
        type: t.boolean,
        doc: "Dev-only flag: logs this mark's key and datum to the console as it is built. It changes nothing about what is drawn.",
      },
    },
  }),

  blank: leafMark("blank", {
    doc: "An invisible sizing/positioning guide — a rect that emits no display items at all, with a restricted channel set (no x/y/cx/cy/x2/y2/theta/r — position it via a layout operator).",
    fields: {
      emX: { type: t.boolean, doc: "Embed x in the parent's x space." },
      emY: { type: t.boolean, doc: "Embed y in the parent's y space." },
      w: { ...ch.num("Width."), default: 0 },
      h: { ...ch.num("Height."), default: 0 },
      rx: { type: t.number, doc: "Corner radius, x." },
      ry: { type: t.number, doc: "Corner radius, y." },
      fill: ch.color("Fill color. A blank draws nothing unless given one."),
      stroke: { type: t.string, doc: "Stroke color." },
      strokeWidth: { type: t.number, doc: "Stroke width in pixels." },
      debug: {
        type: t.boolean,
        doc: "Dev-only flag: logs this mark's key and datum to the console as it is built. It changes nothing about what is drawn.",
      },
    },
  }),

  line: leafMark("line", {
    doc: "Center-mode connector — the path between the centers of consecutive marks (the drop-in for the removed `connect`). Bag form over a ref array, or pairwise `{from, to}` form over rows with two ref columns.",
    fields: {
      // Center mode paints `fill: "none"` on the path (connect.tsx's
      // `mode === "center" ? "none" : ...`), but `fill` is still the channel the
      // color scale reads (`color: isValue(fill) ? fill : stroke`) and the
      // stroke's fallback (`stroke ?? fill ?? "black"`).
      fill: ch.color(
        "A line's path is never filled. `fill` is the channel the shared color scale reads, so a field name colors each line by group, and it is the line color when `stroke` is omitted."
      ),
      stroke: { type: t.string, doc: "Line color." },
      strokeWidth: {
        type: t.number,
        default: 1,
        doc: "Line thickness in pixels.",
      },
      strokeDasharray: {
        type: t.string,
        doc: 'Raw SVG stroke-dasharray (e.g. "12") for a dashed line.',
      },
      opacity: { type: t.number, doc: "Opacity, 0 to 1." },
      mixBlendMode: {
        type: t.enum("normal", "multiply"),
        doc: "Blend mode where connectors overlap.",
      },
      curve: {
        type: t.any,
        doc: 'Screen-space path shape: a factory call (straight()/bezier()/catmullRom()/orthogonal()/arc({direction})/perfectArrows({bow})/...) or a bare name. Omitted = "auto" (catmullRom on a homogeneous continuous connection axis, else straight).',
      },
      dir: { type: t.enum("x", "y"), doc: "Connection axis." },
      source: {
        type: t.any,
        doc: "Anchor-mode start point: a normalized [fx, fy] on the mark's bbox, or a start/middle/end keyword.",
      },
      target: { type: t.any, doc: "Anchor-mode end point; see `source`." },
      from: {
        type: t.string,
        doc: "Pairwise form: column holding the source ref.",
        py: "from_",
      },
      to: {
        type: t.string,
        doc: "Pairwise form: column holding the target ref.",
      },
      along: {
        type: t.string,
        doc: "Names a flow tier by its `by` field: that tier becomes the path tier (threading its groups in order) and every OTHER grouping tier splits. Omitted: the path tier is inferred from the flow shape. Naming a field that matches no tier, or using `along` where the mark doesn't fuse over this chart's own flow (a refs bag, or the pairwise from/to form), is an error.",
      },
      emX: {
        type: t.boolean,
        doc: "Blank-fusion anchor key: placed directly in `.mark()` position, `line(opts)` elaborates to an invisible anchor tier (a `blank()` carrying just `{w, h, emX, emY}`) plus this connector — see the `mark` construct's doc. Ignored by `line` itself.",
      },
      emY: {
        type: t.boolean,
        doc: "Blank-fusion anchor key — see `emX`. Ignored by `line` itself.",
      },
      w: {
        ...ch.num(),
        doc: "Blank-fusion anchor key — see `emX`. Ignored by `line` itself.",
      },
      h: {
        ...ch.num(),
        doc: "Blank-fusion anchor key — see `emX`. Ignored by `line` itself.",
      },
    },
  }),

  ribbon: leafMark("ribbon", {
    doc: "Edge-mode connector — a filled band between the facing edges of consecutive marks (areas, streamgraphs, sankey ribbons).",
    fields: {
      fill: ch.color(
        "Fill color of the band, or a field name for a color scale. Omitted, the band takes the color of the marks it connects."
      ),
      stroke: { type: t.string, doc: "Stroke color." },
      strokeWidth: {
        type: t.number,
        default: 0,
        doc: "Stroke width in pixels.",
      },
      opacity: { type: t.number, doc: "Opacity, 0 to 1." },
      mixBlendMode: {
        type: t.enum("normal", "multiply"),
        default: "normal",
        doc: "Blend mode where bands overlap.",
      },
      dir: { type: t.enum("x", "y"), doc: "Connection axis." },
      curve: {
        type: t.any,
        doc: 'Screen-space band-edge shape (straight() | bezier()). Omitted = "auto" (bezier).',
      },
      from: { type: t.string, py: "from_" },
      to: { type: t.string },
      along: {
        type: t.string,
        doc: "Names a flow tier by its `by` field: that tier becomes the path tier (threading its groups in order) and every OTHER grouping tier splits. Omitted: the path tier is inferred from the flow shape. Naming a field that matches no tier, or using `along` where the mark doesn't fuse over this chart's own flow (a refs bag, or the pairwise from/to form), is an error.",
      },
      emX: {
        type: t.boolean,
        doc: "Blank-fusion anchor key: placed directly in `.mark()` position, `ribbon(opts)` elaborates to an invisible anchor tier (a `blank()` carrying just `{w, h, emX, emY}`) plus this connector — see the `mark` construct's doc. Ignored by `ribbon` itself.",
      },
      emY: {
        type: t.boolean,
        doc: "Blank-fusion anchor key — see `emX`. Ignored by `ribbon` itself.",
      },
      w: {
        ...ch.num(),
        doc: "Blank-fusion anchor key — see `emX`. Ignored by `ribbon` itself.",
      },
      h: {
        ...ch.num(),
        doc: "Blank-fusion anchor key — see `emX`. Ignored by `ribbon` itself.",
      },
    },
  }),

  "mark-fn": leafMark("mark-fn", {
    doc: "Python-bridge: a registered `(data) -> ChartBuilder` lambda, resolved via the bridge.",
    fields: {
      lambdaId: { type: t.string, required: true },
    },
  }),
};

// ---------------------------------------------------------------------------
// Combinator marks — the low-level `type([children])` form of an operator or
// a dedicated combinator-only construct. `options` on the wire is what these
// field lists describe (nested, unlike operator fields which spread flat).
// ---------------------------------------------------------------------------

export const COMBINATOR_MARKS: Record<string, ConstructDescriptor> = {
  spread: combinatorMark("spread", {
    doc: "Low-level combinator form of `spread`. Its `Spread`/`SpreadOptions` factory carries the same `w`/`h` (FancyDims passthrough to the elaborated layer) the v3 operator now exposes.",
    fields: resolveFields(OPERATORS.spread),
  }),
  stack: combinatorMark("stack", {
    doc: "Low-level combinator form of `stack`. See `spread`'s note on `w`/`h`.",
    fields: resolveFields(OPERATORS.stack),
  }),
  scatter: combinatorMark("scatter", {
    fields: resolveFields(OPERATORS.scatter),
  }),
  group: combinatorMark("group", { fields: resolveFields(OPERATORS.group) }),
  table: combinatorMark("table", { fields: resolveFields(OPERATORS.table) }),

  layer: combinatorMark("layer", {
    doc: "Compose children on the same canvas at (0, 0) unless placed by constraints. Also accepts explicit box dims when given a self-scaling size.",
    include: [boxDims],
    fields: {
      key: { type: t.string, doc: "Internal per-node key override." },
      // A real `layer` option, not a chart-only one: `layer({ coord }, children)`
      // delegates to the `coord` transform (layer.tsx's `options.coord !== undefined`
      // branch), and the deserializer resolves a coord config out of the combinator
      // options (`resolveOptions` in serialize/fromJSON.ts).
      coord: {
        type: t.any,
        doc: "Coordinate transform (`polar()`, `clock()`, `wavy()`, ...) the children are drawn in. Given one, the layer becomes that coordinate boundary.",
      },
      // Rides the same `...restDims` passthrough into `coord(...)`, so it is a
      // real option of the coord-bearing form only (a plain layer ignores it).
      axes: {
        type: t.ref("AxesOptions"),
        doc: "Draw the coordinate axes of this layer's `coord`. Ignored on a layer with no `coord`.",
      },
      transform: {
        type: t.object({
          scale: {
            type: t.object({
              x: { type: t.number },
              y: { type: t.number },
            }),
          },
        }),
        doc: "Non-affine-foldable scale applied to the composed children.",
      },
      box: {
        type: t.boolean,
        doc: 'True renders this as a coordinate-space transparent "box" boundary rather than a plain layer.',
      },
    },
  }),

  enclose: combinatorMark("enclose", {
    doc: "Draw a rounded-rect enclosure around the union of the children's bboxes, padded by `padding`.",
    fields: {
      padding: {
        type: t.number,
        default: 2,
        doc: "Pixels of slack between the children's bbox union and the drawn enclosure.",
      },
      rx: { type: t.number, default: 2, doc: "Corner radius, x." },
      ry: { type: t.number, default: 2, doc: "Corner radius, y." },
      fill: {
        type: t.string,
        default: "none",
        doc: "Fill color of the enclosure.",
      },
      stroke: {
        type: t.string,
        default: "#D1D9E2",
        doc: "Stroke color of the enclosure.",
      },
      strokeWidth: {
        type: t.number,
        default: 1,
        doc: "Stroke width in pixels.",
      },
      strokeDasharray: {
        type: t.string,
        doc: 'Raw SVG stroke-dasharray (e.g. "4 2") for a dashed enclosure.',
      },
      opacity: { type: t.number, default: 1, doc: "Opacity, 0 to 1." },
    },
  }),

  position: combinatorMark("position", {
    doc: "Set a single child's min-corner (x, y) in parent coordinates — an absolute-offset placement primitive, NOT center-anchored. Unlike `enclose`'s convex-hull styling, `position` draws nothing of its own; it exists for cases (e.g. the Topology story's combinator trees) that need to place one child precisely without `enclose`'s fill/stroke/hull limits.",
    fields: {
      key: { type: t.string, doc: "Internal per-node key override." },
      x: ch.num("Min-corner x offset."),
      y: ch.num("Min-corner y offset."),
    },
  }),

  arrow: combinatorMark("arrow", {
    doc: "A perfect-arrows box-to-box arrow between exactly two children.",
    fields: {
      bow: {
        type: t.number,
        default: 0.2,
        doc: "Baseline curvature. 0 is a straight line; higher values bow the arc further from center.",
      },
      stretch: {
        type: t.number,
        default: 0.5,
        doc: "How much the bow grows as the endpoints get closer, and shrinks as they get farther apart.",
      },
      stretchMin: {
        type: t.number,
        default: 40,
        doc: "Distance in pixels below which stretch has its full effect.",
      },
      stretchMax: {
        type: t.number,
        default: 420,
        doc: "Distance in pixels above which stretch has no effect.",
      },
      padStart: {
        type: t.number,
        default: 5,
        doc: "Gap in pixels between the source box and the start of the line.",
      },
      padEnd: {
        type: t.number,
        default: 20,
        doc: "Gap in pixels between the end of the line and the target box, leaving room for the arrowhead.",
      },
      flip: {
        type: t.boolean,
        default: false,
        doc: "Flip which side the arrow bows toward.",
      },
      straights: {
        type: t.boolean,
        default: true,
        doc: "Allow a perfectly straight line when the endpoints are axis-aligned, instead of forcing a slight bow.",
      },
      stroke: {
        type: t.string,
        default: "black",
        doc: "Color of the arrow's line and head, and of the start dot when shown.",
      },
      strokeWidth: {
        type: t.number,
        default: 3,
        doc: "Line width; also scales the arrowhead and the start dot.",
      },
      start: {
        type: t.boolean,
        default: false,
        doc: "Draw a dot at the start endpoint.",
      },
    },
  }),

  line: combinatorMark("line", { fields: resolveFields(LEAF_MARKS.line) }),
  ribbon: combinatorMark("ribbon", {
    fields: resolveFields(LEAF_MARKS.ribbon),
  }),

  treemap: combinatorMark("treemap", {
    doc: "Low-level combinator form of `treemap` (single level). Same fields as the operator form (OPERATORS.treemap) plus `key`.",
    fields: {
      ...resolveFields(OPERATORS.treemap),
      key: { type: t.string, doc: "Internal per-node key override." },
    },
  }),

  // Porter-Duff-style compositing quartet + `over`/`mask`. Wire `type` stays
  // the original Porter-Duff string; `pyName` carries the Figma-inspired
  // JS/Python-facing rename (#196/#202).
  over: combinatorMark("over", {
    doc: "Internal-only A ∪ B union compositing (not exported from lib.ts — use `layer`). Kept only so the deserializer can dispatch the wire type.",
    fields: {
      blendMode: {
        type: t.enum("color", "multiply", "screen", "overlay", "luminosity"),
        default: "color",
        doc: "Blend used where the two regions combine.",
      },
    },
  }),
  inside: combinatorMark("inside", {
    pyName: "intersect",
    doc: "Draw only where both regions overlap: A ∩ B. Binary only.",
    fields: {
      blendMode: {
        type: t.enum("color", "multiply", "screen", "overlay", "luminosity"),
        default: "color",
        doc: "Blend used where the two regions combine.",
      },
    },
  }),
  xor: combinatorMark("xor", {
    pyName: "exclude",
    doc: "Symmetric difference (odd-overlap parity): A ^ B. Binary only.",
    fields: {
      blendMode: {
        type: t.enum("color", "multiply", "screen", "overlay", "luminosity"),
        default: "color",
        doc: "Blend used where the two regions combine.",
      },
    },
  }),
  out: combinatorMark("out", {
    pyName: "subtract",
    doc: "Draw A with B removed: A − B. Binary only.",
    fields: {
      blendMode: {
        type: t.enum("color", "multiply", "screen", "overlay", "luminosity"),
        default: "color",
        doc: "Blend used where the two regions combine.",
      },
    },
  }),
  atop: combinatorMark("atop", {
    pyName: "paint",
    doc: "A is a base surface B is painted onto, clipped to A: A ∪ (B ∩ A). Result sized to A. Binary only.",
    fields: {
      blendMode: {
        type: t.enum("color", "multiply", "screen", "overlay", "luminosity"),
        default: "color",
        doc: "Blend used where the two regions combine.",
      },
    },
  }),
  mask: combinatorMark("mask", {
    doc: "Use A's region as a clip and paint B inside it without drawing A itself: B ∩ A, reporting A's bounds. Binary only. No options.",
    fields: {},
  }),
};

// ---------------------------------------------------------------------------
// Coordinate transforms — not operators/marks in the IR (they ride the chart
// `options.coord` bag), but tabled here so a later stage can emit Python
// factories for them. `kind: "coord"` keeps them out of the operator/mark
// dispatch; they don't need JSON Schema $defs yet (per the design doc).
// ---------------------------------------------------------------------------

// The `py` names are the snake_case convention Python's polar()/clock()
// already used before this table existed; the field names stay the camelCase
// wire keys. Both the generated `_polar_config` and the docs options table read
// them from here.
const polarFields: FieldGroup = group({
  innerRadius: {
    type: t.number,
    default: 0,
    doc: "Donut hole as a fraction [0,1) of the outer radius.",
    py: "inner_radius",
  },
  centralAngle: {
    type: t.number,
    default: 2 * Math.PI,
    doc: "Total angular sweep in radians.",
    py: "central_angle",
  },
  startAngle: {
    type: t.number,
    default: Math.PI / 2,
    doc: "Angle (radians) of θ=0.",
    py: "start_angle",
  },
  direction: {
    type: t.number,
    default: -1,
    doc: "+1 counter-clockwise, -1 clockwise (numeric ±1).",
  },
  center: {
    type: t.tuple(t.number, t.number),
    default: [0, 0],
    doc: "Screen-space center offset.",
  },
});

export const COORDS: Record<string, ConstructDescriptor> = {
  polar: coordTransform("polar", {
    doc: "Maps (θ, r) → screen. θ is the x-axis (alias theta/thetaSize), r is the y-axis (alias r/rSize).",
    fields: polarFields,
  }),
  clock: coordTransform("clock", {
    doc: "A `polar()` preset (0° at 12 o'clock, clockwise — already polar's defaults) kept as a distinct type tag for bbox sampling and user intent.",
    fields: polarFields,
  }),
  wavy: coordTransform("wavy", {
    doc: "A sinusoidal warp of the plane. No options.",
    fields: {},
  }),
  bipolar: coordTransform("bipolar", {
    doc: "Bipolar coordinates from two foci. JS takes `fociDistance` positionally, not as an options object.",
    fields: {
      fociDistance: {
        type: t.number,
        default: 100,
        doc: "Distance in pixels between the two foci.",
      },
    },
  }),
  arcLengthPolar: coordTransform("arcLengthPolar", {
    doc: "Polar-like transform parameterized by arc length. No options.",
    fields: {},
  }),
  linear: coordTransform("linear", {
    doc: "Identity/Cartesian transform. No options.",
    fields: {},
  }),
};

// ---------------------------------------------------------------------------
// Combined lookup — operators + leaf marks + combinator marks share the same
// wire-type namespace collision-free EXCEPT for the intentional dual-form
// overlap (spread/stack/scatter/group/table/line/ribbon appear as both an
// operator and a combinator mark — the `__combinator` flag disambiguates on
// the wire, exactly as schema.ts's `CombinatorMarkIR` doc explains). Coord
// transforms are a separate namespace (chart `options.coord`), not merged in.
// ---------------------------------------------------------------------------

export const ALL_OPERATOR_DESCRIPTORS: readonly ConstructDescriptor[] =
  Object.values(OPERATORS);
export const ALL_LEAF_MARK_DESCRIPTORS: readonly ConstructDescriptor[] =
  Object.values(LEAF_MARKS);
export const ALL_COMBINATOR_MARK_DESCRIPTORS: readonly ConstructDescriptor[] =
  Object.values(COMBINATOR_MARKS);
export const ALL_COORD_DESCRIPTORS: readonly ConstructDescriptor[] =
  Object.values(COORDS);

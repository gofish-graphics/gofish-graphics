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
 * Nested option objects a field points at by name (`AxesOptions`) live in
 * `OPTION_TYPES` below, and chart-level options in `CHART_OPTIONS`.
 *
 * Out of scope for this table (stay hand-authored in `schema.ts` /
 * `jsonSchema.ts` / `validate.ts`, per the design doc's staging): `cut`,
 * `offset`, `ref`, constraints, and the envelope types (ChartIR, LayerIR,
 * DataIR, ChannelValue, LabelIR, TranslateIR). Those are
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

/** How a mark or operator infers a channel's value from its rows: a `size`
 *  sums them, a `pos` averages them, a `color` reads the first row through
 *  the color scale, and a `raw` reads the first row as is. The JS mark
 *  factories' channel maps are generated from it
 *  (gofish-graphics' `markChannels.generated.ts`); the wire, the validator,
 *  the JSON Schema, and Python treat every kind alike. */
export type ChannelInfer = "size" | "pos" | "color" | "raw";

/** The value a `literal` type admits: exactly one string, number, or boolean
 *  (`false` in `title: string | false`). */
export type LiteralValue = string | number | boolean;

export type FieldType =
  | { kind: "string" }
  | {
      kind: "number";
      /** The least value allowed (inclusive). NaN is never at least it. */
      min?: number;
      /** A bound the value must be above (exclusive): `0` for a length that
       *  must be positive. NaN is never above it. */
      exclusiveMin?: number;
      /** Reject Infinity and -Infinity (NaN is never finite). */
      finite?: boolean;
    }
  | { kind: "boolean" }
  | { kind: "any" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "literal"; value: LiteralValue }
  | { kind: "channel"; inner: ChannelInner; infer: ChannelInfer }
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
  /** On a strategy family's `OPTION_TYPES` entry: the Python namespace whose
   *  calls make a value (`Tile`, as in `Tile.squarify()`). The docs name the
   *  option by it; a signature annotates the value's own type instead
   *  (`dict`), since a namespace is not a type ({@link pyType}). */
  pyFamily?: string;
  /** On a named type (`OPTION_TYPES`, `AUTHORED_REFS`): the Python class
   *  that builds a value of it. Its instances already carry the wire keys,
   *  so Python passes them through, and {@link pyType} names the class. */
  pyClass?: string;
  /** On the wire only: a field the producer writes for the consumer (a
   *  Python bridge handle), never an option a user passes. The docs options
   *  tables (`::: gofish-ref`) leave it out; the wire schema and validator
   *  keep it. Default: false. */
  wireOnly?: boolean;
}

export type FieldGroup = Record<string, FieldSpec>;

/** Python's reserved words (`keyword.kwlist`). */
const PY_KEYWORDS: ReadonlySet<string> = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

/** The Python kwarg name for a descriptor field: the field name in snake_case
 *  (`strokeWidth` → `stroke_width`, `emX` → `em_x`), with a trailing
 *  underscore when that is a Python keyword (`from` → `from_`, as PEP 8
 *  advises). The wire key is unaffected (`spec.wire ?? fieldName`): the
 *  Python generator and the docs options tables both call this, so a Python
 *  user types the snake_case name and the serialized IR keeps the camelCase
 *  key. */
export function pyKwarg(fieldName: string): string {
  const snake = fieldName.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return PY_KEYWORDS.has(snake) ? `${snake}_` : snake;
}

/** The small type DSL referenced by the design doc as `t.*`. */
export const t = {
  string: { kind: "string" } as FieldType,
  number: { kind: "number" } as FieldType,
  /** A number with bounds: at least `min`, above `exclusiveMin`, and finite
   *  when `finite` (`t.num({ min: 0, finite: true })` for a pixel padding,
   *  `t.num({ exclusiveMin: 0, finite: true })` for a hex radius). */
  num: (bounds: {
    min?: number;
    exclusiveMin?: number;
    finite?: boolean;
  }): FieldType => ({
    kind: "number",
    ...bounds,
  }),
  boolean: { kind: "boolean" } as FieldType,
  /** Escape hatch for JS-only shapes not worth modeling precisely yet
   *  (an `AnchorSpec`, a JS function accessor). */
  any: { kind: "any" } as FieldType,
  enum: (...values: string[]): FieldType => ({ kind: "enum", values }),
  /** Exactly one value, e.g. `t.literal(false)` for the `false` in JS's
   *  `string | false`. */
  literal: (value: LiteralValue): FieldType => ({ kind: "literal", value }),
  channel: (inner: ChannelInner, infer: ChannelInfer): FieldType => ({
    kind: "channel",
    inner,
    infer,
  }),
  /** A reference by name: to a named option type in `OPTION_TYPES`
   *  (AxesOptions, ...), or to an authored envelope `$def` (LabelIR,
   *  ConstraintIR, TranslateIR, ...) that stays hand-written in schema.ts /
   *  jsonSchema.ts. */
  ref: (name: string): FieldType => ({ kind: "ref", name }),
  union: (...options: FieldType[]): FieldType => ({ kind: "union", options }),
  array: (items: FieldType): FieldType => ({ kind: "array", items }),
  tuple: (...items: FieldType[]): FieldType => ({ kind: "tuple", items }),
  object: (fields: FieldGroup): FieldType => ({ kind: "object", fields }),
  /** `Record<string, valueType>` — a string-keyed bag with no fixed key set
   *  (e.g. `derive`'s `schema`: column name → column type). */
  record: (valueType: FieldType = { kind: "string" }): FieldType => ({
    kind: "record",
    valueType,
  }),
};

/** Shorthand for a bare `ChannelValue` slot, one per inference kind
 *  ({@link ChannelInfer}): `ch.size(doc?)` and `ch.pos(doc?)` take a number,
 *  `ch.color(doc?)` a color, and `ch.raw(inner, doc?)` a literal of `inner`. */
export const ch = {
  size: (doc?: string): FieldSpec => ({
    type: t.channel("number", "size"),
    doc,
  }),
  pos: (doc?: string): FieldSpec => ({ type: t.channel("number", "pos"), doc }),
  color: (doc?: string): FieldSpec => ({
    type: t.channel("color", "color"),
    doc,
  }),
  raw: (inner: ChannelInner, doc?: string): FieldSpec => ({
    type: t.channel(inner, "raw"),
    doc,
  }),
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
// Declared once here rather than merged into each entry; `acceptedFields`
// (at the end of this file) folds them into a construct's own fields.
// ---------------------------------------------------------------------------

/** Every leaf/combinator/ref/offset/cut mark carries these (LeafMarkIR /
 *  CombinatorMarkIR common fields in schema.ts). Combinator marks also carry
 *  `children` (required) and wrap their own fields in `options` on the wire. */
export const MARK_BASE_FIELDS: FieldGroup = group({
  name: { type: t.string, doc: 'Layer name, from `.name("...")`.' },
  label: { type: t.ref("LabelIR") },
  relate: { type: t.array(t.ref("RelateClauseIR")) },
  zOrder: { type: t.number },
  translate: { type: t.ref("TranslateIR") },
  debug: {
    type: t.boolean,
    doc: "Dev-only flag: on the shape marks (rect, circle, ellipse, petal, text, image, polygon, blank) it logs the mark's key and datum to the console as the mark is built. It changes nothing about what is drawn; the connector marks accept it and ignore it.",
  },
  // Python bridge fields (the serialization essay's "Bridge extensions"):
  // the renderer reads them, so they are declared like any other field.
  __scope: {
    type: t.literal(true),
    doc: "The mark is a component: the Python @mark decorator's output. The renderer seals it like a JS createMark component.",
  },
  __datum: {
    type: t.any,
    doc: "Python bind_data(): the datum the mark is pre-bound to.",
  },
  __key: {
    type: t.union(t.string, t.number),
    doc: "Python bind_data(): the key the mark is pre-bound to.",
  },
});

/** The base fields the Python generator exposes as leaf-mark kwargs (the
 *  rest of MARK_BASE_FIELDS ride Mark methods: `.name()`, `.z_order()`,
 *  `.translate()`, `.relate()`, `.label()`). Labeling a leaf mark is done
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

/** The base fields the Python generator exposes as kwargs on every operator
 *  core and dual-form combinator core (the rest of OPERATOR_BASE_FIELDS ride
 *  Operator methods: `.label()`, `.translate()`). */
export const PY_OPERATOR_BASE_KWARGS: FieldGroup = group({
  debug: OPERATOR_BASE_FIELDS.debug,
});

/** The base fields that ride inside a combinator mark's `options` on the
 *  wire. The rest of MARK_BASE_FIELDS (`name`, `label`, `relate`, `zOrder`,
 *  `translate`) sit beside `options` on the node, set by Mark methods; only
 *  `debug` is a factory option (the Python combinator cores send it there). */
export const COMBINATOR_OPTIONS_BASE_FIELDS: FieldGroup = group({
  debug: MARK_BASE_FIELDS.debug,
});

/** The options of one `.label(accessor, options?)` call: every field of a
 *  `LabelSpecIR` (schema.ts) but the `accessor`. Marks and operators share
 *  them; the JSON Schema's `LabelIR`, the validator, and the Python
 *  generator (`_label_opts`) all read this group. */
export const LABEL_OPTIONS: FieldGroup = group({
  position: {
    type: t.string,
    doc: 'Label position, e.g. "center", "outset-top", "inset-bottom-start".',
  },
  fontSize: { type: t.number, doc: "Font size in pixels." },
  color: {
    type: t.string,
    doc: "Label color. Omitted, it is chosen to contrast with the mark.",
  },
  offset: { type: t.number, doc: "Offset from the shape's edge in pixels." },
  rotate: { type: t.number, doc: "Rotation in degrees, clockwise on screen." },
  fontFamily: {
    type: t.string,
    doc: "Font family of the label's text node. Omitted, the elaborator's own font family.",
  },
  fontWeight: {
    type: t.union(t.number, t.string),
    doc: 'Font weight, e.g. "bold" or a numeric weight.',
  },
  fontStyle: { type: t.string, doc: 'Font style, e.g. "italic".' },
});

// ---------------------------------------------------------------------------
// Option types — named nested option objects
// ---------------------------------------------------------------------------

/** One axis's options: a boolean (show or hide it, title inferred) or an
 *  object of named options. Mirrors the JS `AxisOptions` in
 *  `gofish-graphics/src/ast/gofish.tsx`. */
const axisOptions: FieldSpec = {
  doc: "One axis's options: a boolean shows or hides it (title inferred); an object sets title, side, labelAngle, and the rows of a time axis.",
  type: t.union(
    t.boolean,
    t.object({
      title: {
        type: t.union(t.string, t.literal(false)),
        doc: "Axis title. A string sets it; false suppresses the inferred title.",
      },
      side: {
        type: t.enum("start", "end"),
        doc: 'Which frame edge the axis sits on: "start" is the near (origin) edge, "end" the far edge. Omitted, a continuous x-axis sits at the visual bottom.',
      },
      labelAngle: {
        type: t.union(t.number, t.array(t.number), t.enum("auto")),
        doc: 'Rotate tick and category labels by this many degrees, clockwise on screen (like Vega-Lite\'s labelAngle). A number applies to every tier of a nested ordinal axis; an array is per tier, from the innermost tier outward; "auto" picks 0, 45, or 90 degrees per label row so labels do not collide.',
      },
      rows: {
        type: t.array(t.ref("Calendar")),
        doc: "The label rows of a time axis, inner row first, e.g. [Calendar.month, Calendar.year]. Each row is one calendar partition: its ticks are its cells' starts, and each label is centered on its cell's start tick. The domain is niced outward to the inner row's cells. Default: the level and step the domain picks for about 10 ticks, then its parent level. In JS a row's labels can be custom: Calendar.quarter.format(fn), with fn a function of the cell. A row with a format is JS-only (it has no wire form).",
      },
    })
  ),
};

// ---------------------------------------------------------------------------
// Strategy families — one table of the strategy objects that cross the wire
// ---------------------------------------------------------------------------

/** One kind of strategy: its params, which sit beside `kind` in the strategy
 *  object (`{ kind: "squarify", ratio: 1 }`). */
export interface StrategyKind {
  doc: string;
  params: FieldGroup;
}

/** A factory that makes a kind with some of its params already set
 *  (`Overlap.sina()` is `noise` with `smoothing: "silverman"`). An option the
 *  caller passes overrides the preset value. */
export interface StrategyPreset {
  kind: string;
  /** Param values, by field name, set before the caller's options. */
  values: Record<string, unknown>;
  doc: string;
}

/** A strategy family: an option's value is one choice from its kinds, made
 *  by a call in the family's namespace (`Tile.squarify()`). */
export interface StrategyFamily {
  doc: string;
  /** The kinds, by their wire `kind`. Each also has a factory of the same
   *  name (`pyKwarg` spelling in Python: `sliceDice` → `slice_dice`). */
  kinds: Record<string, StrategyKind>;
  /** Further factories, each a kind with some params preset. */
  presets?: Record<string, StrategyPreset>;
}

/** Pixels between neighboring dots, for both overlap kinds. */
const overlapPadding: FieldSpec = {
  type: t.num({ min: 0, finite: true }),
  default: 0,
  doc: "Pixels kept between neighboring dots.",
};

/**
 * The strategy families whose values cross the Python↔JS wire, by family
 * name. A strategy is a plain object `{ kind, ...params }`, the same in JS
 * and on the wire; in Python its param keys are snake_case, renamed to the
 * wire keys at the option it is passed to, like any nested option dict.
 *
 * Read by: the `OPTION_TYPES` entry each family derives (so a field takes a
 * strategy with `t.ref("Tile")`, and the validator, the JSON Schema and the
 * Python generator all see one shape), `checkStrategy` in validate.ts (the
 * one check the JS layout runs on a strategy it is handed), and the Python
 * generator, which writes `gofish/<family>.py` from it.
 *
 * `Coord` and `Color` are not strategy families in this sense: a coordinate
 * transform is a JS object of functions, rebuilt on the JS side from a
 * `type`-tagged config (`COORDS` above), and a color scale is tagged by
 * `_tag` and takes its one argument by position.
 */
export const STRATEGIES = {
  Tile: {
    doc: "How `treemap` tiles its box: the value of its `tile` option. Each kind is one of d3-hierarchy's tiling methods.",
    kinds: {
      squarify: {
        doc: "Squarified tiling (d3's `treemapSquarify`): make tiles as close as possible to the aspect `ratio`. The default.",
        params: {
          ratio: {
            type: t.num({ min: 1 }),
            doc: "Target tile aspect ratio: the longer side over the shorter side, at least 1 (orientation is not chosen). Omitted, d3's default, the golden ratio. 1 aims for square tiles, which suits one circle per leaf.",
          },
        },
      },
      slice: {
        doc: "Lay the tiles out in one column, stacked along y (d3's `treemapSlice`).",
        params: {},
      },
      dice: {
        doc: "Lay the tiles out in one row, side by side along x (d3's `treemapDice`).",
        params: {},
      },
      binary: {
        doc: "Split the tiles into two halves of near-equal weight, recursively (d3's `treemapBinary`).",
        params: {},
      },
      sliceDice: {
        doc: "Alternate slice and dice by depth (d3's `treemapSliceDice`).",
        params: {},
      },
    },
  },
  Overlap: {
    doc: "How `scatter` keeps its children clear of each other on the axis no field places: the value of its `overlap` option. Both kinds grow from the `alignment` line and move only that free axis.",
    kinds: {
      separate: {
        doc: "Keep dots apart: each dot keeps its position on the data axis and moves along the free axis to the free spot nearest the alignment line, in data order, so no two dots overlap. The result is a beeswarm (Observable Plot's `dodge`).",
        params: { padding: overlapPadding },
      },
      noise: {
        doc: "Spread the dots inside an outline that follows how many dots share each part of the data axis: each dot adds a small bell-shaped bump, and the outline is the sum of the bumps. Dots may still touch.",
        params: {
          randomness: {
            type: t.enum("blue", "quasi", "uniform"),
            default: "blue",
            doc: 'How offsets are drawn inside the outline: "blue" keeps each dot as far from its placed neighbors as it can, "quasi" spreads the dots by rank (fastest), "uniform" draws seeded uniform offsets.',
          },
          smoothing: {
            type: t.union(t.num({ min: 0 }), t.enum("silverman")),
            default: 0,
            doc: "The bandwidth of each dot's bell, in data units of the data axis: 0 is no smoothing beyond the dots' own size, Infinity is a flat band, and \"silverman\" computes it from the data.",
          },
          padding: {
            ...overlapPadding,
            doc: 'Pixels added to each dot\'s width when the outline is sized and, for "blue" randomness, when distances are compared.',
          },
          seed: {
            type: t.num({ finite: true }),
            default: 0,
            doc: 'Seed for "blue" and "uniform" randomness, so a render is the same every time.',
          },
        },
      },
    },
    presets: {
      sina: {
        kind: "noise",
        values: { smoothing: "silverman" },
        doc: 'A sina plot: noise with smoothing "silverman", a bandwidth computed per scatter from the data (ggforce\'s `geom_sina`). The outline is the curve a violin plot draws. Any option overrides the preset.',
      },
      jitter: {
        kind: "noise",
        values: { randomness: "uniform", smoothing: Infinity },
        doc: 'Classic jitter: noise with randomness "uniform" and smoothing Infinity, so the dots get uniform random offsets in a flat band. Any option overrides the preset.',
      },
    },
  },
  Curve: {
    doc: "How a path runs through its points: the value of the `curve` option of `line` and `ribbon`. `linear`, `step`, `monotone` and `smooth` are read over the parameter of the run, from the least to the most smooth; `catmullRom` is a shape on screen; `bezier`, `orthogonal`, `arc` and `perfectArrows` route each pair of neighboring points.",
    kinds: {
      linear: {
        doc: "Straight segments from each point to the next.",
        params: {},
      },
      step: {
        doc: "Hold every value that depends on the ordering field until the next point, then jump: a staircase when the ordering field is an axis.",
        params: {},
      },
      monotone: {
        doc: "Piecewise monotone cubic: between two neighboring points each coordinate only rises or only falls (d3 `curveMonotoneX`).",
        params: {},
      },
      smooth: {
        doc: "A rounder cubic over the same parameter as `monotone`; it can go a little past a point, but keeps a run of equal values flat.",
        params: {},
      },
      catmullRom: {
        doc: "A centripetal Catmull-Rom through the points on screen.",
        params: {},
      },
      bezier: {
        doc: "Cubic bezier between each pair of points (the d3 `linkVertical`/`linkHorizontal` convention).",
        params: {},
      },
      orthogonal: {
        doc: "Right-angle elbow bending at the main-axis midpoint (GoTree orthogonal).",
        params: {
          bend: {
            type: t.enum("auto"),
            doc: 'Omitted, the elbow bends on the connector\'s `dir` axis; "auto" infers the bend axis from the endpoint geometry instead, for layouts with no single growth axis.',
          },
        },
      },
      arc: {
        doc: "Semicircular arc through both endpoints (GoTree arccurve).",
        params: {
          direction: {
            type: t.enum("up", "down"),
            default: "up",
            doc: "Which side the arc bulges toward.",
          },
        },
      },
      perfectArrows: {
        doc: "Box-to-box arc from the perfect-arrows library.",
        params: {
          bow: {
            type: t.number,
            default: 0,
            doc: "Baseline curvature. 0 is a straight line.",
          },
          stretch: {
            type: t.number,
            default: 0.25,
            doc: "How much the bow grows as the endpoints get closer, and shrinks as they get farther apart.",
          },
          stretchMin: {
            type: t.number,
            default: 50,
            doc: "Distance in pixels below which stretch has its full effect.",
          },
          stretchMax: {
            type: t.number,
            default: 420,
            doc: "Distance in pixels above which stretch has no effect.",
          },
          padStart: {
            type: t.number,
            default: 0,
            doc: "Gap in pixels between the source box and the start of the arc.",
          },
          padEnd: {
            type: t.number,
            default: 20,
            doc: "Gap in pixels between the end of the arc and the target box.",
          },
          flip: {
            type: t.boolean,
            default: false,
            doc: "Flip which side the arc bows toward.",
          },
          straights: {
            type: t.boolean,
            default: true,
            doc: "Allow a straight line when the endpoints are axis-aligned, instead of forcing a slight bow.",
          },
        },
      },
    },
  },
  Bin: {
    doc: "The cells a key built from two fields is binned into: the value of `struct({ x, y }).bin(...)`. Each kind divides the plane of the two fields into cells that do not overlap, and puts each row in the cell its point falls in.",
    kinds: {
      hex: {
        doc: "A grid of hexagons with a corner at the top (pointy-top, as in d3-hexbin, ggplot2's `geom_hex` and Observable Plot), with one hexagon centered on the origin (0, 0). The grid covers the domain of the two fields in the chart's data, and every hexagon in it is a cell, empty ones included.",
        params: {
          radius: {
            type: t.union(
              t.num({ exclusiveMin: 0, finite: true }),
              t.object({
                x: {
                  type: t.num({ exclusiveMin: 0, finite: true }),
                  required: true,
                  doc: "The radius in units of the x field.",
                },
                y: {
                  type: t.num({ exclusiveMin: 0, finite: true }),
                  required: true,
                  doc: "The radius in units of the y field.",
                },
              })
            ),
            required: true,
            doc: "The distance from a hexagon's center to its corners, in data units. A number when both fields share a unit (longitude and latitude), or `{ x, y }`, one per field, when they do not (as in ggplot2's `binwidth = c(x, y)`).",
          },
        },
      },
      voronoi: {
        doc: "One cell per seed: the points nearer to that seed than to any other (a Voronoi diagram). Each row goes to its nearest seed. The cells are clipped to the box that holds the data and the seeds.",
        params: {
          seeds: {
            type: t.array(t.record(t.any)),
            required: true,
            doc: "The seed rows, with the same two fields as the key, such as weather stations for rain gauge readings. Pass the chart's own data to give each row its own cell.",
          },
        },
      },
    },
  },
} satisfies Record<string, StrategyFamily>;

/** The name of a strategy family: `"Tile"`, `"Overlap"`, `"Curve"` or
 *  `"Bin"`. */
export type StrategyFamilyName = keyof typeof STRATEGIES;

/** The value type of a strategy family: a union of one object per kind, told
 *  apart by its `kind`. */
function strategyType(family: StrategyFamily): FieldType {
  return t.union(
    ...Object.entries(family.kinds).map(([kind, { params }]) =>
      t.object({ kind: { type: t.literal(kind), required: true }, ...params })
    )
  );
}

/** A Calendar value's wire form: a partition of the time line into calendar
 *  cells (`CalendarPartition` in gofish-graphics/src/ast/calendar.ts). */
const calendarPartition: FieldSpec = {
  doc: "A calendar partition: a level (unit) at a step, e.g. Calendar.month.every(3).",
  type: t.object({
    unit: {
      type: t.enum(
        "second",
        "minute",
        "hour",
        "day",
        "week",
        "month",
        "quarter",
        "year"
      ),
      doc: "The calendar level of each cell.",
    },
    step: {
      type: t.number,
      default: 1,
      doc: "How many units one cell spans; steps align to the level above.",
    },
    start: {
      type: t.enum("monday", "sunday"),
      doc: "The first day of a week (weeks only).",
    },
  }),
};

/** Chart-level options: `chart(data, {...})` in JS, `chart(data, **options)`
 *  in Python, `ChartIR.options` on the wire. Mirrors the JS `ChartOptions` in
 *  `gofish-graphics/src/ast/marks/chartBuilder.ts`. The Python generator
 *  (`_chart_opts`) reads it; the IR validator, the JSON Schema, and the docs
 *  options table (`::: gofish-ref ChartOptions`) read it as the named option
 *  type `ChartOptions` (`OPTION_TYPES`). */
export const CHART_OPTIONS: FieldGroup = group({
  w: { type: t.number, doc: "Chart width in pixels." },
  h: { type: t.number, doc: "Chart height in pixels." },
  coord: {
    type: t.any,
    doc: "Coordinate transform for the whole chart, made by a call in the Coord family: Coord.polar(), Coord.clock(), Coord.wavy(), ...",
  },
  color: {
    type: t.any,
    doc: "Color scale for every mark, made by a call in the Color family: Color.palette(...) or Color.gradient(...).",
  },
  axes: {
    type: t.ref("AxesOptions"),
    doc: "Draw axes: a boolean for both axes, or per-axis options {x?, y?}.",
  },
  legend: {
    type: t.boolean,
    default: true,
    doc: "Draw the color legend. Turned off, the marks keep their colors and only the legend is dropped.",
  },
  padding: {
    type: t.number,
    doc: "Extra padding in pixels between the plot and the SVG edge (polar charts, overflowing labels).",
  },
  schema: {
    type: t.record(t.any),
    doc: "Column types, keyed by column name, e.g. Schema.ordered(levels) or Schema.time().",
  },
});

/** Named option types: the nested option objects a field points at with
 *  `t.ref(name)`, declared in the same type DSL as the construct fields. Each
 *  consumer resolves a ref through this table: `jsonSchema.ts` emits one
 *  `$def` per entry, `validate.ts` walks the value with the generic field-type
 *  interpreter, and the Python generator renames the keys of a nested dict
 *  with `pyKwarg`, the same rule as the top-level kwargs
 *  (`axes={"x": {"label_angle": 45}}` serializes as `labelAngle`).
 *
 *  A ref that is not in this table names a hand-authored envelope `$def`
 *  (LabelIR, TranslateIR, FieldAccessor, ...). */
export const OPTION_TYPES: Readonly<Record<string, FieldSpec>> = {
  AxisOptions: axisOptions,
  Calendar: calendarPartition,
  AxesOptions: {
    doc: "Per-node axis override: a boolean shows or hides both axes; an object sets each axis on its own.",
    type: t.union(
      t.boolean,
      t.object({
        x: { type: t.ref("AxisOptions"), doc: "Options for the x axis." },
        y: { type: t.ref("AxisOptions"), doc: "Options for the y axis." },
      })
    ),
  },
  AxisInterval: {
    doc: "One axis of a `dims` option as an interval: `size` is a size channel, `min`/`center`/`max` are position channels.",
    type: t.object({
      min: ch.pos("Start edge position."),
      center: ch.pos("Center position."),
      max: ch.pos("End edge position."),
      size: ch.size("Size along the axis."),
      embedded: {
        type: t.boolean,
        doc: "Embed this axis in the parent's space.",
      },
    }),
  },
  FieldPredicate: {
    pyClass: "FieldPredicate",
    doc: "A field predicate, as `field(name).between(lo, hi, { closed })` builds it: the field it reads and the interval it tests.",
    type: t.object({
      field: {
        type: t.string,
        required: true,
        doc: "The field whose value is tested.",
      },
      between: {
        type: t.tuple(t.number, t.number),
        required: true,
        doc: "The interval's ends, `[lo, hi]`, compared by value.",
      },
      closed: {
        type: t.enum("both", "left", "right", "none"),
        default: "both",
        doc: "Which ends of the interval are inclusive, as in polars' `is_between`.",
      },
    }),
  },
  ChartOptions: {
    doc: "Chart-level options: chart(data, {...}) in JS, chart(data, **options) in Python.",
    type: t.object(CHART_OPTIONS),
  },
  AxisDimsValue: {
    doc: "A `dims` entry: a bare channel value (a position) or an interval. A channel value that is an object is tagged (`field(...)`, `datum(...)`), so an untagged object is an interval.",
    type: t.union(t.channel("number", "pos"), t.ref("AxisInterval")),
  },
  // Each strategy family (`STRATEGIES`) is one entry, under its family name.
  ...Object.fromEntries(
    Object.entries(STRATEGIES).map(([name, family]) => [
      name,
      { doc: family.doc, type: strategyType(family), pyFamily: name },
    ])
  ),
};

/** The refs a field may name that are not `OPTION_TYPES` entries: shapes
 *  authored by hand in schema.ts / jsonSchema.ts and walked by their own
 *  validator walkers. `pyClass` names the Python class that builds a value. */
export const AUTHORED_REFS: Readonly<Record<string, { pyClass?: string }>> = {
  FieldAccessor: { pyClass: "FieldAccessor" },
  StructAccessor: { pyClass: "StructAccessor" },
  LabelIR: {},
  TranslateIR: {},
  RelateClauseIR: {},
};

/** The Python class for a named type, if it has one. */
export function refPyClass(name: string): string | undefined {
  return OPTION_TYPES[name]?.pyClass ?? AUTHORED_REFS[name]?.pyClass;
}

/**
 * The Python type of a field type, as the generated factory signatures
 * annotate it (`"annotation"`) and the Python docs tables print it
 * (`"doc"`). A channel takes a literal or a field name; a named type is its
 * Python class when it has one, else the type it stands for. The one
 * difference between the two uses: a strategy family is a namespace, not a
 * type, so the docs name it (`Tile`) and an annotation spells the value it
 * makes (`dict`).
 */
export function pyType(
  f: FieldType,
  use: "annotation" | "doc" = "annotation"
): string {
  switch (f.kind) {
    case "string":
    case "enum":
      return "str";
    case "number":
      return "float";
    case "boolean":
      return "bool";
    case "literal":
      return `Literal[${typeof f.value === "boolean" ? (f.value ? "True" : "False") : JSON.stringify(f.value)}]`;
    case "channel":
      return f.inner === "number"
        ? "int | float | str"
        : f.inner === "boolean"
          ? "bool"
          : "str";
    case "union":
      return [...new Set(f.options.map((o) => pyType(o, use)))].join(" | ");
    case "array":
      // An array of records is a table: Python reads a dataframe too.
      if (f.items.kind === "record")
        return use === "doc" ? "list | DataFrame" : "Any";
      return "list";
    case "tuple":
      return "tuple";
    case "object":
    case "record":
      return "dict";
    case "ref": {
      const cls = refPyClass(f.name);
      if (cls !== undefined) return cls;
      const named = OPTION_TYPES[f.name];
      if (named === undefined) return "Any";
      if (use === "doc" && named.pyFamily !== undefined) return named.pyFamily;
      return pyType(named.type, use);
    }
    case "any":
      return "Any";
  }
}

// ---------------------------------------------------------------------------
// Shared field groups
// ---------------------------------------------------------------------------

/** A `dims` option: axis name → value or interval (`AxisDims` in schema.ts).
 *  The names are `x`/`y` plus whatever the enclosing coordinate space
 *  declares, known only at render time, so the key set is open — the one named
 *  escape hatch for axis names, next to the closed x/y/w/h keys. */
const axisDims = (doc: string): FieldSpec => ({
  type: t.record(t.ref("AxisDimsValue")),
  doc,
});

/** The `FancyDims` channels (`dims.ts` XYWHDims): the closed x/y/w/h keys,
 *  which mean axis 0/1 in every coordinate space, plus the open `dims` bag
 *  keyed by axis name. Included wholesale by marks whose factory spreads a
 *  bare `...fancyDims: FancyDims<MaybeValue<number>>` (rect, ellipse, petal,
 *  text, image, treemap, layer's `Layer(dims, children)` form), and by
 *  circle, which hands them to its ellipse. Marks that destructure a fixed
 *  subset (blank) declare their own fields instead of including this group. */
export const boxDims: FieldGroup = group({
  x: ch.pos("Left edge position."),
  cx: ch.pos("Center x."),
  x2: ch.pos("Right edge position."),
  w: ch.size("Width."),
  emX: { type: t.boolean, doc: "Embed x in the parent's x space." },
  y: ch.pos(
    "Start edge on y: the top edge where y reads top-down, the bottom edge where it grows upward."
  ),
  cy: ch.pos("Center y."),
  y2: ch.pos("Other y edge position."),
  h: ch.size("Height."),
  emY: { type: t.boolean, doc: "Embed y in the parent's y space." },
  dims: axisDims(
    "Box dimensions by axis name: x/y, or a name the enclosing coordinate space declares (polar theta/r, geo lon/lat). Each value is a position (like x) or an interval {min, center, max, size, embedded}."
  ),
});

/** `rect`'s full paint group (the only leaf mark that supports all five —
 *  ellipse/petal/circle support a different set (no filter; ellipse and
 *  circle add fillOpacity) and declare their paint fields directly rather
 *  than including this group). */
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

/** The box fields `spread` and `stack` (a re-tagged `spread({glue: true})`)
 *  share. `x`/`y` place the operator's box in the parent's space: `Spread`
 *  spreads its `FancyDims` into the box, like treemap's. `w`/`h` are the
 *  data-driven operator extent (#4/#20, field/datum-driven cross-axis
 *  sizing), and `size` the per-entry stack-axis extent (#700 Phase 2);
 *  `size: field(<name>).normalize()` (a field accessor with a `normalize`
 *  pipeline op) is the space-filling spine (mosaic/marimekko) that replaced
 *  the old `normalize: true` layout flag. */
const spreadBoxFields: FieldGroup = group({
  x: ch.pos(
    "Left edge of this operator's box, in the parent's space (pixels). Omitted, the parent places it."
  ),
  y: ch.pos(
    "Start edge on y (top where y reads top-down, bottom where it grows upward) of this operator's box, in the parent's space (pixels). Omitted, the parent places it."
  ),
  w: ch.size("Data-driven cross-axis extent (field/datum-sized children)."),
  h: ch.size("Data-driven cross-axis extent (field/datum-sized children)."),
  size: ch.size(
    "Per-entry stack-axis extent (field/datum-sized children); a field(...).normalize() accessor makes it a space-filling spine."
  ),
});

// ---------------------------------------------------------------------------
// Operators (all 9) — grounded in schema.ts interfaces + validate.ts's
// per-type checks + the fluent factories in graphicalOperators/ and marks/chart.ts.
// ---------------------------------------------------------------------------

export const OPERATORS: Record<string, ConstructDescriptor> = {
  derive: operator("derive", {
    doc: "Transforms the data with a function, `derive(fn)`. A function does not serialize: the IR carries a Python bridge handle in its place.",
    fields: {
      lambdaId: {
        type: t.string,
        wireOnly: true,
        doc: "Python-bridge handle for the remote callable.",
      },
      schema: {
        type: t.record(t.any),
        doc: "Column types of the result, keyed by column name, as in a chart's schema, e.g. Schema.ordered(levels) or Schema.time(). They override the types the result keeps from its input or infers, and convert values (an ISO string in a time column becomes an instant).",
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
        type: t.array(t.record(t.any)),
        required: true,
        doc: "The right-hand table, inlined as JSON rows.",
      },
    },
  }),

  filter: operator("filter", {
    doc: "Keep the rows a field predicate accepts (`filter(field(name).between(lo, hi, { closed }))`). A filter over a hand-written predicate has no wire form and serializes as an opaque `derive`.",
    fields: {
      predicate: {
        type: t.ref("FieldPredicate"),
        required: true,
        doc: "The field predicate `field(name).between(lo, hi, { closed })` builds: `{ field, between: [lo, hi], closed? }`.",
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
      dir: {
        type: t.string,
        doc: "Axis to spread along: x, y, or an axis name the enclosing coordinate space declares (polar theta/r, geo lon/lat).",
      },
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
      ...spreadBoxFields,
    },
  }),

  stack: operator("stack", {
    doc: "`spread({ glue: true })` under its own wire tag — children glued together (touching, no gaps).",
    fields: {
      by: {
        type: t.union(t.string, t.ref("FieldAccessor")),
        doc: "Field to partition rows by; also accepts a field(...) accessor carrying domain ops (sort/reverse/bin).",
      },
      dir: {
        type: t.string,
        doc: "Axis to stack along: x, y, or an axis name the enclosing coordinate space declares (polar theta/r, geo lon/lat).",
      },
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
      ...spreadBoxFields,
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
      x: ch.pos("Point position, x."),
      y: ch.pos("Point position, y."),
      xMin: ch.pos("Range form: left/bottom edge, x."),
      xMax: ch.pos("Range form: right/top edge, x."),
      yMin: ch.pos("Range form: left/bottom edge, y."),
      yMax: ch.pos("Range form: right/top edge, y."),
      dims: axisDims(
        "Placement by axis name: x/y, or a name the enclosing coordinate space declares (polar theta/r, geo lon/lat). A bare value or {center} is the point, {min, max} the span."
      ),
      alignment: {
        type: t.string,
        default: "baseline",
        doc: "Cross-axis alignment for the axis without an explicit position.",
      },
      overlap: {
        type: t.ref("Overlap"),
        doc: 'How children keep clear of each other on the axis no field places, made by a call in the Overlap family. Overlap.separate({padding}) is a beeswarm: each dot moves to the free spot nearest the alignment line, so the counts set the width. Overlap.noise({randomness, smoothing, padding, seed}) spreads the dots inside an outline that follows how many dots share each part of the data axis: each dot adds a small bell-shaped bump, and the outline is the sum of the bumps. randomness is "blue" (default), "quasi" or "uniform". smoothing is the bandwidth of each bell in data units, 0 or more (default 0: no smoothing beyond the size of the dots), Infinity for a flat band, or "silverman" to compute it from the data. Overlap.sina() is noise with smoothing "silverman" (a violin outline), and Overlap.jitter() is noise with randomness "uniform" and smoothing Infinity (classic jitter); both make kind "noise". Both kinds grow from the `alignment` line: "middle" both ways, "start"/"baseline" to the positive side, "end" to the negative side. Omit it and every child sits on the line. Strategies move only the free axis. Linear coordinate spaces only.',
      },
      axes: { type: t.ref("AxesOptions") },
      w: ch.size(
        "Fixed cross-axis extent, or a field name sizing this operator's own box from data."
      ),
      h: ch.size(
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
      // `dims` names the same box by axis name and is written onto it by the
      // resolveAliases pass (`deferAxisDims`); each slot infers as its
      // top-level counterpart.
      x: ch.pos(
        "Left edge of the box the treemap tiles into, in the parent's space (pixels). Omitted, the parent places the treemap."
      ),
      y: ch.pos(
        "Start edge on y (top where y reads top-down, bottom where it grows upward) of the box the treemap tiles into, in the parent's space (pixels). Omitted, the parent places the treemap."
      ),
      w: ch.size(
        "Width of the box the treemap tiles into; a number is pixels, a data-driven value scales through the layout. Omitted, the treemap fills the slot its parent allots."
      ),
      h: ch.size(
        "Height of the box the treemap tiles into; a number is pixels, a data-driven value scales through the layout. Omitted, the treemap fills the slot its parent allots."
      ),
      dims: axisDims(
        "The box the treemap tiles into, by axis name: x/y, or a name the enclosing coordinate space declares (polar theta/r, geo lon/lat). Each value is a position (like x) or an interval {min, center, max, size, embedded}."
      ),
      by: {
        type: t.union(t.string, t.ref("FieldAccessor")),
        doc: "Field to partition rows by (like spread/group); also accepts a field(...) accessor carrying domain ops (sort/reverse/bin/dropNulls). Without `by`, one leaf is emitted per row.",
      },
      spacing: {
        type: t.number,
        default: 0,
        doc: "Gap between sibling tiles, in pixels.",
      },
      padding: {
        type: t.number,
        default: 0,
        doc: "Inset around the outer edge of the treemap, in pixels.",
      },
      round: {
        type: t.boolean,
        default: true,
        doc: "Round pixel positions and sizes.",
      },
      tile: {
        type: t.ref("Tile"),
        default: { kind: "squarify" },
        doc: "The tiling strategy, made by a call in the Tile family: Tile.squarify({ ratio? }), Tile.slice(), Tile.dice(), Tile.binary(), or Tile.sliceDice(). Each is one of d3-hierarchy's tiling methods.",
      },
      sort: {
        type: t.enum("asc", "desc", "none"),
        default: "desc",
        doc: "Sort leaves by weight before layout.",
      },
      size: ch.size(
        "Per-leaf weight driving tile area (entry-flagged per split entry); a field name aggregates (sums by default) per group."
      ),
    },
  }),

  pack: operator("pack", {
    doc: "Circle packing: place the flow's groups (or rows) so their enclosing circles touch without overlapping, with d3's front-chain algorithm. Children keep their pixel size; the pack does not fit itself to the available space yet (#967).",
    fields: {
      by: {
        type: t.union(t.string, t.ref("FieldAccessor")),
        doc: "Field to partition rows by (like spread/scatter); also accepts a field(...) accessor carrying domain ops (sort/reverse/bin/dropNulls). Without `by`, one child per row.",
      },
    },
  }),

  partition: operator("partition", {
    doc: "Divide the space into the cells of a binned key, and give each group its cell. Each cell sits at its true place on one continuous scale, so a cell's width follows its width in data, and an empty cell keeps its place. A mark with no size of its own fills its cell, and a mark with a size of its own is centered in it.",
    fields: {
      by: {
        type: t.union(
          t.ref("FieldAccessor"),
          t.object({
            x: { type: t.ref("FieldAccessor"), required: true },
            y: { type: t.ref("FieldAccessor"), required: true },
          }),
          t.ref("StructAccessor")
        ),
        required: true,
        doc: "A key that has a region: a binned field, field(x).bin(p), whose cells divide the axis `dir`. Or one binned field per axis, { x: field(a).bin(p), y: field(b).bin(q) }, whose cells divide both axes into rectangles; this is the partition on x, then the partition on y. Or two fields binned together, struct({ x: a, y: b }).bin(Bin.hex({ radius })) or .bin(Bin.voronoi({ seeds })), whose cells are polygons over both axes. A plain field, or a struct with no bin, has no region and is an error.",
      },
      dir: {
        type: t.string,
        doc: "Axis to divide: x, y, or an axis name the enclosing coordinate space declares (polar theta/r). Required with a single key, and not allowed with a key per axis.",
      },
      alignment: {
        type: t.string,
        default: "baseline",
        doc: 'Alignment of the children on the other axis ("start" | "middle" | "end" | "baseline"). Applies only where nothing gives the children a cell on that axis: inside a cell of another partition, each child is placed in that cell. Not allowed with a key per axis.',
      },
      axes: { type: t.ref("AxesOptions") },
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
      inset: {
        type: t.number,
        default: 0,
        doc: "Pixels drawn in from each side of the space the rect fills, on an axis where it has no size or span of its own (a bar's width in a spread or a partition cell), so neighbors are drawn apart. A side the rect sizes itself, such as a bar's data height, is never inset. It changes only what is drawn: the rect's box stays the space it was given.",
      },
      // A fluent-factory-wide dev flag (`FACTORY_ONLY_KEYS` in
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
    doc: "A circle: an ellipse locked to a 1:1 aspect ratio, with the same box dimensions. Its diameter is set by at most one of r, w, or h and applies to both axes; with none, the circle fills the space it is given.",
    include: [boxDims],
    fields: {
      r: ch.size(
        "Radius. The diameter is 2r for a number (pixels), a field name, or an accessor alike. Pass at most one of r, w, and h."
      ),
      fill: ch.color("Fill color, or a field name for a color scale."),
      stroke: ch.color("Stroke color. Defaults to `fill`."),
      strokeWidth: {
        type: t.number,
        default: 0,
        doc: "Stroke width in pixels.",
      },
      opacity: {
        ...ch.raw(
          "number",
          "Opacity, 0 to 1, applied to fill and stroke: a number, a field name, or a per-datum accessor (in JS also a `live(...)` value, which does not cross the wire)."
        ),
        default: 1,
      },
      fillOpacity: {
        type: t.number,
        doc: "Opacity of the fill alone, 0 to 1. The stroke keeps `opacity`.",
      },
      debug: {
        type: t.boolean,
        doc: "Dev-only flag: logs this mark's key and datum to the console as it is built. It changes nothing about what is drawn.",
      },
    },
  }),

  ellipse: leafMark("ellipse", {
    doc: "An ellipse. Box geometry via the shared dims channels; paint is `paint` without filter, plus fillOpacity.",
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
      fillOpacity: {
        type: t.number,
        doc: "Opacity of the fill alone, 0 to 1. The stroke keeps `opacity`.",
      },
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
        type: t.channel("string", "raw"),
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
        doc: "Rotation in degrees, clockwise on screen, about the text anchor.",
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
    doc: "A closed polygon defined by local-coordinate points (in the frame the polygon sits in: top-down on a plain canvas, upward inside a continuous y), given literally or read from a field. No dims channels — the bbox is computed from `points`.",
    fields: {
      points: {
        type: t.union(t.array(t.tuple(t.number, t.number)), t.string),
        required: true,
        doc: "Vertex list, at least 3 points — either a literal ring, or the name of a field holding one ring per row (which is how one mark draws a whole basemap).",
      },
      fill: {
        ...ch.color("Fill color, or a field name for a color scale."),
        default: "black",
      },
      stroke: ch.color("Stroke color. Defaults to `fill`."),
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
      w: { ...ch.size("Width."), default: 0 },
      h: { ...ch.size("Height."), default: 0 },
      fill: ch.color(
        "Fill color. A blank never paints; `fill` only seeds the shared color scale."
      ),
      debug: {
        type: t.boolean,
        doc: "Dev-only flag: logs this mark's key and datum to the console as it is built. It changes nothing about what is drawn.",
      },
    },
  }),

  region: leafMark("region", {
    doc: "Draws the region its parent gives it, such as a partition's cell. It has no size or position of its own: it fills the space it is given on both axes. It draws the region's outline when the region has one (a hexagon of Bin.hex, a cell of Bin.voronoi), and a rectangle otherwise.",
    include: [paint],
    fields: {
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
        "A line's path is never filled. `fill` is the channel the shared color scale reads: a field name or an accessor colors each line by group (it must be constant within the line), and it is the line color when `stroke` is omitted."
      ),
      stroke: ch.color(
        "Line color, or a field name or accessor for a color scale (constant within the line). Defaults to `fill`."
      ),
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
        type: t.ref("Curve"),
        doc: 'Screen-space path shape, made by a call in the Curve family: Curve.linear(), Curve.step(), Curve.monotone(), Curve.smooth(), Curve.catmullRom(), Curve.bezier(), Curve.orthogonal({bend}), Curve.arc({direction}) or Curve.perfectArrows({bow, ...}). Curve.step(), Curve.linear(), Curve.monotone() and Curve.smooth() are read over the parameter of the run, from the least to the most smooth. Curve.step() holds every value that depends on the ordering field until the next point, then jumps: a staircase when the ordering field is an axis (a line chart over years), and straight jumps between the points when it is not (a connected scatter plot). Curve.monotone() is piecewise monotone: between two neighboring points each coordinate only rises or only falls, so the curve never goes past either point. It does not make the whole line monotone: the line still turns where the data turns, and the turn sits exactly on the data point. For a path in x and y (a connected scatter plot) this holds for x and y separately, over the ordering field. It is the same curve as d3 curveMonotoneX and Vega-Lite interpolate "monotone". Curve.smooth() rounds a peak a little past its point, but keeps a run of equal values flat. Curve.catmullRom() is a centripetal Catmull-Rom through the points on screen. It can overshoot between points, and it is not used when reading values over time (a mark moving along the run follows a data-space curve). Omitted, it is Curve.monotone() on a homogeneous continuous connection axis, else Curve.linear().',
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
        ...ch.size(),
        doc: "Blank-fusion anchor key — see `emX`. Ignored by `line` itself.",
      },
      h: {
        ...ch.size(),
        doc: "Blank-fusion anchor key — see `emX`. Ignored by `line` itself.",
      },
    },
  }),

  ribbon: leafMark("ribbon", {
    doc: "Edge-mode connector — a filled band between the facing edges of consecutive marks (areas, streamgraphs, sankey ribbons).",
    fields: {
      fill: ch.color(
        "Fill color of the band, or a field name or accessor for a color scale (constant within the band). Omitted, the band takes the color of the marks it connects."
      ),
      stroke: ch.color(
        "Stroke color of the band's outline, or a field name or accessor for a color scale (constant within the band)."
      ),
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
        type: t.ref("Curve"),
        doc: 'Screen-space band-edge shape, made by a call in the Curve family: Curve.linear(), Curve.bezier(), Curve.step(), Curve.monotone(), Curve.smooth() or Curve.catmullRom(). Curve.step() steps both edges, as a stepped area does. Curve.monotone() is piecewise monotone: between two neighboring points each edge only rises or only falls, so it never goes past either point, though the band still turns where the data turns (d3 curveMonotoneX, Vega-Lite interpolate "monotone"); Curve.smooth() is a rounder reading over the same parameter, and can go a little past a point; Curve.catmullRom() is a centripetal Catmull-Rom on screen and can overshoot. Omitted, it is Curve.monotone() on a homogeneous continuous connection axis, else a Curve.bezier() band.',
      },
      from: { type: t.string },
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
        ...ch.size(),
        doc: "Blank-fusion anchor key — see `emX`. Ignored by `ribbon` itself.",
      },
      h: {
        ...ch.size(),
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
    doc: "Low-level combinator form of `spread`. Same fields as the operator form (OPERATORS.spread) plus `key` and the full box-dims group.",
    // JS `Spread` spreads its `FancyDims` into its box and the combinator
    // passes its options straight through, so every box-dims key is real
    // here (`cx`, `emX`, `dims`, ...). The operator form's own x/y/w/h win
    // the name collision (same type, operator-specific docs).
    include: [boxDims],
    fields: {
      ...resolveFields(OPERATORS.spread),
      key: { type: t.string, doc: "Internal per-node key override." },
    },
  }),
  stack: combinatorMark("stack", {
    doc: "Low-level combinator form of `stack`. Same fields as the operator form (OPERATORS.stack) plus `key` and the full box-dims group.",
    // Same box as spread's: JS `stack` is `spread({...opts, glue: true})`.
    include: [boxDims],
    fields: {
      ...resolveFields(OPERATORS.stack),
      key: { type: t.string, doc: "Internal per-node key override." },
    },
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
        doc: "Coordinate transform (`Coord.polar()`, `Coord.clock()`, `Coord.wavy()`, ...) the children are drawn in. Given one, the layer becomes that coordinate boundary.",
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
      x: ch.pos("Min-corner x offset."),
      y: ch.pos("Min-corner y offset."),
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

  pack: combinatorMark("pack", {
    doc: "Low-level combinator form of `pack`: packs the given child marks by their enclosing circles.",
    fields: resolveFields(OPERATORS.pack),
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

// The field names are the camelCase wire keys; Python's Coord.polar()/clock() spell
// them in snake_case (inner_radius, ...) like every other generated kwarg (see
// `pyKwarg`).
const polarFields: FieldGroup = group({
  innerRadius: {
    type: t.number,
    default: 0,
    doc: "Donut hole as a fraction [0,1) of the outer radius.",
  },
  centralAngle: {
    type: t.number,
    default: 2 * Math.PI,
    doc: "Total angular sweep in radians.",
  },
  startAngle: {
    type: t.number,
    default: Math.PI / 2,
    doc: "Angle (radians) of θ=0.",
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
    doc: "Maps (θ, r) → screen. θ is axis 0 (x, or the declared name theta), r is axis 1 (y, or r); `dims` and `dir` inside it may use theta/r.",
    fields: polarFields,
  }),
  clock: coordTransform("clock", {
    doc: "A `Coord.polar()` preset (0° at 12 o'clock, clockwise — already polar's defaults) kept as a distinct type tag for bbox sampling and user intent.",
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

/** Every descriptor table, by the kind of construct it declares. */
export const DESCRIPTOR_TABLES: Readonly<
  Record<ConstructKind, Record<string, ConstructDescriptor>>
> = {
  operator: OPERATORS,
  "leaf-mark": LEAF_MARKS,
  "combinator-mark": COMBINATOR_MARKS,
  coord: COORDS,
};

/** The kinds of construct whose options sit on a wire node of their own (a
 *  coord transform is itself an option, of a chart or a combinator). */
export type NodeKind = Exclude<ConstructKind, "coord">;

/** The base fields that sit in the same object as a construct's own options
 *  on the wire. An operator's and a leaf mark's options are spread onto the
 *  node itself, so every base field of its family sits beside them. A
 *  combinator mark nests its options under `options`, where only
 *  COMBINATOR_OPTIONS_BASE_FIELDS ride. */
const OPTIONS_BASE_FIELDS: Readonly<Record<NodeKind, FieldGroup>> = {
  operator: OPERATOR_BASE_FIELDS,
  "leaf-mark": MARK_BASE_FIELDS,
  "combinator-mark": COMBINATOR_OPTIONS_BASE_FIELDS,
};

const acceptedFieldsCache = new Map<string, FieldGroup>();

/**
 * The fields the options object of a `kind` construct with wire type `type`
 * accepts, keyed by wire key: its descriptor's fields plus the base fields
 * that sit in the same object (see OPTIONS_BASE_FIELDS). `undefined` when the
 * table declares no such construct (there is a combinator `layer` but no
 * operator `layer`). The emitter keeps exactly these keys of a factory's
 * options; the validator checks a node against them. Computed once per
 * (kind, type).
 */
export function acceptedFields(
  kind: NodeKind,
  type: string
): FieldGroup | undefined {
  const cacheKey = `${kind}:${type}`;
  const cached = acceptedFieldsCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const table = DESCRIPTOR_TABLES[kind];
  if (!Object.hasOwn(table, type)) return undefined;
  const declared = {
    ...OPTIONS_BASE_FIELDS[kind],
    ...resolveFields(table[type]),
  };
  const fields: FieldGroup = {};
  for (const [name, spec] of Object.entries(declared)) {
    fields[spec.wire ?? name] = spec;
  }
  acceptedFieldsCache.set(cacheKey, fields);
  return fields;
}

/** Whether a value of this type may hold a channel at some depth: a channel,
 *  or a union, array, tuple, record, object or named option type containing
 *  one. A mark factory's channel map (`createMark` in gofish-graphics) names
 *  exactly the fields of this kind, and the Python generator wraps exactly
 *  these fields' callables as accessors. */
export function carriesChannel(type: FieldType): boolean {
  switch (type.kind) {
    case "channel":
      return true;
    case "union":
      return type.options.some(carriesChannel);
    case "array":
      return carriesChannel(type.items);
    case "tuple":
      return type.items.some(carriesChannel);
    case "record":
      return carriesChannel(type.valueType);
    case "object":
      return Object.values(type.fields).some((f) => carriesChannel(f.type));
    case "ref":
      return (
        type.name in OPTION_TYPES &&
        carriesChannel(OPTION_TYPES[type.name].type)
      );
    default:
      return false;
  }
}

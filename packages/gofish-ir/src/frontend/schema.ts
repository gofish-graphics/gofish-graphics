// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * GoFish Frontend IR — schema types.
 *
 * The frontend IR captures a GoFish chart specification at the source level,
 * before macro expansion and elaboration. v0 mirrors the existing widget
 * wire format exactly (lowercase type tags, __combinator flag, channel
 * slots accept strings/numbers/sentinels). See the architecture essay for
 * the multi-stage design and the planned v0.1+ improvements.
 */

/** Top-level wrapper for a serialized GoFish chart. */
export interface FrontendIRDocument {
  irVersion: 0;
  ir: "gofish-frontend";
  /** Optional URL of the JSON Schema this document claims to conform to. */
  $schema?: string;
  root: FrontendIR;
  /** The rows of every chart in the document that has rows of its own, by
   *  the id its `{type: "table", id}` data names (see {@link DataIR}). A
   *  document JS writes carries them as JSON rows; a Python host ships each
   *  table as base64 Arrow instead, an encoding it decodes before
   *  rebuilding. */
  tables?: Tables;
}

/** Rows by table id: what a `{type: "table", id}` data field names. */
export type Tables = Record<string, Array<Record<string, unknown>>>;

/**
 * A frontend-IR root holds anything a mark position holds ({@link MarkIR}):
 * a chart, a `.layer(...)` chain, a `layer([...])` of charts or marks, or a
 * bare mark. It is one rule, so a chart crosses the same way wherever it
 * sits, and so does a chain.
 */
export type FrontendIR = MarkIR;

/**
 * Metadata that any node may carry. v0 emitters leave `meta` unset; later
 * passes (underlying-space inference, scale resolution, etc.) populate the
 * relevant fields. The slot is reserved so additive evolution doesn't
 * require a schema bump.
 */
export interface Meta {
  /** Source-position attribution — populated by future build-time hooks. */
  loc?: SourceLocation;
  /** Underlying-space classification — populated post-elaboration. */
  space?: UnderlyingSpaceAnnotation;
  /** Open extension for unknown pass-specific annotations. */
  [key: string]: unknown;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface UnderlyingSpaceAnnotation {
  type: "SIZE" | "POSITION" | "ORDINAL" | "DIFFERENCE" | "UNDEFINED";
}

/** Mixin properties available on every IR node. */
export interface BaseIRNode {
  /** User-supplied origin metadata. Currently carries the `.name(...)` value if set. */
  origin?: Origin;
  /** Reserved for inline annotations attached by future passes. */
  meta?: Meta;
}

export interface TranslateIR {
  x?: number;
  y?: number;
}

interface TranslatableIR {
  /** Structural pixel translation reapplied by the runtime deserializer. */
  translate?: TranslateIR;
}

/** Mixin for every operator: fields real producers put on the wire that the
 *  JS factory strips (`FACTORY_ONLY_KEYS` in createOperator.ts) before
 *  layout. Mirrors `OPERATOR_BASE_FIELDS` in descriptors.ts. */
interface OperatorFlagsIR {
  /** Dev escape hatch (`debug: true`); a no-op for layout. */
  debug?: boolean;
}

export interface Origin {
  /** User-supplied name via `.name("bars")` on the fluent builder. */
  name?: string;
  /** Optional captured call-site stack — unset in v0. */
  stack?: string;
}

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------

/** A standard chart: data → operators → mark. */
export interface ChartIR extends BaseIRNode {
  type: "chart";
  data: DataIR;
  operators?: OperatorIR[];
  mark: MarkIR;
  options?: Record<string, unknown>;
  zOrder?: number;
  /**
   * Chart-level name (from `chart(...).name("scatter")` in Python /
   * `node.name(...)` on a resolved chart in JS) so a sibling
   * `Layer([...]).relate(...)` callback can reference this chart. A
   * `createName(...)` token sentinel is also accepted on the wire.
   */
  name?: string;
}

/**
 * A `chart(...).layer(...)` chain: tiers stacked in order, each offered the
 * previous tier's marks as its scope. The first tier is a chart; a later
 * tier is anything a mark position holds (a chart, often an empty `chart()`
 * scope with `{type: "previous-tier"}` data, or a bare mark such as a
 * relational `line()` or an annotation `text(...)`). The deserializer
 * rebuilds it through the real `LayerBuilder`, so JS owns the chain's tier
 * wiring and its render logic (inferred axis titles, the root tier's `axes`).
 * It sits wherever a chart can: at the root, and in any mark position, where
 * a first tier with `previous-tier` data binds the rows of the partition the
 * chain sits in. Its own wire type, so `"layer"` means one thing, the
 * combinator mark.
 */
export interface LayerChainIR extends BaseIRNode {
  type: "layer-chain";
  tiers: MarkIR[];
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/**
 * The data field on a chart. Every chart says where its rows come from, in
 * one of three ways, wherever the chart sits (the root, a mark position, a
 * tier of a `.layer(...)` chain):
 *
 * - **Table**: `{type: "table", id}` names rows of the chart's own. The rows
 *   travel beside the IR, keyed by id, in the document's `tables` (JSON rows
 *   in a document JS writes; base64 Arrow when a Python host ships it, which
 *   the host decodes before rebuilding). The ids are the writer's own, unique
 *   within one document.
 * - **Select reference**: `{type: "select", layer: "name", mode?}` resolves a
 *   sibling chart's named-mark output at deserialize time. The optional `mode`
 *   discriminates the plural `selectAll()` (`"all"`, an array of refs) from the
 *   singular `ref(name)` used as chart data (`"one"` or absent, a single ref).
 * - **Previous tier**: `{type: "previous-tier"}` marks an empty `chart()` /
 *   `Chart()` scope: its rows are those of the enclosing scope. Inside a
 *   `.layer(...)` chain that is the previous tier's marks; the deserializer
 *   maps it to the JS `PREVIOUS_LAYER_MARKS` sentinel so `LayerBuilder`'s own
 *   `wireTiers()` (auto-naming the producer's mark + binding this tier to
 *   `selectAll(name)`) runs JS-side. In a mark position
 *   (`.mark(chart().flow(...))`) it is the rows of the partition the chart
 *   sits in.
 */
export type DataIR = TableRef | SelectRefIR | { type: "previous-tier" };

/** A reference to one of a document's `tables`, by id: a chart's rows of
 *  its own. A bridge call's reply names the rows a callback returned the
 *  same way. */
export type TableRef = { type: "table"; id: string };

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

export type OperatorIR =
  | DeriveOperator
  | ResolveOperator
  | JoinOperator
  | FilterOperator
  | SpreadOperator
  | StackOperator
  | GroupOperator
  | ScatterOperator
  | TableOperator
  | LogOperator
  | TreemapOperator
  | PackOperator
  | PartitionOperator;

/**
 * `derive(fn)` — opaque user transformation. Function bodies are not
 * serializable; the IR carries a bridge handle (`lambdaId`) when the
 * Python widget is the producer, and is otherwise empty.
 */
export interface DeriveOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "derive";
  lambdaId?: string;
  /** The column types of the derive's result, keyed by column name, in the
   *  wire form of a chart's `schema` (e.g. `{ HasLevels: { levels } }`). They
   *  type the result over the types it keeps or infers, and convert values
   *  as a chart's schema does. A transform (e.g. Python's `bin`) writes the
   *  quantities of its output columns here (`{ HasQuantity: { name } }`), since the
   *  column types the JS-side array carries can't ride the rows across the
   *  derive RPC. */
  schema?: Record<string, Record<string, unknown>>;
}

/**
 * `resolve(cols, { from, key? })` — dereference reference columns into the
 * drawn nodes they name. Each listed column's value is matched against the
 * keyed nodes of `from` (a layer selected by name) and replaced in place with
 * the matching node ref (many-to-one, grain preserved). Backs node-link edges
 * and label anchoring. The match key defaults to the field `from`'s nodes were
 * grouped by; `key` overrides it.
 */
export interface ResolveOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "resolve";
  /** Local columns holding references to resolve in place. */
  cols: string[];
  /** Layer name whose nodes the columns are resolved against (a `selectAll`). */
  from?: string;
  /** Explicit match field; defaults to the producing operator's `by`. */
  key?: string;
}

/**
 * `join(right, { on })` — one-to-many equi-join of the incoming rows against
 * an inlined `right` table on a shared `on` key. Each incoming row fans out to
 * one output row per matching `right` row, merging their columns
 * (`{ ...left, ...right }`); unmatched incoming rows drop out. Relates two plain
 * data tables (contrast `resolve`, which dereferences columns into drawn
 * nodes), so `right` rides in the IR as inline JSON and round-trips.
 */
export interface JoinOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "join";
  /** Shared key field matched between the incoming rows and `right`. */
  on: string;
  /** The right-hand table, inlined as JSON rows. */
  right: Record<string, unknown>[];
}

/**
 * `filter(field(name).between(lo, hi, { closed }))` — keep the rows whose
 * `field` value lies in `[lo, hi]`, compared by value; `closed` picks the
 * inclusive ends (default `"both"`, as in polars' `is_between`). Only a field
 * predicate has this form: a hand-written JS predicate is a live callback, so
 * that filter serializes as an opaque `derive`. The predicate is its own
 * value, not a field-expression op (`FieldExprWire.ops`).
 */
export interface FilterOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "filter";
  predicate: FieldPredicateIR;
}

/** A `by` key that groups consecutive rows, as `chunk(size)` builds it: row
 *  `i` goes to group `floor(i / size)`, a bin over row position. */
export interface ChunkKeyIR {
  type: "chunk";
  size: number;
}

/** A field predicate: the field it reads and the interval it tests. */
export interface FieldPredicateIR {
  field: string;
  between: [number, number];
  closed?: "both" | "left" | "right" | "none";
}

export interface SpreadOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "spread";
  /** Set via `.label(accessor, options?)` chained on the operator: each
   *  split leaf's produced node(s) get a deferred label over the leaf's own
   *  subdata. String accessors round-trip; function accessors don't (see
   *  `LabelIR`/`labelIRField` in createOperator.ts). */
  label?: LabelIR;
  by?: string | FieldAccessor | ChunkKeyIR;
  /** `x`/`y`, or an axis name the enclosing coordinate space declares. */
  dir?: string;
  spacing?: number;
  alignment?: string;
  anchor?: "edge" | "start" | "middle" | "end" | "baseline";
  reverse?: boolean;
  /** Stack semantics: glue children together (sizes sum into a position at
   *  this level) instead of slicing a budget. Forces `spacing` to 0. */
  glue?: boolean;
  /** Position of this operator's box in the parent's space (pixels): the JS
   *  `Spread` spreads its `FancyDims` into the box, as treemap's does. */
  x?: ChannelValue;
  y?: ChannelValue;
  /** Data-driven operator extent (#4/#20): a field name or pixel number sizing
   *  this operator's box, reported as a SIZE claim to the enclosing scale. */
  w?: ChannelValue;
  h?: ChannelValue;
  /** Per-entry stack-axis extent (#700 Phase 2): a field name/accessor or
   *  pixel number sizing each split entry. A `field(name).normalize()`
   *  accessor (a `FieldAccessor` with a `normalize` pipeline op) replaces
   *  each entry's size with its share of the window, turning the stack axis
   *  into a space-filling spine — the mosaic/marimekko conditional axis. */
  size?: ChannelValue;
  axes?: AxesOptions;
}

export interface StackOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "stack";
  /** See `SpreadOperator.label` — `stack` is `spread({glue: true})` re-tagged. */
  label?: LabelIR;
  by?: string | FieldAccessor | ChunkKeyIR;
  /** See `SpreadOperator.dir`. */
  dir?: string;
  /** Spread-parity passthrough: the JS `stack` is `Spread({...props, glue:
   *  true})`, so producers may put spread's options on the wire. Glue
   *  semantics force the effective gap to 0. */
  spacing?: number;
  /** Spread-parity passthrough; stack always glues regardless. */
  glue?: boolean;
  alignment?: string;
  anchor?: "edge" | "start" | "middle" | "end" | "baseline";
  reverse?: boolean;
  /** Box position, extent, and per-entry size — see `SpreadOperator`. */
  x?: ChannelValue;
  y?: ChannelValue;
  w?: ChannelValue;
  h?: ChannelValue;
  size?: ChannelValue;
  axes?: AxesOptions;
}

export interface GroupOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "group";
  /** See `SpreadOperator.label`. */
  label?: LabelIR;
  by: string | FieldAccessor | ChunkKeyIR;
}

export interface ScatterOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "scatter";
  /** See `SpreadOperator.label`. */
  label?: LabelIR;
  by?: string | FieldAccessor | ChunkKeyIR;
  x?: ChannelValue;
  y?: ChannelValue;
  xMin?: ChannelValue;
  xMax?: ChannelValue;
  yMin?: ChannelValue;
  yMax?: ChannelValue;
  /** Per-child placement by axis name (see `AxisDims`): a bare value is the
   *  point, `{ min, max }` the span, `{ center }` the point. */
  dims?: AxisDims;
  alignment?: string;
  /** How children keep clear of each other on the free axis. Default: none
   *  (every child sits on the alignment line). */
  overlap?: OverlapIR;
  axes?: AxesOptions;
  w?: ChannelValue;
  h?: ChannelValue;
}

/**
 * Per-node axis-rendering override. Mirrors the JS-side `AxesOptions` /
 * `AxisOptions` from `gofish-graphics/src/ast/gofish.tsx`; the field docs live
 * on `OPTION_TYPES` in descriptors.ts, which the validator, the JSON Schema,
 * and the Python generator all read.
 *
 * - `true` / `false` — show or hide both x and y axes.
 * - Object form — independently control each dimension.
 *
 * `AxisOptions` per-dim is either a boolean (show/hide, infer title) or an
 * object: `title` (string for a custom title, `false` to suppress), `side`
 * (the frame edge), `label` (how its labels are drawn: `angle`, their
 * rotation in degrees, and `align`, each level's labels centered or at the
 * start of each run), `levels`
 * (the axis's bands of labels by depth, nearest the plot first: `true`
 * keeps one, `false` hides it, a Calendar value names its cells), and
 * `divider` (whether each level draws dividers: one value, or one per
 * depth).
 */
export type AxesOptions = boolean | { x?: AxisOptions; y?: AxisOptions };
export type AxisOptions =
  | boolean
  | {
      title?: string | false;
      side?: "start" | "end";
      label?: AxisLabelOptions;
      levels?: (boolean | CalendarPartitionIR)[];
      divider?: boolean | boolean[];
    };

/** How one axis's labels are drawn (`axes.x.label`): `angle` and `align`,
 *  each one value for every level or an array per level, nearest the plot
 *  first. */
export type AxisLabelOptions = {
  angle?: number | number[] | "auto";
  align?: "start" | "center" | ("start" | "center" | true)[];
};

/** A Calendar value's wire form (`Calendar.month({ every: 3 })` is
 *  `{ kind: "month", every: 3 }`): a calendar level, its `kind`, at a step,
 *  `every`. Only a week and a weekday have a `start`, the first day of the
 *  week, and a weekday has no `every`. The kinds of the `Calendar` family in
 *  `STRATEGIES` (descriptors.ts). */
export type CalendarPartitionIR =
  | {
      kind: "second" | "minute" | "hour" | "day" | "month" | "quarter" | "year";
      every?: number;
    }
  | { kind: "weekday"; start?: "monday" | "sunday" }
  | { kind: "week"; every?: number; start?: "monday" | "sunday" };

export interface TableOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "table";
  /** See `SpreadOperator.label`. */
  label?: LabelIR;
  /** The column and row keys, each what `SpreadOperator.by` takes. */
  by: {
    x: string | FieldAccessor | ChunkKeyIR;
    y: string | FieldAccessor | ChunkKeyIR;
  };
  spacing?: number | [number, number];
  numCols?: number;
}

export interface LogOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "log";
  /** Console prefix string for `log(prefix)`; unrelated to the operator-level
   *  `.label(accessor, options)` chain, which `log` doesn't support since it
   *  isn't built via `createOperator`'s `dual()`. */
  prefix?: string;
}

/**
 * `treemap({...})` — d3-hierarchy treemap layout over the flow's rows,
 * fare/weight-proportional. Dual-form like `spread`/`stack`/`scatter`/
 * `group`/`table`: also usable as a low-level combinator mark
 * (`CombinatorMarkType`'s `"treemap"`, disambiguated by `__combinator`).
 * Mirrors JS's `TreemapProps`/`TreemapOptions` (`graphicalOperators/treemap.tsx`)
 * minus `key`.
 */
export interface TreemapOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "treemap";
  /** See `SpreadOperator.label`. */
  label?: LabelIR;
  /** Field to partition rows by; also accepts a field(...) accessor carrying
   *  domain ops (sort/reverse/bin/dropNulls). Without `by`, one leaf is
   *  emitted per row. */
  by?: string | FieldAccessor | ChunkKeyIR;
  /** Gap between sibling tiles, in pixels. Default 0. */
  spacing?: number;
  /** Inset around the outer edge of the treemap, in pixels. Default 0. */
  padding?: number;
  round?: boolean;
  /** The tiling strategy. Default `{ kind: "squarify" }`. */
  tile?: TileIR;
  sort?: "asc" | "desc" | "none";
  /** Per-leaf weight driving tile area (entry-flagged per split entry). */
  size?: ChannelValue;
  /** Position of the box the treemap tiles into, in the parent's space. Both
   *  forms spread `FancyDims` into `elaborateDims`, so the box's position is as
   *  real an option as its size — unlike `w`/`h` these carry no channel
   *  annotation, so they are pixel literals. */
  x?: ChannelValue;
  y?: ChannelValue;
  w?: ChannelValue;
  h?: ChannelValue;
  /** The same box by axis name (see `AxisDims`). */
  dims?: AxisDims;
}

/**
 * `pack({...})` — circle packing: children are placed so their enclosing
 * circles touch without overlapping. Dual-form like `treemap`: also a
 * low-level combinator mark (`CombinatorMarkType`'s `"pack"`). Mirrors JS's
 * `PackOptions` (`graphicalOperators/pack.tsx`).
 */
export interface PackOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "pack";
  /** See `SpreadOperator.label`. */
  label?: LabelIR;
  /** Field to partition rows by. Without `by`, one child per row. */
  by?: string | FieldAccessor | ChunkKeyIR;
}

/**
 * `partition({ by, dir })` — divide the space along `dir` into the cells of
 * a binned key (`field(x).bin(p)`), and give each group its cell on one
 * continuous scale. `partition({ by: { x, y } })` divides both axes: it is
 * the partition on x, then the partition on y. `partition({ by:
 * struct({ x, y }).bin(cells) })` divides the plane into the polygon cells
 * of a `Bin` strategy (hexagons, Voronoi cells). Operator-only: its children
 * are the groups of its key. Mirrors JS's `PartitionOptions`
 * (`graphicalOperators/partition.tsx`).
 */
export interface PartitionOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "partition";
  /** See `SpreadOperator.label`. */
  label?: LabelIR;
  /** A key that has a region: a binned field accessor, one per axis, or a
   *  binned struct of two fields. */
  by: FieldAccessor | { x: FieldAccessor; y: FieldAccessor } | StructAccessor;
  /** The axis to divide. Required with a single key; not allowed with a
   *  key per axis. */
  dir?: string;
  /** Alignment on the other axis. Default `"baseline"`. */
  alignment?: string;
  axes?: AxesOptions;
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

// The value types of the strategy families (`STRATEGIES` in descriptors.ts):
// a plain object `{ kind, ...params }`, the same in JS (the family's own
// type, e.g. `Curve.Curve`) and on the wire. descriptors.test.ts checks that
// these kinds and params agree with the table.

/** How `treemap` tiles its box, made by a call in the `Tile` family
 *  (`Tile.squarify()`, `Tile.slice()`, `Tile.dice()`, `Tile.binary()`,
 *  `Tile.sliceDice()`). */
export type TileIR =
  | { kind: "squarify"; ratio?: number }
  | { kind: "slice" }
  | { kind: "dice" }
  | { kind: "binary" }
  | { kind: "sliceDice" };

/** How `scatter` keeps its children clear of each other, made by a call in
 *  the `Overlap` family (`Overlap.separate()`, `Overlap.noise()`;
 *  `Overlap.sina()` and `Overlap.jitter()` make kind `"noise"` with other
 *  params preset). */
export type OverlapIR =
  | { kind: "separate"; padding?: number }
  | {
      kind: "noise";
      randomness?: "blue" | "quasi" | "uniform";
      smoothing?: number | "silverman";
      padding?: number;
      seed?: number;
    };

/** How a path runs through its points, made by a call in the `Curve` family
 *  (`Curve.monotone()`, `Curve.arc({ direction: "down" })`, ...). */
export type CurveIR =
  | { kind: "linear" }
  | { kind: "step" }
  | { kind: "monotone" }
  | { kind: "smooth" }
  | { kind: "catmullRom" }
  | { kind: "bezier" }
  | { kind: "orthogonal"; bend?: "auto" }
  | { kind: "arc"; direction?: "up" | "down" }
  | {
      kind: "perfectArrows";
      bow?: number;
      stretch?: number;
      stretchMin?: number;
      stretchMax?: number;
      padStart?: number;
      padEnd?: number;
      flip?: boolean;
      straights?: boolean;
    };

/** The cells a key is binned into, made by a call in the `Bin` family.
 *  `Bin.step(size)` and `Bin.thresholds(countOrEdges)` bin one field
 *  (`field(x).bin(...)`, {@link FieldBinIR}); `Bin.hex({ radius })` and
 *  `Bin.voronoi({ seeds })` bin two together (`struct({ x, y }).bin(...)`,
 *  {@link StructBinIR}). */
export type BinIR = FieldBinIR | StructBinIR;

/** The `Bin` kinds that cut the line of one field into intervals. */
export type FieldBinIR =
  | { kind: "step"; size: number }
  | { kind: "thresholds"; thresholds: number | number[] };

/** The `Bin` kinds that divide the plane of two fields into polygons. */
export type StructBinIR =
  | { kind: "hex"; radius: number | { x: number; y: number } }
  | { kind: "voronoi"; seeds: Record<string, unknown>[] };

/** A reference to the nodes of a named layer: `ref(name)` (`mode` "one" or
 *  absent, exactly one node) or `selectAll(name)` (`mode` "all", every node).
 *  Chart data takes it, and so does an option that names nodes. */
export type SelectRefIR = {
  type: "select";
  layer: string;
  mode?: "one" | "all";
};

/** Nodes named on the wire inside an option (a blob's `avoiding`): a list of
 *  by-name references (`ref(...)` / a `.relate()` operand), or every node of
 *  a named layer (`selectAll(name)`, the plural form a chart's data takes). */
export type NodeSelectionIR = RefMarkIR[] | (SelectRefIR & { mode: "all" });

/** The outline `enclose` draws, made by a call in the `Shape` family
 *  (`Shape.box()`, `Shape.oval()`, `Shape.blob()`; `Shape.hull()` and
 *  `Shape.spine()` make kind `"blob"` with other params preset). */
export type ShapeIR =
  | { kind: "box"; rx?: number; ry?: number }
  | { kind: "oval" }
  // PROTOTYPE #1221
  | { kind: "arcs"; radius?: number }
  | {
      kind: "blob";
      convexity?: number;
      holes?: boolean;
      roundness?: number;
      neck?: number;
      avoiding?: NodeSelectionIR;
      clearance?: number;
    };

/** A screen direction from a mark, for `Place.around`. */
export type PlaceDirectionIR =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left"
  | "right"
  | "left"
  | "top"
  | "bottom";

/** A side of an outline, for `Place.along`. */
export type PlaceSideIR =
  | "on"
  | "above"
  | "below"
  | "left"
  | "right"
  | "inset"
  | "outset";

/** Where a label goes on the mark it labels, made by a call in the `Place`
 *  family: a value of a label's `position` beside the position strings. */
export type PlaceIR =
  | {
      kind: "around";
      directions?: PlaceDirectionIR[];
      side?: "outset" | "inset" | ("outset" | "inset")[];
      offset?: number;
    }
  | {
      kind: "along";
      at?:
        | number
        | "start"
        | "middle"
        | "end"
        | "x-min"
        | "x-max"
        | "y-min"
        | "y-max";
      side?: PlaceSideIR | PlaceSideIR[];
      orient?: "horizontal" | "sloped";
      offset?: number;
    }
  | { kind: "start"; offset?: number }
  | { kind: "end"; offset?: number }
  | { kind: "interior" };

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

/**
 * What a mark position holds: a chart's `mark`, a combinator's child, a cut's
 * `source`, a drawing `.relate(...)` clause. Besides the mark kinds, a mark
 * position may hold a whole chart, as in JS, where `.mark(chart(...))` and
 * `layer([rect(...), chart(...)])` are ordinary marks. A nested chart crosses
 * as its own `ChartIR` (an empty `chart()` scope as `{type: "previous-tier"}`
 * data, which inherits the rows of the partition it sits in), and a
 * `.layer(...)` chain as its `LayerChainIR`. A layer of charts is the `layer`
 * combinator mark with chart children, like any combinator. A root holds
 * the same things.
 */
export type MarkIR =
  | LeafMarkIR
  | CombinatorMarkIR
  | RefMarkIR
  | OffsetMarkIR
  | CutMarkIR
  | ChartIR
  | LayerChainIR;

export type LeafMarkType =
  | "rect"
  | "circle"
  | "line"
  | "ribbon"
  | "enclose"
  | "blank"
  | "region"
  | "ellipse"
  | "petal"
  | "text"
  | "image"
  | "polygon"
  | "mark-fn"; // Python-bridge: a registered `(data) -> mark | chart` callback.
// Carries a `lambdaId` field; resolved via the bridge.

export type CombinatorMarkType =
  | "spread"
  | "stack"
  | "scatter"
  | "group"
  | "table"
  | "layer"
  | "enclose"
  | "position"
  | "arrow"
  // `line`/`ribbon` are derived marks with a low-level combinator form
  // (children = the refs/marks to connect) — the drop-in for the removed
  // `connect`. They are ALSO leaf marks (bag/pairwise forms); the
  // `__combinator` flag disambiguates.
  | "line"
  | "ribbon"
  | "treemap"
  | "pack"
  | "over"
  | "inside"
  | "xor"
  | "out"
  | "atop"
  | "mask";

/**
 * A leaf shape mark. Channel-valued props (`h`, `w`, `fill`, `x`, `y`, …)
 * appear directly on the object alongside the well-known fields. TypeScript
 * cannot precisely express the union of channel values per shape, so the
 * index signature is permissive — mirrors the existing widget interface.
 */
/** Fields the Python wrapper writes on a mark and the renderer reads (the
 *  serialization essay's "Bridge extensions"). Declared in
 *  `MARK_BASE_FIELDS`, so the validator checks them like any other field. */
export interface MarkBridgeFieldsIR {
  /** The mark is a component (the `@mark` decorator's output). */
  __scope?: true;
  /** `mark(d, key)`: the input `d` the mark is applied to. */
  __datum?: unknown;
  /** `mark(d, key)`: the key the mark is applied with. */
  __key?: string | number;
}

export interface LeafMarkIR extends BaseIRNode, MarkBridgeFieldsIR {
  type: LeafMarkType;
  name?: string;
  label?: LabelIR;
  relate?: RelateClauseIR[];
  zOrder?: number | BridgeLambdaSentinel;
  translate?: TranslateIR;
  [key: string]: unknown;
}

/**
 * A combinator-form operator used as a mark (e.g. `spread([m1, m2])`).
 * Distinguished from the operator-form by the `__combinator: true` flag
 * and the presence of `children`.
 */
export interface CombinatorMarkIR extends BaseIRNode, MarkBridgeFieldsIR {
  type: CombinatorMarkType;
  __combinator: true;
  options?: Record<string, unknown>;
  children: MarkIR[];
  name?: string;
  label?: LabelIR;
  relate?: RelateClauseIR[];
  zOrder?: number | BridgeLambdaSentinel;
  translate?: TranslateIR;
}

/** A by-name reference to another named mark (`ref("bars")`). */
export interface RefMarkIR extends BaseIRNode {
  type: "ref";
  selection: string | Array<string | number>;
  name?: string;
  label?: LabelIR;
  translate?: TranslateIR;
}

/**
 * `offset` node — shifts its single child by `(x, y)` render-pixels without
 * moving the bounds the child advertises to its parent. Maps to the public
 * `offset` operator (`gofish-graphics/src/ast/graphicalOperators/offset.tsx`).
 * Exactly one child; `children` is a one-element tuple to mirror the operator's
 * "exactly one child" contract.
 */
export interface OffsetMarkIR extends BaseIRNode {
  type: "offset";
  x?: number;
  y?: number;
  children: [MarkIR];
  translate?: TranslateIR;
}

/**
 * `cut` mark — slices a single `source` mark into N clipped sub-shapes along
 * `dir`. Two deserialization surfaces over the same JS core (extent resolution
 * stays in JS in ONE place):
 *
 *  - as a chart `.mark(...)` spec → the expand-mark form (`cutMark` /
 *    `source.cut(opts)`); a field-name string `size` resolves per-row.
 *  - as a combinator CHILD (inside a Spread/Stack `children` array) → expanded
 *    in place into its N slice nodes via the pure `cut(source, opts)`.
 *
 * `size` is `string` (field name, expand form only), or an array whose entries
 * are raw `number`s (ABSOLUTE source pixels) or `datum`-wire values (relative
 * flex weights — the same `{type:"datum", datum}` wrapper used by channel
 * values). Omitted → equal slices (N from the data length).
 */
export interface CutMarkIR extends BaseIRNode {
  type: "cut";
  source: MarkIR;
  dir: "x" | "y";
  size?: string | Array<number | DatumValue>;
  inset?: number;
  name?: string;
  zOrder?: number | BridgeLambdaSentinel;
  translate?: TranslateIR;
}

// ---------------------------------------------------------------------------
// Channel values
// ---------------------------------------------------------------------------

/**
 * A channel value (the right-hand side of a mark or operator property like
 * `h: …` or `fill: …`).
 *
 * Strings without explicit tagging disambiguate to field-accessor or
 * literal at runtime by checking against `data[0]`. The explicit
 * constructors `field(name)` / `datum(x)` / `literal(x)` emit their
 * canonical tagged-object forms. `__gofish_lambda` is the one remaining
 * Python-bridge sentinel — it encodes a remote callable that the widget
 * resolves via the DeriveBridge.
 *
 * v0.1+ will move the fluent API to desugar string shorthand to explicit
 * constructors eagerly, so the IR carries only canonical forms.
 */
export type ChannelValue =
  | string
  | number
  | boolean
  | null
  | FieldAccessor
  | DatumValue
  | BridgeLambdaSentinel;

/** One axis of a `dims` option, as an interval: its anchors, each a channel
 *  value (`size` a size channel, the rest positions). */
export interface AxisInterval {
  min?: ChannelValue;
  center?: ChannelValue;
  max?: ChannelValue;
  size?: ChannelValue;
  embedded?: boolean;
}

/**
 * A `dims` option (box-dims marks, `scatter`): axis name → value or interval.
 * The names are `x`/`y` plus whatever the enclosing coordinate space declares
 * (polar `theta`/`r`, geo `lon`/`lat`); they resolve at render time, so the
 * wire keeps them open. A bare value is a position (the `min` anchor on a
 * mark, the point on a scatter).
 */
export type AxisDims = Record<string, ChannelValue | AxisInterval>;

/** Explicit field-accessor form, emitted by `field(name)`. `ops` is the
 *  optional chained pipeline (#700 Phase 1/2), e.g. `field("site").sort("yield")`
 *  or `field("count").normalize()` — see `FieldOpIR` and gofish-graphics'
 *  `fieldExpr.ts` (`FieldOp`), which this mirrors exactly. Two disjoint
 *  slots consume it: a `by` (grouping key) slot accepts the domain ops
 *  (`sort`/`reverse`/`bin`); a value (size/pos) channel slot accepts the
 *  aggregate ops (`sum`/`mean`/`count`/`distinct`) and, only on an
 *  operator's entry-flagged `size` channel, `normalize`. */
/** A partition's wire form (`field(x).bin(p)`): a Calendar value, or a
 *  `Bin` kind that bins one field (`Bin.step(size)`,
 *  `Bin.thresholds(countOrEdges)`). One tagged union, told apart by `kind`
 *  (`OPTION_TYPES.Partition`). */
export type PartitionIR = CalendarPartitionIR | FieldBinIR;

export interface FieldAccessor {
  type: "field";
  name: string;
  ops?: FieldOpIR[];
}

/** A key built from two fields at once, emitted by `struct({ x, y })`
 *  (after polars' `pl.struct`), with the cells it is binned into. `fields`
 *  names the column read on each axis. Its one op is `bin`, which takes a
 *  `Bin` strategy; a struct is a key only once it is binned (a
 *  `partition`'s `by`). Mirrors gofish-graphics' `StructExpr`
 *  (`ast/structExpr.ts`). */
export interface StructAccessor {
  type: "struct";
  fields: { x: string; y: string };
  ops?: StructOpIR[];
}

/** One op in a `struct(...)` pipeline: the cells it is binned into. */
export type StructOpIR = { op: "bin"; partition: StructBinIR };

/** One op in a `field(...)` pipeline — mirrors gofish-graphics'
 *  `FieldOp` (`ast/fieldExpr.ts`) exactly. See {@link FieldAccessor}. */
export type FieldOpIR =
  | {
      op: "sort";
      by?: string;
      order?: "asc" | "desc";
      /** Explicit group order (#735); mutually exclusive with `by`/`order`.
       *  Groups whose key isn't in this list are appended after, in natural
       *  sort order. */
      values?: (string | number)[];
    }
  | { op: "reverse" }
  | {
      op: "bin";
      /** The partition each value is binned into: a Calendar value,
       *  `Bin.step(size)` or `Bin.thresholds(countOrEdges)`, or a product of
       *  Calendar values (`[year, month]`: one cell where they meet).
       *  Absent: about 10 cells. A second `bin` op splits the cells of the
       *  one before it (`.bin(Calendar.year).bin(Calendar.month)`). */
      partition?: PartitionIR | CalendarPartitionIR[];
    }
  | { op: "dropNulls" }
  | { op: "normalize" }
  | { op: "sum" }
  | { op: "mean" }
  | { op: "count" }
  | { op: "distinct" };

/** A post-scale color transform carried by a datum value, applied AFTER the
 *  datum maps through its color scale — the color analog of {@link
 *  DatumValue.offset}. Emitted by `datum(v).lighten(t)` / `.darken(t)`. */
export interface ColorOp {
  op: "lighten" | "darken";
  amount: number;
}

export interface DatumValue {
  type: "datum";
  /** Pixel offset applied AFTER the datum maps through its scale — "this
   *  data position, plus pixels". Emitted by `datum(v) + px` in Python and
   *  `datum(v).offset(px)` in JS. */
  offset?: number;
  /** Post-scale color transforms applied in order AFTER the datum maps through
   *  its color scale — "this category's color, lightened". Emitted by
   *  `datum(v).lighten(t)` / `.darken(t)`. */
  colorOps?: ColorOp[];
  [key: string]: unknown;
}

/** Python-bridge sentinel for a remote callable. The JS side issues an RPC for each datum. */
export interface BridgeLambdaSentinel {
  __gofish_lambda: string;
}

// ---------------------------------------------------------------------------
// Labels and constraints
// ---------------------------------------------------------------------------

/**
 * A single label specification — what one `.label(accessor, options?)` call
 * produces. `accessor` may be a bare field name or a {@link FieldAccessor}
 * (e.g. `field("count").sum()`) labeling a group with an aggregate over its
 * rows, rather than a bare field that must be constant within the group.
 */
export interface LabelSpecIR {
  accessor: string | FieldAccessor;
  /** A position string (`"outset-top"`), or a `Place` strategy. */
  position?: string | PlaceIR;
  /** Nodes a `Place` label keeps off. */
  avoiding?: NodeSelectionIR;
  /** An outline behind the glyphs. */
  halo?: { color?: string; width?: number };
  /** A filled box behind the text. */
  background?: { fill?: string; padding?: number | [number, number] };
  fontSize?: number;
  color?: string;
  offset?: number;
  rotate?: number;
  /** Passed straight through to the label's `Text` node. Defaults to the
   *  elaborator's own font family when unset. */
  fontFamily?: string;
  fontWeight?: number | string;
  fontStyle?: string;
}

/**
 * Label specification carried on a mark or operator's `label` wire field.
 *
 * - **Array of specs** — one entry per `.label(accessor, options?)` call;
 *   repeated calls on the same mark/operator append. This is the only
 *   producing shape: `.label()` always emits (or appends to) an array, even
 *   for a single call.
 * - **Boolean shorthand** (matching the JS operator-kwarg API — e.g.
 *   `stack({...}, label: false)`) — `label: false` explicitly suppresses a
 *   label; this is a distinct, live mechanism from the array form, not
 *   sugar for a one-element array. `label: true` is accepted symmetrically
 *   but has no producer today.
 *
 * NOTE: leaf marks (rect/ellipse/circle) used to interpret a bare `label:
 * true` themselves as an inline value-label; that mark-shape-level reading
 * was removed — `.label()` is the only way to label a leaf mark's drawn
 * value. A bare-string shorthand (`label: "field"`) existed in an earlier
 * revision of this type but was never emitted or consumed by either
 * frontend; it has been dropped.
 */
export type LabelIR = boolean | LabelSpecIR[];

export interface ConstraintIR {
  type: "align" | "distribute" | "position" | "nest" | "zAbove" | "zBelow";
  /** Positioning/sizing constraints (`align`/`distribute`/`position`/`nest`)
   *  carry `options`; z-order constraints don't. `nest` options are
   *  `{ x?: number, y?: number }` (per-axis padding) over `refs: [outer, inner]`. */
  options?: Record<string, unknown>;
  refs: string[];
}

/**
 * One clause of a `.relate()` callback: a constraint over names
 * (`ConstraintIR`, which always carries `refs`), or a mark that draws, whose
 * children may include `{ type: "ref", selection: name }` references to the
 * layer's names (`MarkIR`, which never carries `refs`).
 */
export type RelateClauseIR = ConstraintIR | MarkIR;

/** A relate clause is a constraint exactly when it carries `refs`. */
export function isConstraintIR(clause: RelateClauseIR): clause is ConstraintIR {
  return Array.isArray((clause as { refs?: unknown }).refs);
}

// ---------------------------------------------------------------------------
// Discriminator helpers (predicates)
// ---------------------------------------------------------------------------

/** Discriminate a chart, at the root or in a mark position. */
export function isChartIR(node: MarkIR): node is ChartIR {
  return node.type === "chart";
}
/** Discriminate a `.layer(...)` chain, at the root or in a mark position. */
export function isLayerChainIR(node: MarkIR): node is LayerChainIR {
  return node.type === "layer-chain";
}

/** Discriminate a mark by family. */
export function isCombinatorMarkIR(mark: MarkIR): mark is CombinatorMarkIR {
  return (
    (mark as CombinatorMarkIR).__combinator === true &&
    Array.isArray((mark as CombinatorMarkIR).children)
  );
}
export function isRefMarkIR(mark: MarkIR): mark is RefMarkIR {
  return mark.type === "ref";
}
export function isOffsetMarkIR(mark: MarkIR): mark is OffsetMarkIR {
  return mark.type === "offset";
}
export function isCutMarkIR(mark: MarkIR): mark is CutMarkIR {
  return mark.type === "cut";
}
export function isLeafMarkIR(mark: MarkIR): mark is LeafMarkIR {
  return (
    !isCombinatorMarkIR(mark) &&
    !isRefMarkIR(mark) &&
    !isOffsetMarkIR(mark) &&
    !isCutMarkIR(mark) &&
    !isChartIR(mark) &&
    !isLayerChainIR(mark)
  );
}

/**
 * The set of operator type discriminators recognized in v0. `treemap` is
 * dual-form (also a combinator mark, `COMBINATOR_MARK_TYPES`'s `"treemap"`)
 * exactly like `spread`/`stack`/`scatter`/`group`/`table` — confirmed by a
 * real Python story (`atom/titanic-unit-dots`) that uses `treemap(...)` as a
 * `.flow()` operator, producing `{ type: "treemap", ... }` at the top level
 * of `operators`. Originally this list's inclusion of `treemap` looked like
 * drift against `OperatorIR`/the JSON Schema enum (both omitted it) — but
 * the story corpus proved the OTHER two were the ones missing it, not this
 * list; `OperatorIR` and the generated JSON Schema now include
 * `TreemapOperator` too (see `descriptors.ts`'s `OPERATORS.treemap`).
 */
export const OPERATOR_TYPES = [
  "derive",
  "resolve",
  "join",
  "filter",
  "spread",
  "stack",
  "group",
  "scatter",
  "table",
  "log",
  "treemap",
  "pack",
  "partition",
] as const;

/** The set of leaf-mark type discriminators recognized in v0. */
export const LEAF_MARK_TYPES: readonly LeafMarkType[] = [
  "rect",
  "circle",
  "line",
  "ribbon",
  "enclose",
  "blank",
  "region",
  "ellipse",
  "petal",
  "text",
  "image",
  "polygon",
  "mark-fn",
];

/** The set of combinator-mark type discriminators recognized in v0. */
export const COMBINATOR_MARK_TYPES: readonly CombinatorMarkType[] = [
  "spread",
  "stack",
  "scatter",
  "group",
  "table",
  "layer",
  "enclose",
  "position",
  "arrow",
  "line",
  "ribbon",
  "treemap",
  "pack",
  "over",
  "inside",
  "xor",
  "out",
  "atop",
  "mask",
];

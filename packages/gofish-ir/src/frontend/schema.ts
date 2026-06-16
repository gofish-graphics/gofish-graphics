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
}

/** A frontend-IR root is a chart, a multi-chart layer, or a bare mark. */
export type FrontendIR = ChartIR | LayerIR | RawMarkIR;

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

export interface Origin {
  /** User-supplied name via `.name("bars")` on the v3 fluent builder. */
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
  data?: DataIR | null;
  operators?: OperatorIR[];
  mark: MarkIR;
  options?: Record<string, unknown>;
  zOrder?: number;
  /**
   * Optional connector mark (from `.connect(line())` on the v3 builder).
   * Elaborated JS-side at resolve time into a sibling layer over the nodes
   * the chart's mark registers; an auto-generated layer name never appears
   * in the IR.
   */
  connect?: MarkIR;
  /**
   * Chart-level name (from `chart(...).name("scatter")` in Python /
   * `node.name(...)` on a resolved chart in JS) so a sibling
   * `Layer([...]).constrain(...)` callback can reference this chart. A
   * `createName(...)` token sentinel is also accepted on the wire.
   */
  name?: string;
}

/** Multiple charts composed on the same canvas. */
export interface LayerIR extends BaseIRNode {
  type: "layer";
  charts: ChartIR[];
  options?: Record<string, unknown>;
  /** Layer-level constraints (from `Layer([...]).constrain(...)`), resolving
   *  refs against the child charts' `name`s. */
  constraints?: ConstraintIR[];
}

/** A bare mark, used when no chart-level wrapping is needed. */
export interface RawMarkIR extends BaseIRNode {
  type: "raw-mark";
  mark: MarkIR;
  options?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/**
 * The data field on a chart.
 *
 * - **Inline rows**: `{type: "inline", rows: [...]}` for charts whose data is
 *   embedded in the IR.
 * - **Select reference**: `{type: "select", layer: "name", mode?}` resolves a
 *   sibling chart's named-mark output at deserialize time. The optional `mode`
 *   discriminates the plural `selectAll()` (`"all"`, an array of refs) from the
 *   singular `ref(name)` used as chart data (`"one"` or absent, a single ref).
 *   The `select()` factory no longer exists in either frontend; `mode: "one"`
 *   (or absent) corresponds to `ref(name)`.
 * - **External**: `{type: "external", id?: "..."}` indicates data ships over a
 *   sidecar transport (anywidget's `arrow_data` trait) and the id keys into it.
 */
export type DataIR =
  | { type: "inline"; rows: Array<Record<string, unknown>> }
  | { type: "select"; layer: string; mode?: "one" | "all" }
  | { type: "external"; id?: string };

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

export type OperatorIR =
  | DeriveOperator
  | SpreadOperator
  | StackOperator
  | GroupOperator
  | ScatterOperator
  | TableOperator
  | LogOperator;

/**
 * `derive(fn)` — opaque user transformation. Function bodies are not
 * serializable; the IR carries a bridge handle (`lambdaId`) when the
 * Python widget is the producer, and is otherwise empty.
 */
export interface DeriveOperator extends BaseIRNode {
  type: "derive";
  lambdaId?: string;
  /** Measure provenance a transform (e.g. `bin`) declares for its output
   *  columns — a map from output field name to the measure it carries (the
   *  source field's units). Travels in the IR because the JS-side array symbol
   *  can't ride the data rows across the derive RPC; the deserializer re-applies
   *  it via `setMeasureProvenance`. */
  provenance?: Record<string, string>;
}

export interface SpreadOperator extends BaseIRNode {
  type: "spread";
  by?: string;
  dir?: "x" | "y";
  spacing?: number;
  alignment?: string;
  sharedScale?: boolean;
  mode?: "edge" | "center";
  reverse?: boolean;
  /** Stack semantics: glue children together (sizes sum into a position at
   *  this level) instead of slicing a budget. Forces `spacing` to 0. */
  glue?: boolean;
  axes?: AxesOptions;
}

export interface StackOperator extends BaseIRNode {
  type: "stack";
  by?: string;
  dir?: "x" | "y";
  alignment?: string;
  sharedScale?: boolean;
  mode?: "edge" | "center";
  reverse?: boolean;
  axes?: AxesOptions;
}

export interface GroupOperator extends BaseIRNode {
  type: "group";
  by: string;
}

export interface ScatterOperator extends BaseIRNode {
  type: "scatter";
  by?: string;
  x?: ChannelValue;
  y?: ChannelValue;
  xMin?: ChannelValue;
  xMax?: ChannelValue;
  yMin?: ChannelValue;
  yMax?: ChannelValue;
  alignment?: string;
  axes?: AxesOptions;
}

/**
 * Per-node axis-rendering override. Mirrors the JS-side `AxesOptions` /
 * `AxisOptions` from `gofish-graphics/src/ast/gofish.tsx`.
 *
 * - `true` / `false` — show or hide both x and y axes.
 * - Object form — independently control each dimension.
 *
 * `AxisOptions` per-dim is either a boolean (show/hide, infer title) or an
 * object with an optional `title` (string for custom title, `false` to
 * suppress).
 */
export type AxesOptions = boolean | { x?: AxisOptions; y?: AxisOptions };
export type AxisOptions = boolean | { title?: string | false };

export interface TableOperator extends BaseIRNode {
  type: "table";
  by: { x: string; y: string };
  spacing?: number | [number, number];
  numCols?: number;
}

export interface LogOperator extends BaseIRNode {
  type: "log";
  label?: string;
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

export type MarkIR =
  | LeafMarkIR
  | CombinatorMarkIR
  | RefMarkIR
  | OffsetMarkIR
  | CutMarkIR;

export type LeafMarkType =
  | "rect"
  | "circle"
  | "line"
  | "area"
  | "blank"
  | "ellipse"
  | "petal"
  | "text"
  | "image"
  | "polygon"
  | "mark-fn"; // Python-bridge: a registered (data) -> ChartBuilder lambda.
// Carries a `lambdaId` field; resolved via the bridge.

export type CombinatorMarkType =
  | "spread"
  | "stack"
  | "scatter"
  | "group"
  | "table"
  | "layer"
  | "arrow"
  | "connect"
  | "treemap"
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
export interface LeafMarkIR extends BaseIRNode {
  type: LeafMarkType;
  name?: string;
  label?: LabelIR;
  constraints?: ConstraintIR[];
  zOrder?: number;
  [key: string]: unknown;
}

/**
 * A combinator-form operator used as a mark (e.g. `spread([m1, m2])`).
 * Distinguished from the operator-form by the `__combinator: true` flag
 * and the presence of `children`.
 */
export interface CombinatorMarkIR extends BaseIRNode {
  type: CombinatorMarkType;
  __combinator: true;
  options?: Record<string, unknown>;
  children: MarkIR[];
  name?: string;
  label?: LabelIR;
  constraints?: ConstraintIR[];
  zOrder?: number;
}

/** A by-name reference to another named mark (`ref("bars")`). */
export interface RefMarkIR extends BaseIRNode {
  type: "ref";
  selection: string | Array<string | number>;
  name?: string;
  label?: LabelIR;
  zOrder?: number;
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
}

/**
 * `cut` mark — slices a single `source` mark into N clipped sub-shapes along
 * `dir`. Two deserialization surfaces over the same JS core (extent resolution
 * stays in JS in ONE place):
 *
 *  - as a chart `.mark(...)` spec → the v3 expand-mark form (`cutMark` /
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
  zOrder?: number;
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
 * v0.1+ will move the v3 API to desugar string shorthand to explicit
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

/** Explicit field-accessor form, emitted by `field(name, measure?)`. The
 *  optional `measure` is a unit annotation on the channel's underlying space
 *  (a type claim — see gofish-graphics' `resolveMeasure`). */
export interface FieldAccessor {
  type: "field";
  name: string;
  measure?: string;
}

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
 * Label specification.
 *
 * The canonical object form `{accessor, position?, fontSize?, ...}` is
 * what `mark.label("field", options)` produces. Shorthand forms (matching
 * the JS mark-kwarg API):
 *
 *   label: true     — show a label with default styling
 *   label: "field"  — label using this field accessor, defaults elsewhere
 */
export type LabelIR =
  | true
  | string
  | {
      accessor: string;
      position?: string;
      fontSize?: number;
      color?: string;
      offset?: number;
      minSpace?: number;
      rotate?: number;
    };

export interface ConstraintIR {
  type: "align" | "distribute" | "position" | "nest" | "zAbove" | "zBelow";
  /** Positioning/sizing constraints (`align`/`distribute`/`position`/`nest`)
   *  carry `options`; z-order constraints don't. `nest` options are
   *  `{ x?: number, y?: number }` (per-axis padding) over `refs: [outer, inner]`. */
  options?: Record<string, unknown>;
  refs: string[];
}

// ---------------------------------------------------------------------------
// Discriminator helpers (predicates)
// ---------------------------------------------------------------------------

/** Discriminate a root document. */
export function isChartIR(node: FrontendIR): node is ChartIR {
  return node.type === "chart";
}
export function isLayerIR(node: FrontendIR): node is LayerIR {
  return node.type === "layer";
}
export function isRawMarkIR(node: FrontendIR): node is RawMarkIR {
  return node.type === "raw-mark";
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
    !isCutMarkIR(mark)
  );
}

/** The set of operator type discriminators recognized in v0. */
export const OPERATOR_TYPES = [
  "derive",
  "spread",
  "stack",
  "group",
  "scatter",
  "table",
  "log",
  "treemap",
] as const;

/** The set of leaf-mark type discriminators recognized in v0. */
export const LEAF_MARK_TYPES: readonly LeafMarkType[] = [
  "rect",
  "circle",
  "line",
  "area",
  "blank",
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
  "arrow",
  "connect",
  "treemap",
  "over",
  "inside",
  "xor",
  "out",
  "atop",
  "mask",
];

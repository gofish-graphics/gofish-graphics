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
   * Chart-level name (from `chart(...).name("scatter")` in Python /
   * `node.name(...)` on a resolved chart in JS) so a sibling
   * `Layer([...]).constrain(...)` callback can reference this chart. A
   * `createName(...)` token sentinel is also accepted on the wire.
   */
  name?: string;
}

/** Multiple tiers composed on the same canvas. Each tier is a `ChartIR`; the
 *  v3 `chart(...).layer(mark)` builder chain may also drop in a `RawMarkIR`
 *  tier (a component-level, datumless annotation overlay). The field stays
 *  named `charts` for wire-format stability. */
export interface LayerIR extends BaseIRNode {
  type: "layer";
  charts: Array<ChartIR | RawMarkIR>;
  options?: Record<string, unknown>;
  /** Layer-level constraints (from `Layer([...]).constrain(...)`), resolving
   *  refs against the child charts' `name`s. */
  constraints?: ConstraintIR[];
  /** True when this came from the v3 `chart(...).layer(...)` builder chain
   *  (rather than the low-level `layer([...])` combinator). The deserializer
   *  reconstructs it through the real `LayerBuilder` so JS — not the wrapper —
   *  owns the builder's render logic (inferred axis titles, etc.). */
  builder?: boolean;
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
 * - **Previous tier**: `{type: "previous-tier"}` marks an empty `chart()` /
 *   `Chart()` scope inside a `.layer(...)` chain — "inherit the immediately
 *   preceding tier's marks". The deserializer maps this to the JS
 *   `PREVIOUS_LAYER_MARKS` sentinel so `LayerBuilder`'s own `wireTiers()`
 *   (auto-naming the producer's mark + binding this tier to
 *   `selectAll(name)`) runs JS-side — the same code a native
 *   `chart(...).layer(...)` chain goes through. Only valid on a tier inside a
 *   `builder: true` `LayerIR`.
 */
export type DataIR =
  | { type: "inline"; rows: Array<Record<string, unknown>> }
  | { type: "select"; layer: string; mode?: "one" | "all" }
  | { type: "external"; id?: string }
  | { type: "previous-tier" };

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

export type OperatorIR =
  | DeriveOperator
  | ResolveOperator
  | JoinOperator
  | SpreadOperator
  | StackOperator
  | GroupOperator
  | ScatterOperator
  | TableOperator
  | LogOperator
  | TreemapOperator;

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
  /** Measure provenance a transform (e.g. `bin`) declares for its output
   *  columns — a map from output field name to the measure it carries (the
   *  source field's units). Travels in the IR because the JS-side array symbol
   *  can't ride the data rows across the derive RPC; the deserializer re-applies
   *  it via `setMeasureProvenance`. */
  provenance?: Record<string, string>;
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
  by?: string | FieldAccessor;
  dir?: "x" | "y";
  spacing?: number;
  alignment?: string;
  sharedScale?: boolean;
  anchor?: "edge" | "start" | "middle" | "end" | "baseline";
  reverse?: boolean;
  /** Stack semantics: glue children together (sizes sum into a position at
   *  this level) instead of slicing a budget. Forces `spacing` to 0. */
  glue?: boolean;
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
  by?: string | FieldAccessor;
  dir?: "x" | "y";
  /** Spread-parity passthrough: the JS `stack` is `Spread({...props, glue:
   *  true})`, so producers may put spread's options on the wire. Glue
   *  semantics force the effective gap to 0. */
  spacing?: number;
  /** Spread-parity passthrough; stack always glues regardless. */
  glue?: boolean;
  alignment?: string;
  sharedScale?: boolean;
  anchor?: "edge" | "start" | "middle" | "end" | "baseline";
  reverse?: boolean;
  /** Data-driven operator extent (#4/#20): a field name or pixel number sizing
   *  this operator's box, reported as a SIZE claim to the enclosing scale. */
  w?: ChannelValue;
  h?: ChannelValue;
  /** Per-entry stack-axis extent (#700 Phase 2) — see SpreadOperator.size. */
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
  by: string | FieldAccessor;
}

export interface ScatterOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "scatter";
  /** See `SpreadOperator.label`. */
  label?: LabelIR;
  by?: string | FieldAccessor;
  x?: ChannelValue;
  y?: ChannelValue;
  xMin?: ChannelValue;
  xMax?: ChannelValue;
  yMin?: ChannelValue;
  yMax?: ChannelValue;
  alignment?: string;
  axes?: AxesOptions;
  w?: ChannelValue;
  h?: ChannelValue;
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

export interface TableOperator
  extends BaseIRNode,
    TranslatableIR,
    OperatorFlagsIR {
  type: "table";
  /** See `SpreadOperator.label`. */
  label?: LabelIR;
  by: { x: string; y: string };
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
  by?: string | FieldAccessor;
  paddingInner?: number;
  paddingOuter?: number;
  round?: boolean;
  tile?:
    | "squarify"
    | "slice"
    | "dice"
    | "binary"
    | "slicedice"
    | "squarifyCircle";
  sort?: "asc" | "desc" | "none";
  /** Per-leaf weight driving tile area (entry-flagged per split entry). */
  size?: ChannelValue;
  flipY?: boolean;
  leafIntrinsicRadiusField?: string;
  w?: ChannelValue;
  h?: ChannelValue;
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

export type MarkIR =
  | LeafMarkIR
  | CombinatorMarkIR
  | RefMarkIR
  | OffsetMarkIR
  | CutMarkIR
  | GotreeTreeIR;

export type LeafMarkType =
  | "rect"
  | "circle"
  | "line"
  | "ribbon"
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
  translate?: TranslateIR;
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
  translate?: TranslateIR;
}

/** A by-name reference to another named mark (`ref("bars")`). */
export interface RefMarkIR extends BaseIRNode {
  type: "ref";
  selection: string | Array<string | number>;
  name?: string;
  label?: LabelIR;
  zOrder?: number;
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
  translate?: TranslateIR;
}

/**
 * `gotree-tree` mark (issue #792) — a serialized gotree hierarchy
 * visualization. Python builds a `GoTreeSpec` and calls gotree's `tree()`;
 * on the JS side the reconstruction logic lives in `gofish-gotree` (not
 * here or in gofish-graphics — that dependency would create a workspace
 * cycle) and is INJECTED into the deserializer as a `markBridges` entry
 * keyed `"gotree-tree"` (mirrors the existing `DeriveBridge` precedent in
 * gofish-graphics' `serialize/registry.ts`).
 *
 * Row shape for field/lambda resolution at each hierarchy node:
 * `{ ...d.data (children key omitted), depth, height, width, value }` —
 * `depth`/`height`/`width`/`value` come from gotree's `HierarchyDatum` and
 * OVERRIDE same-named fields already present on the raw tree data. Both the
 * Python emitter and the JS reconstructor must honor this collision rule.
 */
export interface GotreeTreeIR extends BaseIRNode {
  type: "gotree-tree";
  /** The nested tree data: `{ name?, value?, children?: [...], ...extra }`. */
  data: Record<string, unknown>;
  /**
   * Per-node mark template — channels may be literals, `FieldAccessor`s,
   * `DatumValue`s, or `{__gofish_lambda}` sentinels, resolved per row at
   * deserialize time. Omitted → gotree's `DEFAULT_NODE`. The whole-factory
   * fallback (`{type: "mark-fn", lambdaId}`) is already a `MarkIR` leaf
   * variant, so no separate union arm is needed for it here.
   */
  node?: MarkIR;
  /**
   * Per-edge link styling. `"none"` suppresses links; a lambda sentinel
   * receives `(srcRow, tgtRow)` and returns a `GotreeLinkOptionsIR` dict —
   * resolved eagerly at deserialize time (gotree's edge-collection callback
   * is synchronous, so lambda RPCs can't run inside it; see gofish-gotree's
   * `serialize.ts`).
   */
  link?: "none" | GotreeLinkOptionsIR | BridgeLambdaSentinel;
  /** Combiner for parent ↔ children-group. */
  parentChild?: GotreeCombinerIR;
  /** Combiner for the sibling group. */
  sibling?: GotreeCombinerIR;
  /** Reuses the existing coord IR shape (e.g. `{type: "polar", ...}`) — see
   *  `resolveCoordConfig`/`resolveOptions` in gofish-graphics' fromJSON.ts. */
  coord?: Record<string, unknown>;
}

/** `GoTreeSpec.link`'s object form — mirrors gofish-gotree's `LinkOptions`
 *  (`packages/gofish-gotree/src/spec.ts`). */
export interface GotreeLinkOptionsIR {
  curve?: "straight" | "bezier" | "orthogonal" | "arc";
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

/**
 * A gotree parent-child/sibling combiner. Mirrors gofish-gotree's
 * `SpreadOptions` / `DistributeOptions` / `NestOptions` / `CombineOptions`
 * (`packages/gofish-gotree/src/helpers.ts`) and its depth-indexed
 * `alternate(...)` (depth % length indexing over a fixed combiner list).
 * `options` stays a loosely-typed bag here — like other combinator
 * `options` in this schema — rather than re-deriving each helper's full
 * field set; the real helper functions validate their own opts at
 * reconstruction time.
 */
export type GotreeCombinerIR =
  | { kind: "spread"; options: Record<string, unknown> }
  | { kind: "distribute"; options: Record<string, unknown> }
  | { kind: "nest"; options: Record<string, unknown> }
  | { kind: "combine"; options: Record<string, unknown> }
  | { kind: "alternate"; combiners: GotreeCombinerIR[] };

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
 *  (a type claim — see gofish-graphics' `resolveMeasure`). `ops` is the
 *  optional chained pipeline (#700 Phase 1/2), e.g. `field("site").sort("yield")`
 *  or `field("count").normalize()` — see `FieldOpIR` and gofish-graphics'
 *  `fieldExpr.ts` (`FieldOp`), which this mirrors exactly. Two disjoint
 *  slots consume it: a `by` (grouping key) slot accepts the domain ops
 *  (`sort`/`reverse`/`bin`); a value (size/pos) channel slot accepts the
 *  aggregate ops (`sum`/`mean`/`count`/`distinct`) and, only on an
 *  operator's entry-flagged `size` channel, `normalize`. */
export interface FieldAccessor {
  type: "field";
  name: string;
  measure?: string;
  ops?: FieldOpIR[];
}

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
  | { op: "bin"; thresholds?: number | number[] }
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
  position?: string;
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
export function isGotreeTreeIR(mark: MarkIR): mark is GotreeTreeIR {
  return mark.type === "gotree-tree";
}
export function isLeafMarkIR(mark: MarkIR): mark is LeafMarkIR {
  return (
    !isCombinatorMarkIR(mark) &&
    !isRefMarkIR(mark) &&
    !isOffsetMarkIR(mark) &&
    !isCutMarkIR(mark) &&
    !isGotreeTreeIR(mark)
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
  "ribbon",
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
  "enclose",
  "position",
  "arrow",
  "line",
  "ribbon",
  "treemap",
  "over",
  "inside",
  "xor",
  "out",
  "atop",
  "mask",
];

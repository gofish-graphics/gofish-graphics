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
}

/** Multiple charts composed on the same canvas. */
export interface LayerIR extends BaseIRNode {
  type: "layer";
  charts: ChartIR[];
  options?: Record<string, unknown>;
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

export type DataIR =
  | { type: "inline"; rows: Array<Record<string, unknown>> }
  | { type: "select"; layer: string }
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
}

export interface StackOperator extends BaseIRNode {
  type: "stack";
  by?: string;
  dir?: "x" | "y";
  alignment?: string;
  sharedScale?: boolean;
  mode?: "edge" | "center";
  reverse?: boolean;
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
}

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

export type MarkIR = LeafMarkIR | CombinatorMarkIR | RefMarkIR;

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
  | "polygon";

export type CombinatorMarkType =
  | "spread"
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

// ---------------------------------------------------------------------------
// Channel values
// ---------------------------------------------------------------------------

/**
 * A channel value (the right-hand side of a mark or operator property like
 * `h: …` or `fill: …`).
 *
 * v0 mirrors the existing widget wire format — strings disambiguate to
 * field-accessor or literal at runtime by checking against `data[0]`;
 * `__gofish_v` and `__gofish_lambda` are Python-bridge sentinels;
 * `{type: "datum"}` is the existing wrapped-value runtime tag.
 *
 * v0.1+ will introduce explicit `field` / `datum` / `literal` constructors
 * that the v3 API desugars eagerly, so the IR sees only one canonical
 * shape per slot. See the architecture essay.
 */
export type ChannelValue =
  | string
  | number
  | boolean
  | null
  | DatumValue
  | BridgeValueSentinel
  | BridgeLambdaSentinel;

export interface DatumValue {
  type: "datum";
  [key: string]: unknown;
}

/** Python-bridge sentinel for a wrapped-value (`v(...)` on the Python side). */
export interface BridgeValueSentinel {
  __gofish_v: unknown;
}

/** Python-bridge sentinel for a remote callable. The JS side issues an RPC for each datum. */
export interface BridgeLambdaSentinel {
  __gofish_lambda: string;
}

// ---------------------------------------------------------------------------
// Labels and constraints
// ---------------------------------------------------------------------------

export interface LabelIR {
  accessor: string;
  position?: string;
  fontSize?: number;
  color?: string;
  offset?: number;
  minSpace?: number;
  rotate?: number;
}

export interface ConstraintIR {
  type: "align" | "distribute" | "zAbove" | "zBelow";
  /** Positioning constraints carry `options`; z-order constraints don't. */
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
export function isLeafMarkIR(mark: MarkIR): mark is LeafMarkIR {
  return !isCombinatorMarkIR(mark) && !isRefMarkIR(mark);
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
];

/** The set of combinator-mark type discriminators recognized in v0. */
export const COMBINATOR_MARK_TYPES: readonly CombinatorMarkType[] = [
  "spread",
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

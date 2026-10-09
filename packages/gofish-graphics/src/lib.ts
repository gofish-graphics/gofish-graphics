// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Three Surfaces — /internals/design-evolution/three-surfaces
// </gofish-wiki>

// Main library exports
import groupBy from "lodash/groupBy";
import meanBy from "lodash/meanBy";
import orderBy from "lodash/orderBy";
import sumBy from "lodash/sumBy";

export * from "./color";
export * from "./path";
export * from "./util";

// Data utilities
export { value } from "./ast/data";
export { value as v } from "./ast/data";
// `field` / `datum` / `literal` — explicit channel-value constructors
// matching the Vega-Lite encoding trichotomy. `datum` is an alias for
// `value`/`v` (data-driven, scaled); `field(name)` is an explicit field
// accessor; `literal(x)` is an explicit constant.
export { datum, field, literal } from "./ast/data";
export type { FieldAccessor, LiteralValue } from "./ast/data";
// `field(name)` returns a `FieldExpr` — a chainable pipeline expression
// (`.sort()`, `.bin()`, `.normalize()`, aggregates); `FieldOp` is one step of
// its serialized `ops` pipeline. Exported so consumers can type against the
// value the operator docs describe.
export { FieldExpr, between } from "./ast/fieldExpr";
export type {
  FieldOp,
  BetweenOptions,
  FieldPredicate,
  FieldPredicateWire,
} from "./ast/fieldExpr";
// Measure-provenance tagging: how a data transform declares that
// its output columns are in a source field's units. The deserializer re-applies
// it to RPC-returned rows (the array symbol can't cross the bridge).
export { setMeasureProvenance } from "./ast/data";
export type { MeasureProvenance } from "./ast/data";
export { map } from "./ast/iterators/map";

// Strategy families (#1013): an option whose value is one choice from a set
// of named strategies gets one namespace, with a capitalized name. Each is a
// module (`src/families/<name>.ts`, also published as the subpath
// `gofish-graphics/<name>`), so `Curve.monotone` here and
// `import { monotone } from "gofish-graphics/curve"` are the same function.
// The family's type is inside its namespace under the family's name
// (`Curve.Curve`). Strategies are not also exported at the top level. Each
// family is exported where its members used to be, which keeps the order the
// modules run in (lib.ts's imports reach some modules that import lib.ts
// back, so moving them changes which class is defined first).
export * as Coord from "./families/coord";

// The low-level coordinate combinator `coord({ transform }, children)`; the
// transforms themselves are the `Coord` family.
export { coord } from "./ast/coordinateTransforms/coord";

// Main API
export { gofish } from "./ast/gofish";
export { GoFishSolid } from "./ast/GoFishSolid";

// SVG export
export {
  serializeSVG,
  gofishToSVG,
  gofishToSVGElement,
  saveSVGString,
  gofishSave,
} from "./ast/gofish";
export type {
  GoFishRenderOptions,
  GoFishExportOptions,
  View,
} from "./ast/gofish";

// Display-list (render-IR) export
export { toDisplayList } from "./ast/displayList/toDisplayList";

// Name / scope primitives
export { createName } from "./ast/createName";
export type { Token } from "./ast/createName";
export { createMark } from "./ast/withGoFish";

/* Low-level operators */
// Data
// export { groupBy } from "./ast/iterators/groupBy";
export { groupBy, sumBy, orderBy, meanBy };

// Shapes
export { ref } from "./ast/shapes/ref";

// The ref runtime class itself (not just the `ref(...)` factory) — needed by
// consumers that must distinguish "a resolved node ref" from "a plain data
// row" at runtime, e.g. the Python-bridge mark-fn plumbing (issue #591) that
// serializes each `GoFishRef` argument as an `{__inputRef, datum}` sentinel
// before it crosses the RPC boundary.
export { GoFishRef } from "./ast/_ref";

// Datum projection — `pluck(ref, "species")` returns the full set of distinct
// values for a field across a selected node's rows ("every possible value");
// `project(ref, "species")` is its collapsing sibling — the single value when
// the rows agree on the field (the same homogeneity collapse `by: "field"`
// performs), else `undefined`. Use `project` to read a field off the datum a
// mark is bound to (e.g. in a `.zOrder(d => …)` callback) without indexing the
// `pluck` multiset. (`splitKeyFn` stays module-internal — operators import it
// from ./ast/datumProjection directly.)
export { pluck, projectPath as project } from "./ast/datumProjection";

// Column types for `chart(data, { schema })` (#984): `Schema` is the
// capitalized factory namespace, like `Constraint`.
export { Schema, ColumnSchema } from "./ast/schema";
export type {
  ColumnType,
  HasOrder,
  HasMidpoint,
  HasCalendar,
  Level,
  SchemaEntry,
} from "./ast/schema";
// Calendar partitions (#1057): the cells a time axis's rows are made of
// (`axes: { x: { rows: [Calendar.month, Calendar.year] } }`). Capitalized
// like `Schema`: a namespace of values.
export { Calendar, CalendarPartition } from "./ast/calendar";
export type {
  CalendarCell,
  CalendarUnit,
  CalendarJSON,
  CellFormat,
  WeekStart,
} from "./ast/calendar";
export type { TimeRowOption } from "./ast/axes/timeRows";
// Cells (#1058): what `field(x).bin(partition)` maps each value to. A
// partition is a Calendar value, `{ step }`, or `{ thresholds }`.
export type {
  Cell,
  Partition,
  NumberPartition,
  NumberCellFormat,
  PartitionJSON,
} from "./ast/cells";

// Constraints
export { Constraint } from "./ast/constraints";
export type {
  ConstraintRef,
  RelateEnv,
  RelateClause,
  RelateFn,
  ConstraintSpec,
  AlignConstraint,
  DistributeConstraint,
  DistributeOptions,
  PositionConstraint,
  PositionOptions,
  Axis,
  Alignment,
} from "./ast/constraints";

// Graphical Operators
// Each operator has one lowercase name that works at both levels: inside
// `chart(...).flow(...)` and as a combinator over marks (`stack(opts, [a, b])`,
// `layer([...]).render(...)`). The node-level building blocks they are made
// from (`Spread`, `Layer`, the region-compositing node operators, ...) are
// internal and not exported (#146).
export { stackX } from "./ast/graphicalOperators/stackX";
export { stackY } from "./ast/graphicalOperators/stackY";
export { spread, stack } from "./ast/graphicalOperators/spread";
export { scatter } from "./ast/graphicalOperators/scatter";
export { spreadX } from "./ast/graphicalOperators/spreadX";
export { spreadY } from "./ast/graphicalOperators/spreadY";
export * as Curve from "./families/curve";
export { treemap } from "./ast/graphicalOperators/treemap";
export * as Tile from "./families/tile";
export type { TreemapOptions } from "./ast/graphicalOperators/treemap";
export { pack } from "./ast/graphicalOperators/pack";
export type { PackOptions } from "./ast/graphicalOperators/pack";
export { partition } from "./ast/graphicalOperators/partition";
export type { PartitionOptions } from "./ast/graphicalOperators/partition";
export * as Overlap from "./families/overlap";
export {
  enclose,
  enclose as background,
} from "./ast/graphicalOperators/enclose";
export { Frame as frame } from "./ast/graphicalOperators/frame";
export { group } from "./ast/graphicalOperators/group";
export { position } from "./ast/graphicalOperators/position";
export { arrow } from "./ast/graphicalOperators/arrow";
export { table } from "./ast/graphicalOperators/table";
export { cut, cutMark } from "./ast/graphicalOperators/cut";
export { offset } from "./ast/graphicalOperators/offset";

// Marks (lowercase, from createMark)
export { ellipse } from "./ast/shapes/ellipse";
export { petal } from "./ast/shapes/petal";
export { polygon } from "./ast/shapes/polygon";
export { text } from "./ast/shapes/text";
export { image } from "./ast/shapes/image";

/* Chart Syntax */
export {
  chart,
  derive,
  filter,
  resolve,
  join,
  rect,
  circle,
  selectAll,
  line,
  blank,
  ribbon,
  createRelationalMark,
  normalize,
  repeat,
  log,
  layer,
  paint,
  intersect,
  exclude,
  subtract,
  mask,
} from "./ast/marks/chart";
export type { RelatableMark, DeriveOptions } from "./ast/marks/chart";
export { compose } from "./ast/marks/compose";
// Animation (JS-only, like the rest of the reactive layer: a sequence owns a
// clock, which is a live signal and does not cross the Python bridge).
// Exported as ONE namespace object so the temporal vocabulary reads as its
// own surface — `time.sequence` / `time.transition` — rather than as two more
// bare names beside the spatial operators.
export { time } from "./ast/marks/time";
export type {
  SequenceOptions,
  HistoryOptions,
  TransitionOptions,
} from "./ast/marks/time";
// The effects of `.transition({ enter, exit, update })`: WHAT changes as a
// mark enters (grow, fadeIn, wipe, …), the partner of `time.*` (WHEN).
// JS-only like the rest of `time`. The types below belong to `.transition()`
// and `time.*`.
export * as Animation from "./families/animation";
export type { Ease } from "./animation/effects";
export type {
  MarkTransition,
  OperatorTransition,
} from "./animation/transition";
export type { StaggerOptions } from "./animation/timeArrangements";
export type { BuildClockOptions } from "./animation/install";
// The data-space reading of a transition: read a table of keyframes at one
// moment and hand the result to an ordinary chart. See `src/interpolate.ts`.
export { interpolate } from "./interpolate";
export type { InterpolateOptions } from "./interpolate";
export type {
  Mark,
  Operator,
  ChartOptions,
  ChartBuilder,
} from "./ast/marks/chart";
export type { MarkChild } from "./ast/types";
// Side-effect import: attaches .facet() / .stack() to ChartBuilder.
import "./ast/marks/builderMixins";

// Frontend-IR deserializer — re-exported as a namespace so the symbol set
// stays scoped (`Serialize.renderIR`, etc.).
export * as Serialize from "./serialize";
export * as Color from "./families/color";
export { assignGradientColor } from "./ast/colorSchemes";
export { barChart } from "./charts/bar";
export type { NameableMark } from "./ast/withGoFish";
export type {
  LabelSpec,
  LabelOptions,
  LabelAccessor,
} from "./ast/labels/labelPlacement";

// Reactive interaction layer (JS-only; no Python/IR bridge). Signals live
// OUTSIDE the layout pipeline — see src/interaction/ and the reactivity docs.
export {
  live,
  pointer,
  drag,
  click,
  wheel,
  timer,
  signal,
  slider,
  button,
} from "./interaction";
export type {
  LiveValue,
  Pointer,
  Drag,
  DragOptions,
  Click,
  ClickOptions,
  SliderOptions,
  ButtonOptions,
  Control,
  FrameBoxReader,
  Wheel,
  WheelOptions,
  Timer,
  TimerOptions,
  TimerValues,
  Signal,
  SvgPoint,
  SvgBox,
} from "./interaction";

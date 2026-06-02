// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Three Surfaces — /internals/design-evolution/three-surfaces
// </gofish-wiki>

// Main library exports
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
export { For as map } from "./ast/iterators/for";

// Coordinate Transforms
export { coord } from "./ast/coordinateTransforms/coord";
export { linear } from "./ast/coordinateTransforms/linear";
export { polar } from "./ast/coordinateTransforms/polar";
export { clock } from "./ast/coordinateTransforms/clock";
export { polar_DEPRECATED } from "./ast/coordinateTransforms/polar_DEPRECATED";
export { polarTransposed } from "./ast/coordinateTransforms/polarTransposed";
export { arcLengthPolar } from "./ast/coordinateTransforms/arcLengthPolar";
export { bipolar } from "./ast/coordinateTransforms/bipolar";
export { wavy } from "./ast/coordinateTransforms/wavy";

// Main API
export { gofish as GoFish } from "./ast/gofish";
export { GoFishSolid } from "./ast/GoFishSolid";

// Name / scope primitives
export { createName } from "./ast/createName";
export type { Token } from "./ast/createName";
export { createMark } from "./ast/withGoFish";

/* API v2 */
// Data
export { For } from "./ast/iterators/for";
// export { groupBy } from "./ast/iterators/groupBy";
export { groupBy, sumBy, orderBy, meanBy } from "lodash";
export { bin } from "./ast/transforms";

// Shapes
export { ref } from "./ast/shapes/ref";

// Constraints
export { Constraint } from "./ast/constraints";
export type {
  ConstraintRef,
  ConstraintSpec,
  AlignConstraint,
  DistributeConstraint,
  DistributeOptions,
  Axis,
  Alignment,
} from "./ast/constraints";

// Graphical Operators
export { stackX, stackX as StackX } from "./ast/graphicalOperators/stackX";
export { stackY, stackY as StackY } from "./ast/graphicalOperators/stackY";
export { Spread, spread, stack } from "./ast/graphicalOperators/spread";
export { stack as Stack } from "./ast/graphicalOperators/stack";
export { Scatter, scatter } from "./ast/graphicalOperators/scatter";
export { spreadX, spreadX as SpreadX } from "./ast/graphicalOperators/spreadX";
export { spreadY, spreadY as SpreadY } from "./ast/graphicalOperators/spreadY";
export { layer as Layer } from "./ast/graphicalOperators/layer";
export { connect, connect as Connect } from "./ast/graphicalOperators/connect";
export { treemap, treemap as Treemap } from "./ast/graphicalOperators/treemap";
export {
  connectX,
  connectX as ConnectX,
} from "./ast/graphicalOperators/connectX";
export {
  connectY,
  connectY as ConnectY,
} from "./ast/graphicalOperators/connectY";
export { enclose, enclose as Enclose } from "./ast/graphicalOperators/enclose";
export { Frame, Frame as frame } from "./ast/graphicalOperators/frame";
export { group } from "./ast/graphicalOperators/group";
export {
  position,
  position as Position,
} from "./ast/graphicalOperators/position";
export { arrow, arrow as Arrow } from "./ast/graphicalOperators/arrow";
export { Table, table } from "./ast/graphicalOperators/table";
export {
  over as Over,
  inside as In,
  xor as Xor,
  out as Out,
  atop as Atop,
  mask as Mask,
} from "./ast/graphicalOperators/porterDuff";

// Marks (lowercase, from createMark)
export { ellipse } from "./ast/shapes/ellipse";
export { petal } from "./ast/shapes/petal";
export { polygon } from "./ast/shapes/polygon";
export { text } from "./ast/shapes/text";
export { image } from "./ast/shapes/image";

/* Chart Syntax */
export {
  chart as Chart,
  derive,
  rect,
  circle,
  select,
  line,
  blank,
  area,
  normalize,
  repeat,
  log,
  layer,
  atop,
  over,
  inside,
  xor,
  out,
  mask,
} from "./ast/marks/chart";
export type { ConstrainableMark } from "./ast/marks/chart";
export type {
  Mark,
  Operator,
  ChartOptions,
  ChartBuilder,
} from "./ast/marks/chart";
// Side-effect import: attaches .facet() / .stack() to ChartBuilder.
import "./ast/marks/builderMixins";

// Frontend-IR deserializer — re-exported as a namespace so the symbol set
// stays scoped (`Serialize.mapMark`, etc.).
export * as Serialize from "./serialize";
export { palette, gradient, assignGradientColor } from "./ast/colorSchemes";
export type {
  ColorConfig,
  PaletteScale,
  GradientScale,
} from "./ast/colorSchemes";
export type { NameableMark } from "./ast/withGoFish";
export type {
  LabelSpec,
  LabelOptions,
  LabelAccessor,
} from "./ast/labels/labelPlacement";

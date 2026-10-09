/**
 * Frontend-IR deserializer for GoFish.
 *
 * @see {@link ./fromJSON.ts} for the deserializer functions.
 * @see {@link ./registry.ts} for the factory table and
 *      the {@link DeriveBridge} contract.
 */

export {
  FACTORIES,
  OPERATOR_BUILDERS,
  rebuild,
  type DeriveBridge,
} from "./registry";

// Column types (schema.ts) a host attaches to the rows it decodes, the way a
// chart's `schema` attaches them: the Python widget's Arrow decode marks a
// timestamp or date column as a time (`HasCalendar`) in the column's zone.
export {
  getColumnTypes,
  setColumnTypes,
  type ColumnTypes,
} from "../ast/schema";

export {
  buildChart,
  readIR,
  renderIR,
  constraintFromIR,
  isTokenSentinel,
  makeTokenResolver,
  mapOperator,
  resolveNameField,
  resolveRefSelection,
  unwrapMarkOpts,
  unwrapValues,
  wrapWithScope,
  type ChartSpec,
  type ConstraintSpec,
  type LabelSpec,
  type LayerSpec,
  type MarkSpec,
  type OperatorSpec,
  type RawMarkSpec,
  type RenderIROptions,
  type IRHost,
  type TokenResolver,
  type TokenSentinel,
} from "./fromJSON";

export { toJSON, toJSONLayer, toJSONRawMark } from "./toJSON";

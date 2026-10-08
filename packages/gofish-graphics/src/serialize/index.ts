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
  unwrapOpts,
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

/**
 * Frontend-IR deserializer for GoFish.
 *
 * @see {@link ./fromJSON.ts} for the deserializer functions.
 * @see {@link ./registry.ts} for the operator/mark factory registries and
 *      the {@link DeriveBridge} contract.
 */

export {
  COMBINATOR_FACTORIES,
  MARK_MAP,
  OPERATOR_MAP,
  type DeriveBridge,
} from "./registry";

export {
  buildChart,
  isTokenSentinel,
  makeTokenResolver,
  mapMark,
  mapOperator,
  resolveNameField,
  resolveOptions,
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
  type TokenResolver,
  type TokenSentinel,
} from "./fromJSON";

export { toJSON, toJSONLayer, toJSONRawMark } from "./toJSON";

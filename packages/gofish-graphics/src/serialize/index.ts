/**
 * Frontend-IR serialization for GoFish: the emitter (`toJSON`), the
 * deserializer (`buildIR`, `renderIR`), and the {@link DeriveBridge} a host
 * supplies to run the Python callbacks a document names.
 *
 * @see {@link ./fromJSON.ts} for the deserializer.
 * @see {@link ./registry.ts} for the factory table and the bridge contract.
 */

export {
  BridgeRef,
  FACTORIES,
  OPERATOR_BUILDERS,
  rebuild,
  type BridgeReply,
  type DeriveBridge,
} from "./registry";

// Column types (schema.ts) a host attaches to the rows it decodes, the way a
// chart's `schema` attaches them: the Python hosts' Arrow decode marks a
// timestamp or date column as a time (`HasCalendar`) in the column's zone.
export {
  getColumnTypes,
  setColumnTypes,
  type ColumnTypes,
} from "../ast/schema";

export {
  buildIR,
  readIR,
  renderIR,
  mapOperator,
  unwrapOpts,
  type RenderIROptions,
} from "./fromJSON";

export { toJSON } from "./toJSON";

export { withWire, wireOf } from "../ast/wire";

export { RESOLVE_ROWS } from "../ast/channels";

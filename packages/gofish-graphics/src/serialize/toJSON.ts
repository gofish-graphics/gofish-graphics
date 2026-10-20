// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * Frontend-IR emitter: turns a `ChartBuilder` (or a `LayerBuilder` chain, or a
 * mark) into a {@link Frontend.FrontendIRDocument}.
 *
 * The emitter walks the runtime operator/mark tree and reads the
 * `__serialize` tag that the factories (`createOperator`, `createMark`, and
 * various manual tagging sites in `marks/chart.ts`) attach to each value.
 * Operators or marks without a tag emit an opaque `{ type: "derive" }`
 * fallback — the most permissive default, mirroring how the Python widget
 * encodes user-supplied lambdas.
 *
 * The shape produced matches the existing widget wire format exactly (v0).
 * Future major versions will introduce explicit ChannelExpr discriminators,
 * PascalCase type tags, and `__combinator` removal — see the architecture
 * essay at `apps/docs/docs/internals/frontend/serialization.md`.
 */

import { Frontend } from "gofish-ir";
import type { Mark, Operator } from "./registry";
import {
  ChartBuilder,
  LayerBuilder,
  PREVIOUS_LAYER_MARKS,
  RenderableBuilder,
} from "../ast/marks/chartBuilder";
import { GoFishRef } from "../ast/_ref";
import { wireOf } from "../ast/wire";

// The widget IR uses these symbol-loose shapes; toJSON returns them as-is.
// The validator in `gofish-ir` accepts these shapes in permissive mode.
type AnyObject = Record<string, any>;

/** Metadata attached to operators and marks by the factories in P3. */
interface SerializeTag {
  type: string;
  opts: AnyObject;
  __combinator?: true;
  children?: Mark<any>[] | Promise<Mark<any>[]>;
  /** Set when `.name(layerName)` is chained on a mark. Strings pass through; Tokens become bridge-style sentinels. */
  name?: string | { __gofish_token: string; __tag: string };
  /** Set when `.label(accessor, options)` is chained on a mark or an
   *  operator's traversal form (createOperator.ts's `translateOperator` /
   *  bottom-of-`dual` attachment, and `labelModifier`'s mark-side tag).
   *  Always an array — one entry per `.label()` call, in call order;
   *  `pushLabelField` appends. `accessor` is a bare field name or a
   *  `field(...)` aggregate's serialized `FieldExprWire` (`{type: "field",
   *  ...}`) — see `labelIRField` in createOperator.ts. */
  label?: Array<{ accessor: string | AnyObject; [k: string]: unknown }>;
  /** Set when `.translate({x, y})` is chained on an operator (traversal
   *  form) — `translateOperator` copies the base operator's tag forward onto
   *  its wrapper and stamps this field so the structural pixel offset
   *  reaches the wire (mirrors `TranslatableIR.translate` in gofish-ir). */
  translate?: { x?: number; y?: number };
}

/**
 * A construct's options as the wire carries them: only the keys gofish-ir's
 * `acceptedFields` lists for its kind and type (its descriptor's fields plus
 * the base fields that sit beside them). Factories tag their options as the
 * caller passed them; this is the one place that decides what of them
 * reaches the IR, so an unknown key never leaks onto the wire.
 *
 * A function value is dropped too, whatever the key: a callback or `live(...)`
 * channel is a JS closure with no JSON form (the same reason a JS `derive(fn)`
 * emits an opaque `{type: "derive"}`). A strategy kind used bare
 * (`Curve.monotone`) is no function here: the factory that tagged the
 * options read it as its value (`withKindValues`). A type the descriptor
 * table does not declare has no wire form at all, so it throws.
 */
function wireOpts(
  kind: Frontend.NodeKind,
  type: string,
  opts: AnyObject
): AnyObject {
  const accepted = Frontend.acceptedFields(kind, type);
  if (accepted === undefined) {
    throw new Error(
      `toJSON: "${type}" has no ${kind} descriptor in gofish-ir's descriptor ` +
        "table, so it has no IR form."
    );
  }
  const out: AnyObject = {};
  for (const [key, value] of Object.entries(opts)) {
    if (Object.hasOwn(accepted, key) && typeof value !== "function") {
      out[key] = value;
    }
  }
  return out;
}

function readTag(value: unknown): SerializeTag | undefined {
  const tag = wireOf<SerializeTag>(value);
  if (!tag || typeof tag.type !== "string") return undefined;
  return tag as SerializeTag;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Emit a frontend-IR document whose root is `root`: a {@link ChartBuilder}, a
 * `.layer(...)` chain ({@link LayerBuilder}), or a mark (a `layer([...])` of
 * charts or marks, a bare mark). A root holds anything a mark position does,
 * so this is the one entry point.
 *
 * Async because combinator-form marks may carry their child list as a
 * `Promise<Mark[]>` (when built via helpers like `map(...)`); the emitter
 * resolves these to walk into them.
 */
export async function toJSON(
  root: RenderableBuilder | Mark<any>
): Promise<Frontend.FrontendIRDocument> {
  const tables = new TableIds();
  return document(await markToIR(root, tables), tables);
}

/**
 * The tables one document's walk collects: the rows of every chart in it
 * that has rows of its own, each under the id its `{type: "table", id}` data
 * names. Ids are minted in walk order (`t0`, `t1`, ...), and the same rows
 * object, used by two charts, is one table.
 */
class TableIds {
  readonly tables: Frontend.Tables = {};
  private readonly ids = new Map<object, string>();

  add(rows: AnyObject[]): Frontend.DataIR {
    let id = this.ids.get(rows);
    if (id === undefined) {
      id = `t${this.ids.size}`;
      this.ids.set(rows, id);
      this.tables[id] = rows;
    }
    return { type: "table", id };
  }
}

/**
 * Wrap a root and its tables in the IR document envelope, encoded as the
 * wire carries it (gofish-ir's `encodeIR`): a `field(...)` or `datum(...)`
 * instance in its plain form, and every non-finite number (`Infinity`,
 * `-Infinity`, `NaN`) in its tagged form, since JSON has no spelling for
 * them. A reader decodes them with `Serialize.readIR` before rebuilding the
 * chart.
 */
function document(root: Frontend.FrontendIRDocument["root"], ids: TableIds) {
  return Frontend.encodeIR<Frontend.FrontendIRDocument>({
    irVersion: 0,
    ir: "gofish-frontend",
    root,
    ...(Object.keys(ids.tables).length > 0 ? { tables: ids.tables } : {}),
  });
}

// ---------------------------------------------------------------------------
// Walkers
// ---------------------------------------------------------------------------

/** Internal-private read of ChartBuilder's state. */
interface ChartBuilderInternals {
  data: unknown;
  options?: AnyObject;
  operators: Operator<any, any>[];
  finalMark?: Mark<any> | RenderableBuilder;
  nodeZOrder?: number;
  nodeName?: string;
}

function chartBuilderInternals(
  chart: ChartBuilder<any>
): ChartBuilderInternals {
  const c = (chart as any).state;
  return {
    data: c.data,
    options: c.options,
    operators: c.operators ?? [],
    finalMark: c.finalMark,
    nodeZOrder: c.nodeZOrder,
    nodeName: c.nodeName,
  };
}

async function chartBuilderToChartIR(
  chart: ChartBuilder<any>,
  tables: TableIds
): Promise<Frontend.ChartIR> {
  const { data, options, operators, finalMark, nodeZOrder, nodeName } =
    chartBuilderInternals(chart);

  const ir: Frontend.ChartIR = {
    type: "chart",
    data: dataToIR(data, tables),
    mark: finalMark
      ? await markToIR(finalMark, tables)
      : ({ type: "rect" } as Frontend.LeafMarkIR),
  };
  // Match how `options` / `zOrder` are handled — omit empty arrays so a
  // round-trip through fromJSON → toJSON doesn't gain a spurious
  // `operators: []` on the second pass when none were specified.
  if (operators.length > 0) {
    ir.operators = operators.map(operatorToIR);
  }
  if (options && Object.keys(options).length > 0) {
    ir.options = options as AnyObject;
  }
  if (nodeZOrder !== undefined) {
    ir.zOrder = nodeZOrder;
  }
  // `chart(...).name(n)`, which a sibling `layer([...]).relate(...)` reads.
  if (nodeName !== undefined) {
    ir.name = nodeName;
  }
  return ir;
}

/** A chart's data on the wire. Rows of the chart's own (and no data, which
 *  reads as no rows) go into `tables`, and the chart names them by id. */
function dataToIR(data: unknown, tables: TableIds): Frontend.DataIR {
  if (data == null) return tables.add([]);
  // An empty `chart()` scope: the previous tier's marks in a `.layer(...)`
  // chain, or the rows of the partition a chart in a mark position sits in.
  if (data === PREVIOUS_LAYER_MARKS) return { type: "previous-tier" };
  // A `GoFishRef` used as chart data (from `ref(name)` or `selectAll(name)`).
  // Only string-layer references serialize; `multiplicity` ("one" | "all")
  // becomes the wire `mode` (emitted unconditionally so JS and Python IR agree).
  if (data instanceof GoFishRef) {
    if (typeof data.selection === "string") {
      return {
        type: "select",
        layer: data.selection,
        mode: data.multiplicity ?? "one",
      };
    }
    throw new Error(
      "Cannot serialize a token/path/node-backed ref as chart data; only a " +
        "string-layer ref (ref(name) / selectAll(name)) is serializable."
    );
  }
  if (Array.isArray(data)) return tables.add(data as AnyObject[]);
  // Unknown shape — wrap as a single-row table so the schema is satisfied,
  // but warn so the caller can investigate. Hitting this path usually
  // indicates the chart's data argument was neither an array nor a
  // GoFishRef and isn't structurally what the runtime expects.
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(
      "[gofish-ir] toJSON.dataToIR: unrecognized data shape, wrapping as a single-row table. " +
        "Expected an array or a string-layer GoFishRef."
    );
  }
  return tables.add([data as AnyObject]);
}

function operatorToIR(op: Operator<any, any>): Frontend.OperatorIR {
  const tag = readTag(op);
  if (!tag) {
    // No tag — opaque user-supplied operator. The widget wire format
    // represents these as `{ type: "derive" }`.
    return { type: "derive" } as Frontend.DeriveOperator;
  }
  // `.label(accessor, options)` / `.translate({x, y})` chained on the
  // operator (traversal) form land in `tag.label` / `tag.translate`,
  // mirroring how a chained mark `.label()` surfaces as a top-level field in
  // `markToIR` — see createOperator.ts's `attachLabelOption` /
  // `translateOperator`.
  return {
    type: tag.type,
    ...wireOpts("operator", tag.type, tag.opts),
    ...(tag.label !== undefined ? { label: tag.label } : {}),
    ...(tag.translate !== undefined ? { translate: tag.translate } : {}),
  } as Frontend.OperatorIR;
}

/** A `.layer(...)` chain, wherever it sits: its tiers, each in its
 *  mark-position form. */
async function layerChainToIR(
  chain: LayerBuilder,
  tables: TableIds
): Promise<Frontend.LayerChainIR> {
  const tiers = (chain as any).tiers as Mark<any>[];
  const ir: Frontend.MarkIR[] = [];
  // In order, so table ids are minted in walk order.
  for (const tier of tiers) ir.push(await markToIR(tier, tables));
  return { type: "layer-chain", tiers: ir };
}

async function markToIR(
  mark: Mark<any> | RenderableBuilder,
  tables: TableIds
): Promise<Frontend.MarkIR> {
  // A whole chart or `.layer(...)` chain in a mark position (the root, a
  // `.mark(...)`, a combinator's child) is the builder itself, written as its
  // own `ChartIR` or `LayerChainIR` (see `Frontend.MarkIR`).
  if (mark instanceof RenderableBuilder) {
    return mark instanceof LayerBuilder
      ? layerChainToIR(mark, tables)
      : chartBuilderToChartIR(mark as ChartBuilder<any>, tables);
  }
  const tag = readTag(mark);
  if (!tag) {
    throw new Error(
      "encountered an untagged mark in toJSON; either add a serialize " +
        "config to its factory or attach its IR form with withWire at the " +
        "construction site"
    );
  }
  // Chained `.name()` / `.label()` calls land in dedicated tag slots; both
  // surface as top-level fields on the emitted leaf/combinator IR (matches
  // Python's `to_dict()` shape).
  const chained: AnyObject = {};
  if (tag.name !== undefined) chained.name = tag.name;
  if (tag.label !== undefined) chained.label = tag.label;

  if (tag.__combinator) {
    const childrenResolved = tag.children
      ? await Promise.resolve(tag.children)
      : [];
    const options = wireOpts("combinator-mark", tag.type, tag.opts);
    // In order, so table ids are minted in walk order.
    const children: Frontend.MarkIR[] = [];
    for (const c of childrenResolved) children.push(await markToIR(c, tables));
    const ir: Frontend.CombinatorMarkIR = {
      type: tag.type as Frontend.CombinatorMarkType,
      __combinator: true,
      ...(Object.keys(options).length > 0 ? { options } : {}),
      children,
      ...chained,
    };
    return ir;
  }
  // Leaf mark — spread opts plus any chained name/label at the top level.
  return {
    type: tag.type,
    ...wireOpts("leaf-mark", tag.type, tag.opts),
    ...chained,
  } as Frontend.LeafMarkIR;
}

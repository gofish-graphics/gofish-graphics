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
import { GoFishNode } from "../ast/_node";
import { RelateOperand } from "../ast/constraints/relate";
import { wireOf } from "../ast/wire";
import { flowStepMarkOf } from "../ast/marks/compose";
import { nodeSelectionOf } from "../ast/nodeSelection";
import { schemaToWire } from "../ast/schema";

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
  return wireFields(accepted, opts);
}

/** Of `opts`, the keys `accepted` declares, as the wire carries them: a
 *  function value is dropped, and a field whose declared type holds nodes (a
 *  blob's `avoiding`, inside `shape`) carries their references. */
function wireFields(
  accepted: Readonly<Record<string, { type: Frontend.FieldType }>>,
  opts: AnyObject
): AnyObject {
  const out: AnyObject = {};
  for (const [key, value] of Object.entries(opts)) {
    if (Object.hasOwn(accepted, key) && typeof value !== "function")
      out[key] = Frontend.mapHeldNodes(accepted[key].type, value, nodesToIR);
  }
  return out;
}

/**
 * A `.label()` chain as the wire carries it: each call's `accessor`, and of
 * its options the keys `Frontend.LABEL_OPTIONS` declares (`wireFields`, as
 * {@link wireOpts} keeps a construct's), with the nodes a label avoids
 * written as their references.
 */
function wireLabels(
  label: NonNullable<SerializeTag["label"]>
): Frontend.LabelSpecIR[] {
  return label.map(
    ({ accessor, ...opts }) =>
      ({
        accessor,
        ...wireFields(Frontend.LABEL_OPTIONS, opts),
      }) as Frontend.LabelSpecIR
  );
}

/**
 * Nodes named inside an option (a blob's `avoiding`), written as their IR
 * (`Frontend.NodeSelectionIR`), at any depth: a ref becomes
 * `{ type: "ref", selection }`, and a `selectAll(name)` becomes
 * `{ type: "select", layer: name, mode: "all" }`, the form chart data
 * takes. A ref to a node (not a name) has no wire form.
 */
function nodesToIR(nodes: unknown): Frontend.NodeSelectionIR {
  const selection = nodeSelectionOf(
    nodes,
    "toJSON: a value that names nodes (a blob's avoiding)"
  );
  return "all" in selection
    ? (selectRefIR(selection.all) as Frontend.NodeSelectionIR)
    : selection.items.map(nodeRefIR);
}

/** One node of such a list as a `ref` by its name. A ref by a string name
 *  and a `.relate()` operand name theirs; a node (or a ref to one) needs a
 *  string name to cross the wire. */
function nodeRefIR(item: unknown): Frontend.RefMarkIR {
  if (item instanceof RelateOperand)
    return { type: "ref", selection: item.name };
  let node: unknown = item;
  if (item instanceof GoFishRef) {
    if (typeof item.selection === "string")
      return { type: "ref", selection: item.selection };
    if (item.selection !== undefined)
      throw new Error(
        "toJSON: only a ref by a string name crosses the wire in a node list; " +
          "a token or path ref does not."
      );
    node = item.targetNode;
  }
  if (node instanceof GoFishNode) {
    if (typeof node._name === "string")
      return { type: "ref", selection: node._name };
    throw new Error(
      `toJSON: a ${node.type} node in a node list (a blob's avoiding) has no ` +
        'name, so it cannot cross the wire. Name it with .name("...") and ' +
        'list it (or ref("...")) by that name.'
    );
  }
  throw new Error(
    "toJSON: a node list (a blob's avoiding) holds nodes, refs or .relate() " +
      `operands, got ${typeof item}.`
  );
}

/** A ref by a layer name (`ref(name)`, `selectAll(name)`) as its wire form,
 *  `SelectRefIR`: `multiplicity` becomes `mode`, emitted always so JS and
 *  Python IR agree. Only a string-layer ref has one. */
function selectRefIR(r: GoFishRef): Frontend.SelectRefIR {
  if (typeof r.selection !== "string")
    throw new Error(
      "Cannot serialize a token/path/node-backed ref as a layer selection; " +
        "only a string-layer ref (ref(name) / selectAll(name)) is serializable."
    );
  return { type: "select", layer: r.selection, mode: r.multiplicity ?? "one" };
}

/**
 * A combinator's child list as the flat list rendering reads
 * (`reifyChildren`): nested arrays flattened, and a promise of children
 * (as `map(rows, ...)` returns) awaited. A tagged promise is one mark (a
 * combinator's own result), so it stays as it is for `markToIR`.
 */
async function flatChildren(children: unknown): Promise<unknown[]> {
  if (children === null || children === undefined) return [];
  if (Array.isArray(children))
    return (await Promise.all(children.map(flatChildren))).flat();
  if (children instanceof Promise && readTag(children) === undefined)
    return flatChildren(await children);
  return [children];
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
    // A flow step that is a mark (`enclose(opts)`) is that mark's own IR.
    // In order, so table ids are minted in walk order.
    ir.operators = [];
    for (const op of operators) {
      const stepMark = flowStepMarkOf(op);
      ir.operators.push(
        stepMark !== undefined
          ? ((await markToIR(stepMark, tables)) as Frontend.FlowStepMarkIR)
          : operatorToIR(op)
      );
    }
  }
  if (options && Object.keys(options).length > 0) {
    // A schema crosses the wire as its records of traits, as Python writes
    // it (`schemaToWire`).
    ir.options = (
      options.schema === undefined
        ? options
        : { ...options, schema: schemaToWire(options.schema) }
    ) as AnyObject;
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

/** The rows of a chart with no data: one shared empty table, so every such
 *  chart in a document names the same table. */
const NO_TABLE_ROWS: AnyObject[] = Object.freeze([]) as unknown as AnyObject[];

/** A chart's data on the wire. Rows of the chart's own (and no data, which
 *  reads as no rows) go into `tables`, and the chart names them by id. */
function dataToIR(data: unknown, tables: TableIds): Frontend.DataIR {
  if (data == null) return tables.add(NO_TABLE_ROWS);
  // An empty `chart()` scope: the previous tier's marks in a `.layer(...)`
  // chain, or the rows of the partition a chart in a mark position sits in.
  if (data === PREVIOUS_LAYER_MARKS) return { type: "previous-tier" };
  // A `GoFishRef` used as chart data (from `ref(name)` or `selectAll(name)`).
  // Only string-layer references serialize; `multiplicity` ("one" | "all")
  // becomes the wire `mode` (emitted unconditionally so JS and Python IR agree).
  if (data instanceof GoFishRef) return selectRefIR(data);
  if (Array.isArray(data)) return tables.add(data as AnyObject[]);
  throw new Error(
    "toJSON: a chart's data must be an array of rows, a string-layer ref " +
      "(ref(name) / selectAll(name)), or an empty chart() scope; got " +
      `${typeof data}.`
  );
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
    ...(tag.label !== undefined ? { label: wireLabels(tag.label) } : {}),
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
  // A ref child (`ref("a")` in a combinator, an enclosure's member) is a
  // `RefMarkIR` by its name, the form fromJSON reads back with `ref(...)`.
  if ((mark as unknown) instanceof GoFishRef) {
    const r = mark as unknown as GoFishRef;
    if (typeof r.selection !== "string" || r.multiplicity === "all")
      throw new Error(
        "toJSON: only a ref by a string name crosses the wire as a child."
      );
    return {
      type: "ref",
      selection: r.selection,
      ...(typeof r._name === "string" ? { name: r._name } : {}),
    };
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
  if (tag.label !== undefined) chained.label = wireLabels(tag.label);

  if (tag.__combinator) {
    const childrenResolved = await flatChildren(tag.children);
    const options = wireOpts("combinator-mark", tag.type, tag.opts);
    // In order, so table ids are minted in walk order.
    const children: Frontend.MarkIR[] = [];
    for (const c of childrenResolved)
      children.push(await markToIR(c as Mark<any>, tables));
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

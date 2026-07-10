// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * Frontend-IR emitter: turns a `ChartBuilder` (or LayerBuilder / RawMark) into
 * a {@link Frontend.FrontendIRDocument}.
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

import type { Frontend } from "gofish-ir";
import type { ChartBuilder, Mark, Operator } from "./registry";
import { GoFishRef } from "../ast/_ref";

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
  /** Set when `.label(accessor, options)` is chained on a mark (object form). */
  label?: { accessor: string; [k: string]: unknown };
}

function readTag(value: unknown): SerializeTag | undefined {
  const tag = (value as any)?.__serialize;
  if (!tag || typeof tag.type !== "string") return undefined;
  return tag as SerializeTag;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Emit a frontend-IR document for a {@link ChartBuilder}.
 *
 * Async because combinator-form marks may carry their child list as a
 * `Promise<Mark[]>` (when built via helpers like `For(...)`); the emitter
 * resolves these to walk into them.
 */
export async function toJSON(
  chart: ChartBuilder<any>
): Promise<Frontend.FrontendIRDocument> {
  const root = await chartBuilderToChartIR(chart);
  return {
    irVersion: 0,
    ir: "gofish-frontend",
    root,
  };
}

/**
 * Emit a frontend-IR document for a `Layer(opts, [chart1, chart2, ...])`
 * combinator. Pass the layer options and the inner ChartBuilders.
 */
export async function toJSONLayer(
  options: AnyObject,
  charts: ChartBuilder<any>[]
): Promise<Frontend.FrontendIRDocument> {
  const root: Frontend.LayerIR = {
    type: "layer",
    charts: await Promise.all(charts.map(chartBuilderToChartIR)),
    ...(Object.keys(options ?? {}).length > 0 ? { options } : {}),
  };
  return { irVersion: 0, ir: "gofish-frontend", root };
}

/**
 * Emit a frontend-IR document for a bare mark (no chart wrapper).
 * Used for `mark.render(container, opts)` direct callsites.
 */
export async function toJSONRawMark(
  mark: Mark<any>,
  options?: AnyObject
): Promise<Frontend.FrontendIRDocument> {
  const root: Frontend.RawMarkIR = {
    type: "raw-mark",
    mark: await markToIR(mark),
    ...(options && Object.keys(options).length > 0 ? { options } : {}),
  };
  return { irVersion: 0, ir: "gofish-frontend", root };
}

// ---------------------------------------------------------------------------
// Walkers
// ---------------------------------------------------------------------------

/** Internal-private read of ChartBuilder's fields. */
interface ChartBuilderInternals {
  data: unknown;
  options?: AnyObject;
  operators: Operator<any, any>[];
  finalMark?: Mark<any>;
  nodeZOrder?: number;
}

function chartBuilderInternals(
  chart: ChartBuilder<any>
): ChartBuilderInternals {
  const c = chart as any;
  return {
    data: c.data,
    options: c.options,
    operators: c.operators ?? [],
    finalMark: c.finalMark,
    nodeZOrder: c.nodeZOrder,
  };
}

async function chartBuilderToChartIR(
  chart: ChartBuilder<any>
): Promise<Frontend.ChartIR> {
  const { data, options, operators, finalMark, nodeZOrder } =
    chartBuilderInternals(chart);

  const ir: Frontend.ChartIR = {
    type: "chart",
    data: dataToIR(data),
    mark: finalMark
      ? await markToIR(finalMark)
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
  return ir;
}

function dataToIR(data: unknown): Frontend.DataIR | null {
  if (data == null) return null;
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
  if (Array.isArray(data)) {
    return { type: "inline", rows: data as AnyObject[] };
  }
  // Already wrapped (a previous round-trip).
  if (
    typeof data === "object" &&
    (data as any).type === "inline" &&
    Array.isArray((data as any).rows)
  ) {
    return data as Frontend.DataIR;
  }
  // Unknown shape — wrap as single-row inline so the schema is satisfied,
  // but warn so the caller can investigate. Hitting this path usually
  // indicates the chart's data argument was neither an array nor a
  // GoFishRef and isn't structurally what the runtime expects.
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(
      "[gofish-ir] toJSON.dataToIR: unrecognized data shape, wrapping as single-row inline. " +
        "Expected an array, a string-layer GoFishRef, or a pre-wrapped {type:'inline', rows} value."
    );
  }
  return { type: "inline", rows: [data as AnyObject] };
}

function operatorToIR(op: Operator<any, any>): Frontend.OperatorIR {
  const tag = readTag(op);
  if (!tag) {
    // No tag — opaque user-supplied operator. The widget wire format
    // represents these as `{ type: "derive" }`.
    return { type: "derive" } as Frontend.DeriveOperator;
  }
  return { type: tag.type, ...tag.opts } as Frontend.OperatorIR;
}

async function markToIR(mark: Mark<any>): Promise<Frontend.MarkIR> {
  const tag = readTag(mark);
  if (!tag) {
    throw new Error(
      "encountered an untagged mark in toJSON; either add a serialize " +
        "config to its factory or attach an explicit __serialize metadata " +
        "field at the construction site"
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
    const ir: Frontend.CombinatorMarkIR = {
      type: tag.type as Frontend.CombinatorMarkType,
      __combinator: true,
      ...(Object.keys(tag.opts).length > 0 ? { options: tag.opts } : {}),
      children: await Promise.all(childrenResolved.map((c) => markToIR(c))),
      ...chained,
    };
    return ir;
  }
  // Leaf mark — spread opts plus any chained name/label at the top level.
  return { type: tag.type, ...tag.opts, ...chained } as Frontend.LeafMarkIR;
}

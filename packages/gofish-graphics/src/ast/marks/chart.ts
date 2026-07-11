// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

import { sumBy, v, type Curve } from "../../lib";
import {
  connect as Connect,
  type AnchorSpec,
} from "../graphicalOperators/connect";
import chunk from "lodash/chunk";
import { GoFishNode } from "../_node";
import type { MaybeValue, Value } from "../data";
import type { FieldExpr } from "../fieldExpr";
import { GoFishRef } from "../_ref";
import type { GoFishAST } from "../_ast";
import type { Token } from "../createName";
import { type ColorConfig } from "../colorSchemes";

export type { ColorConfig };
import { inferSize, inferColor } from "../channels";
import { isLive, evalLiveStatic, type LiveValue } from "../../interaction/live";
import { rect as generatedRect } from "../shapes/rect";
import { Ellipse } from "../shapes/ellipse";
import { Mark, Operator } from "../types";
import type { NameableMark } from "../withGoFish";
import type { LabelAccessor, LabelOptions } from "../labels/labelPlacement";
import {
  resolveMarkResult,
  nameableMark,
  attachModifiers,
  createModifier,
  nameModifier,
  labelModifier,
  zOrderModifier,
  LayerContext,
} from "./createOperator";
import type { ZOrderValue } from "./createOperator";
import { layer as Layer } from "../graphicalOperators/layer";
import {
  // `over` stays internal (not re-exported from lib) — it backs the
  // deserializer's `"over"` wire type only; user code should use `layer`.
  over as Over,
  intersect as Intersect,
  exclude as Exclude,
  subtract as Subtract,
  paint as Paint,
  mask as Mask,
} from "../graphicalOperators/porterDuff";
import type { ConstraintRef, ConstraintSpec } from "../constraints";
import { splitEntries, type SplitBy } from "../datumProjection";

export type { Mark, Operator };
export { generatedRect as rect };
export type { LayerContext };

import {
  ChartBuilder,
  LayerBuilder,
  chart,
  resolveRefData,
  PREVIOUS_LAYER_MARKS,
} from "./chartBuilder";
import type { ChartOptions } from "./chartBuilder";
import { projectPath } from "../datumProjection";
export { ChartBuilder, LayerBuilder, chart, PREVIOUS_LAYER_MARKS };
export type { ChartOptions };

/* Data Transformation Operators */
export function derive<T, U>(fn: (d: T) => U | Promise<U>): Operator<T, U> {
  const op: Operator<T, U> = async (mark: Mark<U>) => {
    return (async (
      d: T,
      key?: string | number,
      layerContext?: LayerContext
    ) => {
      return mark(await fn(d), key, layerContext);
    }) as Mark<T>;
  };
  // The function body is not serializable; the frontend-IR emitter sees
  // an opaque `{ type: "derive" }`. The Python-bridge widget emits its own
  // `{ type: "derive", lambdaId }` shape; pure-JS callers leave the
  // payload empty.
  (op as any).__serialize = { type: "derive", opts: {} };
  return op;
}

// return an array of copies of `d` repeated `d.field` times
export const repeat = <T, K extends keyof T>(
  d: T,
  field: K & (T[K] extends number ? K : never)
) => {
  return Array.from({ length: d[field] as unknown as number }, () => d);
};

export { chunk };

export const normalize = <T, K extends keyof T>(
  data: T[],
  field: K & (T[K] extends number ? K : never)
): T[] => {
  const total = sumBy(data, field as string);
  return data.map((d) => ({
    ...d,
    [field]: (d[field] as unknown as number) / total,
  }));
};

export function log<T>(prefix?: string): Operator<T, T> {
  const op: Operator<T, T> = async (mark: Mark<T>) => {
    return (async (
      d: T,
      key?: string | number,
      layerContext?: LayerContext
    ) => {
      if (prefix) {
        console.log(prefix, d);
      } else {
        console.log(d);
      }
      return mark(d, key, layerContext);
    }) as Mark<T>;
  };
  (op as any).__serialize = {
    type: "log",
    opts: prefix !== undefined ? { prefix } : {},
  };
  return op;
}

/**
 * Resolve reference columns into the drawn nodes they name. For each row,
 * each listed column's value is matched against the keyed nodes of `from`
 * (a `selectAll(...)` of a prior layer) and replaced *in place* with the
 * matching ref — a many-to-one dereference (no fan-out, grain preserved).
 * The match key defaults to the field the `from` nodes were grouped by
 * (`scatter({ by: "id" })` ⇒ match on `id`); pass `key` to override, e.g.
 * when the producer used a function `by` (no field name to infer).
 *
 * Drives node-link / labeling: `.layer(edges).flow(resolve(["source",
 * "target"], { from: selectAll("nodes") })).mark(line({ from, to }))`.
 */
export function resolve(
  cols: string[],
  opts: { from: GoFishRef; key?: string }
): Operator<any[], any[]> {
  const op: Operator<any[], any[]> = async (mark: Mark<any[]>) => {
    return (async (
      rows: any[],
      key?: string | number,
      layerContext?: LayerContext
    ) => {
      const resolved = resolveRefData(opts.from, layerContext ?? {});
      const refs = Array.isArray(resolved) ? resolved : [resolved];
      const matchField = (r: GoFishRef): string => {
        const field = opts.key ?? (r.targetNode as any)?.__splitBy;
        if (typeof field !== "string") {
          throw new Error(
            `resolve: cannot infer the match key for from=${JSON.stringify(
              opts.from.selection
            )} — its nodes were not grouped by a named field (a function \`by\`?). ` +
              `Pass an explicit { key: "<field>" }.`
          );
        }
        return field;
      };
      const byKey = new Map<unknown, GoFishRef>();
      for (const r of refs) byKey.set(projectPath(r.datum, matchField(r)), r);

      const out = rows.map((row) => {
        const next: Record<string, any> = { ...row };
        for (const c of cols) {
          const matched = byKey.get(row[c]);
          if (matched === undefined) {
            throw new Error(
              `resolve: no node in ${JSON.stringify(
                opts.from.selection
              )} matches ${JSON.stringify(row[c])} for column "${c}".`
            );
          }
          next[c] = matched;
        }
        return next;
      });
      return mark(out, key, layerContext);
    }) as Mark<any[]>;
  };
  (op as any).__serialize = {
    type: "resolve",
    opts: {
      cols,
      // `from` is a selectAll(layerName); serialize the layer name it selects.
      ...(typeof opts.from.selection === "string"
        ? { from: opts.from.selection }
        : {}),
      ...(opts.key !== undefined ? { key: opts.key } : {}),
    },
  };
  return op;
}

/**
 * Equi-join the incoming rows against another data table on a shared key — a
 * one-to-many left join (SQL `JOIN ... USING (on)`, pandas/polars
 * `.merge(right, on=...)`, dplyr `left_join(right, by = on)`). For each
 * incoming row, every `right` row whose `on` value matches contributes one
 * output row of the merged columns `{ ...left, ...right }`; incoming rows with
 * no match drop out (inner-join semantics on the match, fan-out on the right).
 *
 * Unlike `resolve` (which dereferences columns into *drawn nodes* of a prior
 * layer), `join` relates two plain data tables, so the `right` table is
 * inlined into the IR and round-trips as JSON.
 *
 * Pairs with a nested chart that inherits its parent's partition: e.g. scatter
 * lakes by location, then in each glyph
 * `chart(data).flow(join(seafood, { on: "lake" }), stack(...))` pulls in that
 * lake's catch rows.
 */
export function join<
  L extends Record<string, any>,
  R extends Record<string, any>,
>(right: R[], opts: { on: string }): Operator<L[], (L & R)[]> {
  const op: Operator<L[], (L & R)[]> = async (mark: Mark<(L & R)[]>) => {
    return (async (
      left: L[],
      key?: string | number,
      layerContext?: LayerContext
    ) => {
      const leftRows = Array.isArray(left) ? left : left == null ? [] : [left];
      const rightByKey = new Map<unknown, R[]>();
      for (const r of right) {
        const k = r[opts.on];
        const bucket = rightByKey.get(k);
        if (bucket) bucket.push(r);
        else rightByKey.set(k, [r]);
      }
      const joined: (L & R)[] = [];
      for (const l of leftRows) {
        for (const r of rightByKey.get(l[opts.on]) ?? []) {
          joined.push({ ...l, ...r });
        }
      }
      return mark(joined, key, layerContext);
    }) as Mark<L[]>;
  };
  (op as any).__serialize = {
    type: "join",
    opts: { on: opts.on, right },
  };
  return op;
}

/* END Data Transformation Operators */

export function circle<T extends Record<string, any>>({
  r,
  fill,
  stroke,
  strokeWidth,
  debug,
  label,
}: {
  r?: number;
  fill?: string | keyof T | LiveValue;
  stroke?: string;
  strokeWidth?: number;
  debug?: boolean;
  label?: boolean;
}): Mark<T> & {
  name(layerName: string | Token): Mark<T>;
  label(accessor: LabelAccessor, options?: LabelOptions): Mark<T>;
} {
  const base: Mark<T> = async (
    d: T,
    key?: string | number,
    _layerContext?: LayerContext
  ) => {
    if (debug) console.log("circle", key, d);
    // scatter passes an array of items; unwrap to first element for field lookup
    const datum: Record<string, any> = Array.isArray(d) ? (d as any[])[0] : d;
    // `live(...)` fill: the pipeline renders the resolve-time value (evaluated
    // untracked so its input reads wire events but aren't pipeline deps); paint
    // re-evaluates it reactively via the datum-bound thunk baked at lower time.
    let liveFill: LiveValue | undefined;
    let staticFill: string | keyof T | undefined = fill as
      | string
      | keyof T
      | undefined;
    if (isLive(fill)) {
      liveFill = fill;
      staticFill = evalLiveStatic(fill, d) as string | undefined;
    }
    const resolvedFill =
      typeof staticFill === "string" && datum && staticFill in datum
        ? v(datum[staticFill as string])
        : (staticFill as Value<string> | undefined);
    const resolvedStroke =
      typeof stroke === "string" && datum && stroke in datum
        ? v(datum[stroke as string])
        : (stroke as Value<string> | undefined);
    const node = Ellipse({
      w: typeof r === "number" ? r * 2 : inferSize(r, d),
      h: typeof r === "number" ? r * 2 : inferSize(r, d),
      aspectRatio: 1,
      fill: resolvedFill,
      stroke: resolvedStroke,
      strokeWidth,
      label,
    }).name(key?.toString() ?? "");
    node.datum = d;
    if (liveFill) node.__gfLive = { fill: liveFill };
    return node;
  };
  const result = nameableMark(base);
  (result as any).__serialize = {
    type: "circle",
    opts: { r, fill, stroke, strokeWidth, label },
  };
  return result;
}

// `ref(name)` is the universal singular reference — usable inline in a layout
// (resolved at layout time) and as chart data (resolved at build time against
// the per-chart layer registry, erroring unless exactly one named node
// matches). `selectAll(name)` is the plural form: one ref per matching named
// node, chart-data only. Both defer layer lookup until resolution, so layers
// can be registered by `.name()` on marks before the selector accesses them.
export function selectAll(
  layerName: string
): GoFishRef & { readonly multiplicity: "all" } {
  return new GoFishRef({
    selection: layerName,
    multiplicity: "all",
  }) as GoFishRef & {
    readonly multiplicity: "all";
  };
}

// A `RelationalMark` is a mark whose geometry is *derived* from other marks
// via refs — i.e. a connector. Like `createMark` (leaf shapes) and
// `createOperator` (relations over data), this factory yields a value that
// works in BOTH levels:
//   - low-level combinator: `line(opts, [ref(a), ref(b)])` → AST node
//       (explicit-children form, e.g. for a manual `layer([...])`)
//   - chart-builder Mark:    `line(opts)` → a `Mark` consumed by `.layer()` /
//       `.mark()`, in three shapes —
//       · bag form      — applied to a `GoFishRef[]` (e.g. `selectAll(...)`),
//                         one connector through all the refs
//       · `by`-split bag form — partitions the bag with the same
//                         `splitEntries` used by `group()`'s `split` hook,
//                         producing one connector PER GROUP (e.g.
//                         `ribbon({ by: "species" })` over all bar refs).
//                         Composes with an upstream `group()` as a nested
//                         split — no special-casing.
//       · pairwise form — `{ from, to }` over rows with two ref columns, one
//                         connector per row (node-link edges)
// `produce(opts, children)` is the only connector-specific part (it builds the
// underlying `connect` node); the rest is shared dual-form plumbing.
//
// Every produced connector node is tagged with the operand nodes/refs it was
// built from (`__relationalOperands`). The `layer` combinator (see
// `graphicalOperators/layer.tsx`) reads this tag to install a default
// `zBelow(self, operand)` paint-order constraint — the connector paints
// under whatever it references — in every call form, including the
// low-level one used standalone inside a manual `layer([...])`. An explicit
// `.zOrder(...)` or `.constrain(...)` on the connector's node overrides the
// default (the tag is only consulted when neither has been set).
type RelationalMarkOptions = { from?: string; to?: string; by?: SplitBy };

/** Tag a produced connector node with the operand nodes/refs it references,
 *  so `layer`'s default-zBelow pass can find them. See the factory doc above. */
function tagRelationalOperands<T extends GoFishAST>(
  node: T,
  operands: GoFishAST[]
): T {
  if (operands.length > 0) {
    (node as any).__relationalOperands = operands;
  }
  return node;
}

// Anchor-tier keys the blank-fusion rewrite rule (see the doc-comment above
// and `ChartBuilder.mark`) carves off a relational mark's opts: purely
// spatial, nothing paint- or path-related. Everything else (fill, stroke,
// strokeWidth, strokeDasharray, opacity, curve, dir, mixBlendMode, by,
// source, target) stays with the connector.
const ANCHOR_KEYS = ["w", "h", "emX", "emY"] as const;

function pickAnchorOpts(opts: Record<string, any>): Record<string, any> {
  const anchor: Record<string, any> = {};
  for (const k of ANCHOR_KEYS) {
    if (k in opts) anchor[k] = opts[k];
  }
  return anchor;
}

/**
 * Tag a bag-form / by-split-form relational mark with the blank-fusion
 * descriptor `ChartBuilder.mark()` reads when the mark is placed directly in
 * `.mark()` position (instead of after an explicit anchor tier via
 * `.layer(...)`):
 *
 *   .mark(R(opts))  ⇒  .mark(blank(anchor(opts))).layer(R(opts))
 *
 * `anchor(opts)` is exactly the `{w, h, emX, emY}` subset (`pickAnchorOpts`);
 * the connector tier is simply the mark AS GIVEN — `produce` (the factory's
 * second argument) only reads the fields it knows about, so the leftover
 * spatial keys are inert on the connector side and no opts-splitting is
 * needed there. `makeAnchor` is a pre-bound `blank(...)` call rather than a
 * bare opts object: `blank` lives in this module, and `ChartBuilder.mark()`
 * lives in chartBuilder.ts, which this module already imports FROM —
 * importing `blank` the other way would cycle.
 *
 * The pairwise `{from, to}` form is never tagged: it already consumes rows
 * with ref columns directly in `.mark()` position and keeps its existing
 * (unfused) behavior.
 *
 * Also carries `type` and `anchorKeys` (the subset of `ANCHOR_KEYS` actually
 * present in `opts`, keyed off `!== undefined` rather than `in` so an
 * explicitly-passed `undefined` doesn't count) — `ChartBuilder.mark()` reads
 * these to throw when the mark lands on the UNFUSED path (an empty-scope tier
 * or refs data) while still carrying anchor keys that would otherwise be
 * silently inert. Threading them here (rather than importing `ANCHOR_KEYS` /
 * `pickAnchorOpts` into chartBuilder.ts) avoids an import cycle: this module
 * already imports `ChartBuilder` FROM chartBuilder.ts.
 */
function tagRelationalFusable(
  mark: object,
  type: string,
  opts: Record<string, any>
): void {
  const anchorOpts = pickAnchorOpts(opts);
  (mark as any).__relationalFusable = {
    type,
    opts,
    anchorKeys: Object.keys(anchorOpts).filter(
      (k) => anchorOpts[k] !== undefined
    ),
    makeAnchor: () => blank(pickAnchorOpts(opts)),
  };
}

/**
 * A `by`-split connector's `fill` may be a shared field name (e.g.
 * `ribbon({ fill: "species", by: "species" })`) rather than a literal color —
 * each group is homogeneous in that field by construction whenever it names
 * the split field itself (or another field the split happens to agree on),
 * so resolve it once per group into a concrete `Value`, the same way a
 * per-item mark's color channel would (`inferColor`), instead of leaking the
 * bare field name through to `Connect` as a literal (invalid) CSS color.
 * A no-op for literal colors, `Value`s, and undefined — `inferColor` itself
 * tells a field name from a literal (falls through unchanged when the string
 * isn't a key of the sampled row).
 */
function resolveGroupFill<O extends RelationalMarkOptions>(
  opts: O,
  groupRefs: GoFishRef[]
): O {
  const fill = (opts as any).fill;
  if (typeof fill !== "string") return opts;
  const rows = groupRefs.flatMap((r) =>
    Array.isArray(r.datum) ? r.datum : [r.datum]
  );
  const resolved = inferColor(fill, rows);
  return resolved === undefined ? opts : ({ ...opts, fill: resolved } as O);
}

export function createRelationalMark<O extends RelationalMarkOptions>(
  type: string,
  produce: (opts: O, children: GoFishAST[]) => any
) {
  function relational(
    options: O | undefined,
    children: GoFishAST[]
  ): GoFishNode;
  function relational(options?: O): Mark<any>;
  function relational(
    options?: O,
    children?: GoFishAST[]
  ): GoFishNode | Mark<any> {
    const opts = (options ?? {}) as O;

    // Low-level combinator form: connect the given children directly.
    if (children !== undefined) {
      return tagRelationalOperands(
        produce(opts, children) as GoFishNode,
        children
      );
    }

    // Pairwise `{ from, to }` form: one connector per row.
    if (opts.from !== undefined && opts.to !== undefined) {
      const from = opts.from;
      const to = opts.to;
      const mark: Mark<any[]> = async (rows: any[]) => {
        const segments = await Promise.all(
          rows.map(async (row) => {
            const a = row[from];
            const b = row[to];
            if (!(a instanceof GoFishRef) || !(b instanceof GoFishRef)) {
              throw new Error(
                `${type}({ from: "${from}", to: "${to}" }): columns "${from}"/"${to}" ` +
                  `must hold node refs — run resolve(["${from}", "${to}"], ` +
                  `{ from: selectAll(...) }) in the flow first.`
              );
            }
            const node = tagRelationalOperands(
              (await produce(opts, [a, b])) as GoFishNode,
              [a, b]
            );
            (node as any).datum = row;
            return node;
          })
        );
        return Layer({}, segments);
      };
      const result = nameableMark(mark);
      (result as any).__serialize = { type, opts };
      return result;
    }

    // `by`-split bag form: one connector per group.
    if (opts.by !== undefined) {
      const by = opts.by;
      const mark: Mark<GoFishRef[]> = async (d: GoFishRef[]) => {
        const entries = splitEntries(by, d as any);
        const nodes = await Promise.all(
          [...entries.values()].map(async (group) => {
            const groupRefs = (
              Array.isArray(group) ? group : [group]
            ) as GoFishRef[];
            const groupOpts = resolveGroupFill(opts, groupRefs);
            return tagRelationalOperands(
              (await produce(groupOpts, groupRefs)) as GoFishNode,
              groupRefs
            );
          })
        );
        return Layer({}, nodes);
      };
      const result = nameableMark(mark);
      (result as any).__serialize = { type, opts };
      tagRelationalFusable(result, type, opts);
      return result;
    }

    // Bag form: applied to a `GoFishRef[]` (e.g. `selectAll(...)`).
    const mark: Mark<GoFishRef[]> = async (d: GoFishRef[]) =>
      tagRelationalOperands((await produce(opts, d)) as GoFishNode, d);
    const result = nameableMark(mark);
    (result as any).__serialize = { type, opts };
    tagRelationalFusable(result, type, opts);
    return result;
  }
  return relational;
}

export type LineOptions = {
  fill?: MaybeValue<string>;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  mixBlendMode?: "normal" | "multiply";
  // Screen-space path shape, as a factory call (`straight()`, `bezier()`,
  // `catmullRom()`, `orthogonal()`, `arc({ direction })`, `perfectArrows({ bow })`,
  // …) or a bare name (`"straight"` | `"bezier"`). The single path-shaping key.
  curve?: Curve;
  dir?: "x" | "y";
  // Anchor mode: pin each endpoint to a normalized point on its mark's bbox
  // (Bluefish-style `Line`) instead of the center — for ropes, node-link edges,
  // etc. When given, the anchor points win over the routed center path.
  source?: AnchorSpec;
  target?: AnchorSpec;
  from?: string;
  to?: string;
  // Split the operand bag into groups (same `SplitBy` grammar as v3
  // operators' `by`) and draw one connector per group — e.g.
  // `line({ by: "series" })` over a bag of point refs draws one polyline per
  // series. Composes with an upstream `group()` as a nested split.
  by?: SplitBy;
  // Anchor-tier keys for the blank-fusion sugar: placing `line(opts)` directly
  // in `.mark()` position elaborates to `.mark(blank({w,h,emX,emY})).layer(line(opts))`
  // (see `createRelationalMark`'s `tagRelationalFusable`). Purely spatial —
  // `line`'s own `produce` ignores them; they only size/position the
  // invisible anchor blank() the sugar synthesizes. Accepts the same
  // channel-value shapes as a leaf mark's "size" channel (e.g. rect's `h`) —
  // a field name, a `Value<number>`, or a `field(...)` pipeline like
  // `field("count").sum()` — since they're forwarded verbatim to the
  // synthesized `blank()`, which evaluates them the same way.
  w?: number | string | Value<number> | FieldExpr;
  h?: number | string | Value<number> | FieldExpr;
  emX?: boolean;
  emY?: boolean;
};

// `line` — a center-mode connector (the "line" component): the path between the
// centers of consecutive marks. `route` picks the shape (straight | bezier |
// orthogonal | arc | perfectArrows | …).
export const line = createRelationalMark<LineOptions>("line", (o, children) =>
  Connect(
    {
      direction: o.dir ?? "x",
      mode: "center",
      fill: o.fill,
      stroke: o.stroke,
      strokeWidth: o.strokeWidth ?? 1,
      strokeDasharray: o.strokeDasharray,
      opacity: o.opacity,
      mixBlendMode: o.mixBlendMode,
      // Omitted ⇒ "auto": connect smooths (catmullRom) when the connected
      // points share a continuous connection axis, else a straight line.
      curve: o.curve,
      source: o.source,
      target: o.target,
    },
    children
  )
);

export type RibbonOptions = {
  fill?: MaybeValue<string>;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  mixBlendMode?: "normal" | "multiply";
  dir?: "x" | "y";
  // Screen-space path shape for the band edges (`straight()` | `bezier()`).
  // Edge mode honors straight (linear band) vs bezier (S-curve band).
  curve?: Curve;
  from?: string;
  to?: string;
  // Split the operand bag into groups (same `SplitBy` grammar as v3
  // operators' `by`) and draw one ribbon per group — e.g.
  // `ribbon({ by: "species" })` over a bag of bar refs draws one band per
  // species. Composes with an upstream `group()` as a nested split.
  by?: SplitBy;
  // Anchor-tier keys for the blank-fusion sugar: placing `ribbon(opts)` directly
  // in `.mark()` position elaborates to `.mark(blank({w,h,emX,emY})).layer(ribbon(opts))`
  // (see `createRelationalMark`'s `tagRelationalFusable`). Purely spatial —
  // `ribbon`'s own `produce` ignores them; they only size/position the
  // invisible anchor blank() the sugar synthesizes. Accepts the same
  // channel-value shapes as a leaf mark's "size" channel (e.g. rect's `h`) —
  // a field name, a `Value<number>`, or a `field(...)` pipeline like
  // `field("count").sum()` — since they're forwarded verbatim to the
  // synthesized `blank()`, which evaluates them the same way.
  w?: number | string | Value<number> | FieldExpr;
  h?: number | string | Value<number> | FieldExpr;
  emX?: boolean;
  emY?: boolean;
};

// `ribbon` — an edge-mode connector: a filled band between the facing edges of
// consecutive marks (areas, streamgraphs, sankey ribbons).
export const ribbon = createRelationalMark<RibbonOptions>(
  "ribbon",
  (o, children) =>
    Connect(
      {
        direction: o.dir ?? "x",
        mode: "edge",
        mixBlendMode: o.mixBlendMode ?? "normal",
        fill: o.fill,
        stroke: o.stroke,
        strokeWidth: o.strokeWidth ?? 0,
        opacity: o.opacity,
        // Omitted ⇒ "auto": edge mode currently resolves to a bezier band
        // (continuous-ribbon Catmull-Rom is a follow-on).
        curve: o.curve,
      },
      children
    )
);

// blank() mark creates invisible guides for positioning
export function blank<T extends Record<string, any>>({
  emX,
  emY,
  w = 0,
  h = 0,
  rx,
  ry,
  fill,
  debug,
  stroke,
  strokeWidth,
}: {
  emX?: boolean;
  emY?: boolean;
  // Same channel-value shapes rect's "size" channel accepts (see
  // `DeriveMarkProps` in channels.ts) — blank() delegates straight to
  // `rect` below, so a field name, `Value<number>`, or `field(...)`
  // pipeline (e.g. `field("count").sum()`) evaluates identically.
  w?: number | (keyof T & string) | Value<number> | FieldExpr;
  h?: number | (keyof T & string) | Value<number> | FieldExpr;
  rx?: number;
  ry?: number;
  fill?: string | (keyof T & string);
  stroke?: string;
  strokeWidth?: number;
  debug?: boolean;
} = {}): Mark<T | T[] | { item: T | T[]; key: number | string }> {
  // blank is essentially a transparent/zero-size rect
  const mark = generatedRect<T>({
    emX,
    emY,
    w,
    h,
    rx,
    ry,
    fill,
    debug,
    stroke,
    strokeWidth,
  });
  // Override the rect-emitted tag — blank should appear as { type: "blank" }
  // on the wire even though it delegates to rect internally.
  (mark as any).__serialize = {
    type: "blank",
    opts: { emX, emY, w, h, rx, ry, fill, debug, stroke, strokeWidth },
  };
  return mark;
}

/* ---- mark-combinator forms for layer and Porter-Duff operators ---- */

type BlendMode = "color" | "multiply" | "screen" | "overlay";
type PdOptions = { blendMode?: BlendMode };

/**
 * A mark with chainable .name, .label, .constrain, and a top-level .render()
 * for combinator-form callsites whose children carry their own data
 * (e.g. `layer([Chart(...).flow(...).mark(...), ...]).render(container, opts)`).
 *
 * Mark children that read field accessors will be called with `undefined` data
 * if you call `.render()` directly — for those, wrap in a Chart instead:
 *   `chart(data).mark(layer([rect({h: "v"}), ...])).render(container, opts)`.
 */
export type ConstrainableMark<T> = Mark<T> & {
  name(layerName: string | Token): ConstrainableMark<T>;
  label(accessor: LabelAccessor, options?: LabelOptions): ConstrainableMark<T>;
  zOrder(value: ZOrderValue<T>): ConstrainableMark<T>;
  constrain(
    fn: (refs: Record<string, ConstraintRef>) => ConstraintSpec[]
  ): ConstrainableMark<T>;
  render(
    container: Parameters<GoFishNode["render"]>[0],
    options: Parameters<GoFishNode["render"]>[1]
  ): Promise<ReturnType<GoFishNode["render"]>>;
  toSVG(options?: Parameters<GoFishNode["toSVG"]>[0]): Promise<string>;
  toSVGElement(
    options?: Parameters<GoFishNode["toSVGElement"]>[0]
  ): Promise<SVGSVGElement>;
  save(
    filename: string,
    options?: Parameters<GoFishNode["save"]>[1]
  ): Promise<void>;
};

/**
 * `.constrain(fn)` — attaches a constraint callback to each produced node.
 * Unlike `.name()`/`.label()`, it intentionally carries no `tag`: a
 * constrained mark drops its IR-serialize tag (constrained marks aren't
 * serialized), matching the pre-factory behavior.
 */
const constrainModifier = createModifier<
  [fn: (refs: Record<string, ConstraintRef>) => ConstraintSpec[]]
>({
  name: "constrain",
  apply: (node, _layerContext, _datum, fn) => {
    node.constrain(fn);
  },
});

function makeConstrainableMark<T>(base: Mark<T>): ConstrainableMark<T> {
  return attachModifiers(base, [
    nameModifier,
    labelModifier,
    constrainModifier,
    zOrderModifier,
  ]) as unknown as ConstrainableMark<T>;
}

/**
 * Mark-combinator form of layer. Resolves each child against the per-datum
 * data and wraps the resulting nodes in a Layer. Children may be:
 *   - Mark functions (called with the parent's data),
 *   - ChartBuilders (resolved via their own bound data),
 *   - already-resolved GoFishNodes (e.g. ref(...)).
 * Supports `.name()`, `.label()`, `.constrain()`, and a top-level `.render()`.
 */
export function layer<T>(
  marks: (Mark<any> | GoFishRef)[]
): ConstrainableMark<T>;
export function layer<T>(
  opts: Record<string, any>,
  marks: (Mark<any> | GoFishRef)[]
): ConstrainableMark<T>;
export function layer<T>(
  marksOrOpts: (Mark<any> | GoFishRef)[] | Record<string, any>,
  maybeMarks?: (Mark<any> | GoFishRef)[]
): ConstrainableMark<T> {
  const opts = Array.isArray(marksOrOpts) ? {} : marksOrOpts;
  const marks = (Array.isArray(marksOrOpts) ? marksOrOpts : maybeMarks) ?? [];
  const base: Mark<T> = async (d, key, _layerContext) => {
    // A layer establishes its OWN local name context: `.name(...)` registrations
    // and the `ref(name)`/`selectAll(name)` that read them are scoped to *this*
    // layer's children. We deliberately do NOT inherit the enclosing
    // `_layerContext` — otherwise a layer nested inside an operator (e.g. one
    // `layer([bars, area])` per `spread` cell) would share a single context
    // across every cell, so each cell's `selectAll("bars")` would match every
    // other cell's bars too (and reference siblings not yet laid out). Names are
    // local to their layer, mirroring `LayerBuilder.resolve`. Resolve
    // sequentially so a child referencing a name sees earlier siblings'
    // registrations.
    const sharedContext: LayerContext = {};
    const resolved: GoFishNode[] = [];
    for (const m of marks) {
      // A nested empty-scope `chart()` child inherits this layer's incoming
      // partition datum (issue #243), exactly as `.mark(chart())` does — so
      // `layer([chart().flow(...).mark(...), chart(selectAll(...)).mark(...)])`
      // can be a mark without a `(d) => …` callback. A child with its own data
      // (e.g. `chart(selectAll(...))`) is left untouched.
      const child =
        m instanceof ChartBuilder && m.usesPreviousLayerMarks()
          ? m.withData(d)
          : m;
      const result =
        typeof child === "function" ? child(d, key, sharedContext) : child;
      resolved.push(await resolveMarkResult(result, sharedContext));
    }
    const node = await Layer(opts, resolved);
    (node as any).datum = d;
    return node;
  };
  const result = makeConstrainableMark(base);
  (result as any).__serialize = {
    type: "layer",
    opts,
    __combinator: true,
    children: marks,
  };
  return result;
}

function makePorterDuffCombinator(
  lowLevel: (opts: any, children: any) => any,
  irType: string
) {
  function fn<T>(marks: [Mark<any>, Mark<any>]): NameableMark<T>;
  function fn<T>(
    opts: PdOptions,
    marks: [Mark<any>, Mark<any>]
  ): NameableMark<T>;
  function fn<T>(
    optsOrMarks: PdOptions | [Mark<any>, Mark<any>],
    maybeMarks?: [Mark<any>, Mark<any>]
  ): NameableMark<T> {
    const opts = Array.isArray(optsOrMarks) ? {} : optsOrMarks;
    const marks = (Array.isArray(optsOrMarks) ? optsOrMarks : maybeMarks) as [
      Mark<any>,
      Mark<any>,
    ];
    const base: Mark<T> = async (d, key, layerContext) => {
      const [child0, child1] = await Promise.all(
        marks.map((m) =>
          resolveMarkResult(
            typeof m === "function" ? m(d, key, layerContext) : m,
            layerContext
          )
        )
      );
      const node = await lowLevel(opts, [child0, child1]);
      (node as any).datum = d;
      return node;
    };
    const result = nameableMark(base);
    (result as any).__serialize = {
      type: irType,
      opts,
      __combinator: true,
      children: marks,
    };
    return result;
  }
  return fn;
}

// The second arg is the IR/serialize *wire* type — kept at the original
// Porter-Duff strings ("atop"/"over"/"inside"/"xor"/"out"/"mask") so the
// serialize bridge and IR schema are untouched. Only the JS-facing names
// were renamed (Figma-inspired, #196/#202).
export const paint = makePorterDuffCombinator(Paint, "atop");
// `over` combinator is internal (deserializer only) — not exported from lib.
export const over = makePorterDuffCombinator(Over, "over");
export const intersect = makePorterDuffCombinator(Intersect, "inside");
export const exclude = makePorterDuffCombinator(Exclude, "xor");
export const subtract = makePorterDuffCombinator(Subtract, "out");
export const mask = makePorterDuffCombinator(Mask, "mask");

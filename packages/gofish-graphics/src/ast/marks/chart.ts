// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

import { sumBy, type Curve } from "../../lib";
import {
  connect as Connect,
  type AnchorSpec,
} from "../graphicalOperators/connect";
import chunk from "lodash/chunk";
import { GoFishNode } from "../_node";
import { getValue, type MaybeValue, type Value } from "../data";
import type { FieldExpr } from "../fieldExpr";
import { GoFishRef } from "../_ref";
import type { GoFishAST } from "../_ast";
import type { Token } from "../createName";
import { type ColorConfig } from "../colorSchemes";

export type { ColorConfig };
import { inferColor } from "../channels";
import {
  liveChannelsOf,
  withLiveStatics,
  type LiveValue,
  type StripLive,
} from "../../interaction/live";
import { rect as generatedRect, baseBlank } from "../shapes/rect";
import { Ellipse } from "../shapes/ellipse";
import { Mark, MarkChild, Operator } from "../types";
import { addRenderMethod, createMark, type NameableMark } from "../withGoFish";
import type { LabelAccessor, LabelOptions } from "../labels/labelPlacement";
import {
  resolveMarkResult,
  nameableMark,
  attachModifiers,
  tagCombinator,
  nameModifier,
  labelModifier,
  zOrderModifier,
  LayerContext,
} from "./createOperator";
import type { ModifierConfig, ZOrderValue } from "./createOperator";
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
import type { RelateFn } from "../constraints";
import {
  splitEntries,
  type SplitBy,
  type InferredRelational,
} from "../datumProjection";

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
import type { ChartOptions, RelationalFusable } from "./chartBuilder";
import { projectPath } from "../datumProjection";
export { ChartBuilder, LayerBuilder, chart, PREVIOUS_LAYER_MARKS };
export type { ChartOptions };

/* Data Transformation Operators */

/**
 * The shape every data-transformation operator shares: map the incoming data
 * with `fn`, hand the result to the mark, and carry an IR-serialization tag.
 * `fn` receives the layer context so it can resolve refs (see `resolve`).
 */
function mapOperator<T, U>(
  fn: (d: T, layerContext?: LayerContext) => U | Promise<U>,
  serialize: { type: string; opts: Record<string, unknown> }
): Operator<T, U> {
  const op: Operator<T, U> = async (mark: Mark<U>) =>
    (async (d: T, key?: string | number, layerContext?: LayerContext) =>
      mark(await fn(d, layerContext), key, layerContext)) as Mark<T>;
  (op as any).__serialize = serialize;
  return op;
}

export function derive<T, U>(fn: (d: T) => U | Promise<U>): Operator<T, U> {
  // The function body is not serializable; the frontend-IR emitter sees
  // an opaque `{ type: "derive" }`. The Python-bridge widget emits its own
  // `{ type: "derive", lambdaId }` shape; pure-JS callers leave the
  // payload empty.
  return mapOperator(fn, { type: "derive", opts: {} });
}

/**
 * `filter(pred)` — keep the rows a predicate accepts. The flow operator beside
 * `derive`: same place in the pipeline, but it says what it does, so the common
 * case (`derive((rows) => rows.filter(...))`) stops being spelled as an
 * arbitrary transform.
 *
 * `pred` is a plain row predicate `(row) => boolean`, or a field predicate
 * built by `field("day").between(lo, hi)` — which is just such a function, so
 * there is one thing to implement.
 *
 * Non-array data passes through untouched: a `filter` in a scope whose datum is
 * a single row (or a ref) has nothing to filter, and throwing there would make
 * the operator unusable in a nested pipeline.
 *
 * Serialization: the predicate is a live JS callback, so this operator IS a
 * `derive` — it is defined as one below, and so carries `derive`'s
 * `{ type: "derive" }` tag on the wire.
 */
export function filter<T>(pred: (row: T) => boolean): Operator<T[], T[]> {
  return derive<T[], T[]>((d) => (Array.isArray(d) ? d.filter(pred) : d));
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
  return mapOperator<T, T>(
    (d) => {
      if (prefix) {
        console.log(prefix, d);
      } else {
        console.log(d);
      }
      return d;
    },
    { type: "log", opts: prefix !== undefined ? { prefix } : {} }
  );
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
  return mapOperator<any[], any[]>(
    (rows, layerContext) => {
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

      return rows.map((row) => {
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
    },
    {
      type: "resolve",
      opts: {
        cols,
        // `from` is a selectAll(layerName); serialize the layer name it selects.
        ...(typeof opts.from.selection === "string"
          ? { from: opts.from.selection }
          : {}),
        ...(opts.key !== undefined ? { key: opts.key } : {}),
      },
    }
  );
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
  return mapOperator<L[], (L & R)[]>(
    (left) => {
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
      return joined;
    },
    { type: "join", opts: { on: opts.on, right } }
  );
}

/* END Data Transformation Operators */

/**
 * A circle: an ellipse with a 1:1 aspect ratio, sized by RADIUS. A numeric `r`
 * is a pixel radius (so the ellipse is `2r` across); a data-driven `r` is a
 * size channel, and its aggregated value is the ellipse's extent directly.
 */
export const circle = createMark(
  (p: {
    r?: MaybeValue<number>;
    fill?: MaybeValue<string>;
    stroke?: MaybeValue<string>;
    strokeWidth?: number;
    opacity?: MaybeValue<number>;
  }) => {
    const size = typeof p.r === "number" ? p.r * 2 : p.r;
    return Ellipse({
      w: size,
      h: size,
      aspectRatio: 1,
      fill: p.fill,
      stroke: p.stroke,
      strokeWidth: p.strokeWidth,
      // `opacity` is a RAW channel, so a per-datum accessor has already been
      // evaluated against the row and wrapped; `Ellipse` paints a plain number.
      opacity: p.opacity === undefined ? undefined : getValue(p.opacity),
    });
  },
  { r: "size", fill: "color", stroke: "color", opacity: "raw" },
  {
    type: "circle",
    shape: (o) => ({
      r: o.r,
      fill: o.fill,
      stroke: o.stroke,
      strokeWidth: o.strokeWidth,
      // A callback opacity is a live JS value with nothing to put on the wire,
      // so only a literal one is serialized (the same reason `derive` is opaque).
      ...(typeof o.opacity === "number" ? { opacity: o.opacity } : {}),
    }),
  }
);

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
//       · split bag form — a fused mark's split is computed by `ChartBuilder`
//                         from the flow it fuses over (see `along` below) and
//                         partitions the bag with the same `splitEntries`
//                         used by `group()`'s `split` hook, producing one
//                         connector PER GROUP. A refs-bag chart spells the
//                         same shape structurally instead: `chart(selectAll(
//                         ...)).flow(group({ by: "species" })).mark(ribbon())`.
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
// `.zOrder(...)` or `.relate(...)` on the connector's node overrides the
// default (the tag is only consulted when neither has been set).
type RelationalMarkOptions = {
  from?: string;
  to?: string;
  // Names a flow tier by its `by` field: that tier becomes the path tier
  // (threading its groups in order) and every OTHER grouping tier splits.
  // The only free choice a relational mark makes (see `notes/design/
  // relational-mark-default-split.md`'s "The `along` option" section) — the
  // split itself is never spelled directly; it's always the complement,
  // computed by `ChartBuilder` (`applyDefaultRelational`/`computeDefaultBy`)
  // and written into the mark's `inferred` cell, never into `opts`. Omitted:
  // the path tier is inferred from the flow shape instead. Naming a field
  // that matches no tier, or fusing over something that isn't this chart's
  // own flow (a refs bag, or the pairwise `{from,to}` form), is a loud
  // error — `along` never silently no-ops.
  along?: string;
};

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
// strokeWidth, strokeDasharray, opacity, curve, dir, mixBlendMode, along,
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
 *
 * `inferred` is a mutable cell, SEPARATE from `opts`, that `ChartBuilder`
 * writes the computed default split/travel-direction into (issue #752's
 * default-grouping rule — see `notes/design/relational-mark-default-split.md`).
 * It stays disjoint from `opts` on purpose: `opts` is the record of what the
 * user actually wrote (verbatim, serializable — `__serialize.opts` reads the
 * SAME object), so mutating it with a synthesized, non-serializable key
 * function would corrupt the IR and make an inferred `dir` look
 * user-specified. The mark closure (below) reads `inferred` at bag-arrival
 * time for the split (relational marks have no explicit split option — see
 * `along` on `RelationalMarkOptions`) and resolves the travel direction
 * itself: an explicit `opts.dir` always wins over `inferred.dir`.
 */
function tagRelationalFusable(
  mark: object,
  type: string,
  opts: Record<string, any>,
  inferred: InferredRelational,
  temporal?: boolean
): void {
  const anchorOpts = pickAnchorOpts(opts);
  const fusable: RelationalFusable = {
    type,
    opts,
    inferred,
    temporal,
    anchorKeys: Object.keys(anchorOpts).filter(
      (k) => anchorOpts[k] !== undefined
    ),
    makeAnchor: () => blank(pickAnchorOpts(opts)),
  };
  (mark as any).__relationalFusable = fusable;
}

/**
 * A connector's `fill` or `stroke` may be a shared field name (e.g.
 * `ribbon({ fill: "species" })` fused over a flow that splits by `species`,
 * or the refs-bag idiom `ribbon({ fill: "variety" })` over
 * `flow(group({ by: "variety" }))`) rather than a literal color — resolve
 * each once per group into a concrete `Value`, the same way a per-item
 * mark's color channel would (`inferColor`), instead of leaking the bare
 * field name through to `Connect` as a literal (invalid) CSS color. `fill`
 * colors a ribbon's band; `stroke` colors a line's (or a ribbon's outline's)
 * path — both are the same "field name instead of a literal color" shape, so
 * both go through the same resolution.
 *
 * Runs on BOTH the split and unsplit branches of the bag form (see
 * `createRelationalMark`). On the split branch each group is homogeneous in
 * the field by construction whenever it names the split field itself (or
 * another field the split happens to agree on). On the unsplit branch — a
 * connector with no split at all, drawn through the whole bag as one group —
 * that homogeneity isn't guaranteed, so this THROWS a loud, specific error
 * when the field disagrees across the bag instead of silently painting with
 * whatever the first row happens to have (mirrors the homogeneity-collapse
 * error `resolveLabelText` throws for `.label(field)` — see
 * `labels/labelPlacement.ts`).
 *
 * A no-op for literal colors, `Value`s, and undefined — `inferColor` itself
 * tells a field name from a literal (falls through unchanged when the string
 * isn't a key of the sampled row).
 */
const PAINT_KEYS = ["fill", "stroke"] as const;

function resolveGroupFill<O extends RelationalMarkOptions>(
  type: string,
  opts: O,
  groupRefs: GoFishRef[]
): O {
  const rows = groupRefs.flatMap((r) =>
    Array.isArray(r.datum) ? r.datum : [r.datum]
  );
  let resolvedOpts = opts;
  for (const key of PAINT_KEYS) {
    const raw = (opts as any)[key];
    if (typeof raw !== "string") continue;
    if (rows.length === 0 || rows[0] == null || !(raw in rows[0])) {
      // Not a field name on this data (e.g. a literal color like
      // "steelblue") — inferColor's own fallthrough passes it through
      // unchanged.
      continue;
    }
    // `raw` names a field on the data: reuse `projectPath`'s projection +
    // homogeneity collapse (same rule `by` uses elsewhere in this file) —
    // the common value iff the group agrees on it, `undefined` if not.
    // `groupRefs` (not the flattened `rows`) so it walks each ref's `.datum`
    // bag itself, same as any other `projectPath` caller.
    if (projectPath(groupRefs, raw) === undefined) {
      throw new Error(
        `[gofish] ${type}({ ${key}: "${raw}" }): "${raw}" is not constant ` +
          `across the connected group; make sure the flow this ${type} fuses ` +
          `over groups by "${raw}" (or a field it agrees with) — or, over a ` +
          `refs bag, add \`flow(group({ by: "${raw}" }))\` — or pass an ` +
          `explicit color.`
      );
    }
    const resolved = inferColor(raw, rows);
    if (resolved !== undefined) {
      resolvedOpts = { ...resolvedOpts, [key]: resolved } as O;
    }
  }
  return resolvedOpts;
}

export function createRelationalMark<O extends Record<string, unknown>>(
  type: string,
  produce: (
    opts: StripLive<O>,
    children: GoFishAST[],
    inferred: InferredRelational
  ) => any,
  config: {
    /** A TEMPORAL connector (`time.transition()`): its path tier is the
     *  flow's `time.sequence(...)` rather than a spatial tier, so
     *  `applyDefaultRelational` resolves `along` from the time tier and hands
     *  the clock down through `inferred.time`. */
    temporal?: boolean;
  } = {}
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
    // `live(...)` channels on a connector are ALSO registered as paint slots:
    // the paint layer calls the thunk in attribute position on every paint, so
    // a later pulse patches the attribute without a re-resolve. That is what
    // `liveChannelsOf` is collected for here — it is stamped on each produced
    // node, where `INTERNAL_lower` bakes it into the datum-bound paint slots.
    // The opts the connector is BUILT from are the same ones a leaf mark is
    // built from: each `live(...)` replaced by its value at resolve time (see
    // `resolveLive` below), so the first paint already draws the right thing.
    const opts = (options ?? {}) as O;
    const liveChannels = liveChannelsOf(opts);
    /** The cell `ChartBuilder` writes the computed split / travel direction /
     *  time tier into — see `tagRelationalFusable`'s doc comment. Declared
     *  here, not inside the bag branch below, because `produce` reads it on
     *  every branch. */
    const inferred: InferredRelational = {};
    /** The datum of the GROUP a connector threads: each field of its operands'
     *  data, projected with homogeneity collapse. A path through one species'
     *  days collapses `species` to that species and `day` to undefined, which
     *  is what a channel callback — and `pointer().datum()` on hover — should
     *  see. Undefined when the operands carry no data. */
    const groupDatumOf = (
      operands: GoFishAST[]
    ): Record<string, unknown> | undefined => {
      const datums = operands
        .map((o) => (o as any).datum)
        .filter((d) => d !== undefined);
      if (datums.length === 0) return undefined;
      const keys = new Set<string>();
      const collectKeys = (d: unknown): void => {
        if (Array.isArray(d)) d.forEach(collectKeys);
        else if (d !== null && typeof d === "object")
          for (const k of Object.keys(d)) keys.add(k);
      };
      collectKeys(datums);
      if (keys.size === 0) return undefined;
      const group: Record<string, unknown> = {};
      for (const k of keys) group[k] = projectPath(datums, k);
      return group;
    };
    /** The opts `produce` is built from: each `live(...)` channel replaced by
     *  its value at the connector's datum (the same substitution a leaf mark's
     *  channels get — see `withLiveStatics`). */
    const resolveLive = (o: O, datum: unknown): StripLive<O> =>
      withLiveStatics(o, liveChannels, datum);
    /** Tag a produced connector with its operands, the datum it carries, and
     *  the paint-time thunks for its live channels. */
    const finish = (
      node: GoFishNode,
      operands: GoFishAST[],
      datum: unknown
    ): GoFishNode => {
      tagRelationalOperands(node, operands);
      if (datum !== undefined && (node as any).datum === undefined)
        (node as any).datum = datum;
      if (liveChannels)
        (node as any).__gfLive = { ...(node as any).__gfLive, ...liveChannels };
      return node;
    };

    // Low-level combinator form: connect the given children directly.
    if (children !== undefined) {
      // The children may be a PROMISE of an array rather than an array: `map`
      // is async, so the low-level `line(opts, map(rows, ...))` form hands one
      // in. `produce` awaits it internally; the group datum and the operand
      // tagging are read off the children too, so they have to await it as
      // well. The result stays a thenable carrying the node methods, which is
      // what this form already returned (`produce` is itself async).
      return addRenderMethod(
        (async () => {
          const operands = await children;
          const datum = groupDatumOf(operands);
          return finish(
            (await produce(
              resolveLive(opts, datum),
              operands,
              inferred
            )) as GoFishNode,
            operands,
            datum
          );
        })()
      ) as unknown as GoFishNode;
    }

    // Pairwise `{ from, to }` form: one connector per row. The SPATIAL
    // connector options (`from`/`to`/`along`) are read off a cast rather than
    // off `O` itself, because not every relational mark is spatial: a
    // temporal one (`time.transition()`) has none of them — its path tier is
    // the flow's `time.sequence(...)` and it has no pairwise form.
    const spatialOpts = opts as RelationalMarkOptions;
    if (spatialOpts.from !== undefined && spatialOpts.to !== undefined) {
      if ((opts as any).along !== undefined) {
        throw new Error(
          `${type}({ along: "${(opts as any).along}" }): along names a tier ` +
            `of this chart's flow; the pairwise { from, to } form connects ` +
            `two columns of ref-bearing rows, not a flow — remove \`along\`.`
        );
      }
      const from = spatialOpts.from;
      const to = spatialOpts.to;
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
            return finish(
              (await produce(
                resolveLive(opts, row),
                [a, b],
                inferred
              )) as GoFishNode,
              [a, b],
              row
            );
          })
        );
        return Layer({}, segments);
      };
      const result = nameableMark(mark);
      (result as any).__serialize = { type, opts };
      return result;
    }

    // Bag form: applied to a `GoFishRef[]` (e.g. `selectAll(...)`), with an
    // optional split into one connector per group. The split is read HERE,
    // at bag-arrival (invocation) time, off `inferred` — never off `opts`:
    // relational marks have no explicit split option, and `along` only NAMES
    // the path tier, it never spells the split itself. `ChartBuilder` computes
    // the split (and travel direction)
    // AFTER this mark is constructed, from the rest of the flow assembled in
    // `.mark()`/`.layer()`, and writes it into `inferred`, a cell disjoint
    // from `opts` (see `tagRelationalFusable`'s doc comment). `opts.dir`, if
    // given, still wins over the inferred travel direction.
    const mark: Mark<GoFishRef[]> = async (d: GoFishRef[]) => {
      const by = inferred.by;
      const dir = (opts as any).dir ?? inferred.dir;
      // Only allocate a copy when there's actually an inferred `dir` to
      // splice in — `produce` (line/ribbon's Connect call) reads `o.dir` off
      // whatever opts object it's given, defaulting to "x" itself when
      // absent, so this is a no-op when nothing was inferred.
      const baseOpts: O =
        (opts as any).dir === undefined && dir !== undefined
          ? ({ ...opts, dir } as O)
          : opts;

      if (by !== undefined) {
        const entries = splitEntries(by, d as any);
        const nodes = await Promise.all(
          [...entries.values()].map(async (group) => {
            const groupRefs = (
              Array.isArray(group) ? group : [group]
            ) as GoFishRef[];
            const groupOpts = resolveGroupFill(type, baseOpts, groupRefs);
            const datum = groupDatumOf(groupRefs);
            return finish(
              (await produce(
                resolveLive(groupOpts, datum),
                groupRefs,
                inferred
              )) as GoFishNode,
              groupRefs,
              datum
            );
          })
        );
        return Layer({}, nodes);
      }

      // Unsplit: one connector through the whole bag, treated as a single
      // group for `resolveGroupFill` (see its doc comment for the paint fix).
      const groupOpts = resolveGroupFill(type, baseOpts, d);
      const datum = groupDatumOf(d);
      return finish(
        (await produce(
          resolveLive(groupOpts, datum),
          d,
          inferred
        )) as GoFishNode,
        d,
        datum
      );
    };
    const result = nameableMark(mark);
    (result as any).__serialize = { type, opts };
    tagRelationalFusable(result, type, opts, inferred, config.temporal);
    return result;
  }
  return relational;
}

export type LineOptions = {
  fill?: MaybeValue<string> | LiveValue;
  stroke?: MaybeValue<string> | LiveValue;
  strokeWidth?: number | LiveValue;
  strokeDasharray?: string;
  opacity?: number | LiveValue;
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
  // Names a flow tier by its `by` field — see `RelationalMarkOptions.along`'s
  // doc comment for the full semantics.
  along?: string;
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
  fill?: MaybeValue<string> | LiveValue;
  stroke?: MaybeValue<string> | LiveValue;
  strokeWidth?: number | LiveValue;
  opacity?: number | LiveValue;
  mixBlendMode?: "normal" | "multiply";
  dir?: "x" | "y";
  // Screen-space path shape for the band edges (`straight()` | `bezier()`).
  // Edge mode honors straight (linear band) vs bezier (S-curve band).
  curve?: Curve;
  from?: string;
  to?: string;
  // Names a flow tier by its `by` field — see `RelationalMarkOptions.along`'s
  // doc comment for the full semantics.
  along?: string;
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

/**
 * `blank()` — an invisible positioning guide. It takes part in layout, carries
 * a datum, anchors refs (`selectAll`) and seeds the color scale exactly as a
 * `rect` does, and it emits NOTHING to the display list: no SVG element, no
 * hit-test entry. That is unconditional — `fill` reaches the color scale only,
 * there is no option that makes a blank paint, and so it takes no paint-only
 * options (stroke, corner radius). See `Blank` in `shapes/rect.tsx` for how
 * the rule is enforced.
 */
export function blank<T extends Record<string, any>>({
  emX,
  emY,
  w = 0,
  h = 0,
  fill,
  debug,
}: {
  emX?: boolean;
  emY?: boolean;
  // Same channel-value shapes rect's "size" channel accepts (see
  // `DeriveMarkProps` in channels.ts) — blank() runs the same channel
  // encoding as `rect` below, so a field name, `Value<number>`, or
  // `field(...)` pipeline (e.g. `field("count").sum()`) evaluates identically.
  w?: number | (keyof T & string) | Value<number> | FieldExpr;
  h?: number | (keyof T & string) | Value<number> | FieldExpr;
  fill?: string | (keyof T & string);
  debug?: boolean;
} = {}): Mark<T | T[] | { item: T | T[]; key: number | string }> {
  // A rect's dims/layout/datum with rect's paint removed (and `{ type:
  // "blank" }` on the wire) — see `Blank` / `baseBlank` in shapes/rect.tsx.
  return baseBlank<T>({
    emX,
    emY,
    w,
    h,
    fill,
    debug,
  });
}

/* ---- mark-combinator forms for layer and Porter-Duff operators ---- */

type BlendMode = "color" | "multiply" | "screen" | "overlay";
type PdOptions = { blendMode?: BlendMode };

/**
 * A mark with chainable .name, .label, .relate, and a top-level .render()
 * for combinator-form callsites whose children carry their own data
 * (e.g. `layer([Chart(...).flow(...).mark(...), ...]).render(container, opts)`).
 *
 * Mark children that read field accessors will be called with `undefined` data
 * if you call `.render()` directly — for those, wrap in a Chart instead:
 *   `chart(data).mark(layer([rect({h: "v"}), ...])).render(container, opts)`.
 */
export type RelatableMark<T> = Mark<T> & {
  name(layerName: string | Token): RelatableMark<T>;
  label(accessor: LabelAccessor, options?: LabelOptions): RelatableMark<T>;
  zOrder(value: ZOrderValue<T>): RelatableMark<T>;
  relate(fn: RelateFn): RelatableMark<T>;
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
 * `.relate(fn)` — runs a relate callback on each produced node (see
 * `GoFishNode.relate`). Unlike `.name()`/`.label()`, it intentionally carries
 * no `tag`: a related mark drops its IR-serialize tag (related marks aren't
 * serialized), matching the pre-factory behavior.
 */
const relateModifier = {
  name: "relate",
  apply: async (node, _layerContext, _datum, fn) => {
    await node.relate(fn);
  },
} satisfies ModifierConfig<[fn: RelateFn]>;

function makeRelatableMark<T>(base: Mark<T>): RelatableMark<T> {
  return attachModifiers(base, [
    nameModifier,
    labelModifier,
    relateModifier,
    zOrderModifier,
  ]) as unknown as RelatableMark<T>;
}

/**
 * Mark-combinator form of layer. Resolves each child against the per-datum
 * data and wraps the resulting nodes in a Layer. Children may be:
 *   - Mark functions (called with the parent's data),
 *   - ChartBuilders (resolved via their own bound data),
 *   - already-resolved GoFishNodes (e.g. ref(...)).
 * Supports `.name()`, `.label()`, `.relate()`, and a top-level `.render()`.
 */
export function layer<T>(marks: MarkChild[]): RelatableMark<T>;
export function layer<T>(
  opts: Record<string, any>,
  marks: MarkChild[]
): RelatableMark<T>;
export function layer<T>(
  marksOrOpts: MarkChild[] | Record<string, any>,
  maybeMarks?: MarkChild[]
): RelatableMark<T> {
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
  return tagCombinator(makeRelatableMark(base), "layer", opts, marks);
}

function makePorterDuffCombinator(
  lowLevel: (opts: any, children: any) => any,
  irType: string
) {
  function fn<T>(marks: [MarkChild, MarkChild]): NameableMark<T>;
  function fn<T>(
    opts: PdOptions,
    marks: [MarkChild, MarkChild]
  ): NameableMark<T>;
  function fn<T>(
    optsOrMarks: PdOptions | [MarkChild, MarkChild],
    maybeMarks?: [MarkChild, MarkChild]
  ): NameableMark<T> {
    const opts = Array.isArray(optsOrMarks) ? {} : optsOrMarks;
    const marks = (Array.isArray(optsOrMarks) ? optsOrMarks : maybeMarks) as [
      MarkChild,
      MarkChild,
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
    return tagCombinator(nameableMark(base), irType, opts, marks);
  }
  return fn;
}

// The second arg is the IR/serialize *wire* type: the Porter-Duff strings
// ("atop"/"over"/"inside"/"xor"/"out"/"mask"), which the serialize bridge and
// IR schema use. Only the JS-facing names are Figma-style.
export const paint = makePorterDuffCombinator(Paint, "atop");
// `over` combinator is internal (deserializer only) — not exported from lib.
export const over = makePorterDuffCombinator(Over, "over");
export const intersect = makePorterDuffCombinator(Intersect, "inside");
export const exclude = makePorterDuffCombinator(Exclude, "xor");
export const subtract = makePorterDuffCombinator(Subtract, "out");
export const mask = makePorterDuffCombinator(Mask, "mask");

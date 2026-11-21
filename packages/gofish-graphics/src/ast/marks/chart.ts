// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

import type { Curve } from "../../families/curve";
import {
  connect as Connect,
  type AnchorAlignment,
  type AnchorSpec,
} from "../graphicalOperators/connect";
import {
  bandEdgeCurveNames,
  curveName,
  drawsBandEdge,
} from "../graphicalOperators/routers";
import { GoFishNode } from "../_node";
import {
  getValue,
  isValue,
  scaleValue,
  value,
  type MaybeValue,
  type Value,
} from "../data";
import { predicateWire, sumIn, type FieldExpr } from "../fieldExpr";
import { columnQuantity } from "../measure";
import { distOf, type DistData } from "../dist";
import { GoFishRef } from "../_ref";
import type { GoFishAST } from "../_ast";
import type { Token } from "../createName";
import { type ColorConfig } from "../colorSchemes";

export type { ColorConfig };
import { colorValue, resolveChannelAccessors } from "../channels";
import { isThenable } from "../../util";
import { MARK_CHANNELS } from "../markChannels.generated";
import {
  liveChannelsOf,
  withLiveStatics,
  type LiveValue,
  type StripLive,
} from "../../interaction/live";
import { rect as generatedRect, baseBlank } from "../shapes/rect";
import { Ellipse } from "../shapes/ellipse";
import type { XYWHDims } from "../dims";
import { Mark, MarkChild, Operator } from "../types";
import {
  addRenderMethod,
  createMark,
  reifyChildren,
  sealComponent,
  type NameableMark,
} from "../withGoFish";
import { Band, bandOfFunctions, bandOfRows } from "../shapes/band";
import {
  groupFun,
  isFunValue,
  type FunctionExpr,
  type ValueExpr,
} from "../groupExpr";
import { bezier, linear as linearCurve, monotone } from "../../families/curve";
import type { ParameterCurve } from "../fun";
import type { LabelAccessor, LabelOptions } from "../labels/labelPlacement";
import {
  resolveMarkResult,
  nameableMark,
  attachModifiers,
  tagCombinator,
  forwardInputsResolver,
  nameModifier,
  labelModifier,
  zOrderModifier,
  hiddenModifier,
} from "./createOperator";
import type {
  HiddenValue,
  ModifierConfig,
  ZOrderValue,
} from "./createOperator";
import { layer as Layer } from "../graphicalOperators/layer";
import type { BlendMode } from "../blendMode";
import {
  applyFilter,
  displayFilter,
  type FilterOption,
  type FilterOptions,
} from "../drawFilter";
import {
  encloseNode,
  type EncloseOptions,
  type Resolved as EncloseResolved,
} from "../graphicalOperators/enclose";
import {
  union as Union,
  intersect as Intersect,
  exclude as Exclude,
  subtract as Subtract,
  atop as Atop,
  type UnionOptions,
  type IntersectOptions,
  type SubtractOptions,
  type ExcludeOptions,
  type AtopOptions,
} from "../graphicalOperators/porterDuff";
import type { RelateFn } from "../constraints";
import { splitByTiers, type InferredRelational } from "../datumProjection";

export type { Mark, Operator };
export { generatedRect as rect };
export type { LayerContext };

import {
  ChartBuilder,
  LayerBuilder,
  chart,
  PREVIOUS_LAYER_MARKS,
} from "./chartBuilder";
import { resolveRefData } from "./resolveRefData";
import type { ChartOptions, RelationalFusable } from "./chartBuilder";
import { projectByValues, projectPath, rowsReached } from "../datumProjection";
import {
  applySchema,
  columnType,
  copyColumnTypes,
  getColumnTypes,
  schemaToWire,
  type SchemaEntry,
} from "../schema";
import { withWire } from "../wire";
import { withKindValues } from "../strategyKind";
import { LayerContext, datumOfInput, markContext } from "./markResult";
import { withRegistrar } from "../../interaction/resolveContext";
import { withFlowStep } from "./compose";
export { ChartBuilder, LayerBuilder, chart, PREVIOUS_LAYER_MARKS };
export type { ChartOptions };

/* Data Transformation Operators */

/**
 * The shape every data-transformation operator shares: map the incoming data
 * with `fn`, type the result with the operator's own typing rule
 * (`typeResult`, given the result and the input), hand it to the mark, and
 * carry an IR-serialization tag. `fn` receives the layer context so it can
 * resolve refs (see `resolve`).
 */
function mapOperator<T, U>(
  fn: (d: T, layerContext: LayerContext) => U | Promise<U>,
  serialize: { type: string; opts: Record<string, unknown> },
  typeResult: (out: U, input: T) => U | Promise<U>
): Operator<T, U> {
  const op: Operator<T, U> = async (mark: Mark<U>) =>
    (async (d: T, key?: string | number, given?: LayerContext) => {
      const layerContext = markContext(given);
      // The one call of a `derive` function or a `filter` predicate.
      const out = await withRegistrar(layerContext.registrar, () =>
        fn(d, layerContext)
      );
      return resolveMarkResult(
        mark,
        layerContext,
        await typeResult(out, d),
        key
      );
    }) as Mark<T>;
  withWire(op, serialize);
  return op;
}

/**
 * `derive`'s typing rule: its result is typed like chart data, column by
 * column, through `applySchema`:
 *
 *  1. A column whose values still fit the type it had in the input keeps it
 *     (`applySchema`'s `inherited` types): a time column of instants (epoch
 *     milliseconds or `Date`s) stays a time in its zone, so a `derive` that
 *     adds a column leaves the other columns as they were. The input's types
 *     never reinterpret values: a `Date` is an instant, so it only becomes
 *     epoch milliseconds.
 *  2. A column of `Date`s is a time (UTC), inferred as for chart data.
 *  3. Any other column has no type: a `derive` that rewrites a date to
 *     "Mar" makes it plain text.
 *  4. `schema` (the `derive(fn, { schema })` annotation) types the columns it
 *     names over all of that, and converts their values as a chart's schema
 *     does (an ISO string in a time column becomes epoch milliseconds).
 *
 * Types the result carries itself win over 1 and 2 (a datetime column a
 * Python callback returns arrives typed from the widget's decode). The
 * returned array itself is left as `fn` made it: `applySchema` types a copy.
 * The result is a list of rows, as all data is; only the types say so, and
 * nothing here checks its shape.
 */
const typeLikeChartData =
  (schema: Record<string, SchemaEntry> = {}) =>
  async <U>(out: U[], input: unknown): Promise<U[]> =>
    (await applySchema(out as any[], schema, getColumnTypes(input))) as U[];

/** What `derive` takes besides its function: `schema`, the column types of
 *  its result, as a chart's `schema` takes them (see `typeLikeChartData`). */
export type DeriveOptions = { schema?: Record<string, SchemaEntry> };

export function derive<T, U>(
  fn: (rows: T[]) => U[] | Promise<U[]>,
  { schema }: DeriveOptions = {}
): Operator<T[], U[]> {
  // The function body is not serializable; the frontend-IR emitter sees
  // an opaque `{ type: "derive" }` (with its `schema`, if any). The
  // Python-bridge widget emits its own `{ type: "derive", lambdaId }` shape.
  // The schema is kept in its wire form (`schemaToWire`), as Python's
  // `derive` keeps it, so the tag serializes as it stands.
  const wire = schema !== undefined ? schemaToWire(schema) : undefined;
  return mapOperator(
    fn,
    { type: "derive", opts: wire !== undefined ? { schema: wire } : {} },
    typeLikeChartData(wire)
  );
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
 * Typing: `filter` returns a subset of its input's row objects, so its
 * result carries the input's column types as they are, with no check of the
 * values. A predicate that changes the rows it tests is not supported.
 *
 * Serialization: a field predicate carries its own description, so the
 * operator goes on the wire as `{ type: "filter", predicate: { field,
 * between: [lo, hi], closed? } }` and the deserializer rebuilds it. A
 * hand-written predicate is a live JS callback with no JSON form, so that
 * filter carries `derive`'s opaque `{ type: "derive" }` tag.
 */
export function filter<T>(pred: (row: T) => boolean): Operator<T[], T[]> {
  const predicate = predicateWire(pred);
  return mapOperator<T[], T[]>(
    (d) => d.filter(pred),
    predicate !== undefined
      ? { type: "filter", opts: { predicate } }
      : { type: "derive", opts: {} },
    (out, input) => (out === input ? out : copyColumnTypes(out, input))
  );
}

// return an array of copies of `d` repeated `d.field` times
export const repeat = <T, K extends keyof T>(
  d: T,
  field: K & (T[K] extends number ? K : never)
) => {
  return Array.from({ length: d[field] as unknown as number }, () => d);
};

/** Each row of `data` with `field` divided by the column's total. The
 *  total adds the column, so its unit must add up (`sumIn`), as for
 *  `field(...).normalize()`. */
export const normalize = <T, K extends keyof T>(
  data: T[],
  field: K & (T[K] extends number ? K : never)
): T[] => {
  const column = field as string;
  const total = sumIn(
    data.map((d) => d[field]),
    columnQuantity(column, columnType(data, column)),
    "normalize(...)"
  );
  // Over values all missing the total is unknown, and so is every share.
  return data.map((d) => ({
    ...d,
    [field]: (d[field] as unknown as number) / (total ?? NaN),
  }));
};

/** The options of {@link kde}. */
export type KdeOptions = {
  /** The standard deviation of each value's kernel, in the column's unit.
   *  Silverman's rule (R's `bw.nrd0`) when omitted. */
  bandwidth?: number;
};

/**
 * A derive helper, `derive(kde("x"))`: the rows going in are a sample of
 * the column `column`, and the one row coming out holds, in that column,
 * the sample smoothed by a normal kernel, a distribution
 * (`{ type: "dist", family: "kde", params: { values, bandwidth? } }`, see
 * `DistData` in dist.ts). `field(column)`'s members read it: `density()`,
 * `domain()`, `cdf()`, `quantile(p)`, `median()`, `mean()`, and
 * `.bin(Bin.quantiles(n))` cuts it at its own quantiles.
 *
 * The row also holds every other column whose value is the same in all
 * the rows (a group's species, after a split by it), and nothing else. In a
 * flow after a split, `derive` runs once per group, so each group's column
 * holds its own distribution. No rows give no row. Missing values are left
 * out of the sample.
 */
export const kde =
  (column: string, options: KdeOptions = {}) =>
  <T>(rows: T[]): Record<string, unknown>[] => {
    if (rows.length === 0) return [];
    const records = rows as unknown as (Record<string, unknown> | null)[];
    const first = records.find((r) => r != null) ?? {};
    const same = Object.fromEntries(
      Object.entries(first).filter(
        ([k, v]) => k !== column && records.every((r) => Object.is(r?.[k], v))
      )
    );
    const data: DistData = {
      type: "dist",
      family: "kde",
      params: {
        values: records.flatMap((r) =>
          r?.[column] == null ? [] : [r[column]]
        ),
        ...(options.bandwidth !== undefined
          ? { bandwidth: options.bandwidth }
          : {}),
      },
    };
    // Built here, so a sample that has no density is an error at the kde.
    distOf(data);
    return [{ ...same, [column]: data }];
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
    { type: "log", opts: prefix !== undefined ? { prefix } : {} },
    // The result is the input, types and all.
    (out) => out
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
      const refs = resolveRefData(opts.from, layerContext);
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
    },
    typeLikeChartData()
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
      const rightByKey = new Map<unknown, R[]>();
      for (const r of right) {
        const k = r[opts.on];
        const bucket = rightByKey.get(k);
        if (bucket) bucket.push(r);
        else rightByKey.set(k, [r]);
      }
      const joined: (L & R)[] = [];
      for (const l of left) {
        for (const r of rightByKey.get(l[opts.on]) ?? []) {
          joined.push({ ...l, ...r });
        }
      }
      return joined;
    },
    { type: "join", opts: { on: opts.on, right } },
    typeLikeChartData()
  );
}

/* END Data Transformation Operators */

type CircleProps = XYWHDims<MaybeValue<number>> & {
  /** Radius. The diameter is `2r`, whether `r` is a number, a field, or an
   *  accessor. */
  r?: MaybeValue<number>;
  /** Area. An area channel hands the circle the side of the square of that
   *  area (its square root, `CHANNEL_INFER.area` in channels.ts), and the circle
   *  takes the diameter of the disc of that area, `2/√π` times the side. */
  area?: MaybeValue<number>;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  opacity?: MaybeValue<number>;
  /** Opacity of the fill alone, 0 to 1; the stroke keeps `opacity`. */
  fillOpacity?: number;
};

/** The diameter of a disc over the side of the square of the same area. */
const DISC_PER_SQUARE = 2 / Math.sqrt(Math.PI);

/**
 * A circle: an ellipse locked to a 1:1 aspect ratio. It takes the same box
 * dimensions as `ellipse`. Its one size is the diameter, set by at most one of
 * `r`, `area`, `w`, or `h`. A number is pixels (square pixels for `area`), and
 * a field name, `field(...)`, or accessor is data.
 *
 * - `r` is the radius, so the diameter is `2r` for every kind of value. It has
 *   no axis, so it sizes both axes, and a data `r` claims the same data size
 *   on both (a circle in data space).
 * - `area` is an area channel (#972): the circle's area is proportional to
 *   the value. The channel, not the circle, takes the square root, so the
 *   length it hands the circle is linear in the scale that sizes it. Like
 *   `r`, it sizes both axes. A number is an exact area in square pixels.
 * - `w` or `h` is the diameter along that axis. The aspect lock gives the
 *   other axis the same data length (`Ellipse`, #1087), so a data `w` or `h`
 *   claims both axes and one σ sizes both: `circle({ h: "value" })` in a
 *   spread reads against the value axis, and the row of circles fits. Where
 *   the parent places the circle at a datum of another unit on the other
 *   axis (a scatter on x only), the other axis follows in pixels and claims
 *   nothing there (`GoFishNode.isGlyph`).
 *
 * A circle its parent places at a datum in another unit (a bubble in a
 * scatter, a circle in a 2D histogram's cell) is a glyph
 * (`GoFishNode.isGlyph`): its size is a scale of its own, fit to its room.
 *
 * With none of them, the circle fills the space it is given.
 */
export const circle = createMark(
  ({ r, area, w, h, opacity, ...rest }: CircleProps) => {
    const given = [r, area, w, h].filter((v) => v !== undefined).length;
    if (given > 1) {
      throw new Error(
        "circle: pass one of r, area, w, or h. Each one sets the diameter."
      );
    }
    // The other axis copies a pixel diameter and follows a data one.
    const follow = (d: MaybeValue<number> | undefined) =>
      d !== undefined && isValue(d) ? undefined : d;
    const both = (d: MaybeValue<number>) => ({ w: d, h: d });
    const diameter =
      r !== undefined
        ? both(scaleValue(2, r))
        : area !== undefined
          ? both(scaleValue(DISC_PER_SQUARE, area))
          : w !== undefined
            ? { w, h: follow(w) }
            : { w: follow(h), h };
    return Ellipse({
      ...rest,
      ...diameter,
      aspectRatio: 1,
      // `opacity` is a RAW channel, so a per-datum accessor has already been
      // evaluated against the row and wrapped; `Ellipse` paints a plain number.
      opacity: opacity === undefined ? undefined : getValue(opacity),
    });
  },
  MARK_CHANNELS.circle,
  "circle"
);

// `ref(name)` is the universal singular reference — usable inline in a layout
// (resolved at layout time) and as chart data (resolved at build time against
// the per-chart layer registry, erroring unless exactly one named node
// matches). `selectAll(name)` is the plural form: one ref per matching named
// node, chart-data only; `name` is a string or a `createName` token, which
// is plural too (a token on a repeated mark names every node it made). Both
// defer layer lookup until resolution, so layers can be registered by
// `.name()` on marks before the selector accesses them.
export function selectAll(
  layerName: string | Token
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
//                         partitions the bag as the flow's tiers grouped its
//                         rows (`splitByTiers`), producing one
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
// strokeWidth, strokeDasharray, opacity, curve, dir, blendMode, along,
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
 * The channels a relational mark or a compositor reads once per group: the
 * color channels of its channel map (`fill`, `stroke`) and its raw ones
 * (`enclose`'s `padding`), generated from its descriptor. They are the keys
 * the connector reads per group, so the only ones resolved.
 */
const groupChannelsOf = (type: string): Record<string, "color" | "raw"> =>
  Object.fromEntries(
    Object.entries(
      (MARK_CHANNELS as Record<string, Record<string, string>>)[type] ?? {}
    ).filter(([, kind]) => kind === "color" || kind === "raw")
  ) as Record<string, "color" | "raw">;

/**
 * Resolve a connector's paint (and its other per-group channels) over the
 * `group` it threads (its refs, an edge row, its operands' data, or a flow
 * step's rows): one color per connector, the way a mark's color channel
 * gives one color per mark.
 *
 * A field name is shorthand for an accessor (`"species"` is
 * `(d) => d.species`), so both read a value off each row of the group with
 * `projectByValues`, the projection `by` uses. One distinct value is the
 * connector's: a color channel's goes through the shared color scale
 * (`colorValue`), a raw channel's (`enclose`'s `padding`) is used as it is.
 * Several is a loud error, never a silent first-row pick (mirrors the
 * homogeneity-collapse error `resolveLabelText` throws for `.label(field)`).
 * None passes a string through unchanged (it names no field, so it is a
 * literal color, as for a mark's color channel) and drops an accessor (a
 * group with no rows has nothing for it to read), so a raw function never
 * reaches the node. A `Value` or undefined is left as is.
 *
 * The same resolution serves every mark whose paint is one color: the
 * connectors, `enclose`, and `intersect` (over the rows of its input).
 *
 * Python accessors are resolved first, over exactly the rows that walk reads
 * (`rowsReached`), in one batch call each (`resolveChannelAccessors`).
 */
async function resolveGroupPaint<O extends Record<string, unknown>>(
  type: string,
  opts: O,
  group: unknown
): Promise<O> {
  const paint = groupChannelsOf(type);
  const pending = resolveChannelAccessors(opts, paint, () =>
    rowsReached(group)
  );
  let resolved = isThenable(pending) ? await pending : pending;
  for (const key of Object.keys(paint)) {
    const raw = (resolved as any)[key];
    if (typeof raw !== "string" && typeof raw !== "function") continue;
    const values = projectByValues(group, raw);
    if (values.length === 0) {
      // No row has a value: a string is then a literal color, and an
      // accessor has nothing to read, so the mark keeps its default.
      if (typeof raw === "function")
        resolved = { ...resolved, [key]: undefined };
      continue;
    }
    if (values.length > 1) {
      const what =
        typeof raw === "string" ? `"${raw}"` : "the accessor's value";
      throw new Error(
        `[gofish] ${type}({ ${key} }): ${what} is not constant across the ` +
          `connected group; make sure the flow this ${type} fuses over ` +
          `groups by that value (or one it agrees with) — or, over a refs ` +
          `bag, add \`flow(group({ by }))\` — or pass an explicit ` +
          `${paint[key] === "raw" ? "value" : "color"}.`
      );
    }
    resolved = {
      ...resolved,
      [key]:
        paint[key] === "raw"
          ? values[0]
          : colorValue(values[0], typeof raw === "string" ? raw : undefined),
    } as O;
  }
  return resolved;
}

declare const relationalMarkBrand: unique symbol;

/**
 * The mark a relational factory (`createRelationalMark`: `line`, `ribbon`,
 * `time.transition`) returns. It is a `NameableMark` whose type remembers that
 * it may fuse: `ChartBuilder.mark()` gives a relational mark a
 * `ChartBuilder | LayerBuilder` result (it rewrites to a two-tier layer when
 * the chart has its own flow), and every other mark a plain `ChartBuilder`.
 * `.name()`, `.label()`, `.zOrder()`, `.hidden()` and `.transition()` carry the fusion tag
 * forward, so they keep the brand; `.translate()` wraps the mark in a fresh
 * one without the tag, so it returns a plain `NameableMark`.
 */
export type RelationalMark = Mark<any> &
  Omit<
    NameableMark<any>,
    "name" | "label" | "zOrder" | "hidden" | "transition"
  > & {
    readonly [relationalMarkBrand]: true;
    name(...args: Parameters<NameableMark<any>["name"]>): RelationalMark;
    label(...args: Parameters<NameableMark<any>["label"]>): RelationalMark;
    zOrder(...args: Parameters<NameableMark<any>["zOrder"]>): RelationalMark;
    hidden(...args: Parameters<NameableMark<any>["hidden"]>): RelationalMark;
    transition(
      ...args: Parameters<NameableMark<any>["transition"]>
    ): RelationalMark;
  };

/**
 * The mark `enclose(opts)` returns: a relational mark that may also stand in
 * `.flow(...)` (`withFlowStep`). Every modifier keeps the tag, so each
 * returns a `FlowStepMark`.
 */
export type FlowStepMark = Mark<any> &
  Operator<any, any> &
  Omit<
    RelationalMark,
    "name" | "label" | "zOrder" | "hidden" | "transition"
  > & {
    name(...args: Parameters<NameableMark<any>["name"]>): FlowStepMark;
    label(...args: Parameters<NameableMark<any>["label"]>): FlowStepMark;
    zOrder(...args: Parameters<NameableMark<any>["zOrder"]>): FlowStepMark;
    hidden(...args: Parameters<NameableMark<any>["hidden"]>): FlowStepMark;
    transition(
      ...args: Parameters<NameableMark<any>["transition"]>
    ): FlowStepMark;
    translate(
      ...args: Parameters<NameableMark<any>["translate"]>
    ): FlowStepMark;
  };

export function createRelationalMark<O extends Record<string, unknown>>(
  type: string,
  produce: (
    opts: StripLive<O>,
    children: GoFishAST[],
    inferred: InferredRelational,
    /** The key of the group of the default split this connector threads;
     *  undefined when the bag is not split. */
    key?: string,
    /** The chart's named layers, where the mark is applied to a chart's
     *  data (a `selectAll(...)` an option names resolves against it);
     *  undefined in the combinator form. */
    layerContext?: LayerContext
  ) => any,
  config: {
    /** A TEMPORAL connector (`time.transition()`): its path tier is the
     *  flow's `time.sequence(...)` rather than a spatial tier, so
     *  `applyDefaultRelational` resolves `along` from the time tier and hands
     *  the clock down through `inferred.time`. */
    temporal?: boolean;
    /** The bag mark may also stand in `.flow(...)` (`enclose`, its
     *  descriptor's `flowStep`): there it is applied to each group's
     *  subtree as its one fresh operand (`flowStepOperator` in compose.ts),
     *  and reads its per-group channels off that operand's rows. */
    flowStep?: boolean;
  } = {}
) {
  function relational(
    options: O | undefined,
    children: GoFishAST[]
  ): GoFishNode;
  function relational(options?: O): RelationalMark;
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
    // A strategy kind used bare is read as its value from here on.
    const opts = withKindValues((options ?? {}) as O);
    const liveChannels = liveChannelsOf(opts);
    // Its `filter` filters each connector's whole drawing; checked once.
    const filter = displayFilter(
      opts.filter as FilterOption | undefined,
      `${type}({ filter })`
    );
    /** The cell `ChartBuilder` writes the computed split / travel direction /
     *  time tier into — see `tagRelationalFusable`'s doc comment. Declared
     *  here, not inside the bag branch below, because `produce` reads it on
     *  every branch. */
    const inferred: InferredRelational = {};
    /** The datum of a connector: the rows it was drawn through, in draw
     *  order (its operands' datums, concatenated), with their column types,
     *  like any leaf's. A field one group agrees on reads off any row
     *  (`d[0].species`), and a projection reads it off all of them
     *  (`projectPath(d, "species")`). Undefined when the operands carry no
     *  data. */
    const groupDatumOf = (operands: GoFishAST[]): unknown[] | undefined => {
      const datums: unknown[][] = operands
        .map((o) => (o as any).datum)
        .filter((d) => d !== undefined);
      if (datums.length === 0) return undefined;
      return datums.reduce<unknown[]>(
        (rows, d) => copyColumnTypes(rows, d),
        datums.flat()
      );
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
      // A fresh operand (a node the connector holds as its own child, as
      // `enclose(opts, [spread(...)])` does) is painted by the connector,
      // over its own drawing: only operands placed elsewhere need the
      // paint-below default.
      tagRelationalOperands(
        node,
        operands.filter((o) => !(o instanceof GoFishNode && o.parent === node))
      );
      if (datum !== undefined && (node as any).datum === undefined)
        (node as any).datum = datum;
      if (liveChannels)
        (node as any).__gfLive = { ...(node as any).__gfLive, ...liveChannels };
      return applyFilter(node, filter);
    };
    /** Build one connector over `operands` from `o`: its paint (and other
     *  per-group channels) read off the rows `group` reaches, its live
     *  channels at `datum`, tagged by `finish`. */
    const build = async (
      o: O,
      group: unknown,
      operands: GoFishAST[],
      datum: unknown,
      key?: string,
      layerContext?: LayerContext
    ): Promise<GoFishNode> => {
      const paint = await resolveGroupPaint(type, o, group);
      // The one call of its `produce`, with its `live()` channels evaluated
      // at resolve, in the scope of the context it is applied in.
      const node = await withRegistrar(layerContext?.registrar, () =>
        produce(
          resolveLive(paint, datum),
          operands,
          inferred,
          key,
          layerContext
        )
      );
      return finish(node as GoFishNode, operands, datum);
    };
    /** The rows a bag of operands reaches: each operand's datum (a ref's is
     *  its node's, a node's its own). */
    const rowsOf = (operands: GoFishAST[]): unknown[] =>
      operands.map((o) => (o as any).datum);

    // Low-level combinator form: connect the given children directly.
    if (children !== undefined) {
      // The children may be a PROMISE of an array rather than an array: `map`
      // is async, so the low-level `line(opts, map(rows, ...))` form hands one
      // in. `produce` awaits it internally; the group datum and the operand
      // tagging are read off the children too, so they have to await it as
      // well. The result stays a thenable carrying the node methods, which is
      // what this form already returned (`produce` is itself async).
      // The combinator form carries its IR tag (`tagCombinator`), so a
      // chart that holds it serializes it with its children.
      const built = addRenderMethod(
        (async () => {
          // The same child list every combinator takes: marks, promises and
          // nested arrays reify to nodes (`reifyChildren`).
          const operands = await reifyChildren(children);
          // The connector's paint is read off its operands' data.
          return build(
            opts,
            rowsOf(operands),
            operands,
            groupDatumOf(operands)
          );
        })()
      );
      return tagCombinator(
        built,
        type,
        opts,
        children
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
      const mark: Mark<any[]> = async (rows: any[], _key, layerContext) => {
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
            // An edge's paint is read off its own row; its datum is the
            // one-row list `[row]`.
            const datum = [row];
            return build(opts, datum, [a, b], datum, undefined, layerContext);
          })
        );
        return Layer({}, segments);
      };
      const result = withWire(nameableMark(mark), { type, opts });
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
    const mark: Mark<GoFishRef[]> = async (
      d: GoFishRef[],
      _key,
      layerContext
    ) => {
      const split = inferred.split;
      const dir = (opts as any).dir ?? inferred.dir;
      // Only allocate a copy when there's actually an inferred `dir` to
      // splice in — `produce` (line/ribbon's Connect call) reads `o.dir` off
      // whatever opts object it's given, defaulting to "x" itself when
      // absent, so this is a no-op when nothing was inferred.
      const baseOpts: O =
        (opts as any).dir === undefined && dir !== undefined
          ? ({ ...opts, dir } as O)
          : opts;

      if (split !== undefined) {
        const entries = splitByTiers(split, d);
        const nodes = await Promise.all(
          [...entries].map(([key, groupRefs]) =>
            build(
              baseOpts,
              rowsOf(groupRefs),
              groupRefs,
              groupDatumOf(groupRefs),
              key,
              layerContext
            )
          )
        );
        return Layer({}, nodes);
      }

      // Unsplit: one connector through the whole bag, treated as a single
      // group for `resolveGroupPaint`.
      return build(
        baseOpts,
        rowsOf(d),
        d,
        groupDatumOf(d),
        undefined,
        layerContext
      );
    };
    const result = withWire(nameableMark(mark), { type, opts });
    tagRelationalFusable(result, type, opts, inferred, config.temporal);
    withFlowStep(result, config.flowStep);
    return result;
  }
  return relational;
}

export type LineOptions = FilterOptions & {
  fill?: MaybeValue<string> | LiveValue;
  stroke?: MaybeValue<string> | LiveValue;
  strokeWidth?: number | LiveValue;
  strokeDasharray?: string;
  opacity?: number | LiveValue;
  blendMode?: BlendMode;
  // Screen-space path shape, made by a call in the Curve family
  // (`Curve.bezier()`, `Curve.orthogonal()`, `Curve.arc({ direction })`,
  // `Curve.perfectArrows({ bow })`, …). The single path-shaping key.
  curve?: Curve;
  dir?: "x" | "y";
  // Anchors: pin each endpoint to a normalized point on its mark's bbox
  // (Bluefish-style `Line`) instead of the center — for ropes, node-link edges,
  // etc. `curve` routes the line between the anchor points; omitted, an
  // anchored line is straight.
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
  /** The shape form: each row's position. Given, the line owns its rows and
   *  draws one path per group through them, sorted by `x`. */
  x?: ShapeChannel;
  y?: ShapeChannel;
};

/** A position or value channel of the shape form of `ribbon` and `line`:
 *  read once per row (a column name, an accessor, or a `field(...)`
 *  expression), or a function expression read at the mark's parameter t
 *  (`fun(...)`, `f.domain()`). */
export type ShapeChannel =
  | string
  | ((d: any) => unknown)
  | FieldExpr
  | FunctionExpr;

/** The options only the connector form of `ribbon` and `line` reads. */
const CONNECTOR_ONLY = [
  "dir",
  "from",
  "to",
  "along",
  "source",
  "target",
  "emX",
  "emY",
] as const;

/**
 * The shape form of `ribbon` and `line`: a mark that owns its rows and
 * builds one {@link Band} node per group, through them. `parameter` and
 * `value` name the two channels it reads per row: `x` and `h` for
 * `ribbon({ x, h })`, `y` and `w` for `ribbon({ y, w })`, `x` and `y` for
 * `line({ x, y })`. A ribbon's values are amounts from a baseline, which its
 * parent places, and it is filled; a line's are positions, and it is a path.
 * Its paint is read once per group, as the connector's is
 * (`resolveGroupPaint`).
 */
function shapeForm(
  type: "ribbon" | "line",
  options: Record<string, any>,
  axis: 0 | 1,
  parameter: string,
  value: string
): NameableMark<any> {
  const opts = withKindValues(options);
  for (const key of CONNECTOR_ONLY)
    if (opts[key] !== undefined)
      throw new Error(
        `[gofish] ${type}({ ${parameter}, ${key} }): \`${key}\` belongs to ` +
          `the connector form, which joins marks another flow placed. The ` +
          `shape form, with \`${parameter}\`, places its own rows; remove ` +
          `\`${key}\`, or drop \`${parameter}\` for the connector form.`
      );
  for (const key of type === "line" ? ["h", "w"] : [axis === 0 ? "w" : "h"])
    if (opts[key] !== undefined)
      throw new Error(
        `[gofish] ${type}({ ${parameter}, ${key} }): the shape form reads ` +
          `${parameter} and ${value}; \`${key}\` is not one of its channels.`
      );
  if (opts[value] === undefined)
    throw new Error(
      `[gofish] ${type}({ ${parameter} }): the shape form needs \`${value}\` ` +
        `too, the value at each ${parameter}.`
    );
  const curve = (opts.curve ?? monotone()) as Curve;
  if (!["linear", "step", "monotone", "smooth"].includes(curve.kind))
    throw new Error(
      `[gofish] ${type}({ ${parameter}, curve: Curve.${curve.kind}() }): the ` +
        `shape form reads its curve over ${parameter}, so it takes ` +
        `Curve.linear(), Curve.step(), Curve.monotone() or Curve.smooth().`
    );
  const closed = type === "ribbon";
  const filter = displayFilter(
    opts.filter as FilterOption | undefined,
    `${type}({ filter })`
  );
  const liveChannels = liveChannelsOf(opts);
  const channels = (MARK_CHANNELS as Record<string, Record<string, string>>)[
    type
  ];
  const mark: Mark<any[]> = async (rows, key, given) => {
    const layerContext = markContext(given);
    const pending = resolveChannelAccessors(opts, channels, () => rows);
    const accessors = isThenable(pending) ? await pending : pending;
    const paint = await resolveGroupPaint(type, accessors, rows);
    const o = withLiveStatics(paint, liveChannels, rows) as Record<string, any>;
    // A channel that holds a function expression (a function value, or a
    // reduce that returns a function for this group) gives the mark a
    // parameter t, which every function channel is read at; rows are not
    // read at t.
    const ofT =
      groupFun(o[parameter], rows) !== undefined ||
      groupFun(o[value], rows) !== undefined;
    if (ofT && opts.curve !== undefined)
      throw new Error(
        `[gofish] ${type}({ ${parameter}, ${value}, curve }): a curve says ` +
          `how a ${type} runs between its rows, but these channels hold ` +
          `functions of t, which run as they are. Remove curve.`
      );
    const along = { name: parameter, accessor: o[parameter] };
    const values = {
      name: value,
      accessor: o[value],
      kind: closed ? ("amount" as const) : ("position" as const),
    };
    const node = withRegistrar(layerContext.registrar, () =>
      Band({
        axis,
        ...(ofT
          ? bandOfFunctions(type, rows, along, values, key)
          : bandOfRows(
              type,
              rows,
              along,
              values,
              curve as ParameterCurve,
              key
            )),
        origin: closed ? "free" : "pinned",
        closed,
        inset: opts.inset,
        fill: o.fill,
        stroke: o.stroke,
        strokeWidth: o.strokeWidth,
        strokeDasharray: o.strokeDasharray,
        opacity: o.opacity,
        blendMode: o.blendMode,
      })
    );
    if (liveChannels) (node as any).__gfLive = liveChannels;
    applyFilter(node, filter);
    return sealComponent(node, rows);
  };
  return withWire(nameableMark(mark), { type, opts: options });
}

// `line`'s connector form: one open edge from each mark to the next, from
// its center (the whole box, which the curve's route reads) or from the
// `source`/`target` points on it.
const lineConnector = createRelationalMark<LineOptions>(
  "line",
  (o, children, inferred) =>
    Connect(
      {
        direction: o.dir ?? "x",
        edges: [{ source: o.source, target: o.target }],
        // Omitted, the curve of a line through its marks' centers is "auto":
        // connect smooths it (monotone) when the marks share a continuous
        // connection axis, else draws it straight. An anchored line's
        // (`source`/`target`) is straight: the smoothing reads the operands'
        // centers as samples of one continuous variable, and an edge pinned
        // to points on its operands is not that.
        curve:
          o.curve ??
          (o.source !== undefined || o.target !== undefined
            ? linearCurve()
            : undefined),
        discreteCurve: linearCurve(),
        fill: o.fill,
        stroke: o.stroke,
        strokeWidth: o.strokeWidth ?? 1,
        strokeDasharray: o.strokeDasharray,
        opacity: o.opacity,
        blendMode: o.blendMode,
        along: inferred.along,
        parameterAxis: inferred.parameterAxis,
      },
      children
    )
);

/**
 * `line` has two forms, picked by whether a position channel is given:
 *
 * - `line({ x, y })`, the shape form: the mark owns its rows and draws one
 *   path per group through them, sorted by `x` ({@link shapeForm}).
 * - `line(opts)` with no `x` or `y`, the connector form: the path between
 *   the centers of consecutive marks another flow placed, over a ref bag, a
 *   pairwise `{ from, to }`, or a combinator's children.
 */
export function line(
  options: LineOptions & { x: ShapeChannel; y: ShapeChannel }
): NameableMark<any>;
export function line(
  options: LineOptions | undefined,
  children: GoFishAST[]
): GoFishNode;
export function line(options?: LineOptions): RelationalMark;
export function line(
  options?: LineOptions,
  children?: GoFishAST[]
): GoFishNode | Mark<any> {
  if (options?.x === undefined && options?.y === undefined)
    return children === undefined
      ? lineConnector(options)
      : lineConnector(options, children);
  if (children !== undefined)
    throw new Error(
      "[gofish] line({ x, y }, children): the shape form draws its own rows; " +
        "the combinator form joins its children. Drop x and y to join the " +
        "children."
    );
  if (options.x === undefined)
    throw new Error(
      "[gofish] line({ y }): the shape form needs `x` too: a line runs " +
        "through its rows sorted by x."
    );
  return shapeForm("line", options, 0, "x", "y");
}

export type RibbonOptions = FilterOptions & {
  fill?: MaybeValue<string> | LiveValue;
  stroke?: MaybeValue<string> | LiveValue;
  strokeWidth?: number | LiveValue;
  opacity?: number | LiveValue;
  blendMode?: BlendMode;
  dir?: "x" | "y";
  // Screen-space path shape for the band edges: a curve that draws a band
  // edge (`drawsBandEdge` in `routers.ts`), such as `Curve.bezier()` or
  // `Curve.orthogonal()`. `Curve.arc()` and `Curve.perfectArrows()` throw.
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
  // In the shape form they are the band's values: a column, or a function
  // expression read at the mark's parameter t.
  w?: number | string | Value<number> | FieldExpr | FunctionExpr;
  h?: number | string | Value<number> | FieldExpr | FunctionExpr;
  emX?: boolean;
  emY?: boolean;
  /** The shape form: pixels the band is drawn in by, from each end of its
   *  parameter and up from its baseline, so the bands of a partition's
   *  cells are drawn apart. It changes only what is drawn: the band's box
   *  is the same. */
  inset?: number;
  /** The shape form: each row's position along the band, or a function
   *  expression's `domain()`. `x` with `h` is a band over x, of height h
   *  from its baseline; `y` with `w` is a band over y, of width w. */
  x?: ShapeChannel;
  y?: ShapeChannel;
};

// `ribbon`'s connector form: two edges, the near and far sides of a band,
// each from the far face of one mark to the near face of the next along
// `dir`, closed into a filled region (sankey ribbons, bands between discrete
// marks, stacked areas). Its curve draws a band edge (`ribbon` checks it).
const ribbonConnector = createRelationalMark<RibbonOptions>(
  "ribbon",
  (o, children, inferred) => {
    const main = o.dir ?? "x";
    const cross = main === "x" ? "y" : "x";
    const side = (m: AnchorAlignment, c: AnchorAlignment): AnchorSpec =>
      ({ [main]: m, [cross]: c }) as AnchorSpec;
    return Connect(
      {
        direction: main,
        edges: [
          { source: side("end", "start"), target: side("start", "start") },
          { source: side("end", "end"), target: side("start", "end") },
        ],
        closed: true,
        // Omitted ⇒ "auto": a smooth (monotone) band over a continuous
        // connection axis, else a bezier band.
        curve: o.curve,
        discreteCurve: bezier(),
        blendMode: o.blendMode ?? "normal",
        fill: o.fill,
        stroke: o.stroke,
        strokeWidth: o.strokeWidth ?? 0,
        opacity: o.opacity,
        along: inferred.along,
        parameterAxis: inferred.parameterAxis,
      },
      children
    );
  }
);

/**
 * `ribbon` has two forms, picked by whether a position channel is given:
 *
 * - `ribbon({ x, h })` or `ribbon({ y, w })`, the shape form: the mark owns
 *   its rows and draws one band per group, from its baseline to `h` (or
 *   `w`) at each row's `x` (or `y`), sorted by it ({@link shapeForm}).
 * - `ribbon(opts)` with no `x` or `y`, the connector form: a band between
 *   the facing edges of consecutive marks another flow placed, over a ref
 *   bag, a pairwise `{ from, to }`, or a combinator's children.
 */
export function ribbon(
  options: RibbonOptions & ({ x: ShapeChannel } | { y: ShapeChannel })
): NameableMark<any>;
export function ribbon(
  options: RibbonOptions | undefined,
  children: GoFishAST[]
): GoFishNode;
export function ribbon(options?: RibbonOptions): RelationalMark;
export function ribbon(
  options?: RibbonOptions,
  children?: GoFishAST[]
): GoFishNode | Mark<any> {
  if (options?.x === undefined && options?.y === undefined) {
    for (const [key, at] of [
      ["h", "x"],
      ["w", "y"],
    ] as const)
      if (isFunValue(options?.[key]))
        throw new Error(
          `[gofish] ribbon({ ${key} }): ${key} holds a function of t, which ` +
            `the shape form reads; give it ${at} too, the function's ` +
            `domain: ribbon({ ${at}: f.domain(), ${key}: f }).`
        );
    if (options?.inset !== undefined)
      throw new Error(
        "[gofish] ribbon({ inset }): inset draws in the band of the shape " +
          "form, ribbon({ x, h }) or ribbon({ y, w }). The connector form " +
          "joins the edges of other marks, which it does not draw in."
      );
    const kind = curveName(options?.curve, "ribbon({ curve })");
    if (kind !== undefined && !drawsBandEdge(options!.curve!))
      throw new Error(
        `[gofish] ribbon({ curve: Curve.${kind}() }): a ribbon is the band ` +
          `between two edges that each run along its axis (dir), one value ` +
          `across it at each point along it, and this curve does not draw ` +
          `such an edge. An arc or a perfect-arrows bow turns back along ` +
          `the axis, and an elbow with bend: "auto" picks an axis for each ` +
          `edge on its own, so two of them bound no band. Use one of ` +
          bandEdgeCurveNames()
            .map((name) => `Curve.${name}()`)
            .join(", ") +
          `.`
      );
    return children === undefined
      ? ribbonConnector(options)
      : ribbonConnector(options, children);
  }
  if (children !== undefined)
    throw new Error(
      "[gofish] ribbon({ x }, children): the shape form draws its own rows; " +
        "the combinator form joins its children. Drop x and y to join the " +
        "children."
    );
  if (options.x !== undefined && options.y !== undefined)
    throw new Error(
      "[gofish] ribbon({ x, y }): the shape form runs along one axis: " +
        "ribbon({ x, h }) is a band over x, ribbon({ y, w }) a band over y."
    );
  return options.x !== undefined
    ? shapeForm("ribbon", options, 0, "x", "h")
    : shapeForm("ribbon", options, 1, "y", "w");
}

/**
 * Draw an outline around nodes, under them: their padded bounding box
 * (`Shape.box()`, the default), the smallest ellipse around them
 * (`Shape.oval()`), the padded members with arc corners (`Shape.fillet()`), or
 * a smooth region (`Shape.blob()`, `Shape.hull()`, `Shape.spine()`). The node
 * is built in `graphicalOperators/enclose.tsx`.
 *
 * - `enclose(opts, children)`: around the children. Fresh children are laid
 *   out as `layer` lays them out; `ref(...)` children and `.relate()`
 *   operands are enclosed where they are.
 * - `chart(selectAll(name)).mark(enclose(opts))`: around the selected nodes,
 *   one outline per group when the flow groups them.
 * - `chart(rows).flow(..., enclose(opts), ...)`: around each group's subtree,
 *   laid out with it, so the operator above packs or places the outline.
 */
const encloseMark = createRelationalMark<EncloseOptions>(
  "enclose",
  (o, children, _inferred, _key, layerContext) =>
    encloseNode(o as EncloseResolved, children, layerContext),
  { flowStep: true }
);
export function enclose(
  options: EncloseOptions | undefined,
  children: GoFishAST[]
): GoFishNode;
/** The bag form in `.mark(...)`, the flow step in `.flow(...)`. */
export function enclose(options?: EncloseOptions): FlowStepMark;
export function enclose(
  options?: EncloseOptions,
  children?: GoFishAST[]
): GoFishNode | FlowStepMark {
  return children === undefined
    ? (encloseMark(options) as unknown as FlowStepMark)
    : encloseMark(options, children);
}

/**
 * `blank()` — an invisible positioning guide: a hidden `rect`. It takes part
 * in layout, carries a datum, anchors refs (`selectAll`) and seeds the color
 * scale exactly as a `rect` does, and it never paints: `.hidden()` has no
 * effect on it, `fill` reaches the color scale only, and it takes no
 * paint-only options (stroke, corner radius). Like any hidden mark it keeps
 * its shape, so under a compositor a blank operand gives its box. See `Blank`
 * in `shapes/rect.tsx`.
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
} = {}): Mark<T[]> {
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

/* ---- mark-combinator forms for layer and the compositing operators ---- */

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
  hidden(value?: HiddenValue<T>): RelatableMark<T>;
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
  apply: async (node, _layerContext, datum, fn) => {
    await node.relate(fn, datum);
  },
} satisfies ModifierConfig<[fn: RelateFn]>;

function makeRelatableMark<T>(base: Mark<T>): RelatableMark<T> {
  return attachModifiers(base, [
    nameModifier,
    labelModifier,
    relateModifier,
    zOrderModifier,
    hiddenModifier,
  ]) as unknown as RelatableMark<T>;
}

/**
 * Mark-combinator form of layer. Resolves each child against the per-datum
 * data and wraps the resulting nodes in a Layer. Children may be anything a
 * mark position holds (`resolveMarkResult`):
 *   - Mark functions (called with the parent's data),
 *   - charts and chains (an empty scope binds the parent's data),
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
  const withChildren =
    (children: readonly MarkChild[]): Mark<T> =>
    async (d, key, _layerContext) => {
      // A layer establishes its OWN name scope: `.name(...)` registrations of
      // its children go into a registry nested in the enclosing one
      // (`LayerContext.child`). A `ref(name)`/`selectAll(name)` reads the
      // nearest scope that has the name (`LayerContext.lookup`), so a layer
      // repeated per `spread` cell finds its own cell's `bars`, while a
      // `selectAll("bars")` outside the spread gathers every cell's. Resolve
      // sequentially so a child referencing a name sees earlier siblings'
      // registrations.
      const sharedContext = markContext(_layerContext).child();
      const resolved: GoFishNode[] = [];
      for (const m of children) {
        // Each child is a mark position over this layer's rows: an empty-scope
        // `chart()` child (or a chain whose first tier is one) binds them
        // (issue #243, #1181), as in every combinator and `.mark(...)`.
        resolved.push(await resolveMarkResult(m, sharedContext, d, key));
      }
      const node = await Layer(opts, resolved);
      node.datum = datumOfInput(d as unknown[]);
      // Its `.relate()` clauses are resolved in the same context.
      node._names = sharedContext;
      return node;
    };
  // Each child is applied to the layer's own input.
  const base = forwardInputsResolver(withChildren(marks), marks, (children) =>
    withChildren(children as MarkChild[])
  );
  return tagCombinator(makeRelatableMark(base), "layer", opts, marks);
}

/** The mark-combinator form of a compositing operator (porterDuff.tsx):
 *  `union([a, b])` or `union(opts, [a, b, ...])`. `irType` is its wire
 *  type, the same name. */
function makeCompositeCombinator<O extends object>(
  lowLevel: (opts: any, children: any) => any,
  irType: string
) {
  function fn<T>(marks: MarkChild[]): NameableMark<T>;
  function fn<T>(opts: O, marks: MarkChild[]): NameableMark<T>;
  function fn<T>(
    optsOrMarks: O | MarkChild[],
    maybeMarks?: MarkChild[]
  ): NameableMark<T> {
    const opts = Array.isArray(optsOrMarks) ? {} : optsOrMarks;
    const marks = (Array.isArray(optsOrMarks) ? optsOrMarks : maybeMarks) ?? [];
    const withChildren =
      (children: readonly MarkChild[]): Mark<T> =>
      async (d, key, given) => {
        const layerContext = markContext(given);
        const operands = await Promise.all(
          children.map((m) => resolveMarkResult(m, layerContext, d, key))
        );
        // Its paint (`fill` and `stroke`) is read off its input, as a
        // connector's is off the group it threads.
        const paintOpts = await resolveGroupPaint(irType, opts, d);
        const node = await lowLevel(paintOpts, operands);
        node.datum = datumOfInput(d as unknown[]);
        return node;
      };
    // Each child is applied to the combinator's own input.
    const base = forwardInputsResolver(withChildren(marks), marks, (children) =>
      withChildren(children as MarkChild[])
    );
    return tagCombinator(nameableMark(base), irType, opts, marks);
  }
  return fn;
}

// The second arg is the IR/serialize wire type, which is the public name.
export const union = makeCompositeCombinator<UnionOptions>(Union, "union");
export const intersect = makeCompositeCombinator<IntersectOptions>(
  Intersect,
  "intersect"
);
export const subtract = makeCompositeCombinator<SubtractOptions>(
  Subtract,
  "subtract"
);
export const exclude = makeCompositeCombinator<ExcludeOptions>(
  Exclude,
  "exclude"
);
export const atop = makeCompositeCombinator<AtopOptions>(Atop, "atop");

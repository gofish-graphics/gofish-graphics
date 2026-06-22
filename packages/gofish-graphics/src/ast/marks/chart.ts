import { sumBy, v, Connect } from "../../lib";
import chunk from "lodash/chunk";
import { GoFishNode } from "../_node";
import type { Value } from "../data";
import { GoFishRef } from "../_ref";
import type { Token } from "../createName";
import { type ColorConfig } from "../colorSchemes";

export type { ColorConfig };
import { inferSize } from "../channels";
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
  LayerContext,
} from "./createOperator";
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

export type { Mark, Operator };
export { generatedRect as rect };
export type { LayerContext };

import {
  ChartBuilder,
  LayerBuilder,
  chart,
  resolveRefData,
} from "./chartBuilder";
import type { ChartOptions } from "./chartBuilder";
import { projectPath } from "../datumProjection";
export { ChartBuilder, LayerBuilder, chart };
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

export function log<T>(label?: string): Operator<T, T> {
  const op: Operator<T, T> = async (mark: Mark<T>) => {
    return (async (
      d: T,
      key?: string | number,
      layerContext?: LayerContext
    ) => {
      if (label) {
        console.log(label, d);
      } else {
        console.log(d);
      }
      return mark(d, key, layerContext);
    }) as Mark<T>;
  };
  (op as any).__serialize = {
    type: "log",
    opts: label !== undefined ? { label } : {},
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
  fill?: string | keyof T;
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
    const resolvedFill =
      typeof fill === "string" && datum && fill in datum
        ? v(datum[fill as string])
        : (fill as Value<string> | undefined);
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
    (node as any).datum = d;
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

// line() mark connects data points using center-to-center mode.
// Two forms:
//  - bag form: `line()` over a `GoFishRef[]` (e.g. `selectAll(...)`) — one
//    polyline through all the refs.
//  - pairwise form: `line({ from, to })` over rows whose `from`/`to` columns
//    hold refs (after `resolve(...)`) — one segment per row (node-link edges).
export function line(options?: {
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  interpolation?: "linear" | "bezier";
  from?: string;
  to?: string;
}): Mark<any> {
  if (options?.from !== undefined && options?.to !== undefined) {
    return pairwiseConnect("line", options, {
      mode: "center",
      strokeWidth: options.strokeWidth ?? 1,
      interpolation: options.interpolation ?? "linear",
    });
  }
  const mark: Mark<GoFishRef[]> = async (
    d: GoFishRef[],
    _key?: string | number,
    _layerContext?: LayerContext
  ) => {
    // `selectAll(...)` resolves to one ref per named node; connect them.
    return Connect(
      {
        direction: 0, // x direction
        mode: "center",
        stroke: options?.stroke,
        strokeWidth: options?.strokeWidth ?? 1,
        opacity: options?.opacity,
        interpolation: options?.interpolation ?? "linear",
      },
      d
    );
  };
  (mark as any).__serialize = { type: "line", opts: options ?? {} };
  return mark;
}

// Shared pairwise (per-row) connector: each row carries two ref-valued columns
// (`from`/`to`, populated by `resolve(...)`); emit one Connect per row and
// stack them in a Layer. Backs the `{ from, to }` form of `line`/`area`.
function pairwiseConnect(
  irType: "line" | "area",
  options: {
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    interpolation?: "linear" | "bezier";
    mixBlendMode?: "normal" | "multiply";
    dir?: "x" | "y";
    from?: string;
    to?: string;
  },
  connectOpts: {
    mode: "center" | "edge";
    strokeWidth: number;
    interpolation: "linear" | "bezier";
  }
): Mark<any> {
  const from = options.from as string;
  const to = options.to as string;
  const mark: Mark<any[]> = async (
    rows: any[],
    _key?: string | number,
    _layerContext?: LayerContext
  ) => {
    const segments = await Promise.all(
      rows.map(async (row) => {
        const a = row[from];
        const b = row[to];
        if (!(a instanceof GoFishRef) || !(b instanceof GoFishRef)) {
          throw new Error(
            `${irType}({ from: "${from}", to: "${to}" }): columns "${from}"/"${to}" ` +
              `must hold node refs — run resolve(["${from}", "${to}"], ` +
              `{ from: selectAll(...) }) in the flow first.`
          );
        }
        const node = await Connect(
          {
            direction: options.dir ?? 0,
            mode: connectOpts.mode,
            stroke: options.stroke,
            strokeWidth: connectOpts.strokeWidth,
            opacity: options.opacity,
            interpolation: connectOpts.interpolation,
            mixBlendMode: options.mixBlendMode,
          },
          [a, b]
        );
        (node as any).datum = row;
        return node;
      })
    );
    return Layer({}, segments);
  };
  (mark as any).__serialize = { type: irType, opts: options };
  return mark;
}

// area() mark connects data points using edge-to-edge mode
export function area(options?: {
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  mixBlendMode?: "normal" | "multiply";
  dir?: "x" | "y";
  interpolation?: "linear" | "bezier";
  from?: string;
  to?: string;
}): Mark<any> {
  if (options?.from !== undefined && options?.to !== undefined) {
    return pairwiseConnect("area", options, {
      mode: "edge",
      strokeWidth: options.strokeWidth ?? 0,
      interpolation: options.interpolation ?? "bezier",
    });
  }
  const mark: Mark<GoFishRef[]> = async (
    d: GoFishRef[],
    _key?: string | number,
    _layerContext?: LayerContext
  ) => {
    // `selectAll(...)` resolves to one ref per named node; connect them.
    return Connect(
      {
        direction: options?.dir ?? "x",
        mode: "edge",
        mixBlendMode: options?.mixBlendMode ?? "normal",
        stroke: options?.stroke,
        strokeWidth: options?.strokeWidth ?? 0,
        opacity: options?.opacity,
        interpolation: options?.interpolation ?? "bezier",
      },
      d
    );
  };
  (mark as any).__serialize = { type: "area", opts: options ?? {} };
  return mark;
}

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
  w?: number | (keyof T & string);
  h?: number | (keyof T & string);
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
  apply: (node, _layerContext, fn) => {
    node.constrain(fn);
  },
});

function makeConstrainableMark<T>(base: Mark<T>): ConstrainableMark<T> {
  return attachModifiers(base, [
    nameModifier,
    labelModifier,
    constrainModifier,
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
  const base: Mark<T> = async (d, key, layerContext) => {
    // Share one layerContext across all children so that ref(name)/
    // selectAll(name) in one child can find a sibling's .name(name)
    // registration. Inherit from the caller when present (nested-layer case),
    // else create a fresh context (top-level .render() case). Resolve
    // sequentially so a child referencing a name sees registrations from
    // earlier siblings.
    const sharedContext = layerContext ?? {};
    const resolved: GoFishNode[] = [];
    for (const m of marks) {
      const result = typeof m === "function" ? m(d, key, sharedContext) : m;
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

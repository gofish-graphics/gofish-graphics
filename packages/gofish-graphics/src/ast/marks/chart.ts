import { sumBy, v, Connect, ref } from "../../lib";
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
  LayerContext,
} from "./createOperator";
import { layer as Layer } from "../graphicalOperators/layer";
import {
  over as Over,
  inside as Inside,
  xor as Xor,
  out as Out,
  atop as Atop,
  mask as Mask,
} from "../graphicalOperators/porterDuff";
import type { ConstraintRef, ConstraintSpec } from "../constraints";

export type { Mark, Operator };
export { generatedRect as rect };
export type { LayerContext };

import { ChartBuilder, LayerSelector, chart } from "./chartBuilder";
import type { ChartOptions } from "./chartBuilder";
export { ChartBuilder, LayerSelector, chart };
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

export { chunk } from "lodash";

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

// select() returns a lazy selector that defers layer lookup until actually needed
// This allows layers to be registered by .name() on marks before select() tries to access them
export function select<T>(layerName: string): LayerSelector<T> {
  return new LayerSelector<T>(layerName);
}

// line() mark connects data points using center-to-center mode
export function line<T extends Record<string, any>>(options?: {
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  interpolation?: "linear" | "bezier";
}): Mark<Array<T & { __ref?: GoFishNode }>> {
  const mark: Mark<Array<T & { __ref?: GoFishNode }>> = async (
    d: Array<T & { __ref?: GoFishNode }>,
    key?: string | number,
    _layerContext?: LayerContext
  ) => {
    // Use refs from enriched data (lazy resolution via __ref)
    const refs = d.map((item) => {
      if ("__ref" in item && item.__ref) {
        return ref(item.__ref);
      }
      throw new Error("line mark expected __ref on items");
    });

    return Connect(
      {
        direction: 0, // x direction
        mode: "center",
        stroke: options?.stroke,
        strokeWidth: options?.strokeWidth ?? 1,
        opacity: options?.opacity,
        interpolation: options?.interpolation ?? "linear",
      },
      refs
    );
  };
  (mark as any).__serialize = { type: "line", opts: options ?? {} };
  return mark;
}

// area() mark connects data points using edge-to-edge mode
export function area<T extends Record<string, any>>(options?: {
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  mixBlendMode?: "normal" | "multiply";
  dir?: "x" | "y";
  interpolation?: "linear" | "bezier";
}): Mark<Array<T & { __ref?: GoFishNode }>> {
  const mark: Mark<Array<T & { __ref?: GoFishNode }>> = async (
    d: Array<T & { __ref?: GoFishNode }>,
    key?: string | number,
    _layerContext?: LayerContext
  ) => {
    // Use refs from enriched data (lazy resolution via __ref)
    const refs = d.map((item) => {
      if ("__ref" in item && item.__ref) {
        return ref(item.__ref);
      }
      throw new Error("area mark expected __ref on items");
    });

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
      refs
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
};

function makeConstrainableMark<T>(base: Mark<T>): ConstrainableMark<T> {
  const withName = (layerName: string | Token): ConstrainableMark<T> => {
    const named: Mark<T> = async (d, key, layerContext) => {
      const node = await resolveMarkResult(
        base(d, key, layerContext),
        layerContext
      );
      node.name(layerName);
      // Tag for a deterministic post-resolve collection pass instead of
      // pushing directly into `layerContext` here — the push order would
      // otherwise depend on which leg's `await` happened to finish first
      // (parents fan their children out via `Promise.all`, and any async
      // op in the chain — e.g. a Python `derive` RPC — varies per-leaf
      // latency). ChartBuilder.resolve walks the finished node tree in
      // parent-iteration order so consumers see canonical order. Tokens
      // are hygienic handles and don't participate in the string-keyed
      // layerContext registry, so we only tag for string names.
      if (layerContext && typeof layerName === "string" && layerName) {
        (node as { __layerRegistration?: string }).__layerRegistration =
          layerName;
      }
      return node;
    };
    // Propagate the IR-serialize tag through the chain and record the
    // layerName in its `name` slot. Without this, `.name(...)` on a
    // combinator-form mark (layer, Porter-Duff, …) would strip the tag
    // and toJSON would fail.
    const baseTag = (base as any).__serialize;
    if (baseTag && typeof layerName === "string") {
      (named as any).__serialize = { ...baseTag, name: layerName };
    } else if (baseTag) {
      (named as any).__serialize = baseTag;
    }
    return makeConstrainableMark(named);
  };
  const withLabel = (
    accessor: LabelAccessor,
    options?: LabelOptions
  ): ConstrainableMark<T> => {
    const labeled: Mark<T> = async (d, key, layerContext) => {
      const node = await resolveMarkResult(
        base(d, key, layerContext),
        layerContext
      );
      node.label(accessor, options);
      return node;
    };
    const baseTag = (base as any).__serialize;
    if (baseTag && typeof accessor === "string") {
      (labeled as any).__serialize = {
        ...baseTag,
        label: {
          accessor,
          ...(options && typeof options === "object" ? options : {}),
        },
      };
    } else if (baseTag) {
      (labeled as any).__serialize = baseTag;
      if (
        typeof accessor === "function" &&
        typeof console !== "undefined" &&
        typeof console.warn === "function"
      ) {
        // Function accessors don't serialize; the mark stays serializable
        // but the label is dropped from the emitted IR.
        console.warn(
          "[gofish-ir] .label(fn): function accessors aren't serializable; " +
            "label will be omitted from the emitted IR. Use a string field " +
            "name if you need the label to round-trip."
        );
      }
    }
    return makeConstrainableMark(labeled);
  };
  const withConstrain = (
    fn: (refs: Record<string, ConstraintRef>) => ConstraintSpec[]
  ): ConstrainableMark<T> => {
    const constrained: Mark<T> = async (d, key, layerContext) => {
      const node = await resolveMarkResult(
        base(d, key, layerContext),
        layerContext
      );
      node.constrain(fn);
      return node;
    };
    return makeConstrainableMark(constrained);
  };
  const render = async (
    container: Parameters<GoFishNode["render"]>[0],
    options: Parameters<GoFishNode["render"]>[1]
  ) => {
    const node = await resolveMarkResult(base(undefined as any));
    return node.render(container, options);
  };
  Object.defineProperty(base, "name", {
    value: withName,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(base, "label", {
    value: withLabel,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(base, "constrain", {
    value: withConstrain,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(base, "render", {
    value: render,
    writable: true,
    configurable: true,
  });
  return base as ConstrainableMark<T>;
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
    // Share one layerContext across all children so that select(name) in
    // one child can find a sibling's .name(name) registration. Inherit from
    // the caller when present (nested-layer case), else create a fresh
    // context (top-level .render() case). Resolve sequentially so a child
    // using select(...) sees registrations from earlier siblings.
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

export const atop = makePorterDuffCombinator(Atop, "atop");
export const over = makePorterDuffCombinator(Over, "over");
export const inside = makePorterDuffCombinator(Inside, "inside");
export const xor = makePorterDuffCombinator(Xor, "xor");
export const out = makePorterDuffCombinator(Out, "out");
export const mask = makePorterDuffCombinator(Mask, "mask");

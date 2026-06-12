/**
 * cut: an expand-kind mark that slices a single source shape (image or rect)
 * into N clipped sub-shapes 1:1 with input data. Layout (spread, stack, etc.)
 * is handled by an upstream operator — cut just produces the slices.
 *
 * Chart-flow form (sizes derived from data):
 *
 *   chart(data)
 *     .flow(spread({ dir: "x" }))
 *     .mark(image({ href, w, h }).cut({ dir: "y", size: "amount" }))
 *
 * Low-level form (explicit sizes, no data needed):
 *
 *   Spread({ dir: "x" }, await image({ href, w, h }).cut({
 *     dir: "y",
 *     sizes: [10, 20, 15],
 *   })([{}, {}, {}], undefined, {}))
 *
 * Internally each slice is a `mask([regionRect, translatedSource])` — the
 * region rect defines the visible portion, the source shape is translated so
 * the requested portion lines up under the rect.
 */
import { GoFishAST } from "../_ast";
import { GoFishNode } from "../_node";
import { Mark } from "../types";
import {
  resolveMarkResult,
  NameableMark,
  LayerContext,
} from "../marks/createOperator";
import { mask as Mask } from "./porterDuff";
import { Rect } from "../shapes/rect";
import { createMark, createNodeOperator } from "../withGoFish";
import { getValue, isValue } from "../data";

/** Shape props the cut factory's shape function receives after channel
 *  resolution. `size` is already an array (or undefined) regardless of how
 *  the caller passed it. */
type CutShapeProps = {
  source: Mark<any>;
  dir: "x" | "y";
  size?: number[];
  inset?: number;
};

/** User-facing cut options (when calling `cut(source, opts)` directly). */
export type CutMarkOptions = {
  dir: "x" | "y";
  /** Slice proportions. Accepts a field name (resolved per-row from data),
   *  an explicit `number[]` of pixel extents, or undefined for equal slices. */
  size?: string | number[];
  /** Pixels removed from each slice's source region (split half on each side
   *  along `dir`). Creates a "chunk taken out" effect on every slice. Default 0. */
  inset?: number;
};

/**
 * A single-child wrapper that translates its child along `dir` by `offset`
 * pixels. Used to position the source shape so the requested portion lines
 * up with the slice's mask region.
 */
const translateNode = createNodeOperator<
  { dir: 0 | 1; offset: number },
  GoFishAST
>((opts, children) => {
  if (children.length !== 1) {
    throw new Error("translateNode expects exactly one child");
  }
  const { dir, offset } = opts;
  const dx = dir === 0 ? offset : 0;
  const dy = dir === 1 ? offset : 0;
  return new GoFishNode(
    {
      type: "cut-translate",
      shared: [false, false],
      resolveUnderlyingSpace: (childSpaces) => childSpaces[0] ?? [],
      layout: (_shared, size, scaleFactors, layoutChildren, posScales) => {
        const child = layoutChildren[0].layout(size, scaleFactors, posScales);
        child.place("x", 0, "baseline");
        child.place("y", 0, "baseline");
        return {
          intrinsicDims: [
            {
              min: child.dims[0].min ?? 0,
              size: child.dims[0].size ?? 0,
              center: child.dims[0].center ?? 0,
              max: child.dims[0].max ?? 0,
            },
            {
              min: child.dims[1].min ?? 0,
              size: child.dims[1].size ?? 0,
              center: child.dims[1].center ?? 0,
              max: child.dims[1].max ?? 0,
            },
          ],
          transform: { translate: [undefined, undefined] },
        };
      },
      render: ({ transform }, renderedChildren) => {
        const tx = (transform?.translate?.[0] ?? 0) + dx;
        const ty = (transform?.translate?.[1] ?? 0) + dy;
        return (
          <g transform={`translate(${tx}, ${ty})`}>{renderedChildren[0]}</g>
        );
      },
    },
    children
  );
});

/** Build one slice node at (offset, offset+extent) in source coords. */
async function buildSliceNode(
  source: Mark<any>,
  dirIdx: 0 | 1,
  sourceDimAlong: number,
  offset: number,
  extent: number,
  crossExtent: number,
  inset: number,
  datum: any,
  layerContext?: LayerContext
): Promise<GoFishNode> {
  const insetExtent = Math.max(0, extent - inset);
  const insetOffset = offset + inset / 2;

  // Image and rect render with an internal scale(1, -1) that flips their
  // y-axis so the source is right-side up in chart-y space. To bring source
  // pixels [insetOffset, insetOffset + insetExtent] into slice-local
  // [0, insetExtent] on y, translate by -(sourceDimAlong - insetOffset -
  // insetExtent), not -insetOffset. The x axis has no such flip.
  const translateOffset =
    dirIdx === 1 ? -(sourceDimAlong - insetOffset - insetExtent) : -insetOffset;

  const sliceW = dirIdx === 0 ? insetExtent : crossExtent;
  const sliceH = dirIdx === 1 ? insetExtent : crossExtent;

  const regionRect = await Rect({
    x: 0,
    y: 0,
    w: sliceW,
    h: sliceH,
    fill: "white",
  });
  const sourceNode = await resolveMarkResult(source(undefined), layerContext);
  const translated = await translateNode(
    { dir: dirIdx, offset: translateOffset },
    [sourceNode]
  );
  const node = (await Mask({}, [regionRect, translated])) as GoFishNode;
  // Stamp datum so .name(layerName) registers the original row for select().
  (node as any).datum = datum;
  return node;
}

/**
 * Build N slice nodes from explicit sizes — used when an upstream layout
 * operator already has the data and just needs the geometry.
 */
async function buildSlicesFromSizes(
  source: Mark<any>,
  opts: CutMarkOptions,
  sizes: number[],
  data: any[],
  layerContext?: LayerContext
): Promise<GoFishNode[]> {
  const probe = await resolveMarkResult(source(undefined), layerContext);
  const dirIdx: 0 | 1 = opts.dir === "x" ? 0 : 1;
  const crossIdx: 0 | 1 = dirIdx === 0 ? 1 : 0;
  const probeArgs: any = (probe as any).args;
  const sourceDimAlong: number | undefined = probeArgs?.dims?.[dirIdx]?.size;
  const sourceDimCross: number | undefined = probeArgs?.dims?.[crossIdx]?.size;
  if (typeof sourceDimAlong !== "number") {
    throw new Error(
      `cut: source shape must have an explicit ${
        opts.dir === "x" ? "w" : "h"
      } (got ${JSON.stringify(sourceDimAlong)})`
    );
  }
  if (typeof sourceDimCross !== "number") {
    throw new Error(
      `cut: source shape must have an explicit ${
        opts.dir === "x" ? "h" : "w"
      } (cross axis); v1 cannot infer it from intrinsic dimensions`
    );
  }

  const inset = opts.inset ?? 0;
  let offset = 0;
  const nodes: GoFishNode[] = [];
  for (let i = 0; i < sizes.length; i++) {
    const extent = sizes[i];
    const datum = data[i] ?? null;
    nodes.push(
      await buildSliceNode(
        source,
        dirIdx,
        sourceDimAlong,
        offset,
        extent,
        sourceDimCross,
        inset,
        datum,
        layerContext
      )
    );
    offset += extent;
  }
  return nodes;
}

/**
 * Resolve the entry-flagged `size` channel value into pixel extents along
 * `dir`. createMark hands us either:
 *  - undefined: no `size` was given → equal slices.
 *  - a number[] / MaybeValue<number>[]: the per-row extents (either passed
 *    directly by the caller, or mapped per-row from a field name).
 *
 * For the field-name case, the values are raw sums; we normalize them to
 * proportions of `sourceDimAlong`. For the explicit-array case, values are
 * already in source pixels; pass through.
 *
 * The `sizeFromField` flag distinguishes the two paths — when true, treat
 * values as relative weights and scale; when false (literal array), keep as-is.
 */
function resolveExtents(
  size: any,
  sourceDimAlong: number,
  sizeFromField: boolean
): number[] {
  if (size === undefined) return [];
  const arr: number[] = Array.isArray(size)
    ? size.map((v) =>
        typeof v === "number" ? v : isValue(v) ? (getValue(v) ?? 0) : 0
      )
    : [];
  if (!sizeFromField) return arr;
  const total = arr.reduce((a, b) => a + b, 0) || 1;
  return arr.map((w) => (w / total) * sourceDimAlong);
}

/**
 * Attach a `.cut(opts)` method onto an existing mark. The method returns
 * `cut(mark, opts)` — the chained sugar form. Propagates through `.name()`
 * and `.label()` so chained calls retain `.cut`.
 */
export function attachCut<M>(mark: M): M {
  if (typeof mark !== "function") return mark;
  const m: any = mark;
  Object.defineProperty(m, "cut", {
    value: (cutOpts: CutMarkOptions) => cut(m, cutOpts),
    writable: true,
    configurable: true,
  });
  for (const methodName of ["name", "label"] as const) {
    const original = m[methodName];
    if (typeof original === "function") {
      Object.defineProperty(m, methodName, {
        value: (...args: any[]) => attachCut(original.call(m, ...args)),
        writable: true,
        configurable: true,
      });
    }
  }
  return mark;
}

/**
 * The cut shape function. createMark resolves the `size` channel before
 * calling us — by the time we run, `size` is either undefined (equal
 * slices) or an array of extents. We probe the source for its dir-axis
 * extent, normalize the extents, and emit N clipped slice nodes.
 *
 * `sizeFromField` is a flag on the props that tells us whether the array
 * came from a field-name resolution (= relative weights, need scaling) or
 * was passed explicitly by the caller (= absolute pixel extents).
 */
async function cutShape(
  props: CutShapeProps & { __sizeFromField: boolean },
  data?: any[]
): Promise<GoFishNode[]> {
  const items = data ?? [];
  const probe = await resolveMarkResult(props.source(undefined));
  const dirIdx: 0 | 1 = props.dir === "x" ? 0 : 1;
  const probeArgs: any = (probe as any).args;
  const sourceDimAlong: number | undefined = probeArgs?.dims?.[dirIdx]?.size;
  if (typeof sourceDimAlong !== "number") {
    throw new Error(
      `cut: source shape must have an explicit ${
        props.dir === "x" ? "w" : "h"
      } (got ${JSON.stringify(sourceDimAlong)})`
    );
  }

  let extents: number[];
  if (props.size === undefined) {
    const n = items.length;
    extents = n > 0 ? Array(n).fill(sourceDimAlong / n) : [];
  } else {
    extents = resolveExtents(props.size, sourceDimAlong, props.__sizeFromField);
  }

  return buildSlicesFromSizes(
    props.source,
    { dir: props.dir, inset: props.inset },
    extents,
    items
  );
}

const cutFactory = createMark<
  CutShapeProps & { __sizeFromField: boolean },
  { size: { type: "size"; entry: true } }
>(
  cutShape as any,
  { size: { type: "size", entry: true } },
  undefined,
  { kind: "expand" }
);

/**
 * Build a cut mark. The mark is expand-kind — when invoked with data it
 * returns N slice nodes 1:1 with the data array.
 *
 * Wraps `cutFactory` with the `(source, opts)` signature users prefer; the
 * `__sizeFromField` flag is computed here so the shape function doesn't have
 * to inspect raw input.
 */
export function cut(
  source: Mark<any>,
  opts: CutMarkOptions
): NameableMark<any> {
  return cutFactory({
    source,
    dir: opts.dir,
    size: opts.size,
    inset: opts.inset,
    __sizeFromField: typeof opts.size === "string",
  } as any);
}

/**
 * cut: slice a single source shape (image or rect) into N clipped sub-shapes
 * along `dir`. cut NEVER lays out — it always returns an ARRAY of slice nodes
 * and leaves arrangement to a combinator (Stack/Spread) or upstream operator.
 *
 * Two surfaces, one core:
 *
 * 1. Pure user-space `cut(source, { dir, size, inset? })` → `Promise<GoFishNode>[]`,
 *    usable synchronously as combinator children:
 *
 *      Stack({ dir: "y" }, cut(image({ href, w: 193, h: 600 }),
 *        { dir: "y", size: bottleData.map((d) => datum(d.amount)) }))
 *
 *      Spread({ dir: "y", spacing: 20, reverse: true },
 *        cut(rect({ w: 400, h: 80 }), { dir: "x", size: [100, 100, 200] }))
 *
 *    `size` is a `(number | DatumValue)[]` with a field/datum/literal-style
 *    trichotomy (issue #266), resolved with CSS-flexbox semantics:
 *      - raw `number` = ABSOLUTE source pixels (a fixed "flex-basis" item).
 *        It claims its pixels in place; if the absolutes alone exceed the
 *        source extent along `dir`, we throw.
 *      - `datum(n)` = RELATIVE weight (a flex item). The datum entries split
 *        the REMAINDER (source extent − sum of absolutes) in proportion to
 *        their weights. All-datum = the remainder is the whole extent.
 *      - mixing the two is well-defined (fixed caps + weighted middle), but
 *        we throw if the remainder ≤ 0 (datums with no room) or if datum
 *        entries carry incompatible measure tags (a unit error).
 *    N = `size.length`. Equal slices = `Array(n).fill(datum(1))`.
 *
 * 2. The v3 expand-mark form `image({...}).cut({ dir, size, inset })` stays,
 *    built ON the pure function. Its `size` additionally accepts a field-name
 *    string (resolved per-row → datum-provenance, i.e. relative weights) or
 *    `undefined` (equal slices, N from data). It resolves sizes and delegates
 *    to the pure `cut`. Datum stamping for `selectAll` is handled by the mark
 *    factory's expand path (see createMark).
 *
 * Internally each slice is `mask([regionRect, offset(source)])` — the region
 * rect defines the visible portion, and the source shape is shifted (via the
 * public `offset` operator) so the requested portion lines up under the rect.
 */
import { GoFishNode } from "../_node";
import { Mark } from "../types";
import {
  resolveMarkResult,
  attachTransformModifiers,
} from "../marks/createOperator";
import { mask as Mask } from "./porterDuff";
import { offset as offsetOp } from "./offset";
import { Rect } from "../shapes/rect";
import { createMark } from "../withGoFish";
import { datum, getValue, getMeasure, isValue, type Value } from "../data";
import { mergeAllMeasures } from "../underlyingSpace";

/** User-facing options for the pure `cut(source, opts)` form. */
export type CutOptions = {
  dir: "x" | "y";
  /** Slice extents along `dir`, resolved flexbox-style. Raw numbers = absolute
   *  source pixels (fixed items); `datum(n)` = relative weights that split the
   *  remainder after the fixed items. The two compose (fixed caps + weighted
   *  middle). */
  size: Value<number>[];
  /** Pixels removed from each slice's source region (split half on each side
   *  along `dir`). Creates a "chunk taken out" effect on every slice. Default 0. */
  inset?: number;
};

/** Options for the v3 expand-mark form `mark.cut(opts)`. Adds the field-name /
 *  undefined sugar on top of the pure form's `size`. */
export type CutMarkOptions = {
  dir: "x" | "y";
  /** Field name (per-row datum weights), an explicit `(number | DatumValue)[]`
   *  array (same as the pure form), or undefined for equal slices. */
  size?: string | Value<number>[];
  inset?: number;
};

/** Shape props the cut mark factory's shape function receives after channel
 *  resolution. `size` is already an array (or undefined) — the entry-flagged
 *  size channel maps a field name to a per-row `datum()` array for us. */
type CutShapeProps = {
  source: Mark<any>;
  dir: "x" | "y";
  size?: Value<number>[];
  inset?: number;
};

/** Build one slice node spanning source coords [offset, offset+extent). */
async function buildSliceNode(
  source: Mark<any>,
  dirIdx: 0 | 1,
  sourceDimAlong: number,
  offset: number,
  extent: number,
  crossExtent: number,
  inset: number
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
  const sourceNode = await resolveMarkResult(source(undefined));
  const translated = await offsetOp(
    dirIdx === 0 ? { x: translateOffset } : { y: translateOffset },
    [sourceNode]
  );
  return (await Mask({}, [regionRect, translated])) as GoFishNode;
}

/**
 * Resolve a `(number | DatumValue)[]` `size` array into pixel extents along
 * `dir` using CSS-flexbox semantics: fixed-width items sit next to flex items.
 *   - raw `number` entries are ABSOLUTE source pixels; they claim their pixels
 *     first, in place.
 *   - `datum(n)` entries are RELATIVE weights; they split the *remainder*
 *     (source extent − sum of absolutes) proportionally to their weights.
 *
 * The two degenerate ends are exactly as before: an all-absolute array passes
 * its pixels through (remainder unused); an all-datum array has remainder =
 * the whole extent, so the weights normalize over the full source.
 *
 * Throws on the genuinely meaningless cases:
 *   (a) the absolutes alone already sum to more than the source extent
 *       (the fixed claims don't fit);
 *   (b) there are datum entries but the remainder is ≤ 0 (no flex space left
 *       for them to fill);
 *   (c) two datum entries carry different, both-defined measure tags
 *       (incompatible units). Untagged entries are permissive — they unify
 *       with anything. The comparison reuses {@link mergeAllMeasures}, the same
 *       undefined-permissive measure unification the underlying-space type
 *       system uses (#527).
 */
function resolveExtents(
  size: Value<number>[],
  sourceDimAlong: number,
  dir: "x" | "y"
): number[] {
  const dimName = dir === "x" ? "width" : "height";
  const isAbsolute = (v: Value<number>): v is number => typeof v === "number";

  const absoluteTotal = size.reduce<number>(
    (sum, v) => (isAbsolute(v) ? sum + v : sum),
    0
  );
  if (absoluteTotal > sourceDimAlong + 1e-6) {
    throw new Error(
      `cut: absolute slice sizes sum to ${absoluteTotal}px but the source ` +
        `${dimName} is only ${sourceDimAlong}px along "${dir}". Reduce the ` +
        `fixed sizes so they fit within the source, or use datum() weights to ` +
        `fill it exactly.`
    );
  }

  const datumEntries = size.filter((v): v is Exclude<Value<number>, number> =>
    isValue(v)
  );
  if (datumEntries.length === 0) {
    // All-absolute: pass the fixed pixels through unchanged.
    return size as number[];
  }

  // Datum entries split the remainder left after the fixed claims (flexbox).
  const remainder = sourceDimAlong - absoluteTotal;
  if (remainder <= 1e-6) {
    throw new Error(
      `cut: \`size\` has datum() weights but the absolute sizes already ` +
        `consume the entire source ${dimName} (${sourceDimAlong}px along ` +
        `"${dir}"), leaving no room (${remainder}px) for the weighted slices. ` +
        `Reduce the fixed sizes so a positive remainder is left to distribute.`
    );
  }

  // Incompatible-measures guard: datum entries with different, both-defined
  // measure tags are a unit error. mergeAllMeasures is undefined-permissive
  // (untagged entries unify with anything) and throws on a real conflict.
  mergeAllMeasures(
    datumEntries.map((v) => getMeasure(v)),
    `cut: \`size\` datum() weights carry incompatible measures`
  );

  const weightTotal =
    datumEntries.reduce((sum, v) => sum + (Number(getValue(v)) || 0), 0) || 1;
  return size.map((v) =>
    isAbsolute(v) ? v : ((Number(getValue(v)) || 0) / weightTotal) * remainder
  );
}

/**
 * The core, pure cut. Probes `source` for its extent along `dir`, resolves the
 * `size` array into pixel extents, and returns N slice promises (one per `size`
 * element) — N is `size.length`, known synchronously, so the array is usable as
 * combinator children right away while each slice resolves asynchronously.
 */
export function cut(
  source: Mark<any>,
  opts: CutOptions
): Promise<GoFishNode>[] {
  const { dir, size, inset = 0 } = opts;
  if (!Array.isArray(size)) {
    throw new Error(
      `cut: \`size\` must be an array of numbers or datum() values (got ` +
        `${JSON.stringify(size)}).`
    );
  }

  // One shared probe + extent resolution; every slice awaits it.
  const geom = (async () => {
    const probe = await resolveMarkResult(source(undefined));
    const dirIdx: 0 | 1 = dir === "x" ? 0 : 1;
    const crossIdx: 0 | 1 = dirIdx === 0 ? 1 : 0;
    const probeArgs: any = (probe as any).args;
    const sourceDimAlong: number | undefined = probeArgs?.dims?.[dirIdx]?.size;
    const sourceDimCross: number | undefined =
      probeArgs?.dims?.[crossIdx]?.size;
    if (typeof sourceDimAlong !== "number") {
      throw new Error(
        `cut: source shape must have an explicit ${
          dir === "x" ? "w" : "h"
        } (got ${JSON.stringify(sourceDimAlong)})`
      );
    }
    if (typeof sourceDimCross !== "number") {
      throw new Error(
        `cut: source shape must have an explicit ${
          dir === "x" ? "h" : "w"
        } (cross axis); v1 cannot infer it from intrinsic dimensions`
      );
    }
    const extents = resolveExtents(size, sourceDimAlong, dir);
    const offsets: number[] = [];
    let acc = 0;
    for (const e of extents) {
      offsets.push(acc);
      acc += e;
    }
    return { dirIdx, sourceDimAlong, sourceDimCross, extents, offsets };
  })();

  return size.map((_, i) =>
    geom.then((g) =>
      buildSliceNode(
        source,
        g.dirIdx,
        g.sourceDimAlong,
        g.offsets[i],
        g.extents[i],
        g.sourceDimCross,
        inset
      )
    )
  );
}

/**
 * The cut shape function for the v3 expand-mark form. createMark resolves the
 * entry-flagged `size` channel before calling us — a field name becomes a
 * per-row `datum()` array, an explicit array passes through, and `undefined`
 * stays `undefined`. We default `undefined` to equal slices (`datum(1)` ×N from
 * the data length) and delegate to the pure `cut`. The mark factory's expand
 * path stamps each returned node's datum for `selectAll`.
 */
async function cutShape(
  props: CutShapeProps,
  data?: any[]
): Promise<GoFishNode[]> {
  const items = data ?? [];
  const size: Value<number>[] =
    props.size === undefined ? Array(items.length).fill(datum(1)) : props.size;
  return Promise.all(
    cut(props.source, { dir: props.dir, size, inset: props.inset })
  );
}

const cutFactory = createMark<
  CutShapeProps,
  { size: { type: "size"; entry: true } }
>(cutShape as any, { size: { type: "size", entry: true } }, undefined, {
  kind: "expand",
});

/**
 * Build the v3 expand-kind cut mark directly from an options object — the
 * deserializer entry point for a `cut` mark used in a chart `.mark(...)`
 * position. Equivalent to `source.cut(opts)` / what `attachCut` produces, but
 * callable without first having the source mark in hand as a method receiver.
 * The frontend-IR deserializer reconstructs `source` from its mark-spec and
 * passes it here. (As a combinator CHILD, a `cut` IR node is instead expanded
 * into its N slice nodes via the pure {@link cut} — see the serializer.)
 */
export function cutMark(opts: {
  source: Mark<any>;
  dir: "x" | "y";
  size?: string | Value<number>[];
  inset?: number;
}): Mark<any> {
  return cutFactory(opts as any) as unknown as Mark<any>;
}

/**
 * Attach a `.cut(opts)` method onto an existing mark. `.cut` is a transform
 * modifier — it maps the mark to the expand-kind cut mark built from
 * `cutFactory`. `attachTransformModifiers` keeps it available across
 * `.name()`/`.label()` chains.
 */
export function attachCut<M>(mark: M): M {
  if (typeof mark !== "function") return mark;
  return attachTransformModifiers(mark as object, [
    {
      name: "cut",
      transform: (m, cutOpts) =>
        cutFactory({
          source: m as Mark<any>,
          dir: (cutOpts as CutMarkOptions).dir,
          size: (cutOpts as CutMarkOptions).size,
          inset: (cutOpts as CutMarkOptions).inset,
        } as any),
    },
  ]) as M;
}

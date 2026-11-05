// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Axes — /internals/frontend/axes
// </gofish-wiki>

import { GoFishNode } from "../_node";
import type { GoFishAST } from "../_ast";
import { displayDims, type Size } from "../dims";
import type { DisplayList } from "gofish-ir";
import { lowerStyle, rectItemFromBox } from "../displayList/lowerHelpers";
import { UNDEFINED, type UnderlyingSpace } from "../underlyingSpace";
import { ref } from "../shapes/ref";
import { boxExtent } from "../extent";

/** One end of an {@link axisSpan}: an edge of a laid-out node. */
export type SpanEnd = { node: GoFishNode; edge: "start" | "end" };

/**
 * The stretch of an ordinal axis between two edges of laid-out nodes, along
 * axis `dim`: from one slot's start to another's end (the run of slots a
 * level's label is centered under), or from one slot's end to the next one's
 * start (the gap a divider sits in). It reads the two nodes through `ref`s,
 * as an ordinal label reads its slot, so it is placed along `dim` by its own
 * layout. Across the axis it is `cross` pixels deep and free, so the axis
 * seats it past the content.
 *
 * With `line`, it draws a line one pixel wide in its middle, `cross` pixels
 * long: a divider centered in the gap between two groups. A divider
 * separates regions, so the axis makes it as long as the rows whose regions
 * break in its gap (see `elaborateOrdinalAxis`). Without, it draws
 * nothing and is only a box to center a label on.
 */
export function axisSpan(opts: {
  dim: 0 | 1;
  from: SpanEnd;
  to: SpanEnd;
  cross: number;
  line?: { color: string };
}): GoFishNode {
  const { dim, from, to, cross, line } = opts;
  const refs = [ref(from.node), ref(to.node)] as unknown as GoFishAST[];
  const node = new GoFishNode(
    {
      type: "axisSpan",
      resolveUnderlyingSpace: (): Size<UnderlyingSpace> => [
        UNDEFINED,
        UNDEFINED,
      ],
      // Across the axis it is `cross` pixels deep, a size of its own (#493);
      // along it, its length is where layout puts the slots it reads.
      resolveExtent: (_ce, _cs, spaces) =>
        dim === 0
          ? [undefined, boxExtent(spaces[1], 0, cross)]
          : [boxExtent(spaces[0], 0, cross), undefined],
      layout: (size, _scales, layoutChildren) => {
        const [a, b] = layoutChildren.map((c) =>
          c.layout(size, [undefined, undefined])
        );
        const edge = (p: typeof a, e: "start" | "end") =>
          (e === "start" ? p.dims[dim].min : p.dims[dim].max) ?? 0;
        const lo = edge(a, from.edge);
        const hi = edge(b, to.edge);
        const along = { min: Math.min(lo, hi), size: Math.abs(hi - lo) };
        const across = { min: 0, size: cross };
        return {
          intrinsicDims: dim === 0 ? [along, across] : [across, along],
          // Placed along `dim` by its layout (the refs' edges), free across.
          transform: { translate: dim === 0 ? [0, undefined] : [undefined, 0] },
          renderData: undefined,
        };
      },
      lower: ({
        intrinsicDims,
        transform,
        toPixel,
      }): DisplayList.DisplayItem[] => {
        if (line === undefined) return [];
        const d = displayDims(intrinsicDims, transform);
        const mid = d[dim].center ?? 0;
        const c = 1 - dim;
        const [lo, hi] = [d[c].min ?? 0, d[c].max ?? 0];
        const box =
          dim === 0
            ? ([mid - 0.5, mid + 0.5, lo, hi] as const)
            : ([lo, hi, mid - 0.5, mid + 0.5] as const);
        return [
          rectItemFromBox(...box, toPixel!, {
            style: lowerStyle({
              fill: line.color,
              stroke: line.color,
              strokeWidth: 0,
            }),
            role: "overlay",
          }),
        ];
      },
    },
    refs
  );
  // It reads its place along the axis from refs, so it is ink there
  // (`GoFishNode.inkOn`). Without a line it is only a box to center a label
  // on: across it, it has no depth and is wherever its layout left it, so
  // it is ink there too.
  node.inkOn = line === undefined ? [true, true] : alongOnly(dim);
  node.placedByLayout = alongOnly(dim);
  return node;
}

/** Per axis, true only along axis `dim`. */
const alongOnly = (dim: 0 | 1): [boolean, boolean] =>
  dim === 0 ? [true, false] : [false, true];

/**
 * The box a start-aligned label of an ordinal axis is centered on, along
 * axis `dim`: `width` pixels long (the label's extent along the axis),
 * starting at the boundary its run begins at and running into the run. The
 * boundary is the middle of the gap between the run's first slot (`first`)
 * and the slot before it (`prev`), where a divider sits, and the box starts
 * `pad` pixels past it; for the axis's first run (no `prev`) it is the
 * first slot's start, the axis start. Which way the run runs is read off
 * the layout, from the axis's first slot (`axisFirst`) toward its last
 * (`axisLast`), so a reversed or bottom-up axis puts the box on the run's
 * side too. Like {@link axisSpan}, it reads the slots through `ref`s, is
 * placed along `dim` by its own layout, and is free across it (no depth).
 */
export function runStartBox(opts: {
  dim: 0 | 1;
  axisFirst: GoFishNode;
  axisLast: GoFishNode;
  first: GoFishNode;
  prev?: GoFishNode;
  width: number;
  pad: number;
}): GoFishNode {
  const { dim, axisFirst, axisLast, first, prev, width, pad } = opts;
  const nodes = [axisFirst, axisLast, first, ...(prev ? [prev] : [])];
  const refs = nodes.map((n) => ref(n)) as unknown as GoFishAST[];
  const node = new GoFishNode(
    {
      type: "axisSpan",
      resolveUnderlyingSpace: (): Size<UnderlyingSpace> => [
        UNDEFINED,
        UNDEFINED,
      ],
      layout: (size, _scales, layoutChildren) => {
        const [lo, hi, f, p] = layoutChildren
          .map((c) => c.layout(size, [undefined, undefined]))
          .map((l) => [l.dims[dim].min ?? 0, l.dims[dim].max ?? 0] as const);
        const sign = hi[0] + hi[1] >= lo[0] + lo[1] ? 1 : -1;
        // The run's start edge, and the slot before's facing edge.
        const runStart = sign > 0 ? f[0] : f[1];
        const boundary =
          p === undefined
            ? runStart
            : (runStart + (sign > 0 ? p[1] : p[0])) / 2;
        const start = boundary + sign * pad;
        const along = {
          min: Math.min(start, start + sign * width),
          size: width,
        };
        const across = { min: 0, size: 0 };
        return {
          intrinsicDims: dim === 0 ? [along, across] : [across, along],
          transform: { translate: dim === 0 ? [0, undefined] : [undefined, 0] },
          renderData: undefined,
        };
      },
      lower: (): DisplayList.DisplayItem[] => [],
    },
    refs
  );
  // It reads its place along the axis from refs, and across it has no
  // depth and is wherever its layout left it: it is ink on both axes
  // (`GoFishNode.inkOn`).
  node.inkOn = [true, true];
  node.placedByLayout = alongOnly(dim);
  return node;
}

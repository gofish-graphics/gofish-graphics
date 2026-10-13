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
 * long: a divider centered in the gap between two groups. Without, it draws
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
  return new GoFishNode(
    {
      type: "axisSpan",
      shared: [false, false],
      resolveUnderlyingSpace: (): Size<UnderlyingSpace> => [
        UNDEFINED,
        UNDEFINED,
      ],
      layout: (_shared, size, _scales, layoutChildren) => {
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
}

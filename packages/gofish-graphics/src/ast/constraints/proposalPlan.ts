// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { type Size } from "../dims";
import { allocateSlices } from "./folds";

export type SliceSegment = {
  dAxis: 0 | 1;
  spacing: number;
  order: string[];
};

/** Build per-child size proposals from distribute budget segments.
 *
 * This is the top-down adjoint of the distribute SIZE fold: once a layer has a
 * concrete pixel budget, each distribute segment slices that axis among its
 * covered children. A child may be covered by at most one distribute segment per
 * axis. Otherwise the proposal would be declaration-order-sensitive because the
 * layer can hand only one size per child axis. */
export function buildDistributeSliceMap(
  segments: SliceSegment[],
  size: Size
): Map<string, Size> | undefined {
  if (segments.length === 0) return undefined;

  const out = new Map<string, Size>();
  const ownerOf = new Map<string, string>();

  for (const [segmentIndex, segment] of segments.entries()) {
    const owner = `distribute[${segmentIndex}]`;
    const slices = allocateSlices(
      size[segment.dAxis],
      segment.spacing,
      segment.order.length
    );
    segment.order.forEach((name, i) => {
      const key = `${segment.dAxis}:${name}`;
      const prior = ownerOf.get(key);
      if (prior !== undefined) {
        throw new Error(
          `Constraint.distribute proposal conflict on ${
            segment.dAxis === 0 ? "x" : "y"
          }: child "${name}" is covered by both ${prior} and ${owner}`
        );
      }
      ownerOf.set(key, owner);
      const cur = out.get(name) ?? ([size[0], size[1]] as Size);
      cur[segment.dAxis] = slices[i];
      out.set(name, cur);
    });
  }

  return out;
}

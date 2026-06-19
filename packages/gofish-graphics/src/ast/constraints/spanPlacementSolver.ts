// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import { BBox, type BBoxFacet } from "./bbox";

export type SpanAxis = "x" | "y";
const axisIndex = (axis: SpanAxis): 0 | 1 => (axis === "x" ? 0 : 1);

/** One emitted span equation: the target owns both edges on one axis. */
export interface SpanPlacement {
  target: Placeable;
  axis: SpanAxis;
  owned: { min: number; max: number };
  owner: string;
}

type SpanGroup = {
  target: Placeable;
  axis: SpanAxis;
  bbox: BBox;
  owned: Partial<Record<BBoxFacet, number>>;
  owner: string;
};

/**
 * Commit span equations as a batch. This is the size-setting counterpart to the
 * relational placement solver: all span facet claims are collected before any
 * target axis is reset, so duplicate consistent spans collapse and conflicting
 * spans diagnose independent of declaration order.
 */
export function applySpanPlacements(placements: SpanPlacement[]): void {
  const byTarget = new Map<Placeable, [SpanGroup?, SpanGroup?]>();
  const groups: SpanGroup[] = [];
  for (const placement of placements) {
    const idx = axisIndex(placement.axis);
    let axes = byTarget.get(placement.target);
    if (!axes) {
      axes = [undefined, undefined];
      byTarget.set(placement.target, axes);
    }
    let group = axes[idx];
    if (!group) {
      group = {
        target: placement.target,
        axis: placement.axis,
        bbox: new BBox(),
        owned: {},
        owner: placement.owner,
      };
      axes[idx] = group;
      groups.push(group);
    }

    for (const [facet, value] of Object.entries(placement.owned) as [
      BBoxFacet,
      number,
    ][]) {
      const conflict = group.bbox.add(facet, value, placement.owner);
      if (conflict) {
        throw new Error(
          `Constraint span conflict on ${placement.axis}: ${conflict.owner} ` +
            `asserts ${conflict.facet}=${conflict.asserted}, but ` +
            `${conflict.priorOwner} implies ${conflict.implied}`
        );
      }
      group.owned[facet] = value;
    }
  }

  for (const group of groups) {
    group.target.setExtent!(group.axis, group.owned, group.owner);
  }
}

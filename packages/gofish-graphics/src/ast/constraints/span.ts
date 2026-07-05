// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import { getValue, isValue, MaybeValue } from "../data";
import { Axis } from "./shared";
import { BBox, type BBoxKey } from "./bbox";
import * as Interval from "../../util/interval";
import { edgePinFact, type PlacementEdgePin } from "./placementFacts";
import type { PositionConstraint, PositionInterval } from "./position";
import { isPositionInterval } from "./position";

/**
 * The internal **size-setting** lowering (#39/#546) that backs the interval form
 * of `position` (`x: [min, max]`): pin BOTH edges of each target on an axis and
 * let the edges *determine the size*. This is the first consumer of the linsys
 * bbox ({@link BBox}): two anchors on one axis are rank 2, so the extent
 * (`size = max − min`) falls out — the relation scatter's `xMin`/`xMax` interval
 * channels need, which point placement's write-once protocol could not express
 * (it can pin a point, not set a size).
 *
 * Each endpoint is a literal pixel coordinate or a datum (`value(n)`) mapped
 * through the layer's posScale, exactly like a point position. The resolved
 * `(min, size)` is stamped into GoFish's `(local box, translate)` split: the
 * target's local box becomes `[0, size]` and its translate becomes the absolute
 * `min` on that axis. Kept as its own module until the rank-2 placement solve
 * (Stage 5) folds it into the general cell closure.
 */

/** One lowered span edge plus the resolved target needed to derive extent metadata. */
export interface SpanEdgeClaim {
  fact: PlacementEdgePin;
  target: Placeable;
}

interface SpanGroup {
  name: string;
  target: Placeable;
  axis: Axis;
  bbox: BBox;
  owner: string;
}

export interface SpanExtent {
  type: "span-extent";
  name: string;
  axis: Axis;
  min: number;
  max: number;
  owner: string;
  size: number;
}

/** Each endpoint contributes its datum value to the axis's POSITION domain
 *  (parallel to point coordinates in `collectPositionDomains`), so the layer
 *  builds a posScale that covers the spanned range. Literal-pixel endpoints are
 *  not data and don't contribute. */
export function spanDatumInterval(
  span: PositionInterval | undefined
): Interval.Interval | undefined {
  if (span === undefined) return undefined;
  const vals = span.filter(isValue).map((v) => getValue(v)!);
  if (vals.length === 0) return undefined;
  return Interval.interval(Math.min(...vals), Math.max(...vals));
}

/** Lower the interval-form axes of a `position` constraint to edge pins. Point
 *  axes are skipped here (they lower to a single pin via `lowerPositionPlacement`). */
export function lowerSpanEdgePins(
  constraint: PositionConstraint,
  targets: Map<string, Placeable>,
  owner: string,
  resolveCoordinate: (
    axis: Axis,
    coordinate: MaybeValue<number>
  ) => number | undefined
): SpanEdgeClaim[] {
  const out: SpanEdgeClaim[] = [];
  const emitAxis = (axis: Axis, coord: PositionConstraint["x"]) => {
    if (!isPositionInterval(coord)) return;
    const span = coord;
    const min = resolveCoordinate(axis, span[0]);
    const max = resolveCoordinate(axis, span[1]);
    if (min === undefined || max === undefined) return;
    for (const child of constraint.children) {
      const target = targets.get(child.name);
      if (!target) continue;
      out.push(
        {
          fact: edgePinFact(child.name, axis, "min", min, owner),
          target,
        },
        {
          fact: edgePinFact(child.name, axis, "max", max, owner),
          target,
        }
      );
    }
  };
  emitAxis("x", constraint.x);
  emitAxis("y", constraint.y);
  return out;
}

export function collectSpanExtents(placements: SpanEdgeClaim[]): SpanExtent[] {
  const byTarget = new Map<Placeable, [SpanGroup?, SpanGroup?]>();
  const groups: SpanGroup[] = [];
  for (const placement of placements) {
    const { fact } = placement;
    const idx = fact.axis === "x" ? 0 : 1;
    let axes = byTarget.get(placement.target);
    if (!axes) {
      axes = [undefined, undefined];
      byTarget.set(placement.target, axes);
    }
    let group = axes[idx];
    if (!group) {
      group = {
        name: fact.name,
        target: placement.target,
        axis: fact.axis,
        bbox: new BBox(),
        owner: fact.owner,
      };
      axes[idx] = group;
      groups.push(group);
    }

    const conflict = group.bbox.add(
      fact.edge as BBoxKey,
      fact.value,
      fact.owner
    );
    if (conflict) {
      throw new Error(
        `Constraint span conflict on ${fact.axis}: ${conflict.owner} ` +
          `asserts ${conflict.key}=${conflict.asserted}, but ` +
          `${conflict.priorOwner} implies ${conflict.implied}`
      );
    }
  }

  return groups.flatMap((group) => {
    const min = group.bbox.read("min");
    const max = group.bbox.read("max");
    if (min === undefined || max === undefined) return [];
    const size = max - min;
    return [
      {
        type: "span-extent",
        name: group.name,
        axis: group.axis,
        min,
        max,
        size,
        owner: group.owner,
      },
    ];
  });
}

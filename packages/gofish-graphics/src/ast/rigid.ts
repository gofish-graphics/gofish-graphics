// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

// Where a coordinate space draws something that does not warp. A rigid
// drawing (a `layer({ box: true })`, a text, an image, and a mark on an axis
// that does not embed) keeps its own shape and pixel size, so it can agree
// with a warped space at one point only. That point is the one its
// relations fix in the space (`relationsOfChildren` in relatedExtents.ts):
// the space draws the drawing with that point on the point's image, so the
// relation still holds after the transform. A drawing that nothing pins on
// an axis is placed by its middle there. It is drawn unrotated.

import type { GoFishNode } from "./_node";
import type { CoordinateTransform } from "./coordinateTransforms/coord";
import type { AlignAnchor } from "./constraints/shared";
import { displayDims, type Dimensions } from "./dims";

/** A rigid drawing's box on one axis, in its space: its two edges and its
 *  baseline (its local 0). */
export type RigidExtent = { min: number; max: number; origin: number };

/** A node's box placed in its space, as {@link RigidExtent}s: its local box
 *  (`intrinsicDims`) moved by its translate, which is also its baseline. */
export const placedExtents = (
  intrinsicDims: Dimensions | undefined,
  transform: { translate?: (number | undefined)[] } | undefined
): [RigidExtent, RigidExtent] => {
  const [x, y] = displayDims(intrinsicDims, transform).map((d, axis) => ({
    min: d.min,
    max: d.max,
    origin: transform?.translate?.[axis] ?? 0,
  }));
  return [x, y];
};

const AXIS_NAMES = ["x", "y"] as const;

/**
 * The point of `node`'s box that its relations pin on `axis`: the one point
 * they fix, or its middle when they fix none. A rigid drawing cannot keep
 * two points of its box on a space that is not linear, so two pinned points
 * there (both edges, as the middle part of a chain has) are an error.
 */
export function pinnedAnchor(
  node: GoFishNode,
  axis: 0 | 1,
  space: CoordinateTransform
): AlignAnchor {
  const { pins } = node.relations[axis];
  if (pins.length <= 1 || space.type === "linear") return pins[0] ?? "middle";
  const name = AXIS_NAMES[axis];
  throw new Error(
    `[gofish] a ${node.type} inside a "${space.type}" coordinate space is ` +
      `pinned at ${pins.join(" and ")} on ${name}. It is drawn rigid (it ` +
      `does not warp with the space), so it can keep only one point of its ` +
      `box on the space. Relate one point of it on ${name}: for example, put ` +
      `it at an end of the chain, or align it at one anchor.`
  );
}

/** The coordinate of `node`'s pinned point on `axis` ({@link
 *  pinnedAnchor}), on a box that spans `extent` there. */
export function pinnedAt(
  node: GoFishNode,
  axis: 0 | 1,
  space: CoordinateTransform,
  { min, max, origin }: RigidExtent
): number {
  const anchor = pinnedAnchor(node, axis, space);
  if (anchor === "middle") return (min + max) / 2;
  if (anchor === "baseline") return origin;
  // The box is stored in y-down pixels. Where the frame the relation acted
  // in runs y upward (direction -1, as inside every coordinate space), its
  // start is the box's bottom, the larger pixel (`axisDirection.ts`).
  const frame = (node.parent as GoFishNode | undefined)?.yFrame ?? node.yFrame;
  const upward = axis === 1 && frame.direction === -1;
  return (anchor === "start") !== upward ? min : max;
}

/**
 * The pinned point of a rigid drawing whose box in `space` is `box`, and
 * how far the space moves it: the drawing is drawn at its box moved by
 * `shift`, which puts the pinned point on its image.
 */
export function rigidPlacement(
  node: GoFishNode,
  space: CoordinateTransform,
  box: readonly [RigidExtent, RigidExtent]
): { point: [number, number]; shift: [number, number] } {
  const point: [number, number] = [
    pinnedAt(node, 0, space, box[0]),
    pinnedAt(node, 1, space, box[1]),
  ];
  const [x, y] = space.transform(point);
  return { point, shift: [x - point[0], y - point[1]] };
}

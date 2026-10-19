// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import type { GoFishNode } from "./_node";
import * as Monotonic from "../util/monotonic";
import {
  actsOn,
  literalSeats,
  type Placement,
} from "./constraints/claimPlacement";

/**
 * Placement claims (#493): where a node lands in another node's frame, as a
 * function of σ, known in the claim walk. A label sits beside its mark, at
 * the mark's edge or center plus a pixel offset, and a ref stands where its
 * target is. The claim walk already knows where each layer's constraints
 * place its children (`placeByClaims`, `GoFishNode._childBoxes`), so it knows
 * where a node deep inside a layer lands in it: the node's box, moved by each
 * ancestor's place in the next, up to the layer. So a node placed beside a
 * ref takes room where it draws, and σ is solved with it, while the mark it
 * describes stays where its own layout puts it.
 *
 * The walk goes up from `target` to the nearest node it shares with `frame`,
 * and down from there to `frame`. Each step is a layer that is not a scope
 * of its own on the axis (a size of its own solves its own σ), and every
 * node on the walk reads y in the same direction. The step into the shared node reads where it seats its
 * child without solving it (its own claim may be the one being computed): a
 * child no constraint acts on sits at its origin, and one a literal
 * position pins sits at that pixel. Anywhere else (a coordinate space, a
 * treemap tile, a band in a scope that mixes data and bands), the claim
 * walk does not know, and the node stays ink.
 */

/** Where `parent` seats `child`'s origin on `axis` without solving: 0 for a
 *  child no constraint acts on there, the pixel a literal position pins it
 *  at, else undefined. A literal start the child has of its own moves it. */
function seatIn(
  parent: GoFishNode,
  child: GoFishNode,
  axis: 0 | 1
): number | undefined {
  const operands = parent._constraintOperands?.();
  if (operands === undefined) return undefined;
  const i = parent.children.indexOf(child);
  const acting = parent.constraints.filter(
    (c) =>
      actsOn(c, axis) &&
      c.children.some((r) => operands.get(r.name)?.child === i)
  );
  const start = child._literalStart?.[axis] ?? 0;
  if (acting.length === 0) return start;
  const name = [...operands].find(([, op]) => op.direct && op.child === i)?.[0];
  const seat =
    name === undefined ? undefined : literalSeats(acting).get(name)?.[axis];
  return seat !== undefined && acting.every((c) => c.type === "position")
    ? seat + start
    : undefined;
}

/** Whether a walk may step through `n` on `axis`: a layer, not a scope of
 *  its own there, reading y as `direction` does. */
const passable = (n: GoFishNode, axis: 0 | 1, direction: number) =>
  n._childBoxes !== undefined &&
  n._ownScope?.[axis] !== true &&
  (axis === 0 || n.yFrame.direction === direction);

/** Where `target` lands in `frame`'s frame on `axis`, or undefined when the
 *  claim walk does not know. */
export function placementIn(
  target: GoFishNode,
  frame: GoFishNode,
  axis: 0 | 1
): Placement | undefined {
  const extent = target.resolveExtent()[axis];
  if (extent === undefined) return undefined;
  const up = new Set<GoFishNode>();
  for (let n: GoFishNode | undefined = frame; n; n = n.parent) up.add(n);
  let shared: GoFishNode | undefined = target.parent;
  while (shared !== undefined && !up.has(shared)) shared = shared.parent;
  if (shared === undefined) return undefined;
  const direction = shared.yFrame.direction;
  // The frame and the target read y as the shared node does: a box is in
  // its frame's axis order, so a frame that reads y the other way would
  // read every place reflected.
  if (
    axis === 1 &&
    (frame.yFrame.direction !== direction ||
      target.yFrame.direction !== direction)
  )
    return undefined;

  // The frame's origin in the shared node.
  let frameAt = 0;
  for (let n = frame; n !== shared; n = n.parent!) {
    const p = n.parent!;
    if (!passable(p, axis, direction)) return undefined;
    const seat = seatIn(p, n, axis);
    if (seat === undefined) return undefined;
    frameAt += seat;
  }

  // The target's box, in each ancestor's frame in turn.
  let lo = Monotonic.negate(extent.descent);
  let hi = extent.ascent;
  let n = target;
  while (n.parent !== shared) {
    const p = n.parent!;
    if (!passable(p, axis, direction)) return undefined;
    const box = p._childBoxes!(axis)?.get(p.children.indexOf(n));
    if (box === undefined) return undefined;
    if (n === target) {
      lo = box.lo;
      hi = box.hi;
    } else {
      // The box sits about `n`'s claim; its frame's origin is past that
      // claim's descent, and past a literal start of its own.
      const claim = n.resolveExtent()[axis];
      if (claim === undefined) return undefined;
      const origin = Monotonic.adds(
        Monotonic.add(box.lo, claim.descent),
        n._literalStart?.[axis] ?? 0
      );
      lo = Monotonic.add(lo, origin);
      hi = Monotonic.add(hi, origin);
    }
    n = p;
  }
  const seat = seatIn(shared, n, axis);
  if (seat === undefined) return undefined;
  const by = seat - frameAt;
  return { lo: Monotonic.adds(lo, by), hi: Monotonic.adds(hi, by), extent };
}

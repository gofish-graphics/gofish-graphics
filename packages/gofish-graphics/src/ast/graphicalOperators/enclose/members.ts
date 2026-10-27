// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * How `enclose` reads a placed node as blob geometry (internal; see
 * `blob.ts`). It reads the node's outlines (`geometry/outline.ts`) in the
 * enclosure's own frame, the frame its children's `dims` are read in, and
 * takes each outline's exact form where it gives one:
 *
 *  - An ellipse is a disc. One that is not a circle is the disc of its
 *    enclosing circle (its larger radius) and carries its semi-axes: the
 *    blob reads the disc, so it pads the ellipse a little more along its
 *    short axis, and the oval samples the ellipse itself.
 *  - A box (a rect's outline, or that of a node with none of its own) is a
 *    box.
 *  - An open outline (a line, an arrow's body) is its pieces, each as wide
 *    as its stroke.
 *  - A closed outline that is not filled (a polygon with fill "none") is
 *    its loop's pieces, each as wide as its stroke: a ring, whose inside is
 *    not part of the member.
 *  - A filled closed outline with no exact form (a polygon, a ribbon's band,
 *    a rotated text's glyph box) is its bounding box.
 *
 * TODO(#1207): the last rule is a declared shortcut. A filled closed outline
 * is a filled region, and the blob should hug it, but the blob has no
 * filled-ring primitive. Reading the ring as its edges hugs the shape only
 * through hole filling: with `holes: true` a large polygon's inside stays a
 * hole, and an avoided polygon keeps out only a band along its edges. The
 * fix is a filled-ring member kind in `blob.ts` (its distance, sites, link
 * widths, keep-out polygon and avoidance pivots).
 */
import type { Placeable } from "../../_node";
import {
  outlineSegments,
  placedOutlines,
  ringExtent,
  type Outline,
} from "../../geometry";
import type { BlobMember } from "./blob";

/** How far the samples of a curved outline may stray from it, in pixels. */
const TOLERANCE = 0.5;

/** An outline as blob members. */
function membersOfOutline(o: Outline): BlobMember[] {
  if (o.ellipse !== undefined) {
    const { cx, cy, rx, ry } = o.ellipse;
    const disc: BlobMember = { kind: "disc", cx, cy, r: Math.max(rx, ry) };
    return [rx === ry ? disc : { ...disc, axes: [rx, ry] }];
  }
  if (o.box !== undefined || (o.closed && o.filled)) {
    const e = ringExtent(o.box ? [o.box.min, o.box.max] : o.points);
    const [x, y] = [e.minX, e.minY];
    return [{ kind: "box", x, y, w: e.maxX - x, h: e.maxY - y }];
  }
  // An open path, or the loop of an unfilled closed one: its pieces.
  const w = o.width ?? 0;
  return outlineSegments(o).map(
    ([a, b]): BlobMember => ({
      kind: "segment",
      a,
      b,
      w,
    })
  );
}

/**
 * The blob members a placed child stands for. `placed` is the child as the
 * enclosure's layout got it back (its view of the child), so its geometry
 * and `dims` are both in the enclosure's frame.
 */
export const membersOf = (placed: Placeable): BlobMember[] =>
  placedOutlines(placed, TOLERANCE).flatMap(membersOfOutline);

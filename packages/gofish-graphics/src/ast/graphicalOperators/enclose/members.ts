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
 *  - A box (the outline of a node with none of its own) is a box.
 *  - An open outline (a line, an arrow's body) is its pieces, each as wide
 *    as its stroke.
 *  - Any other closed outline (a polygon, a ribbon's band, a rotated text's
 *    glyph box) is its edges at no width; the blob fills the inside, as it
 *    fills any hole.
 *
 * TODO(#1167): the last rule is a declared shortcut. A closed outline is a
 * filled region, but the blob has no filled-ring primitive, so the inside is
 * filled only by hole filling: with `holes: true` the inside of a large
 * polygon member stays a hole, and an avoided polygon or ribbon keeps out
 * only a band along its edges, so the blob may cover its inside. The fix is
 * a filled-ring member kind in `blob.ts` (its distance, sites, link widths,
 * keep-out polygon and avoidance pivots).
 */
import type { Placeable } from "../../_node";
import { rawPlaceable } from "../../axisDirection";
import { openRing, placedOutlines, type Outline } from "../../geometry";
import type { BlobMember, Pt } from "./blob";

/** How far the samples of a curved outline may stray from it, in pixels. */
const TOLERANCE = 0.5;

/** An outline as blob members. */
function membersOfOutline(o: Outline): BlobMember[] {
  if (o.ellipse !== undefined) {
    const { cx, cy, rx, ry } = o.ellipse;
    const disc: BlobMember = { kind: "disc", cx, cy, r: Math.max(rx, ry) };
    return [rx === ry ? disc : { ...disc, axes: [rx, ry] }];
  }
  if (o.box !== undefined) {
    const { min, max } = o.box;
    return [
      {
        kind: "box",
        x: min[0],
        y: min[1],
        w: max[0] - min[0],
        h: max[1] - min[1],
      },
    ];
  }
  const pts = (o.closed ? openRing(o.points) : o.points) as Pt[];
  const w = o.closed ? 0 : (o.width ?? 0);
  const out: BlobMember[] = [];
  for (let i = 1; i < pts.length; i++)
    out.push({ kind: "segment", a: pts[i - 1], b: pts[i], w });
  if (o.closed && pts.length > 2)
    out.push({ kind: "segment", a: pts[pts.length - 1], b: pts[0], w });
  return out;
}

/**
 * The blob members a placed child stands for. `placed` is the child as the
 * enclosure's layout got it back (its view of the child), so its geometry
 * and `dims` are both in the enclosure's frame.
 */
export function membersOf(placed: Placeable): BlobMember[] {
  // A box's edges are named in the node's own axis order: its direction,
  // turned when the view reflects it into the enclosure's.
  const raw = rawPlaceable(placed) as Placeable & {
    yFrame?: { direction: 1 | -1 };
  };
  const own = raw.yFrame?.direction ?? 1;
  const direction = raw === placed ? own : own === 1 ? -1 : 1;
  return placedOutlines(placed, TOLERANCE, direction).flatMap(membersOfOutline);
}

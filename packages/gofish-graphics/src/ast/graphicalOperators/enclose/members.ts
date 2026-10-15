// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * How `enclose` reads a placed node as blob geometry (internal; see
 * `blob.ts`). The result is in the enclosure's own frame: the frame its
 * children's `dims` are read in.
 *
 *  - A circle is a disc. An ellipse that is not a circle is the disc of its
 *    enclosing circle (its larger radius), so it is padded a little more
 *    along its short axis.
 *  - A drawn line (a `line` connector) is its segments, each as wide as its
 *    stroke; a curved piece is cut into 8 straight ones.
 *  - Anything else is its bounding box.
 */
import type { GoFishAST } from "../../_ast";
import { targetOf } from "../../constraints/relationalPaint";
import type { Dimensions } from "../../dims";
import type { Path, Point } from "../../../path";
import type { BlobMember, Pt } from "./blob";

/** A path's points, a curved piece cut into 8 straight ones. */
const pathPoints = (path: Path): Point[] => {
  const out: Point[] = [];
  for (const seg of path) {
    if (seg.type === "line") {
      if (out.length === 0) out.push(seg.points[0]);
      out.push(seg.points[1]);
      continue;
    }
    if (out.length === 0) out.push(seg.start);
    for (let k = 1; k <= 8; k++) {
      const t = k / 8,
        u = 1 - t;
      out.push([
        u * u * u * seg.start[0] +
          3 * u * u * t * seg.control1[0] +
          3 * u * t * t * seg.control2[0] +
          t * t * t * seg.end[0],
        u * u * u * seg.start[1] +
          3 * u * u * t * seg.control1[1] +
          3 * u * t * t * seg.control2[1] +
          t * t * t * seg.end[1],
      ]);
    }
  }
  return out;
};

/**
 * The blob members `child` stands for, given its placed `dims` in the
 * enclosure's frame.
 */
export function membersOf(child: GoFishAST, dims: Dimensions): BlobMember[] {
  const [x, y] = dims;
  const x0 = x.min ?? 0,
    y0 = y.min ?? 0,
    w = x.size ?? 0,
    h = y.size ?? 0;
  const node = targetOf(child);
  if (node?.type === "ellipse") {
    return [
      { kind: "disc", cx: x0 + w / 2, cy: y0 + h / 2, r: Math.max(w, h) / 2 },
    ];
  }
  const width = node?.renderData?.centerline as number | undefined;
  if (node && width !== undefined) {
    // The paths are in the line's local frame, the frame of its own box; the
    // placed box says where that frame sits in ours.
    const local = node.intrinsicDims;
    const dx = x0 - (local?.[0]?.min ?? 0),
      dy = y0 - (local?.[1]?.min ?? 0);
    const out: BlobMember[] = [];
    for (const path of node.renderData.paths as Path[]) {
      const pts = pathPoints(path).map(([px, py]): Pt => [px + dx, py + dy]);
      for (let i = 1; i < pts.length; i++)
        out.push({ kind: "segment", a: pts[i - 1], b: pts[i], w: width });
    }
    if (out.length > 0) return out;
  }
  return [{ kind: "box", x: x0, y: y0, w, h }];
}

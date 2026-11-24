// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

/**
 * The region a mark draws when exactly one of its axes is embedded in a
 * coordinate space (see `GoFishNode.resolveEmbedding`).
 *
 * On the embedded axis the mark's two edges are positions of the space, so
 * its midline runs from one to the other and goes through the transform.
 * On the other axis the mark is ink: a pixel thickness laid off on both
 * sides of the transformed midline, along its normal. The region is closed
 * at each end by a straight cap along the normal there. In polar, with the
 * angle embedded and a pixel thickness along the radius, the midline is an
 * arc and its normal is radial, so the region is an annular sector whose
 * ends lie on the rays at the two embedded edges.
 *
 * The thickness may vary along the midline (`halfWidth`), which is how an
 * ellipse draws: its half width at a fraction `u` of the way along its
 * midline is that of an ellipse.
 */
import type { CoordinateTransform } from "./ast/coordinateTransforms/coord";
import { resampleSegmentSources } from "./adaptive-resampling";
import { segment, type Path, type Point } from "./path";
import { catmullRomPath } from "./spline";

/** The unit normal of `space`'s image of the line through `s` along `dir`
 *  (a unit vector of the space), at `s`. It is read from a central
 *  difference of the transform at `s` itself, with a step far below a
 *  pixel, so the normal at an end of the midline is the transform's own,
 *  not the slope of a chord. */
function normalAt(
  space: CoordinateTransform,
  s: Point,
  dir: Point,
  step: number
): Point {
  const ahead = space.transform([s[0] + dir[0] * step, s[1] + dir[1] * step]);
  const behind = space.transform([s[0] - dir[0] * step, s[1] - dir[1] * step]);
  const dx = ahead[0] - behind[0];
  const dy = ahead[1] - behind[1];
  const len = Math.hypot(dx, dy);
  // A transform that is flat along `dir` at `s` (the center of a polar
  // space) has no tangent there: the band has no width to lay off.
  if (len === 0) return [0, 0];
  return [-dy / len, dx / len];
}

/**
 * The closed outline of the band from `a` to `b` (points of the space, the
 * midline's ends) whose half thickness in pixels at a fraction `u` of the
 * way along it is `halfWidth(u)`. The midline is sampled adaptively, as a
 * transformed path is (`resampleSegmentSources`).
 */
export function bandRegion(
  space: CoordinateTransform,
  a: Point,
  b: Point,
  halfWidth: (u: number) => number
): Path {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length === 0) return [];
  const dir: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const step = length * 1e-6;
  const sources = resampleSegmentSources(a, b, space);
  const left: Point[] = [];
  const right: Point[] = [];
  for (const s of sources) {
    const u = Math.hypot(s[0] - a[0], s[1] - a[1]) / length;
    const p = space.transform(s);
    const n = normalAt(space, s, dir, step);
    const h = halfWidth(Math.min(1, Math.max(0, u)));
    left.push([p[0] + n[0] * h, p[1] + n[1] * h]);
    right.push([p[0] - n[0] * h, p[1] - n[1] * h]);
  }
  right.reverse();
  return [
    ...catmullRomPath(left),
    segment(left[left.length - 1], right[0]),
    ...catmullRomPath(right),
    segment(right[right.length - 1], left[0]),
  ];
}

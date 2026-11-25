// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

/**
 * The region a mark draws through a coordinate space that is not linear, as
 * a list of closed loops (`Path[]`): the fill fills what they enclose, by
 * the nonzero rule, and the stroke outlines each of them.
 *
 * Most regions are one loop. A region whose extent along a periodic axis
 * (`HasCycle`) is one whole period is not: its start edge and its end edge
 * are the same place (`isPeriod` in coord.tsx), so it has no ends, and its
 * outline is the two edges that run along that axis, each a loop on its own
 * and turning the opposite way. In polar with the angle spanning the full
 * turn, a ring is its outer circle and its inner circle, and a disc is its
 * outer circle alone. A region that spans almost the whole turn keeps its
 * two ends.
 *
 * `bandRegion` is the region of a mark with exactly one of its axes
 * embedded (see `GoFishNode.resolveEmbedding`). On the embedded axis the
 * mark's two edges are positions of the space, so its midline runs from one
 * to the other and goes through the transform. On the other axis the mark
 * is ink: a pixel thickness laid off on both sides of the transformed
 * midline, along its normal. The region is closed at each end by a straight
 * cap along the normal there. In polar, with the angle embedded and a pixel
 * thickness along the radius, the midline is an arc and its normal is
 * radial, so the region is an annular sector whose ends lie on the rays at
 * the two embedded edges.
 *
 * The thickness may vary along the midline (`halfWidth`), which is how an
 * ellipse draws: its half width at a fraction `u` of the way along its
 * midline is that of an ellipse.
 *
 * `boxRegion` is the region of a mark with both axes embedded, a box of the
 * space, and `wrappedBandLoops` the region of a filled band between two
 * edges that runs a whole period (a ribbon around a full turn).
 */
import {
  isPeriod,
  type CoordinateTransform,
} from "./ast/coordinateTransforms/coord";
import { resampleSegmentSources } from "./adaptive-resampling";
import { reversePath, samePoint, segment, type Path, type Point } from "./path";
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

/** 1 when the normal `n` at `s` points where the coordinate along
 *  `across` grows in the image, else -1. */
function acrossSign(
  space: CoordinateTransform,
  s: Point,
  across: Point,
  n: Point,
  step: number
): number {
  const ahead = space.transform([
    s[0] + across[0] * step,
    s[1] + across[1] * step,
  ]);
  const behind = space.transform([
    s[0] - across[0] * step,
    s[1] - across[1] * step,
  ]);
  return n[0] * (ahead[0] - behind[0]) + n[1] * (ahead[1] - behind[1]) < 0
    ? -1
    : 1;
}

/** A run of points with each point that repeats the one before it left
 *  out. A side of a band that the transform maps to one point (the inner
 *  side of a pie, at the polar center) is that one point. */
function distinct(points: Point[]): Point[] {
  return points.filter((p, i) => i === 0 || !samePoint(p, points[i - 1]));
}

/** The axis along which `a` and `b`, points of the space, are one whole
 *  period apart, if there is one. */
function periodAxis(
  space: CoordinateTransform,
  a: Point,
  b: Point
): 0 | 1 | undefined {
  if (isPeriod(space, 0, b[0] - a[0])) return 0;
  if (isPeriod(space, 1, b[1] - a[1])) return 1;
  return undefined;
}

/**
 * The closed loops of the band from `a` to `b` (points of the space, the
 * midline's ends) whose half thickness in pixels at a fraction `u` of the
 * way along it is `halfWidth(u)`. The midline is sampled adaptively, as a
 * transformed path is (`resampleSegmentSources`). A band of no length is
 * no region.
 *
 * The thickness is laid off around a point `shift` pixels from the
 * midline, toward where the coordinate across the band grows: 0 centers it
 * on the midline. A mark pinned at an edge across the band (`rigid.ts`)
 * runs its midline along that edge and shifts its thickness off it.
 */
export function bandRegion(
  space: CoordinateTransform,
  a: Point,
  b: Point,
  halfWidth: (u: number) => number,
  shift = 0
): Path[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length === 0) return [];
  const dir: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const step = length * 1e-6;
  // The axis across the band, growing: the midline runs along one axis.
  const across: Point = [Math.abs(dir[1]), Math.abs(dir[0])];
  const sources = resampleSegmentSources(a, b, space);
  const left: Point[] = [];
  const right: Point[] = [];
  for (const s of sources) {
    const u = Math.hypot(s[0] - a[0], s[1] - a[1]) / length;
    const p = space.transform(s);
    const n = normalAt(space, s, dir, step);
    const h = halfWidth(Math.min(1, Math.max(0, u)));
    const o = shift === 0 ? 0 : shift * acrossSign(space, s, across, n, step);
    left.push([p[0] + n[0] * (o + h), p[1] + n[1] * (o + h)]);
    right.push([p[0] + n[0] * (o - h), p[1] + n[1] * (o - h)]);
  }
  const sideL = distinct(left);
  const sideR = distinct(right).reverse();
  if (periodAxis(space, a, b) !== undefined) {
    // No ends: each side is a loop. Its two ends are the same point of the
    // midline, offset by the half width there; where the two half widths
    // differ, the loop steps across from one to the other.
    const [h0, h1] = [halfWidth(0), halfWidth(1)];
    const loop = (side: Point[]): Path => [
      ...catmullRomPath(side),
      ...(h0 === h1 ? [] : [segment(side[side.length - 1], side[0])]),
    ];
    return [loop(sideL), loop(sideR)];
  }
  return [
    [
      ...catmullRomPath(sideL),
      segment(sideL[sideL.length - 1], sideR[0]),
      ...catmullRomPath(sideR),
      segment(sideR[sideR.length - 1], sideL[0]),
    ],
  ];
}

/**
 * The closed loops of the box from `min` to `max` (corners in the space),
 * each a run of corners whose edges are straight lines of the space, to be
 * drawn through it. It is one loop around the four corners, unless the box
 * spans a whole period of an axis: then the two edges across that axis are
 * one edge, the seam, and are not drawn, and the box is its two edges along
 * that axis, the one at `min` turning one way and the one at `max` the
 * other.
 */
export function boxRegion(
  space: CoordinateTransform,
  min: Point,
  max: Point
): Point[][] {
  const [x0, y0] = min;
  const [x1, y1] = max;
  if (isPeriod(space, 0, x1 - x0))
    return [
      [
        [x0, y0],
        [x1, y0],
      ],
      [
        [x1, y1],
        [x0, y1],
      ],
    ];
  if (isPeriod(space, 1, y1 - y0))
    return [
      [
        [x1, y0],
        [x1, y1],
      ],
      [
        [x0, y1],
        [x0, y0],
      ],
    ];
  return [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ];
}

/**
 * The closed loops of a filled band between two edges of the space,
 * `upper` and `lower`, each a path from the band's start to its end along
 * `axis`, when that run is one whole period of it (`isPeriod`); undefined
 * otherwise. Such a band has no ends: each edge is a loop, `lower` drawn
 * back the other way. Where an edge's value at the end differs from its
 * value at the start, its loop steps across along the seam, at the end's
 * position on `axis` (which is the start's), from the one value to the
 * other. Its two ends would have drawn the same steps, overlapping, so the
 * fill is unchanged.
 */
export function wrappedBandLoops(
  space: CoordinateTransform,
  axis: 0 | 1,
  upper: Path,
  lower: Path
): Path[] | undefined {
  if (upper.length === 0 || lower.length === 0) return undefined;
  const startOf = (p: Path): Point =>
    p[0].type === "line" ? p[0].points[0] : p[0].start;
  const endOf = (p: Path): Point => {
    const seg = p[p.length - 1];
    return seg.type === "line" ? seg.points[1] : seg.end;
  };
  if (!isPeriod(space, axis, endOf(upper)[axis] - startOf(upper)[axis]))
    return undefined;
  /** A loop of `edge`, closed along the seam where its value at the end
   *  is not its value at the start. */
  const loop = (edge: Path): Path => {
    const from = endOf(edge);
    const to: Point = [...startOf(edge)];
    to[axis] = from[axis];
    return samePoint(from, to) ? edge : [...edge, segment(from, to)];
  };
  return [loop(upper), loop(reversePath(lower))];
}

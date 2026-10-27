import type { Path } from "../../path";
import type { AxisDirection } from "../axisDirection";
import type { Box } from "./box";
import type { Geometry } from "./index";

/** A point of an outline, in a node's local layout frame (pixels, y down). */
export type OutlinePoint = [number, number];

/**
 * A named stretch of an outline, as arc lengths from its first point: one of
 * the mark's own pieces, named in the mark's own frame. A box names its four
 * edges by axis (`x-min`, `x-max`, `y-min`, `y-max`), read in the box's own
 * axis order, so on a continuous y, which grows upward, `y-max` is the top
 * edge on the screen.
 */
export type OutlinePart = { name: string; from: number; to: number };

/**
 * A shape's outline, sampled: a polyline that is never farther from the true
 * shape than the tolerance asked for. `closed` says whether it is a region's
 * boundary (the last point joins the first; the inside is known) or an open
 * path with a start, an end and a direction of travel (a line, an arrow).
 */
export interface Outline {
  points: OutlinePoint[];
  closed: boolean;
  parts?: OutlinePart[];
}

/**
 * A shape that knows its outline. One shape may have several (a ribbon cut
 * by gaps is one closed band per run). `tolerance` is the most the samples
 * may stray from the true shape, in pixels.
 */
export interface HasOutline {
  readonly outline?: (tolerance: number) => Outline[];
}

/** A box's outline: a closed rect, clockwise on the screen from its top-left
 *  corner, with its edges as parts. `direction` is the y direction of the
 *  box's own axis order, which names the top and bottom edges. */
export function boxOutline(box: Box, direction: AxisDirection): Outline {
  const [x0, y0] = box.min;
  const [x1, y1] = box.max;
  const w = x1 - x0;
  const h = y1 - y0;
  // Pixel top is the low end of the axis on a y that reads top-down, and
  // the high end on one that grows upward.
  const top = direction === 1 ? "y-min" : "y-max";
  const bottom = direction === 1 ? "y-max" : "y-min";
  return {
    points: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
    closed: true,
    parts: [
      { name: top, from: 0, to: w },
      { name: "x-max", from: w, to: w + h },
      { name: bottom, from: w + h, to: 2 * w + h },
      { name: "x-min", from: 2 * w + h, to: 2 * w + 2 * h },
    ],
  };
}

/**
 * A geometry's outlines, falling back to its box (see {@link boxOutline}).
 * `g` must be a node's own geometry, in its pixel frame, and `direction`
 * that node's y direction.
 */
export function outlines(
  g: Geometry,
  tolerance: number,
  direction: AxisDirection
): Outline[] {
  return g.outline?.(tolerance) ?? [boxOutline(g.box, direction)];
}

/** Move an outline by `[dx, dy]`, e.g. by a child's translate into its
 *  parent's frame. */
export function translateOutline(
  o: Outline,
  [dx, dy]: [number, number]
): Outline {
  return { ...o, points: o.points.map(([x, y]) => [x + dx, y + dy]) };
}

/** An outline reflected about its origin's y. Its parts keep their names:
 *  they name the mark's own pieces, wherever a frame puts them. */
export function reflectOutlineY(o: Outline): Outline {
  return { ...o, points: o.points.map(([x, y]) => [x, -y]) };
}

/** How many equal steps of angle keep a circle of radius `r` within
 *  `tolerance` of its chords: the sagitta `r (1 − cos(θ/2))` at most the
 *  tolerance. At least 8. */
const circleSteps = (r: number, tolerance: number): number => {
  if (!(r > tolerance)) return 8;
  const theta = 2 * Math.acos(1 - tolerance / r);
  return Math.max(8, Math.min(1024, Math.ceil((2 * Math.PI) / theta)));
};

/** A closed ellipse, sampled, clockwise on the screen from its rightmost
 *  point. */
export function ellipseOutline(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  tolerance: number
): Outline {
  const n = circleSteps(Math.max(rx, ry), tolerance);
  const points: OutlinePoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    points.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return { points, closed: true };
}

/**
 * A path's points, each bezier cut into enough straight pieces to stay
 * within `tolerance` of it. Uniform subdivision of a cubic into `n` pieces
 * strays at most `max|B''| / (8 n²)`, and `|B''| ≤ 6 M`, where `M` is the
 * larger second difference of its control points.
 */
export function flattenPath(path: Path, tolerance: number): OutlinePoint[] {
  const out: OutlinePoint[] = [];
  const push = (p: readonly [number, number]) => {
    const last = out[out.length - 1];
    if (last === undefined || last[0] !== p[0] || last[1] !== p[1])
      out.push([p[0], p[1]]);
  };
  for (const seg of path) {
    if (seg.type === "line") {
      push(seg.points[0]);
      push(seg.points[1]);
      continue;
    }
    const { start: p0, control1: p1, control2: p2, end: p3 } = seg;
    const second = (a: number[], b: number[], c: number[]) =>
      Math.hypot(a[0] - 2 * b[0] + c[0], a[1] - 2 * b[1] + c[1]);
    const m = Math.max(second(p0, p1, p2), second(p1, p2, p3));
    const n = Math.max(
      1,
      Math.min(
        256,
        Math.ceil(Math.sqrt((0.75 * m) / Math.max(tolerance, 1e-6)))
      )
    );
    push(p0);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      push([
        u * u * u * p0[0] +
          3 * u * u * t * p1[0] +
          3 * u * t * t * p2[0] +
          t * t * t * p3[0],
        u * u * u * p0[1] +
          3 * u * u * t * p1[1] +
          3 * u * t * t * p2[1] +
          t * t * t * p3[1],
      ]);
    }
  }
  return out;
}

/** A closed outline's points without a repeated closing point. */
export function openRing(points: OutlinePoint[]): OutlinePoint[] {
  if (points.length < 2) return points;
  const a = points[0];
  const b = points[points.length - 1];
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9
    ? points.slice(0, -1)
    : points;
}

/** Points kept in a node's axis order (`y` grows with the axis), in the
 *  node's pixel frame. */
export const orderToPixel = (
  points: readonly (readonly [number, number])[],
  direction: AxisDirection
): OutlinePoint[] => points.map(([x, y]) => [x, direction * y]);

import { cubicAt, type Path } from "../../path";
import type { AxisDirection } from "../axisDirection";
import type { Dimensions } from "../dims";
import type { Box } from "./box";
import type { Geometry } from "./index";

/**
 * A point of an outline. Every outline, a shape's own and the box fallback
 * alike, is in the frame of the geometry it was read from: for
 * `GoFishNode.geometry()`, the node's local layout frame, which is pixels
 * with y down (the frame of `intrinsicDims`, see `axisDirection.ts`). An
 * outline read through a parent's view of a child (`orientView`) is in that
 * parent's axis order instead, like the view's box.
 */
export type OutlinePoint = [number, number];

/** A point that is only read, such as a corner of a cell's polygon. */
export type Point = readonly [number, number];

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
 * shape than the tolerance asked for. It states three facts about the shape:
 *
 *  - `closed`, its topology: `true` when the path loops back (the last point
 *    joins the first), `false` for an open path with a start, an end and a
 *    direction of travel (a line, an arrow).
 *  - `filled`, its paint: `true` when the inside of a closed loop is drawn,
 *    so the inside is ink. An open outline is never filled. A mark is filled
 *    unless its fill is `"none"` or `"transparent"` (see {@link outlinePaint}).
 *  - `width`, its stroke: the width of the band a pen draws along the path,
 *    on an open or a closed outline alike. Absent (or 0) when no stroke is
 *    drawn.
 *
 * The ink a shape puts down is its inside when filled, plus the stroke band
 * of `width` along its points. A closed outline that is not filled is ink
 * only along its band; what is behind its inside shows through.
 *
 * An outline that only stands in for its shape says so with `bounds`: the
 * box of a node whose definition gives no outline (an image, a group), or a
 * text's glyph box. It lies around the ink without tracing it. A path boolean (`intersect` with paint)
 * reads only outlines that trace their shape.
 *
 * An outline may also give its shape exactly, beside the samples, for a
 * consumer that reads a primitive in closed form (the blob in `enclose`):
 *  - `ellipse`, on a closed outline that is an axis-aligned ellipse (a circle
 *    when `rx === ry`);
 *  - `box`, on a closed outline that is an axis-aligned box.
 *
 * TODO(#1201): a region with holes (a donut slice, a country with a lake) is
 * several loops filled under a fill rule, which one outline cannot say. No
 * producer in a Cartesian space makes one yet; when one does, the outline
 * grows its loops and its fill rule.
 */
export interface Outline {
  points: OutlinePoint[];
  closed: boolean;
  filled: boolean;
  width?: number;
  /** True when the outline only bounds the ink, not traces it. */
  bounds?: true;
  parts?: OutlinePart[];
  ellipse?: { cx: number; cy: number; rx: number; ry: number };
  box?: Box;
}

/** How a mark paints its outline: whether it is filled, and its stroke's
 *  width when it draws one. */
export type OutlinePaint = Pick<Outline, "filled" | "width">;

/** Whether a color draws ink: any color but `"none"` or `"transparent"`. A
 *  data-driven color, and no color at all (SVG fills black by default), do. */
export const inks = (color: unknown): boolean =>
  color !== "none" && color !== "transparent";

/**
 * The paint a mark puts on its outline, read from its own `fill`, `stroke`
 * and `strokeWidth`: filled unless its fill is `"none"` or `"transparent"`,
 * and stroked as wide as `strokeWidth` unless that is 0 or its stroke is
 * `"none"` or `"transparent"`.
 */
export function outlinePaint(paint: {
  fill?: unknown;
  stroke?: unknown;
  strokeWidth?: number;
}): OutlinePaint {
  const w = paint.strokeWidth ?? 0;
  return {
    filled: inks(paint.fill),
    ...(w > 0 && inks(paint.stroke) && { width: w }),
  };
}

/**
 * A shape's outlines. One shape may have several (a ribbon cut by gaps is
 * one closed band per run). `tolerance` is the most the samples may stray
 * from the true shape, in pixels. Every node's geometry has them: its
 * shape's own, or its box ({@link boxOutline}) when its definition gives
 * none (`GoFishNode.geometry`).
 */
export interface HasOutline {
  readonly outline: (tolerance: number) => Outline[];
}

/** A box's outline: a closed rect, clockwise on the screen from its top-left
 *  corner, with the box as its exact form and its edges as parts.
 *  `direction` is the y direction of the box's own axis order relative to
 *  the frame the box is in, which names the top and bottom edges. `paint` is
 *  the mark's (a rect's); a node with no paint of its own (a layer, a
 *  `blank`, a group) is read as filled, so it occupies its box. */
export function boxOutline(
  box: Box,
  direction: AxisDirection,
  paint: OutlinePaint = { filled: true }
): Outline {
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
    ...paint,
    box: { min: [x0, y0], max: [x1, y1] },
    parts: [
      { name: top, from: 0, to: w },
      { name: "x-max", from: w, to: w + h },
      { name: bottom, from: w + h, to: 2 * w + h },
      { name: "x-min", from: 2 * w + h, to: 2 * w + 2 * h },
    ],
  };
}

/** Move an outline by `[dx, dy]`, e.g. by a child's translate into its
 *  parent's frame. Its exact forms move with it. */
export function translateOutline(
  o: Outline,
  [dx, dy]: [number, number]
): Outline {
  const { ellipse, box } = o;
  return {
    ...o,
    points: o.points.map(([x, y]) => [x + dx, y + dy]),
    ...(ellipse && {
      ellipse: { ...ellipse, cx: ellipse.cx + dx, cy: ellipse.cy + dy },
    }),
    ...(box && {
      box: {
        min: [box.min[0] + dx, box.min[1] + dy],
        max: [box.max[0] + dx, box.max[1] + dy],
      },
    }),
  };
}

/** An outline reflected about its origin's y, exact forms and all. Its
 *  parts keep their names: they name the mark's own pieces, wherever a frame
 *  puts them. */
export function reflectOutlineY(o: Outline): Outline {
  const { ellipse, box } = o;
  return {
    ...o,
    points: o.points.map(([x, y]) => [x, -y]),
    ...(ellipse && { ellipse: { ...ellipse, cy: -ellipse.cy } }),
    ...(box && {
      box: { min: [box.min[0], -box.max[1]], max: [box.max[0], -box.min[1]] },
    }),
  };
}

/**
 * A placed node's outlines in its parent's frame: the outlines of `p`'s
 * geometry, moved so its box sits where `p.dims` puts it. `p` is any
 * placeable (a node, a `ref()` stand-in, or a parent's oriented view of
 * one), whose `geometry()` and `dims` are read in the same frame.
 */
export function placedOutlines(
  p: { geometry(): Geometry; dims: Dimensions },
  tolerance: number
): Outline[] {
  const g = p.geometry();
  const d = p.dims;
  const dx = (d[0].min ?? 0) - g.box.min[0];
  const dy = (d[1].min ?? 0) - g.box.min[1];
  return g.outline(tolerance).map((o) => translateOutline(o, [dx, dy]));
}

/** A closed ring's outline: `ring` kept in a node's axis order (see
 *  {@link orderToPixel}), painted as `paint`. */
export const ringOutline = (
  ring: readonly (readonly [number, number])[],
  direction: AxisDirection,
  paint: OutlinePaint
): Outline => ({
  points: orderToPixel(ring, direction),
  closed: true,
  ...paint,
});

/** A path's outline: `path`, kept in a node's axis order, flattened to
 *  `tolerance` (see {@link flattenPath}) and closed or open as `closed`
 *  says, painted as `paint`. An open outline is never filled. */
export const pathOutline = (
  path: Path,
  tolerance: number,
  direction: AxisDirection,
  closed: boolean,
  paint: OutlinePaint
): Outline => ({
  points: orderToPixel(flattenPath(path, tolerance), direction),
  closed,
  ...paint,
  filled: closed && paint.filled,
});

/** How many equal steps of angle keep a circle of radius `r` within
 *  `tolerance` of its chords: the sagitta `r (1 − cos(θ/2))` at most the
 *  tolerance. At least 8. */
const circleSteps = (r: number, tolerance: number): number => {
  if (!(r > tolerance)) return 8;
  const theta = 2 * Math.acos(1 - tolerance / r);
  return Math.max(8, Math.min(1024, Math.ceil((2 * Math.PI) / theta)));
};

/** A closed ellipse, sampled, clockwise on the screen from its rightmost
 *  point, painted as `paint`. */
export function ellipseOutline(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  tolerance: number,
  paint: OutlinePaint
): Outline {
  const n = circleSteps(Math.max(rx, ry), tolerance);
  const points: OutlinePoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    points.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return { points, closed: true, ...paint, ellipse: { cx, cy, rx, ry } };
}

/**
 * A box with rounded corners, sampled: a rect with `rx` and `ry`, each
 * corner a quarter of an ellipse sampled as {@link ellipseOutline} samples
 * one. The radii are cut to half the box's width and height, as SVG cuts
 * them. It runs as {@link boxOutline} runs, from the top edge, and its parts
 * are the straight pieces of the four edges, by the same names. A box with
 * no rounding is {@link boxOutline}.
 */
export function roundedBoxOutline(
  box: Box,
  rx: number,
  ry: number,
  direction: AxisDirection,
  tolerance: number,
  paint: OutlinePaint = { filled: true }
): Outline {
  const x0 = Math.min(box.min[0], box.max[0]);
  const x1 = Math.max(box.min[0], box.max[0]);
  const y0 = Math.min(box.min[1], box.max[1]);
  const y1 = Math.max(box.min[1], box.max[1]);
  const a = Math.min(rx, (x1 - x0) / 2);
  const b = Math.min(ry, (y1 - y0) / 2);
  if (!(a > 0 && b > 0)) return boxOutline(box, direction, paint);
  const steps = Math.max(
    2,
    Math.ceil(circleSteps(Math.max(a, b), tolerance) / 4)
  );
  const points: OutlinePoint[] = [];
  // Each edge's straight piece as [from, to] indices into `points`.
  const edges: [number, number][] = [];
  // Per corner: its center, the angle it starts at (it turns a quarter),
  // and the points it starts and ends at, exactly.
  const corners: [number, number, number, OutlinePoint, OutlinePoint][] = [
    [x1 - a, y0 + b, -Math.PI / 2, [x1 - a, y0], [x1, y0 + b]],
    [x1 - a, y1 - b, 0, [x1, y1 - b], [x1 - a, y1]],
    [x0 + a, y1 - b, Math.PI / 2, [x0 + a, y1], [x0, y1 - b]],
    [x0 + a, y0 + b, Math.PI, [x0, y0 + b], [x0 + a, y0]],
  ];
  points.push([x0 + a, y0]);
  for (const [cx, cy, t0, from, to] of corners) {
    // The straight piece up to this corner (none when the corners meet, at
    // a radius half the side), then the corner.
    const start = points.length - 1;
    const last = points[start];
    if (from[0] !== last[0] || from[1] !== last[1]) points.push(from);
    edges.push([start, points.length - 1]);
    for (let i = 1; i < steps; i++) {
      const t = t0 + (i / steps) * (Math.PI / 2);
      points.push([cx + a * Math.cos(t), cy + b * Math.sin(t)]);
    }
    points.push(to);
  }
  // The last corner ends where the outline starts.
  points.pop();
  const along: number[] = [0];
  for (let i = 1; i < points.length; i++)
    along.push(
      along[i - 1] +
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1]
        )
    );
  const top = direction === 1 ? "y-min" : "y-max";
  const bottom = direction === 1 ? "y-max" : "y-min";
  const names = [top, "x-max", bottom, "x-min"];
  return {
    points,
    closed: true,
    ...paint,
    parts: edges.map(([from, to], i) => ({
      name: names[i],
      from: along[from],
      to: along[to],
    })),
  };
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
      push([
        cubicAt(p0[0], p1[0], p2[0], p3[0], t),
        cubicAt(p0[1], p1[1], p2[1], p3[1], t),
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

/**
 * The straight pieces an outline's path is drawn with, each from one point
 * to the next: on a closed outline, the last point back to the first too (a
 * repeated closing point is no piece of its own). A single point is one
 * piece from itself to itself, so its stroke still counts.
 */
export function outlineSegments(o: Outline): [OutlinePoint, OutlinePoint][] {
  const pts = o.closed ? openRing(o.points) : o.points;
  const n = pts.length;
  if (n === 1) return [[pts[0], pts[0]]];
  const out: [OutlinePoint, OutlinePoint][] = [];
  for (let i = 0; i + 1 < n; i++) out.push([pts[i], pts[i + 1]]);
  if (o.closed && n > 2) out.push([pts[n - 1], pts[0]]);
  return out;
}

/** Points kept in a node's axis order (`y` grows with the axis), in the
 *  node's pixel frame. */
export const orderToPixel = (
  points: readonly (readonly [number, number])[],
  direction: AxisDirection
): OutlinePoint[] => points.map(([x, y]) => [x, direction * y]);

import { CoordinateTransform } from "./ast/coordinateTransforms/coord";
import { lerp } from "./util";
import { adaptiveResamplePath } from "./adaptive-resampling";

export const lerpPoint = (point1: Point, point2: Point, t: number): Point => {
  return [lerp(point1[0], point2[0], t), lerp(point1[1], point2[1], t)];
};

export type Point = [number, number];

/** Whether two points are the same, allowing for rounding. */
export const samePoint = (p: Point, q: Point): boolean =>
  Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;
export type LineSegment = {
  type: "line";
  points: [Point, Point];
};

export const segment = (point1: Point, point2: Point): LineSegment => ({
  type: "line",
  points: [point1, point2],
});

export type BezierCurve = {
  type: "bezier";
  start: Point;
  control1: Point;
  control2: Point;
  end: Point;
};

export const curve = (
  start: Point,
  control1: Point,
  control2: Point,
  end: Point
): BezierCurve => ({
  type: "bezier",
  start,
  control1,
  control2,
  end,
});

export type PathSegment = LineSegment | BezierCurve;

export type Path = PathSegment[];

/**
 * One step of a threaded run: the segments drawn from one point to the next,
 * and how the step's time is shared out among them. `spans[j]` is the share
 * of the step's time segment `j` takes, a fraction of the step, and the
 * shares add up to 1. Inside a segment with a nonzero share, time moves
 * linearly with the segment's own parameter. A segment with a share of 0 is
 * an instant: it is drawn all at once, at the moment the shares before it add
 * up to (`windowPath` in `timeWindow.ts`).
 */
export type Step = { segments: PathSegment[]; spans: number[] };

/** A step whose segments split its time evenly. */
export const evenStep = (segments: PathSegment[]): Step => ({
  segments,
  spans: segments.map(() => 1 / segments.length),
});

/** The point a path is at when a fraction `u` of it has been traversed, its
 *  segments taking equal shares of `u` and each read by its own parameter
 *  (not by arc length). PROTOTYPE (ribbon particles): what a transition whose
 *  curve is a screen-space route reads (`tween.tsx`). */
export const pointOnPath = (path: Path, u: number): Point => {
  const n = path.length;
  const scaled = Math.max(0, Math.min(1, u)) * n;
  const j = Math.min(n - 1, Math.floor(scaled));
  const s = scaled - j;
  const seg = path[j];
  if (seg.type === "line") return lerpPoint(seg.points[0], seg.points[1], s);
  const r = 1 - s;
  const [a, b, c, d] = [r * r * r, 3 * r * r * s, 3 * r * s * s, s * s * s];
  return [
    a * seg.start[0] +
      b * seg.control1[0] +
      c * seg.control2[0] +
      d * seg.end[0],
    a * seg.start[1] +
      b * seg.control1[1] +
      c * seg.control2[1] +
      d * seg.end[1],
  ];
};

/** A segment traversed from its end to its start: the same points. */
export const reverseSegment = (seg: PathSegment): PathSegment =>
  seg.type === "line"
    ? segment(seg.points[1], seg.points[0])
    : curve(seg.end, seg.control2, seg.control1, seg.start);

/** A path traversed from its end to its start: the same points. */
export const reversePath = (path: Path): Path =>
  path.map(reverseSegment).reverse();

/** A path with every point (and control point) mapped through `f`. */
export const mapPathPoints = (path: Path, f: (p: Point) => Point): Path =>
  path.map(
    (seg): PathSegment =>
      seg.type === "line"
        ? { type: "line", points: [f(seg.points[0]), f(seg.points[1])] }
        : {
            type: "bezier",
            start: f(seg.start),
            control1: f(seg.control1),
            control2: f(seg.control2),
            end: f(seg.end),
          }
  );

export const segmentToSVG = (segment: PathSegment): string => {
  if (segment.type === "line") {
    const [[x1, y1], [x2, y2]] = segment.points;
    return `L${x2},${y2}`;
  } else {
    const { control1, control2, end } = segment;
    return `C${control1[0]},${control1[1]} ${control2[0]},${control2[1]} ${end[0]},${end[1]}`;
  }
};

export const pathToSVGPath = (path: Path): string => {
  // An empty path draws nothing, which is empty path data (a line cut to a
  // window it does not reach is one — see `windowPath` in `timeWindow.ts`).
  if (path.length === 0) return "";
  const firstSegment = path[0];
  const startPoint =
    firstSegment.type === "line" ? firstSegment.points[0] : firstSegment.start;
  return `M${startPoint[0]},${startPoint[1]} ${path.map(segmentToSVG).join(" ")}`;
};

export const transformPath = (
  path: Path,
  space: CoordinateTransform,
  options?: { resample?: boolean }
): Path => {
  if (options?.resample) {
    // Use adaptive resampling which transforms as it resamples
    return adaptiveResamplePath(path, space);
  }

  // Default behavior: direct transformation without resampling
  return mapPathPoints(path, (p) => space.transform(p));
};

const subdivideSegment = (
  lineSegment: LineSegment,
  n: number
): LineSegment[] => {
  const points: Point[] = [];
  for (let i = 0; i <= n; i++) {
    points.push(lerpPoint(lineSegment.points[0], lineSegment.points[1], i / n));
  }

  /* create a segment for each pair of points */
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push(segment(points[i], points[i + 1]));
  }

  return segments;
};

export const subdivideCurve1 = (
  c: BezierCurve,
  t: number = 0.5
): [BezierCurve, BezierCurve] => {
  // Apply de Casteljau's algorithm to find points on the curve

  // First level of interpolation
  const p01 = lerpPoint(c.start, c.control1, t);
  const p12 = lerpPoint(c.control1, c.control2, t);
  const p23 = lerpPoint(c.control2, c.end, t);

  // Second level of interpolation
  const p012 = lerpPoint(p01, p12, t);
  const p123 = lerpPoint(p12, p23, t);

  // Final interpolation point - this is the point on the curve at parameter t
  const splitPoint = lerpPoint(p012, p123, t);

  // Form the two new curves
  const leftCurve: BezierCurve = curve(c.start, p01, p012, splitPoint);
  const rightCurve: BezierCurve = curve(splitPoint, p123, p23, c.end);

  return [leftCurve, rightCurve];
};

const subdivideCurve = (
  curve: BezierCurve,
  numSegments: number
): BezierCurve[] => {
  if (numSegments <= 0) {
    throw new Error("Number of segments must be positive");
  }

  if (numSegments === 1) {
    return [curve];
  }

  const segments: BezierCurve[] = [];
  let currentCurve = curve;
  const step = 1 / numSegments;

  for (let i = 0; i < numSegments - 1; i++) {
    // Calculate parameter for this subdivision
    const t = step / (1 - i * step);

    // Subdivide the current curve
    const [leftCurve, rightCurve] = subdivideCurve1(currentCurve, t);

    // Add the left segment to our result
    segments.push(leftCurve);

    // Continue with the right segment
    currentCurve = rightCurve;
  }

  // Add the final segment
  segments.push(currentCurve);

  return segments;
};

export const subdividePath = (path: Path, n: number): Path => {
  const segments: PathSegment[] = [];
  for (const segment of path) {
    if (segment.type === "line") {
      segments.push(...subdivideSegment(segment, n));
    } else {
      segments.push(...subdivideCurve(segment, n));
    }
  }

  return segments;
};

/* TODO: probably want catmull-rom as well... */
export const path = (
  points: Point[],
  {
    subdivision = 0,
    closed = false,
    interpolation = "linear",
  }: {
    subdivision?: number;
    closed?: boolean;
    interpolation?: "linear" | "bezierX" | "bezierY";
  }
): Path => {
  let segments: PathSegment[] = [];
  if (closed === true) {
    points.push(points[0]);
  }
  if (interpolation === "linear") {
    for (let i = 0; i < points.length - 1; i++) {
      segments.push(segment(points[i], points[i + 1]));
    }
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      const control1: Point =
        interpolation === "bezierX"
          ? [(points[i][0] + points[i + 1][0]) / 2, points[i][1]]
          : [points[i][0], (points[i][1] + points[i + 1][1]) / 2];
      const control2: Point =
        interpolation === "bezierX"
          ? [(points[i][0] + points[i + 1][0]) / 2, points[i + 1][1]]
          : [points[i + 1][0], (points[i][1] + points[i + 1][1]) / 2];
      segments.push(
        ...subdivideCurve(
          curve(points[i], control1, control2, points[i + 1]),
          subdivision
        )
      );
    }
  }
  return subdivision > 0 ? subdividePath(segments, subdivision) : segments;
};

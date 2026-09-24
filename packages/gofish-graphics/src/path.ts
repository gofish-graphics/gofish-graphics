import { CoordinateTransform } from "./ast/coordinateTransforms/coord";
import { lerp } from "./util";
import { adaptiveResamplePath } from "./adaptive-resampling";

export const lerpPoint = (point1: Point, point2: Point, t: number): Point => {
  return [lerp(point1[0], point2[0], t), lerp(point1[1], point2[1], t)];
};

export type Point = [number, number];
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
  return path.map((segment): PathSegment => {
    if (segment.type === "line") {
      return {
        type: "line",
        points: [
          space.transform(segment.points[0]),
          space.transform(segment.points[1]),
        ] as [Point, Point],
      };
    } else {
      return {
        type: "bezier",
        start: space.transform(segment.start),
        control1: space.transform(segment.control1),
        control2: space.transform(segment.control2),
        end: space.transform(segment.end),
      };
    }
  });
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

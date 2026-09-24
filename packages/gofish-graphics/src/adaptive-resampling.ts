/**
 * Adaptive resampling algorithm for paths under coordinate transformations.
 *
 * Based on D3's adaptive resampling algorithm:
 * https://github.com/d3/d3-geo/blob/8c53a90ae70c94bace73ecb02f2c792c649c86ba/src/projection/resample.js
 * https://observablehq.com/@d3/adaptive-sampling
 *
 * This implementation is a generalized version (not specialized to spherical coordinates) and
 * written in a more readable and functional style. It also works with PathSegments (lines and
 * bezier curves).
 */

import { CoordinateTransform } from "./ast/coordinateTransforms/coord";
import { catmullRomPath, centripetalKnots } from "./catmullRom";
import {
  Path,
  PathSegment,
  LineSegment,
  BezierCurve,
  Point,
  segment,
  lerpPoint,
  subdivideCurve1,
} from "./path";

export interface ResamplingOptions {
  /** Squared distance threshold in projected space */
  delta2: number;
  /** Maximum recursion depth */
  maxDepth: number;
  /** Minimum source distance threshold for forced subdivision */
  minSourceDistance: number;
}

const DEFAULT_OPTIONS: ResamplingOptions = {
  delta2: 0.25,
  maxDepth: 16,
  minSourceDistance: 10,
};

/**
 * Computes Euclidean distance between two points
 */
function distance(p0: Point, p1: Point): number {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Source space operations for line segments
 */
function lineSourceMidpoint(seg: LineSegment): Point {
  return lerpPoint(seg.points[0], seg.points[1], 0.5);
}

function lineSourceDistance(seg: LineSegment): number {
  return distance(seg.points[0], seg.points[1]);
}

/**
 * Source space operations for bezier curves
 * Uses subdivideCurve1 to get midpoint efficiently (avoids redundant de Casteljau)
 */
function bezierSourceMidpoint(curve: BezierCurve): Point {
  const [leftCurve] = subdivideCurve1(curve, 0.5);
  return leftCurve.end; // This is the split point at t=0.5
}

function bezierSourceDistance(curve: BezierCurve): number {
  // Use chord length for simplicity
  return distance(curve.start, curve.end);
}

/**
 * Recursively resamples a line segment adaptively.
 */
function resampleLineSegment(
  seg: LineSegment,
  transform: (p: Point) => Point,
  options: ResamplingOptions,
  depth: number,
  result: Point[]
): void {
  const p0 = transform(seg.points[0]);
  const p1 = transform(seg.points[1]);

  const [x0, y0] = p0;
  const [x1, y1] = p1;

  const dx = x1 - x0;
  const dy = y1 - y0;
  const d2 = dx * dx + dy * dy; // squared distance in projected space

  // Check if we need to subdivide
  if (d2 > 4 * options.delta2 && depth > 0) {
    // Calculate midpoint in source space
    const sMid = lineSourceMidpoint(seg);
    const pMid = transform(sMid);
    const [x2, y2] = pMid;

    // Vector from start to midpoint
    const dx2 = x2 - x0;
    const dy2 = y2 - y0;

    // Perpendicular distance (cross product)
    const dz = dy * dx2 - dx * dy2;

    // Check subdivision criteria:
    // 1. Perpendicular distance exceeds threshold
    const perpendicularCheck = (dz * dz) / d2 > options.delta2;

    // 2. Midpoint is too close to an endpoint (not near center)
    const midpointCheck = Math.abs((dx * dx2 + dy * dy2) / d2 - 0.5) > 0.3;

    // 3. Source space distance exceeds threshold
    const sourceDistanceCheck =
      lineSourceDistance(seg) > options.minSourceDistance;

    if (perpendicularCheck || midpointCheck || sourceDistanceCheck) {
      // Create left and right segments
      const leftSeg: LineSegment = segment(seg.points[0], sMid);
      const rightSeg: LineSegment = segment(sMid, seg.points[1]);

      // Recursively process first half
      resampleLineSegment(leftSeg, transform, options, depth - 1, result);

      // Add midpoint
      result.push(pMid);

      // Recursively process second half
      resampleLineSegment(rightSeg, transform, options, depth - 1, result);
    }
  }
}

/**
 * Recursively resamples a bezier curve adaptively.
 * Uses subdivideCurve1 to efficiently get midpoint and sub-curves in one operation.
 */
function resampleBezierCurve(
  curve: BezierCurve,
  transform: (p: Point) => Point,
  options: ResamplingOptions,
  depth: number,
  result: Point[]
): void {
  const p0 = transform(curve.start);
  const p1 = transform(curve.end);

  const [x0, y0] = p0;
  const [x1, y1] = p1;

  const dx = x1 - x0;
  const dy = y1 - y0;
  const d2 = dx * dx + dy * dy; // squared distance in projected space

  // Check if we need to subdivide
  if (d2 > 4 * options.delta2 && depth > 0) {
    // Use subdivideCurve1 to get midpoint AND sub-curves in one operation
    // This avoids redundant de Casteljau evaluation
    const [leftCurve, rightCurve] = subdivideCurve1(curve, 0.5);
    const sMid = leftCurve.end; // This is the split point at t=0.5
    const pMid = transform(sMid);
    const [x2, y2] = pMid;

    // Vector from start to midpoint
    const dx2 = x2 - x0;
    const dy2 = y2 - y0;

    // Perpendicular distance (cross product)
    const dz = dy * dx2 - dx * dy2;

    // Check subdivision criteria:
    // 1. Perpendicular distance exceeds threshold
    const perpendicularCheck = (dz * dz) / d2 > options.delta2;

    // 2. Midpoint is too close to an endpoint (not near center)
    const midpointCheck = Math.abs((dx * dx2 + dy * dy2) / d2 - 0.5) > 0.3;

    // 3. Source space distance exceeds threshold
    const sourceDistanceCheck =
      bezierSourceDistance(curve) > options.minSourceDistance;

    if (perpendicularCheck || midpointCheck || sourceDistanceCheck) {
      // Recursively process first half
      resampleBezierCurve(leftCurve, transform, options, depth - 1, result);

      // Add midpoint
      result.push(pMid);

      // Recursively process second half
      resampleBezierCurve(rightCurve, transform, options, depth - 1, result);
    }
  }
}

/**
 * Adaptively resamples a path, transforming points as it goes.
 * Returns a path with transformed, resampled segments converted to smooth Bezier curves
 * using centripetal Catmull-Rom interpolation.
 *
 * Each input segment is processed independently to preserve piecewise smoothness
 * and prevent smoothing across segment boundaries.
 */
export function adaptiveResamplePath(
  path: Path,
  space: CoordinateTransform,
  options?: Partial<ResamplingOptions>
): Path {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const transform = (p: Point) => space.transform(p);

  if (path.length === 0) {
    return [];
  }

  const outputSegments: PathSegment[] = [];

  // Process each input segment independently
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    const segmentPoints: Point[] = [];

    // Add start point (transformed)
    const startPoint = seg.type === "line" ? seg.points[0] : seg.start;
    segmentPoints.push(transform(startPoint));

    // Resample this segment only, collecting points into segmentPoints
    if (seg.type === "line") {
      resampleLineSegment(seg, transform, opts, opts.maxDepth, segmentPoints);
    } else {
      resampleBezierCurve(seg, transform, opts, opts.maxDepth, segmentPoints);
    }

    // Add end point (transformed)
    const endPoint = seg.type === "line" ? seg.points[1] : seg.end;
    segmentPoints.push(transform(endPoint));

    // Thread this segment's points with a centripetal Catmull-Rom (within
    // this segment only). This preserves boundaries - no smoothing across
    // segments
    outputSegments.push(
      ...catmullRomPath(segmentPoints, centripetalKnots(segmentPoints))
    );
  }

  return outputSegments;
}

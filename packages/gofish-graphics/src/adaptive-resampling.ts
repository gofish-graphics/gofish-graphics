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
import {
  Path,
  PathSegment,
  LineSegment,
  BezierCurve,
  Point,
  segment,
  curve,
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
 * Computes squared Euclidean distance between two points
 */
function distanceSquared(p0: Point, p1: Point): number {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  return dx * dx + dy * dy;
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
 * Converts a centripetal Catmull-Rom spline segment to a cubic Bezier curve.
 * Given four control points P0, P1, P2, P3, creates a Bezier curve from P1 to P2.
 * Uses centripetal parameterization (alpha = 0.5) for smooth, cusp-free curves.
 *
 * This uses a standard approximation that works well for centripetal Catmull-Rom splines.
 */
function catmullRomToBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point
): BezierCurve {
  // Centripetal parameterization: calculate distances with alpha = 0.5
  // For centripetal: t_i = sqrt(|P_i - P_{i-1}|)
  const d1 = Math.sqrt(distanceSquared(p0, p1));
  const d2 = Math.sqrt(distanceSquared(p1, p2));
  const d3 = Math.sqrt(distanceSquared(p2, p3));

  // Avoid division by zero
  const eps = 1e-6;
  const d1Safe = Math.max(d1, eps);
  const d2Safe = Math.max(d2, eps);
  const d3Safe = Math.max(d3, eps);

  // Calculate tangents at P1 and P2
  // For centripetal Catmull-Rom, tangents are weighted by the centripetal distances
  // Tangent at P1 points toward P2, weighted by distances from P0
  // Tangent at P2 points from P1, weighted by distances to P3
  const t1x = (p2[0] - p0[0]) / (d1Safe + d2Safe);
  const t1y = (p2[1] - p0[1]) / (d1Safe + d2Safe);
  const t2x = (p3[0] - p1[0]) / (d2Safe + d3Safe);
  const t2y = (p3[1] - p1[1]) / (d2Safe + d3Safe);

  // Convert to Bezier control points
  // The control points are positioned along the tangent vectors
  // The factor d2/3 ensures the Bezier curve approximates the Catmull-Rom segment length
  const control1: Point = [
    p1[0] + (d2Safe / 3) * t1x,
    p1[1] + (d2Safe / 3) * t1y,
  ];
  const control2: Point = [
    p2[0] - (d2Safe / 3) * t2x,
    p2[1] - (d2Safe / 3) * t2y,
  ];

  return curve(p1, control1, control2, p2);
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
 * Converts an array of points to Bezier curves using centripetal Catmull-Rom interpolation.
 * This function handles the conversion for a single segment's resampled points,
 * preserving boundaries by only smoothing within the point set.
 */
export function convertPointsToBezierCurves(points: Point[]): PathSegment[] {
  const segments: PathSegment[] = [];

  if (points.length === 0) {
    return segments;
  }

  if (points.length === 1) {
    // Single point - can't create a segment
    return segments;
  }

  if (points.length === 2) {
    // Two points - can't create Catmull-Rom, use line segment
    segments.push(segment(points[0], points[1]));
    return segments;
  }

  if (points.length === 3) {
    // Three points - create two segments with duplicated endpoints
    // First segment: from points[0] to points[1]
    segments.push(
      catmullRomToBezier(
        points[0], // P0 (duplicate for boundary)
        points[0], // P1 (start of curve)
        points[1], // P2 (end of curve)
        points[2] // P3 (next point for tangent)
      )
    );

    // Second segment: from points[1] to points[2]
    segments.push(
      catmullRomToBezier(
        points[0], // P0 (previous point for tangent)
        points[1], // P1 (start of curve)
        points[2], // P2 (end of curve)
        points[2] // P3 (duplicate for boundary)
      )
    );
    return segments;
  }

  // Four or more points - apply Catmull-Rom conversion for each segment
  for (let i = 0; i < points.length - 1; i++) {
    // For each segment from points[i] to points[i+1], we need 4 points
    let p0: Point, p1: Point, p2: Point, p3: Point;

    if (i === 0) {
      // First segment: duplicate first point for P0
      p0 = points[0];
      p1 = points[0];
      p2 = points[1];
      p3 = points[2];
    } else if (i === points.length - 2) {
      // Last segment: duplicate last point for P3
      p0 = points[i - 1];
      p1 = points[i];
      p2 = points[i + 1];
      p3 = points[i + 1];
    } else {
      // Interior segments: use 4 consecutive points
      p0 = points[i - 1];
      p1 = points[i];
      p2 = points[i + 1];
      p3 = points[i + 2];
    }

    segments.push(catmullRomToBezier(p0, p1, p2, p3));
  }

  return segments;
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

    // Convert this segment's points to Bezier curves (within this segment only)
    // This preserves boundaries - no smoothing across segments
    const bezierSegments = convertPointsToBezierCurves(segmentPoints);
    outputSegments.push(...bezierSegments);
  }

  return outputSegments;
}

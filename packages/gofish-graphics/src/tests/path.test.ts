/**
 * Tests for adaptive resampling in path transformations.
 *
 * Compares adaptive resampling against uniform fine subdivision
 * to verify that adaptive resampling produces similar visual quality
 * with fewer segments.
 */

import {
  Path,
  Point,
  PathSegment,
  BezierCurve,
  segment,
  curve,
  transformPath,
  subdividePath,
  lerpPoint,
} from "../path";
import { polar } from "../ast/coordinateTransforms/polar";
import { CoordinateTransform } from "../ast/coordinateTransforms/coord";

/**
 * Evaluates a cubic bezier curve at parameter t using de Casteljau's algorithm.
 * @param curve The bezier curve to evaluate
 * @param t Parameter value in [0, 1]
 * @returns The point on the curve at parameter t
 */
function evaluateBezierAt(curve: BezierCurve, t: number): Point {
  // Apply de Casteljau's algorithm
  const p01 = lerpPoint(curve.start, curve.control1, t);
  const p12 = lerpPoint(curve.control1, curve.control2, t);
  const p23 = lerpPoint(curve.control2, curve.end, t);

  const p012 = lerpPoint(p01, p12, t);
  const p123 = lerpPoint(p12, p23, t);

  // Final interpolation point - this is the point on the curve at parameter t
  return lerpPoint(p012, p123, t);
}

/**
 * Evaluates a point on a path at parameter t ∈ [0, 1].
 * The parameter is distributed uniformly across segments.
 * @param path The path to evaluate
 * @param t Parameter value in [0, 1]
 * @returns The point on the path at parameter t
 */
function evaluatePathAt(path: Path, t: number): Point {
  if (path.length === 0) {
    throw new Error("Cannot evaluate empty path");
  }

  // Clamp t to [0, 1]
  t = Math.max(0, Math.min(1, t));

  const numSegments = path.length;
  const segmentIndex = Math.floor(t * numSegments);
  const clampedIndex = Math.min(segmentIndex, numSegments - 1);
  const seg = path[clampedIndex];

  // Calculate local parameter within the segment
  const segmentT = (t * numSegments) - clampedIndex;

  if (seg.type === "line") {
    const [p0, p1] = seg.points;
    return lerpPoint(p0, p1, segmentT);
  } else {
    // For bezier curves, use proper de Casteljau evaluation
    return evaluateBezierAt(seg, segmentT);
  }
}

/**
 * Computes the squared Euclidean distance between two points.
 */
function distanceSquared(p0: Point, p1: Point): number {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  return dx * dx + dy * dy;
}

/**
 * Computes the Euclidean distance between two points.
 */
function distance(p0: Point, p1: Point): number {
  return Math.sqrt(distanceSquared(p0, p1));
}

/**
 * Computes the distance from a point to a line segment.
 * @param point The point
 * @param lineStart Start point of the line segment
 * @param lineEnd End point of the line segment
 * @returns The minimum distance from the point to the line segment
 */
function pointToLineDistance(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): number {
  const [px, py] = point;
  const [x0, y0] = lineStart;
  const [x1, y1] = lineEnd;

  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) {
    // Line segment is a point
    return distance(point, lineStart);
  }

  // Project point onto line
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
  const projX = x0 + t * dx;
  const projY = y0 + t * dy;

  return distance(point, [projX, projY]);
}

/**
 * Computes the minimum distance from a point to a bezier curve.
 * Uses sampling to approximate the distance.
 * @param point The point
 * @param curve The bezier curve
 * @param numSamples Number of samples to use (default: 20)
 * @returns The approximate minimum distance from the point to the curve
 */
function pointToBezierDistance(
  point: Point,
  curve: BezierCurve,
  numSamples: number = 20
): number {
  let minDist = Infinity;

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const curvePoint = evaluateBezierAt(curve, t);
    const dist = distance(point, curvePoint);
    minDist = Math.min(minDist, dist);
  }

  return minDist;
}

/**
 * Computes the minimum distance from a point to a path.
 * @param point The point
 * @param path The path
 * @returns The minimum distance from the point to any segment in the path
 */
function pointToPathDistance(point: Point, path: Path): number {
  if (path.length === 0) {
    return Infinity;
  }

  let minDist = Infinity;

  for (const seg of path) {
    if (seg.type === "line") {
      const dist = pointToLineDistance(point, seg.points[0], seg.points[1]);
      minDist = Math.min(minDist, dist);
    } else {
      // For bezier curves, sample to approximate distance
      const dist = pointToBezierDistance(point, seg);
      minDist = Math.min(minDist, dist);
    }
  }

  return minDist;
}

/**
 * Compares adaptive and uniform resampling results by sampling the source path
 * uniformly in parameter space and measuring distances to both transformed paths.
 * @param sourcePath The original source path (before transformation)
 * @param adaptivePath The adaptively resampled and transformed path
 * @param uniformPath The uniformly resampled and transformed path (ground truth)
 * @param space The coordinate transform used
 * @param numSamples Number of sample points along the source path (default: 100)
 * @returns Comparison statistics
 */
function comparePaths(
  sourcePath: Path,
  adaptivePath: Path,
  uniformPath: Path,
  space: CoordinateTransform,
  numSamples: number = 100
): {
  maxDeviation: number;
  adaptiveMaxDist: number;
  uniformMaxDist: number;
} {
  let adaptiveMaxDist = 0;
  let uniformMaxDist = 0;

  // Sample the source path uniformly in parameter space
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;

    // Evaluate point on source path at parameter t
    const sourcePoint = evaluatePathAt(sourcePath, t);

    // Transform to get reference point
    const referencePoint = space.transform(sourcePoint);

    // Measure distance to adaptive path
    const dAdaptive = pointToPathDistance(referencePoint, adaptivePath);
    adaptiveMaxDist = Math.max(adaptiveMaxDist, dAdaptive);

    // Measure distance to uniform path
    const dUniform = pointToPathDistance(referencePoint, uniformPath);
    uniformMaxDist = Math.max(uniformMaxDist, dUniform);
  }

  // Maximum deviation is the difference between the two max distances
  const maxDeviation = Math.abs(adaptiveMaxDist - uniformMaxDist);

  return {
    maxDeviation,
    adaptiveMaxDist,
    uniformMaxDist,
  };
}

/**
 * Samples points along a path by evaluating segments at regular intervals.
 * Used to compare paths by sampling and measuring distances.
 * @deprecated Use comparePaths instead for accurate comparison
 */
function samplePathPoints(path: Path, numSamples: number): Point[] {
  const points: Point[] = [];
  const totalSegments = path.length;

  if (totalSegments === 0) return points;

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const segmentIndex = Math.floor(t * totalSegments);
    const segmentT = t * totalSegments - segmentIndex;

    if (segmentIndex >= totalSegments) {
      // Use last segment's end point
      const lastSeg = path[totalSegments - 1];
      const endPoint =
        lastSeg.type === "line" ? lastSeg.points[1] : lastSeg.end;
      points.push(endPoint);
    } else {
      const seg = path[segmentIndex];
      if (seg.type === "line") {
        const [p0, p1] = seg.points;
        const x = p0[0] + (p1[0] - p0[0]) * segmentT;
        const y = p0[1] + (p1[1] - p0[1]) * segmentT;
        points.push([x, y]);
      } else {
        // For bezier, use de Casteljau at segmentT
        // Simplified: just use linear interpolation for testing
        const x = seg.start[0] + (seg.end[0] - seg.start[0]) * segmentT;
        const y = seg.start[1] + (seg.end[1] - seg.start[1]) * segmentT;
        points.push([x, y]);
      }
    }
  }

  return points;
}

/**
 * Computes maximum deviation between two paths by sampling points.
 */
function maxDeviation(
  path1: Path,
  path2: Path,
  numSamples: number = 100
): number {
  const points1 = samplePathPoints(path1, numSamples);
  const points2 = samplePathPoints(path2, numSamples);

  let maxDist = 0;
  for (let i = 0; i < Math.min(points1.length, points2.length); i++) {
    const [x1, y1] = points1[i];
    const [x2, y2] = points2[i];
    const dist = Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
    maxDist = Math.max(maxDist, dist);
  }

  return maxDist;
}

/**
 * Test: Line segments under polar transform
 */
function testLineSegmentsPolar() {
  console.log("Test 1: Line segments under polar transform");

  // Create a line path in polar coordinates (theta, r)
  const linePath: Path = [
    segment([0, 10], [Math.PI / 2, 50]), // From theta=0, r=10 to theta=π/2, r=50
  ];

  const space = polar();

  // Adaptive resampling
  const adaptiveResult = transformPath(linePath, space, { resample: true });

  // Uniform subdivision (reference)
  const uniformResult = transformPath(subdividePath(linePath, 1000), space);

  console.log(`  Adaptive segments: ${adaptiveResult.length}`);
  console.log(`  Uniform segments: ${uniformResult.length}`);

  const comparison = comparePaths(linePath, adaptiveResult, uniformResult, space, 100);
  console.log(`  Max deviation: ${comparison.maxDeviation.toFixed(4)}`);
  console.log(`  Adaptive max distance: ${comparison.adaptiveMaxDist.toFixed(4)}`);
  console.log(`  Uniform max distance: ${comparison.uniformMaxDist.toFixed(4)}`);

  // Adaptive should use fewer segments but still be close
  const fewerSegments = adaptiveResult.length < uniformResult.length;
  const deviationOk = comparison.maxDeviation < 10;
  const passed = fewerSegments && deviationOk;

  if (!passed) {
    console.log(`  ✗ FAILED:`);
    if (!fewerSegments) {
      console.log(
        `    - Adaptive resampling produced ${adaptiveResult.length} segments, but uniform subdivision produced ${uniformResult.length}.`
      );
      console.log(
        `      Expected adaptive to use fewer segments (it should be more efficient).`
      );
    }
    if (!deviationOk) {
      console.log(
        `    - Maximum deviation ${comparison.maxDeviation.toFixed(4)} exceeds threshold of 10.`
      );
      console.log(
        `      The adaptive resampling result differs too much from the reference.`
      );
      console.log(
        `      This may indicate the resampling algorithm needs tuning (delta2, maxDepth, etc.).`
      );
    }
  } else {
    console.log(`  ✓ PASSED`);
  }
  console.log();

  return passed;
}

/**
 * Test: Bezier curves under polar transform
 */
function testBezierCurvesPolar() {
  console.log("Test 2: Bezier curves under polar transform");

  // Create a bezier path in polar coordinates
  const bezierPath: Path = [
    curve(
      [0, 10], // start: theta=0, r=10
      [Math.PI / 6, 20], // control1
      [Math.PI / 3, 40], // control2
      [Math.PI / 2, 50] // end: theta=π/2, r=50
    ),
  ];

  const space = polar();

  // Adaptive resampling
  const adaptiveResult = transformPath(bezierPath, space, { resample: true });

  // Uniform subdivision (reference)
  const uniformResult = transformPath(subdividePath(bezierPath, 1000), space);

  console.log(`  Adaptive segments: ${adaptiveResult.length}`);
  console.log(`  Uniform segments: ${uniformResult.length}`);

  const comparison = comparePaths(bezierPath, adaptiveResult, uniformResult, space, 100);
  console.log(`  Max deviation: ${comparison.maxDeviation.toFixed(4)}`);
  console.log(`  Adaptive max distance: ${comparison.adaptiveMaxDist.toFixed(4)}`);
  console.log(`  Uniform max distance: ${comparison.uniformMaxDist.toFixed(4)}`);

  const fewerSegments = adaptiveResult.length < uniformResult.length;
  const deviationOk = comparison.maxDeviation < 10;
  const passed = fewerSegments && deviationOk;

  if (!passed) {
    console.log(`  ✗ FAILED:`);
    if (!fewerSegments) {
      console.log(
        `    - Adaptive resampling produced ${adaptiveResult.length} segments, but uniform subdivision produced ${uniformResult.length}.`
      );
      console.log(
        `      Expected adaptive to use fewer segments (it should be more efficient).`
      );
    }
    if (!deviationOk) {
      console.log(
        `    - Maximum deviation ${comparison.maxDeviation.toFixed(4)} exceeds threshold of 10.`
      );
      console.log(
        `      The adaptive resampling result differs too much from the reference.`
      );
      console.log(
        `      This may indicate the resampling algorithm needs tuning (delta2, maxDepth, etc.).`
      );
    }
  } else {
    console.log(`  ✓ PASSED`);
  }
  console.log();

  return passed;
}

/**
 * Test: Mixed paths (lines and beziers)
 */
function testMixedPaths() {
  console.log("Test 3: Mixed paths (lines and beziers)");

  const mixedPath: Path = [
    segment([0, 10], [Math.PI / 4, 30]),
    curve(
      [Math.PI / 4, 30],
      [Math.PI / 3, 35],
      [Math.PI / 2, 40],
      [Math.PI, 50]
    ),
  ];

  const space = polar();

  // Adaptive resampling
  const adaptiveResult = transformPath(mixedPath, space, { resample: true });

  // Uniform subdivision (reference)
  const uniformResult = transformPath(subdividePath(mixedPath, 1000), space);

  console.log(`  Adaptive segments: ${adaptiveResult.length}`);
  console.log(`  Uniform segments: ${uniformResult.length}`);

  const comparison = comparePaths(mixedPath, adaptiveResult, uniformResult, space, 100);
  console.log(`  Max deviation: ${comparison.maxDeviation.toFixed(4)}`);
  console.log(`  Adaptive max distance: ${comparison.adaptiveMaxDist.toFixed(4)}`);
  console.log(`  Uniform max distance: ${comparison.uniformMaxDist.toFixed(4)}`);

  const fewerSegments = adaptiveResult.length < uniformResult.length;
  const deviationOk = comparison.maxDeviation < 10;
  const passed = fewerSegments && deviationOk;

  if (!passed) {
    console.log(`  ✗ FAILED:`);
    if (!fewerSegments) {
      console.log(
        `    - Adaptive resampling produced ${adaptiveResult.length} segments, but uniform subdivision produced ${uniformResult.length}.`
      );
      console.log(
        `      Expected adaptive to use fewer segments (it should be more efficient).`
      );
    }
    if (!deviationOk) {
      console.log(
        `    - Maximum deviation ${comparison.maxDeviation.toFixed(4)} exceeds threshold of 10.`
      );
      console.log(
        `      The adaptive resampling result differs too much from the reference.`
      );
      console.log(
        `      This may indicate the resampling algorithm needs tuning (delta2, maxDepth, etc.).`
      );
    }
  } else {
    console.log(`  ✓ PASSED`);
  }
  console.log();

  return passed;
}

/**
 * Test: Edge cases
 */
function testEdgeCases() {
  console.log("Test 4: Edge cases");

  const space = polar();
  let allPassed = true;

  // Empty path
  const emptyPath: Path = [];
  const emptyResult = transformPath(emptyPath, space, { resample: true });
  const emptyPassed = emptyResult.length === 0;
  if (!emptyPassed) {
    console.log(`  Empty path: ✗ FAILED`);
    console.log(
      `    - Expected empty path to return 0 segments, but got ${emptyResult.length}`
    );
  } else {
    console.log(`  Empty path: ✓ PASSED`);
  }
  allPassed = allPassed && emptyPassed;

  // Single segment path
  const singlePath: Path = [segment([0, 10], [Math.PI / 4, 20])];
  const singleResult = transformPath(singlePath, space, { resample: true });
  const singlePassed = singleResult.length > 0;
  if (!singlePassed) {
    console.log(`  Single segment: ✗ FAILED`);
    console.log(
      `    - Expected single segment path to produce at least 1 segment, but got ${singleResult.length}`
    );
    console.log(
      `    - This suggests the resampling algorithm may be filtering out valid segments.`
    );
  } else {
    console.log(`  Single segment: ✓ PASSED`);
  }
  allPassed = allPassed && singlePassed;

  // Very short segment
  const shortPath: Path = [segment([0, 10], [0.001, 10.001])];
  const shortResult = transformPath(shortPath, space, { resample: true });
  const shortPassed = shortResult.length > 0;
  if (!shortPassed) {
    console.log(`  Very short segment: ✗ FAILED`);
    console.log(
      `    - Expected very short segment to produce at least 1 segment, but got ${shortResult.length}`
    );
    console.log(
      `    - This suggests the resampling algorithm may be incorrectly filtering short segments.`
    );
  } else {
    console.log(`  Very short segment: ✓ PASSED`);
  }
  allPassed = allPassed && shortPassed;

  if (allPassed) {
    console.log(`  ✓ ALL PASSED`);
  } else {
    console.log(`  ✗ SOME FAILED`);
  }
  console.log();

  return allPassed;
}

/**
 * Run all tests
 */
export function runTests() {
  console.log("Running adaptive resampling tests...\n");

  const results = [
    testLineSegmentsPolar(),
    testBezierCurvesPolar(),
    testMixedPaths(),
    testEdgeCases(),
  ];

  const allPassed = results.every((r) => r);

  console.log();
  if (allPassed) {
    console.log("✓ All tests passed!");
  } else {
    console.log("✗ Some tests failed");
    console.log("\nSummary:");
    const testNames = [
      "Line segments under polar transform",
      "Bezier curves under polar transform",
      "Mixed paths (lines and beziers)",
      "Edge cases",
    ];
    results.forEach((passed, i) => {
      console.log(`  ${passed ? "✓" : "✗"} ${testNames[i]}`);
    });
    console.log("\nTroubleshooting:");
    console.log(
      "  - If adaptive resampling uses more segments than uniform, check the subdivision criteria"
    );
    console.log(
      "  - If deviation is too high, try adjusting delta2 or maxDepth in adaptive-resampling.ts"
    );
    console.log(
      "  - If edge cases fail, check that empty/short paths are handled correctly"
    );
  }

  return allPassed;
}

// Run tests if this file is executed directly
if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "")) {
  const ok = runTests();
  process.exit(ok ? 0 : 1);
}

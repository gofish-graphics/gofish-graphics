import { CoordinateTransform } from "./coord";
import { BoundingBox, union } from "../../util/bbox";

export type TransformedBoundingBox = BoundingBox & {
  width: number;
  height: number;
};

/**
 * Samples points from a bounding box in coordinate space for transformation.
 * For polar/clock coordinates, includes additional samples to capture curved edges.
 *
 * `gridSamples` switches to a full (gridSamples+1)² lattice over the box. That is
 * what a MAP PROJECTION needs: it curves in both axes at once, so an extremum of
 * the projected box can sit strictly inside the box (Equal Earth is widest at the
 * equator), which the boundary-only sample set below would miss. `geo`'s `fit`
 * passes it; the affine and polar warps do not, their extremes being on the
 * boundary.
 */
export function sampleBoundingBoxPoints(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  coordTransform: CoordinateTransform,
  gridSamples?: number
): [number, number][] {
  const width = maxX - minX;
  const height = maxY - minY;
  const samples: [number, number][] = [];

  if (gridSamples !== undefined) {
    for (let i = 0; i <= gridSamples; i++) {
      for (let j = 0; j <= gridSamples; j++) {
        samples.push([
          minX + (width * i) / gridSamples,
          minY + (height * j) / gridSamples,
        ]);
      }
    }
    return samples;
  }

  // Sample corners
  samples.push([minX, minY]);
  samples.push([maxX, minY]);
  samples.push([minX, maxY]);
  samples.push([maxX, maxY]);

  // Sample along edges - more samples for better accuracy with polar coordinates
  const numSamples = coordTransform.polar ? 50 : 20;
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    // Bottom edge
    samples.push([minX + width * t, minY]);
    // Top edge - this is the outer arc for polar coordinates
    samples.push([minX + width * t, maxY]);
    // Left edge
    samples.push([minX, minY + height * t]);
    // Right edge
    samples.push([maxX, minY + height * t]);
  }

  // For polar coordinates, also sample the center point (r=0) and midpoints
  if (coordTransform.polar) {
    // Center point
    samples.push([(minX + maxX) / 2, 0]);
    // Additional samples at intermediate radii for better coverage
    for (let r = minY; r <= maxY; r += height / 10) {
      for (let theta = minX; theta <= maxX; theta += width / 20) {
        samples.push([theta, r]);
      }
    }
  }

  return samples;
}

/** How many points along an edge {@link edgeExtreme} starts from. */
const EDGE_SAMPLES = 64;

/**
 * The largest value `f` takes on [0, 1]: the best of evenly spaced samples,
 * then a golden-section search between that sample's neighbors, which finds
 * the maximum exactly where `f` has one peak there (a transformed edge does,
 * at the spacing sampled).
 */
function edgeExtreme(f: (t: number) => number): number {
  let best = 0;
  let bestValue = f(0);
  for (let i = 1; i <= EDGE_SAMPLES; i++) {
    const v = f(i / EDGE_SAMPLES);
    if (v > bestValue) [best, bestValue] = [i, v];
  }
  let lo = Math.max(0, best - 1) / EDGE_SAMPLES;
  let hi = Math.min(EDGE_SAMPLES, best + 1) / EDGE_SAMPLES;
  const g = (Math.sqrt(5) - 1) / 2;
  let a = hi - g * (hi - lo);
  let b = lo + g * (hi - lo);
  let fa = f(a);
  let fb = f(b);
  for (let i = 0; i < 40; i++) {
    if (fa < fb) {
      lo = a;
      a = b;
      fa = fb;
      b = lo + g * (hi - lo);
      fb = f(b);
    } else {
      hi = b;
      b = a;
      fb = fa;
      a = hi - g * (hi - lo);
      fa = f(a);
    }
  }
  return Math.max(bestValue, fa, fb);
}

/**
 * Computes the transformed bounding box of a given bounding box using a coordinate transform.
 * Samples points from the bounding box, transforms them to screen space, and computes
 * the bounding box of the transformed points.
 */
export function computeTransformedBoundingBox(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  coordTransform: CoordinateTransform,
  gridSamples?: number
): TransformedBoundingBox {
  // Sample points from the bounding box
  const samples = sampleBoundingBoxPoints(
    minX,
    maxX,
    minY,
    maxY,
    coordTransform,
    gridSamples
  );

  // Transform all samples to screen space
  const screenSamples = samples.map((coordPoint) =>
    coordTransform.transform([coordPoint[0], coordPoint[1]])
  );

  // Compute bounding box in screen space
  let screenBboxMinX = Math.min(...screenSamples.map((p) => p[0]));
  let screenBboxMaxX = Math.max(...screenSamples.map((p) => p[0]));
  let screenBboxMinY = Math.min(...screenSamples.map((p) => p[1]));
  let screenBboxMaxY = Math.max(...screenSamples.map((p) => p[1]));

  // The samples fall between the box's extremes on a curved edge: a polar
  // disc sampled every 7.2° misses its leftmost point by up to 0.2% of its
  // radius, which the outline drawn there then reaches past. Without a
  // lattice the extremes are on the box's boundary, so each edge's extreme
  // is found exactly, from the best of its samples.
  if (gridSamples === undefined) {
    const edges: [[number, number], [number, number]][] = [
      [
        [minX, minY],
        [maxX, minY],
      ],
      [
        [minX, maxY],
        [maxX, maxY],
      ],
      [
        [minX, minY],
        [minX, maxY],
      ],
      [
        [maxX, minY],
        [maxX, maxY],
      ],
    ];
    for (const [[x0, y0], [x1, y1]] of edges) {
      const at = (t: number) =>
        coordTransform.transform([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
      for (const axis of [0, 1] as const)
        for (const sign of [1, -1] as const) {
          const v = edgeExtreme((t) => sign * at(t)[axis]) * sign;
          if (axis === 0) {
            screenBboxMinX = Math.min(screenBboxMinX, v);
            screenBboxMaxX = Math.max(screenBboxMaxX, v);
          } else {
            screenBboxMinY = Math.min(screenBboxMinY, v);
            screenBboxMaxY = Math.max(screenBboxMaxY, v);
          }
        }
    }
  }

  return {
    minX: screenBboxMinX,
    maxX: screenBboxMaxX,
    minY: screenBboxMinY,
    maxY: screenBboxMaxY,
    width: screenBboxMaxX - screenBboxMinX,
    height: screenBboxMaxY - screenBboxMinY,
  };
}

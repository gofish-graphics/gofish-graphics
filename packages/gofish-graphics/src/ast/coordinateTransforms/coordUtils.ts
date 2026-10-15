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
  const numSamples =
    coordTransform.type === "clock" || coordTransform.type === "polar"
      ? 50
      : 20;
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
  if (coordTransform.type === "clock" || coordTransform.type === "polar") {
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
  const screenBboxMinX = Math.min(...screenSamples.map((p) => p[0]));
  const screenBboxMaxX = Math.max(...screenSamples.map((p) => p[0]));
  const screenBboxMinY = Math.min(...screenSamples.map((p) => p[1]));
  const screenBboxMaxY = Math.max(...screenSamples.map((p) => p[1]));

  return {
    minX: screenBboxMinX,
    maxX: screenBboxMaxX,
    minY: screenBboxMinY,
    maxY: screenBboxMaxY,
    width: screenBboxMaxX - screenBboxMinX,
    height: screenBboxMaxY - screenBboxMinY,
  };
}

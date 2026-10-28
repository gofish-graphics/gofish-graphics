import { CoordinateTransform } from "./coord";
import { BoundingBox } from "../../util/bbox";

export type TransformedBoundingBox = BoundingBox & {
  width: number;
  height: number;
};

/** How many intervals each edge of the box is sampled at. */
const EDGE_SAMPLES = 64;
/** Golden-section steps that refine an edge's best sample: they shrink its
 *  bracket (two sample intervals) by 0.618⁴⁰ ≈ 4·10⁻⁹, so the extreme is
 *  found to the precision the layout keeps. */
const GOLDEN_STEPS = 40;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/**
 * The largest value `f` takes on `[lo, hi]`, where it has one peak there, by
 * golden-section search, at least `floor` (the best sample, which the search
 * starts beside).
 */
function goldenMax(
  f: (t: number) => number,
  lo: number,
  hi: number,
  floor: number
): number {
  let a = hi - GOLDEN * (hi - lo);
  let b = lo + GOLDEN * (hi - lo);
  let fa = f(a);
  let fb = f(b);
  for (let i = 0; i < GOLDEN_STEPS; i++) {
    if (fa < fb) {
      lo = a;
      a = b;
      fa = fb;
      b = lo + GOLDEN * (hi - lo);
      fb = f(b);
    } else {
      hi = b;
      b = a;
      fb = fa;
      a = hi - GOLDEN * (hi - lo);
      fa = f(a);
    }
  }
  return Math.max(floor, fa, fb);
}

/**
 * The bounding box of the image of the segment from `p0` to `p1` under
 * `transform`: evenly spaced samples, then, for each extreme (least and
 * largest x and y), a golden-section search between the neighbors of the
 * sample that attains it, which finds it exactly where the transformed edge
 * has one peak there (it does, at the spacing sampled).
 */
function edgeBox(
  transform: (p: [number, number]) => [number, number],
  [x0, y0]: [number, number],
  [x1, y1]: [number, number]
): BoundingBox {
  const at = (t: number) => transform([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= EDGE_SAMPLES; i++) {
    const [x, y] = at(i / EDGE_SAMPLES);
    xs.push(x);
    ys.push(y);
  }
  // The largest of `sign · values` refined, times `sign`: the maximum for
  // sign 1, the minimum for sign -1.
  const extreme = (axis: 0 | 1, values: number[], sign: 1 | -1): number => {
    let best = 0;
    for (let i = 1; i <= EDGE_SAMPLES; i++)
      if (sign * values[i] > sign * values[best]) best = i;
    const lo = Math.max(0, best - 1) / EDGE_SAMPLES;
    const hi = Math.min(EDGE_SAMPLES, best + 1) / EDGE_SAMPLES;
    const f = (t: number) => sign * at(t)[axis];
    return sign * goldenMax(f, lo, hi, sign * values[best]);
  };
  return {
    minX: extreme(0, xs, -1),
    maxX: extreme(0, xs, 1),
    minY: extreme(1, ys, -1),
    maxY: extreme(1, ys, 1),
  };
}

/**
 * Computes the transformed bounding box of a given bounding box using a
 * coordinate transform: the bounding box, in screen space, of the image of
 * the box.
 *
 * The affine and polar warps have their extremes on the box's boundary, so
 * by default each of the box's four edges is measured exactly ({@link
 * edgeBox}): sampled points fall between a curved edge's extremes (a polar
 * disc sampled every 7.2° misses its leftmost point by up to 0.2% of its
 * radius, which the outline drawn there then reaches past). A polar box also
 * holds the center (r = 0), where the transform folds the box: a donut's
 * hole is inside the box it draws.
 *
 * `gridSamples` switches to a full (gridSamples+1)² lattice over the box. That
 * is what a MAP PROJECTION needs: it curves in both axes at once, so an
 * extremum of the projected box can sit strictly inside the box (Equal Earth
 * is widest at the equator), which the boundary would miss. `geo`'s `fit`
 * passes it.
 */
export function computeTransformedBoundingBox(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  coordTransform: CoordinateTransform,
  gridSamples?: number
): TransformedBoundingBox {
  const box = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };
  const add = (b: BoundingBox) => {
    box.minX = Math.min(box.minX, b.minX);
    box.maxX = Math.max(box.maxX, b.maxX);
    box.minY = Math.min(box.minY, b.minY);
    box.maxY = Math.max(box.maxY, b.maxY);
  };
  const addPoint = ([x, y]: [number, number]) =>
    add({ minX: x, maxX: x, minY: y, maxY: y });

  if (gridSamples !== undefined) {
    for (let i = 0; i <= gridSamples; i++)
      for (let j = 0; j <= gridSamples; j++)
        addPoint(
          coordTransform.transform([
            minX + ((maxX - minX) * i) / gridSamples,
            minY + ((maxY - minY) * j) / gridSamples,
          ])
        );
  } else {
    const transform = coordTransform.transform;
    add(edgeBox(transform, [minX, minY], [maxX, minY]));
    add(edgeBox(transform, [minX, maxY], [maxX, maxY]));
    add(edgeBox(transform, [minX, minY], [minX, maxY]));
    add(edgeBox(transform, [maxX, minY], [maxX, maxY]));
    if (coordTransform.polar) addPoint(transform([(minX + maxX) / 2, 0]));
  }

  return { ...box, width: box.maxX - box.minX, height: box.maxY - box.minY };
}

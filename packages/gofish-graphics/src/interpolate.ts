/**
 * Interpolation over a run of keyframes, with knots at DATA parameter values.
 *
 * This is the temporal reading of what `adaptive-resampling.ts` does in space:
 * `convertPointsToBezierCurves` threads a run of points with a *centripetal*
 * (chord-length) Catmull-Rom, because pixel space has a canonical metric and a
 * path only has to look right. A transition instead evaluates the run at one
 * parameter value — the clock's — and the parameter is the data's own time
 * field (`year`), not an accumulated distance. So the knots here are the data
 * values, and nothing is reparameterized: two keyframes ten years apart take
 * ten years' worth of the clock, whatever the distance between them on screen.
 *
 * Both methods are pure functions of `(knots, values, t)`. `knots` must be
 * sorted ascending and the same length as `values`; the caller sorts once and
 * reuses the ordering for every channel it interpolates (x, y, width, height).
 */

/** How a run is read between its knots. */
export type InterpolationMethod = "linear" | "catmullRom";

/** Locate `t` in an ascending knot array: the index `i` of the segment
 *  `[knots[i], knots[i+1]]` containing `t`, and the local fraction `u` in
 *  `[0, 1]` inside it. `t` outside the run clamps to the first/last segment,
 *  which is what a playhead sitting before the first keyframe (or exactly on
 *  the last) should see: the endpoint value, held. */
function locate(knots: number[], t: number): { i: number; u: number } {
  const n = knots.length;
  if (t <= knots[0]) return { i: 0, u: 0 };
  if (t >= knots[n - 1]) return { i: n - 2, u: 1 };
  // Linear scan: a run is a handful of keyframes, so a binary search would
  // cost more in code than it saves in comparisons.
  let i = 0;
  while (i < n - 2 && knots[i + 1] <= t) i++;
  const span = knots[i + 1] - knots[i];
  // Two keyframes at the SAME time value (duplicate rows for one year) would
  // divide by zero; treat the pair as an instantaneous jump to the later one.
  return { i, u: span === 0 ? 1 : (t - knots[i]) / span };
}

/** Piecewise-linear evaluation: the value moves at a constant rate between
 *  each pair of keyframes, and changes rate at every keyframe. */
export function interpolateLinear(
  knots: number[],
  values: number[],
  t: number
): number {
  if (knots.length === 0) return NaN;
  if (knots.length === 1) return values[0];
  const { i, u } = locate(knots, t);
  return values[i] + (values[i + 1] - values[i]) * u;
}

/**
 * Non-uniform Catmull-Rom evaluation, by the Barry-Goldman pyramid: the value
 * follows a C¹ spline that passes through every keyframe, with each segment
 * parameterized by the knots themselves rather than by a uniform 0..1. That is
 * what makes an uneven run of years (1952, 1957, 1962, …, 2007 with a gap)
 * play at an even speed instead of racing through the short intervals.
 *
 * The two end segments have no outside neighbor, so a phantom knot is
 * reflected outward (`t₀ = t₁ - (t₂ - t₁)`) with the endpoint's own value. A
 * duplicated knot VALUE with a duplicated knot PARAMETER would divide by zero,
 * so the parameter is offset while the value repeats.
 */
export function interpolateCatmullRom(
  knots: number[],
  values: number[],
  t: number
): number {
  const n = knots.length;
  if (n === 0) return NaN;
  if (n === 1) return values[0];
  if (n === 2) return interpolateLinear(knots, values, t);

  const { i, u } = locate(knots, t);
  const t1 = knots[i];
  const t2 = knots[i + 1];
  const p1 = values[i];
  const p2 = values[i + 1];
  // Reflected phantom neighbors at the ends.
  const t0 = i > 0 ? knots[i - 1] : t1 - (t2 - t1);
  const p0 = i > 0 ? values[i - 1] : p1;
  const t3 = i + 2 < n ? knots[i + 2] : t2 + (t2 - t1);
  const p3 = i + 2 < n ? values[i + 2] : p2;

  const tt = t1 + u * (t2 - t1);
  // Guard every denominator: a degenerate span collapses that lerp onto its
  // later endpoint, the same rule `locate` uses.
  const lerp = (a: number, b: number, ta: number, tb: number): number =>
    tb === ta ? b : ((tb - tt) * a + (tt - ta) * b) / (tb - ta);

  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/** Evaluate one channel of a keyframe run at `t`. */
export function interpolateRun(
  knots: number[],
  values: number[],
  t: number,
  method: InterpolationMethod
): number {
  return method === "linear"
    ? interpolateLinear(knots, values, t)
    : interpolateCatmullRom(knots, values, t);
}

/** Sort a run by its knots, returning the ordering so several channels can be
 *  reordered the same way. Keyframes arrive in whatever order the flow
 *  produced its groups, which is not necessarily time order. */
export function knotOrder(knots: number[]): number[] {
  return knots.map((_, i) => i).sort((a, b) => knots[a] - knots[b]);
}

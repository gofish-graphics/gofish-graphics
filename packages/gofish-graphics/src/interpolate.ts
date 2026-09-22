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

export type InterpolateOptions = {
  /** The field the rows are keyed by in time — the playhead's own units. */
  along: string;
  /** The field that says which rows are the same thing at different times.
   *  One output row comes back per value of it. */
  key: string;
  /** Where to read the run, in `along`'s units. */
  at: number;
  /** How a run is read between its keyframes. Default `"catmullRom"`, the
   *  same default `time.transition()` takes for the same reason (the field is
   *  numeric, so the run is a sample of something continuous). */
  method?: InterpolationMethod;
  /** Which fields to interpolate. By default every field whose value is a
   *  finite number at every keyframe of the run, apart from `along` and
   *  `key`. */
  fields?: string[];
};

/**
 * Read a table of keyframes at one moment, in DATA space: one row per `key`,
 * with its numeric fields evaluated at `at` and `along` set to `at`.
 *
 * This is the upstream reading of what `time.transition()` does downstream.
 * The transition interpolates PLACED GEOMETRY — the boxes layout produced —
 * and this interpolates the DATA that geometry came from, leaving the whole
 * pipeline to run over the result. The two agree whenever the path through
 * layout is affine in the interpolated quantities, which a fixed-domain
 * scatter is; see the animation design note, §4.1. They part company as soon
 * as it is not, for example when a scale's domain is inferred from the frame's
 * own rows, or when the mark's size comes from an aggregate of them.
 *
 * Non-numeric fields (a country's name, its region) are not blended — they are
 * copied from the keyframe nearest `at`, the same rule the transition uses for
 * a mark's paint.
 */
export function interpolate<T extends Record<string, unknown>>(
  rows: readonly T[],
  { along, key, at, method = "catmullRom", fields }: InterpolateOptions
): Record<string, unknown>[] {
  // Key order is first appearance, so the output is a deterministic function
  // of the input rather than of a hash's iteration order.
  const runs = new Map<unknown, T[]>();
  for (const row of rows) {
    const k = row[key];
    const run = runs.get(k);
    if (run === undefined) runs.set(k, [row]);
    else run.push(row);
  }

  const out: Record<string, unknown>[] = [];
  for (const [k, run] of runs) {
    const sorted = [...run].sort((a, b) => Number(a[along]) - Number(b[along]));
    const knots = sorted.map((r) => Number(r[along]));
    if (knots.some((v) => !Number.isFinite(v))) {
      throw new Error(
        `[gofish] interpolate(): "${along}" is the playhead's own units, so ` +
          `every row needs a number in it — ${JSON.stringify(k)} has a row ` +
          `whose "${along}" is not one.`
      );
    }

    // Which fields get blended. Every field of the run is considered so a
    // column that only some rows carry still comes out.
    const names = new Set<string>();
    for (const r of sorted) for (const f of Object.keys(r)) names.add(f);
    const blended =
      fields !== undefined
        ? new Set(fields)
        : new Set(
            [...names].filter(
              (f) =>
                f !== along &&
                f !== key &&
                sorted.every(
                  (r) => typeof r[f] === "number" && Number.isFinite(r[f])
                )
            )
          );

    // The keyframe a non-numeric field is copied from: the nearest in time,
    // which is the value that was actually true closest to `at`.
    const nearest = sorted.reduce(
      (best, _r, i) =>
        Math.abs(knots[i] - at) < Math.abs(knots[best] - at) ? i : best,
      0
    );

    const row: Record<string, unknown> = { ...sorted[nearest] };
    for (const f of names) {
      if (!blended.has(f)) continue;
      row[f] = interpolateRun(
        knots,
        sorted.map((r) => Number(r[f])),
        at,
        method
      );
    }
    row[along] = at;
    row[key] = k;
    out.push(row);
  }
  return out;
}

/**
 * Interpolation over a run of keyframes, with knots at DATA parameter values.
 *
 * A transition evaluates a run at one parameter value — the clock's — and the
 * parameter is the data's own time field (`year`), not a distance on screen.
 * So the knots here are the data values, and nothing is reparameterized: two
 * keyframes ten years apart take ten years' worth of the clock, whatever the
 * distance between them on screen. A smooth `line` threaded through the same
 * keyframes with the same `curve` draws the same curve (`spline.ts`) over the
 * same knots.
 *
 * Every method is a pure function of `(knots, values, t)`. `knots` must be
 * sorted ascending and the same length as `values`; the caller sorts once and
 * reuses the ordering for every channel it interpolates (x, y, width, height).
 * A keyed run of rows has one row per knot: `interpolate()` and
 * `time.transition()` check it (`assertOneRowPerKnot`), since a run with two
 * rows at one moment has no one value there.
 */

import { SMOOTH_CURVES, type SmoothCurve, channelSpline } from "./spline";
import { lerp } from "./util";
import type { Curve } from "./families/curve";
import { curveName } from "./ast/graphicalOperators/routers";

/** How a run is read between its knots, from the least to the most smooth.
 *  These are readings of values over a parameter; the screen-space
 *  Catmull-Rom a `line` can draw is not one. The three smooth ones are
 *  `spline.ts`'s data-space curves. */
export type InterpolationMethod = "step" | "linear" | SmoothCurve;

const METHODS: readonly InterpolationMethod[] = [
  "step",
  "linear",
  ...SMOOTH_CURVES,
];

/**
 * The method a `curve` (or `method`) option names. Unset is
 * `"monotone"`: the field is numeric, so the run is a sample of a continuous
 * variable and smooths — the same conclusion `connect`'s auto rule reaches for
 * a continuous connection axis, and the reason a transition traces the curve
 * a smooth threaded line draws. Anything else that is not a method throws,
 * naming `where` the option was written.
 */
export function resolveMethod(
  curve: Curve | undefined,
  where: string
): InterpolationMethod {
  const name = curveName(curve, where);
  if (name === undefined) return "monotone";
  if (METHODS.includes(name as InterpolationMethod)) {
    return name as InterpolationMethod;
  }
  const screenOnly =
    name === "catmullRom"
      ? ` Catmull-Rom is a screen-space path curve: a line's or a ribbon's ` +
        `\`curve\` can draw it, but nothing reads it over time.`
      : "";
  throw new Error(
    `[gofish] ${where}: Curve.${name}() is not a way to read a run ` +
      `between its keyframes. Use ${METHODS.slice(0, -1)
        .map((m) => `Curve.${m}()`)
        .join(", ")} or Curve.${METHODS[METHODS.length - 1]}().` +
      screenOnly
  );
}

/** Where `t` falls in a run: the segment index and the local fraction in it. */
export type KnotLocation = { i: number; u: number };

/** Locate `t` in an ascending knot array: the index `i` of the segment
 *  `[knots[i], knots[i+1]]` containing `t`, and the local fraction `u` in
 *  `[0, 1]` inside it. `t` outside the run clamps to the first/last segment,
 *  which is what a playhead sitting before the first keyframe (or exactly on
 *  the last) should see: the endpoint value, held. */
export function locate(knots: number[], t: number): KnotLocation {
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

/**
 * Check that a run of one key's rows has one row per moment: none of its
 * `knots` repeated, in whatever order they come. Two rows of one key at one
 * value of the ordering field leave no answer to "where is it at that
 * moment?", so this throws, naming the key and the value. `where` names the
 * caller, `field` the ordering field and `key` the key's value (undefined when
 * the run is the whole chart's).
 */
export function assertOneRowPerKnot(
  knots: number[],
  where: string,
  field: string,
  key: unknown
): void {
  const seen = new Set<number>();
  for (const knot of knots) {
    if (!seen.has(knot)) {
      seen.add(knot);
      continue;
    }
    const who =
      key === undefined ? "the run" : `the run for ${JSON.stringify(key)}`;
    throw new Error(
      `[gofish] ${where}: ${who} has two rows at ${field} = ${knot}, so ` +
        `there is no one place it is at that moment. Aggregate to one row ` +
        `per ${field} first; for example, scatter({ by, x, y }) places each ` +
        `group at the mean of its rows.`
    );
  }
}

/** Piecewise-linear evaluation: the value moves at a constant rate between
 *  each pair of keyframes, and changes rate at every keyframe. */
export function interpolateLinear(
  knots: number[],
  values: number[],
  t: number
): number {
  return interpolateRun(knots, values, t, "linear");
}

/**
 * Step evaluation: nothing moves between keyframes. The value is the one the
 * PREVIOUS keyframe set, held until the next keyframe's own time arrives, and
 * then it jumps. This is d3's `curveStepAfter` read on a time axis, and it is
 * what a keyframe means when it is a band rather than a knot: keyframe `i`
 * owns `[t_i, t_{i+1})`.
 *
 * A playhead before the run holds the first value, and one at or after the
 * last knot holds the last, which is the same clamping the other methods do.
 */
export function interpolateStep(
  knots: number[],
  values: number[],
  t: number
): number {
  return interpolateRun(knots, values, t, "step");
}

/**
 * Monotone cubic evaluation: the value follows a smooth curve that passes
 * through every keyframe, with each segment parameterized by the knots
 * themselves rather than by a uniform 0..1. That is what makes an uneven run
 * of years (1952, 1957, 1962, …, 2007 with a gap) play at an even speed
 * instead of racing through the short intervals.
 *
 * The curve is `spline.ts`'s monotone cubic, the one a smooth `line` draws.
 * Between two keyframes it only rises or only falls, so it never goes past
 * either of them, and where the run turns it turns on the keyframe. A run of
 * two keyframes is a straight line.
 */
export function interpolateMonotone(
  knots: number[],
  values: number[],
  t: number
): number {
  return interpolateRun(knots, values, t, "monotone");
}

/** Evaluate one channel of a keyframe run at `t`. A caller reading several
 *  channels, or one channel at many `t`, prepares each with `channelReader`
 *  and locates `t` once instead. */
export function interpolateRun(
  knots: number[],
  values: number[],
  t: number,
  method: InterpolationMethod
): number {
  const read = channelReader(knots, values, method);
  return knots.length < 2 ? read({ i: 0, u: 0 }) : read(locate(knots, t));
}

/**
 * One channel of a keyframe run, prepared once for reading at many located
 * parameters, with a smooth run's curve worked out here rather than on every
 * read. A transition reads every channel of its run on every frame, so it
 * builds these at layout. A run of fewer than two knots holds its one value
 * (or is NaN when empty), wherever it is read.
 */
export function channelReader(
  knots: number[],
  values: number[],
  method: InterpolationMethod
): (at: KnotLocation) => number {
  if (knots.length < 2) {
    const held = knots.length === 0 ? NaN : values[0];
    return () => held;
  }
  if (method === "step") {
    // `locate` only reports `u === 1` past the end of the run; inside a
    // segment the fraction is strictly below 1, so the previous keyframe's
    // value holds.
    return ({ i, u }) => (u >= 1 ? values[i + 1] : values[i]);
  }
  if (method === "linear") {
    return ({ i, u }) => lerp(values[i], values[i + 1], u);
  }
  const spline = channelSpline(method, knots, values);
  return ({ i, u }) => spline.at(i, u);
}

/**
 * The keyframe whose non-blended attributes (a mark's paint, a row's
 * non-numeric fields) a run shows at `t`. Normally the keyframe nearest `t`
 * (ties go to the earlier one), which is the value that was actually true
 * closest to the playhead; under `"step"` the PREVIOUS one — the last knot at
 * or before `t`, or the first when `t` is before the run — so every attribute
 * comes from the keyframe the step method is holding. `knots` must be sorted
 * ascending.
 */
export function sourceIndex(
  knots: number[],
  t: number,
  method: InterpolationMethod
): number {
  let best = 0;
  if (method === "step") {
    for (let i = 0; i < knots.length; i++) if (knots[i] <= t) best = i;
    return best;
  }
  for (let i = 0; i < knots.length; i++) {
    if (Math.abs(knots[i] - t) < Math.abs(knots[best] - t)) best = i;
  }
  return best;
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
  /** How a run is read between its keyframes: `Curve.step()`,
   *  `Curve.linear()`, `Curve.monotone()` or `Curve.smooth()`. Default
   *  `Curve.monotone()`, the same default `time.transition()` takes for the
   *  same reason (the field is numeric, so the run is a sample of something
   *  continuous). `Curve.step()` does not blend at all: each keyframe's values
   *  hold until the next one's time arrives. */
  method?: Curve;
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
 * a mark's paint. Under `"step"` they come from the previous keyframe instead,
 * which is the one the method is holding.
 */
export function interpolate<T extends Record<string, unknown>>(
  rows: readonly T[],
  { along, key, at, method: written, fields }: InterpolateOptions
): Record<string, unknown>[] {
  const method = resolveMethod(written, "interpolate({ method })");
  // Key order is first appearance, so the output is a deterministic function
  // of the input rather than of a hash's iteration order.
  const runs = Map.groupBy(rows, (row) => row[key]);

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
    assertOneRowPerKnot(knots, "interpolate()", along, k);

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

    // The keyframe a non-numeric field is copied from. Normally the nearest
    // in time, which is the value that was actually true closest to `at`;
    // under `"step"` the PREVIOUS one, so every field of the row — blended or
    // copied — comes from the keyframe the step method is holding.
    const source = sourceIndex(knots, at, method);

    const where = knots.length < 2 ? { i: 0, u: 0 } : locate(knots, at);
    const row: Record<string, unknown> = { ...sorted[source] };
    for (const f of names) {
      if (!blended.has(f)) continue;
      const values = sorted.map((r) => Number(r[f]));
      row[f] = channelReader(knots, values, method)(where);
    }
    row[along] = at;
    row[key] = k;
    out.push(row);
  }
  return out;
}

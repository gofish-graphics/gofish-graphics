// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Piecewise-Linear Values — /internals/core/pwl
// </gofish-wiki>

/**
 * Piecewise-linear values in one variable, the algebra size claims are written
 * in. A claim's side is a function of its scope's scale factor σ ≥ 0: a line
 * `slope·σ + intercept` (an {@link Affine}), or a function that is a line on
 * each of a few segments of σ (a {@link Piecewise}), as the max of claims that
 * cross as σ grows. The algebra is closed: sums, scalings and upper envelopes
 * of piecewise-linear values are piecewise-linear, so a composed claim keeps
 * its closed form (printable, and solved exactly for σ).
 *
 * Ported from the symbolic layout kernel (layout-engine-prototype `affine.ts`
 * and `piecewise.ts`, #1176), whose layout solve works in the same values.
 */

/** The line `slope·σ + intercept`. */
export type Affine = {
  readonly kind: "affine";
  readonly slope: number;
  readonly intercept: number;
};

/** The line `slope·σ + intercept` on σ in `[from, to]`. */
export type Segment = {
  readonly from: number;
  readonly to: number;
  readonly slope: number;
  readonly intercept: number;
};

/** A function of σ ≥ 0 that is a line on each of its segments. The segments
 *  are in order, the first starts at 0, each starts where the one before it
 *  ends, the last runs to ∞, and two neighbors are never one line (so there
 *  are at least two: one line is an {@link Affine}). */
export type Piecewise = {
  readonly kind: "piecewise";
  readonly segments: readonly Segment[];
};

export type Pwl = Affine | Piecewise;

export type Value = Pwl;

export const affine = (slope: number, intercept: number): Affine => ({
  kind: "affine",
  slope,
  intercept,
});

/** A value that does not depend on σ. */
export const constant = (value: number): Affine => affine(0, value);

/** The zero claim `0σ + 0`: the extent of nothing (e.g. the descent of an
 *  extent that sits wholly above its baseline). */
export const ZERO: Affine = constant(0);

/** σ itself, `1σ + 0`: one share of a scope. */
export const SIGMA: Affine = affine(1, 0);

export const isAffine = (v: Value): v is Affine => v.kind === "affine";

/** The rounding error a sum of numbers can carry, per unit of the sum of
 *  their sizes: a few ulps, allowing for sums of sums. */
const ROUNDING = 16 * Number.EPSILON;

/**
 * The cancellation rule: a sum whose terms cancel to within the rounding
 * error they carry is 0. `magnitude` is the sum of the terms' sizes. Applied
 * to σ's coefficient, it decides whether a sum depends on σ: two claims whose
 * σ parts cancel (a one-value domain's ascent `5σ + 3` and descent `−5σ + 3`,
 * each off by a rounding) sum to a value that does not, rather than one with
 * a slope of 1e-15 that solves σ ≈ 1e16. The terms are in one unit, so the
 * rule is relative to them, and a small slope summed from small terms is kept.
 */
export const cancel = (sum: number, magnitude: number): number =>
  Math.abs(sum) <= ROUNDING * magnitude ? 0 : sum;

/** The segments of a piecewise-linear value; a line is one segment. */
export const segmentsOf = (p: Pwl): readonly Segment[] =>
  p.kind === "affine"
    ? [{ from: 0, to: Infinity, slope: p.slope, intercept: p.intercept }]
    : p.segments;

/** The value with `segments` in normal form: neighbors on one line merged,
 *  a segment narrower than the rounding of its ends merged into the one
 *  before it (two breakpoints a rounding apart are one), and one line an
 *  {@link Affine}. */
function fromSegments(segments: Segment[]): Pwl {
  const merged: Segment[] = [];
  for (const s of segments) {
    const last = merged[merged.length - 1];
    if (
      last !== undefined &&
      ((last.slope === s.slope && last.intercept === s.intercept) ||
        (s.to < Infinity && cancel(s.to - s.from, s.to + s.from) === 0))
    )
      merged[merged.length - 1] = { ...last, to: s.to };
    else merged.push(s);
  }
  return merged.length === 1
    ? affine(merged[0].slope, merged[0].intercept)
    : { kind: "piecewise", segments: merged };
}

/** The segment of `segments` that holds `x` (the first one below 0). */
function segmentAt(segments: readonly Segment[], x: number): Segment {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].to < x) lo = mid + 1;
    else hi = mid;
  }
  return segments[lo];
}

/** `v` at σ = `x`. */
export function at(v: Value, x: number): number {
  switch (v.kind) {
    case "affine":
      return v.slope * x + v.intercept;
    case "piecewise": {
      const s = segmentAt(v.segments, x);
      return s.slope * x + s.intercept;
    }
  }
}

/** `a + b`, segment by segment over both breakpoints. */
function sum2(a: Pwl, b: Pwl): Pwl {
  const as = segmentsOf(a);
  const bs = segmentsOf(b);
  const out: Segment[] = [];
  let i = 0;
  let j = 0;
  let from = 0;
  for (;;) {
    const sa = as[i];
    const sb = bs[j];
    const to = Math.min(sa.to, sb.to);
    out.push({
      from,
      to,
      slope: cancel(
        sa.slope + sb.slope,
        Math.abs(sa.slope) + Math.abs(sb.slope)
      ),
      intercept: sa.intercept + sb.intercept,
    });
    if (to === Infinity) break;
    if (sa.to === to) i++;
    if (sb.to === to) j++;
    from = to;
  }
  return fromSegments(out);
}

/** The sum of `vs`; σ's coefficient follows the cancellation rule
 *  ({@link cancel}). */
export function add(...vs: Value[]): Value {
  let affines = true;
  for (const v of vs) if (v.kind !== "affine") affines = false;
  if (affines) {
    let slope = 0;
    let intercept = 0;
    let magnitude = 0;
    for (const v of vs as Affine[]) {
      slope += v.slope;
      intercept += v.intercept;
      magnitude += Math.abs(v.slope);
    }
    return affine(cancel(slope, magnitude), intercept);
  }
  return vs.reduce<Pwl>(sum2, ZERO);
}

/** `v + c`. */
export function addConstant(v: Value, c: number): Value {
  switch (v.kind) {
    case "affine":
      return affine(v.slope, v.intercept + c);
    case "piecewise":
      return fromSegments(
        v.segments.map((s) => ({ ...s, intercept: s.intercept + c }))
      );
  }
}

/** `k·v`. */
export function scale(k: number, v: Value): Value {
  switch (v.kind) {
    case "affine":
      return affine(k * v.slope, k * v.intercept);
    case "piecewise":
      return fromSegments(
        v.segments.map((s) => ({
          ...s,
          slope: k * s.slope,
          intercept: k * s.intercept,
        }))
      );
  }
}

/** `−v`. */
export const negate = (v: Value): Value => scale(-1, v);

/**
 * `f` read through `g`: the value `h` of `t` with `h(g(σ)) = f(σ)`, for a
 * `g` that never decreases. It reads a claim in a scope of its own in the
 * σ of the scope around it, where `g` is how long that scope's room is at
 * its own σ (a facet panel's plot, `chromeGutters.ts`). Below `g(0)` no σ
 * makes `g` that short, so `h` is `f(0)` there; where `g` is flat, `h`
 * takes `f` past the flat stretch, as {@link solve} takes the largest σ.
 */
export function through(f: Value, g: Value): Value {
  const out: Segment[] = [];
  const push = (from: number, to: number, slope: number, intercept: number) => {
    const lo = Math.max(0, from);
    if (to > lo) out.push({ from: lo, to, slope, intercept });
  };
  const g0 = at(g, 0);
  push(0, g0, 0, at(f, 0));
  const fs = segmentsOf(f);
  for (const s of segmentsOf(g)) {
    if (!(s.slope > 0)) continue;
    // σ = (t − intercept) / slope on this stretch of g; f's breakpoints
    // inside it cut it.
    const cuts = [
      s.from,
      ...fs.map((x) => x.to).filter((x) => x > s.from && x < s.to),
      s.to,
    ];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const seg = segmentAt(
        fs,
        (cuts[k] + Math.min(cuts[k + 1], cuts[k] + 1)) / 2
      );
      push(
        s.slope * cuts[k] + s.intercept,
        cuts[k + 1] === Infinity
          ? Infinity
          : s.slope * cuts[k + 1] + s.intercept,
        seg.slope / s.slope,
        seg.intercept - (seg.slope * s.intercept) / s.slope
      );
    }
  }
  // Past a g that ends flat, f stays where g left it.
  const last = out[out.length - 1];
  if (last === undefined) return constant(at(f, 0));
  if (last.to < Infinity)
    out.push({
      from: last.to,
      to: Infinity,
      slope: 0,
      intercept: last.slope * last.to + last.intercept,
    });
  return fromSegments(out);
}

/** The upper envelope of `lines` on `[lo, hi]`, as segments in order. In
 *  slope order each line enters and leaves the envelope once, so one pass
 *  over a stack keeps the lines that bound it (a monotone hull). */
function hull(lines: readonly Segment[], lo: number, hi: number): Segment[] {
  const sorted = [...lines].sort(
    (a, b) => a.slope - b.slope || b.intercept - a.intercept
  );
  const stack: { line: Segment; start: number }[] = [];
  for (const line of sorted) {
    const top = stack[stack.length - 1];
    if (top !== undefined && top.line.slope === line.slope) continue;
    let start = -Infinity;
    while (stack.length > 0) {
      const prev = stack[stack.length - 1];
      start =
        (prev.line.intercept - line.intercept) / (line.slope - prev.line.slope);
      if (start > prev.start) break;
      stack.pop();
    }
    stack.push({ line, start: stack.length > 0 ? start : -Infinity });
  }
  const out: Segment[] = [];
  for (let k = 0; k < stack.length; k++) {
    const from = Math.max(lo, stack[k].start);
    const to = Math.min(hi, stack[k + 1]?.start ?? Infinity);
    if (to > from) {
      const { slope, intercept } = stack[k].line;
      out.push({ from, to, slope, intercept });
    }
  }
  return out;
}

/**
 * The upper envelope `max_i vs_i(σ)`. Lines with a negative slope or a zero
 * line are kept (a union's lower reach needs them; {@link max} drops zero
 * claims). Lines are one monotone hull; piecewise values take one hull per
 * stretch between their breakpoints. The max of nothing is −∞.
 */
export function envelope(vs: readonly Value[]): Value {
  if (vs.length === 1) return vs[0];
  if (vs.length === 0) return constant(-Infinity);
  const inputs = vs.map(segmentsOf);
  if (vs.every(isAffine))
    return fromSegments(
      hull(
        inputs.map((s) => s[0]),
        0,
        Infinity
      )
    );
  const cuts = [...new Set(inputs.flatMap((s) => s.map((seg) => seg.to)))].sort(
    (a, b) => a - b
  );
  const next = inputs.map(() => 0);
  const out: Segment[] = [];
  let from = 0;
  for (const to of cuts) {
    if (to <= from) continue;
    const active = inputs.map((segments, i) => {
      while (segments[next[i]].to <= from) next[i]++;
      return segments[next[i]];
    });
    out.push(...hull(active, from, to));
    from = to;
  }
  return fromSegments(out);
}

/** The max of claims, ignoring zero claims: the {@link envelope} of the
 *  non-zero arguments, or the zero claim when none remain. */
export const max = (...vs: Value[]): Value => {
  const kept = vs.filter((v) => !isZero(v));
  return kept.length === 0 ? ZERO : envelope(kept);
};

/** `|v|`: the envelope of `v` and `−v`. */
export const abs = (v: Value): Value => envelope([v, negate(v)]);

/** Whether `v` does not depend on σ. */
export const isConstant = (v: Value): boolean =>
  v.kind === "affine"
    ? v.slope === 0
    : v.kind === "piecewise" && v.segments.every((s) => s.slope === 0);

export const isZero = (v: Value): boolean =>
  v.kind === "affine" && v.slope === 0 && v.intercept === 0;

/**
 * The σ at which `v(σ) = target`: the largest such σ ≥ 0, or undefined when
 * there is none or the solutions run on to ∞ (`v` flat at the target leaves σ
 * undetermined). On a value that rises it is the one solution; on the max of
 * claims that dips and then rises, it is where it rises through the target.
 * `target − intercept` follows the cancellation rule ({@link cancel}), so a
 * value that reaches the target at σ = 0 up to rounding solves 0, not a σ
 * just below it.
 */
export function solve(v: Value, target: number): number | undefined {
  const segments = segmentsOf(v);
  for (let k = segments.length - 1; k >= 0; k--) {
    const s = segments[k];
    const gap = cancel(
      target - s.intercept,
      Math.abs(target) + Math.abs(s.intercept)
    );
    if (s.slope === 0) {
      if (gap === 0) return s.to === Infinity ? undefined : s.to;
      continue;
    }
    const x = gap / s.slope;
    // A root at a breakpoint may land a rounding past either segment.
    const slack = ROUNDING * Math.max(s.from, Number.isFinite(s.to) ? s.to : 0);
    if (x >= s.from - slack && x <= s.to + slack)
      return Math.min(Math.max(x, s.from), s.to);
  }
  return undefined;
}

/** The part of a claim that grows with σ, alone: `s·σ` for the slope `s`
 *  it tends to as σ grows (its last segment's), or undefined when that does
 *  not rise. Solving it against a slot the fixed parts overfill gives the σ
 *  at which what scales fills the slot, drawn as if the fixed parts took no
 *  room. */
export const rising = (v: Value): Affine | undefined => {
  const segments = segmentsOf(v);
  const slope = segments[segments.length - 1].slope;
  return slope > 0 && Number.isFinite(slope) ? affine(slope, 0) : undefined;
};

/**
 * The σ ≥ 0 at which `v` fills `target` ({@link solve}), or, where none
 * does because its fixed parts alone are longer than `target`, the σ at
 * which the part of `v` that grows with σ alone fills it ({@link rising}):
 * `v` drawn as if its fixed parts took no room. Undefined when neither
 * does. The one solve of a claim in its slot (`ScopeRegistry.fit`), and of
 * a plot in a node's own size (`aroundPlot`).
 */
export const fill = (v: Value, target: number): number | undefined => {
  const sigma = solve(v, target);
  if (sigma !== undefined) return sigma;
  const grows = rising(v);
  return grows && solve(grows, target);
};

/**
 * Whether `a` and `b` are the same function of σ within an absolute
 * `tolerance`. Two lines agree everywhere when they agree at σ = 0 and 1.
 * Their difference is a line between breakpoints, so two piecewise values
 * agree everywhere when they agree at 0, 1, every breakpoint of either, and
 * once past the last.
 */
export const approxEqual = (a: Value, b: Value, tolerance = 1e-6): boolean => {
  const close = (x: number): boolean =>
    Math.abs(at(a, x) - at(b, x)) <= tolerance;
  if (a.kind === "affine" && b.kind === "affine") return close(0) && close(1);
  const breaks = [...segmentsOf(a), ...segmentsOf(b)]
    .map((s) => s.to)
    .filter(Number.isFinite);
  const last = Math.max(1, ...breaks);
  return [0, 1, ...breaks, last + 1].every(close);
};

/** `v` as the equation it is: `40σ + 16`; `max(160σ + 16, 90)` for a
 *  piecewise value that bends upward (the max of its lines), else its
 *  segments, `{2σ on [0, 5], 15 − σ on [5, ∞)}`. */
export const print = (v: Value): string => {
  const line = (s: { slope: number; intercept: number }): string => {
    if (s.slope === 0) return `${s.intercept}`;
    const term = `${s.slope}σ`;
    if (s.intercept === 0) return term;
    return s.intercept > 0
      ? `${term} + ${s.intercept}`
      : `${term} - ${-s.intercept}`;
  };
  switch (v.kind) {
    case "affine":
      return line(v);
    case "piecewise": {
      const s = v.segments;
      const convex = s.every(
        (seg, k) => k === 0 || seg.slope >= s[k - 1].slope
      );
      return convex
        ? `max(${s.map(line).join(", ")})`
        : `{${s.map((seg) => `${line(seg)} on [${seg.from}, ${seg.to === Infinity ? "∞" : seg.to})`).join(", ")}}`;
    }
  }
};

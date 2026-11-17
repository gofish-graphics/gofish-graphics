// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * Function values: a function of one parameter, with the interval it is
 * defined over (its domain). A cross-section is a `Fun<Interval>`; an edge, a
 * thickness, a density or an operator's offset is a `Fun<number>`.
 *
 * There are two kinds, and every operation below takes both:
 *
 * - An **exact** function holds its pieces: one polynomial per interval
 *   between knots. A function built from rows ({@link through}) has degree 0
 *   pieces for `Curve.step`, degree 1 for `Curve.linear`, and the cubic
 *   Hermite pieces of `spline.ts` for `Curve.monotone` and `Curve.smooth`. A
 *   constant ({@link constant}) is one piece of degree 0. Sums, scales,
 *   restrictions, envelopes, derivatives and records of exact functions are
 *   exact again, and so are their maxima (at a piece's end or at a root of
 *   its derivative) and integrals (in closed form per piece).
 * - An **opaque** function is only its `at` ({@link opaque}, a user's
 *   `fun()`, or the result of
 *   {@link map} and {@link zip}, which apply a function the module cannot
 *   see into). A query on it is answered to a tolerance, by sampling.
 *
 * Pieces hold numbers or flat records of numbers, so a cross-section's two
 * edges travel together ({@link record}, {@link field}). Only a `Fun<number>`
 * has a maximum, a minimum, an envelope or an integral.
 *
 * Nothing here samples an exact function, and nothing here reads pixels:
 * the parameter is in data units.
 */
import type { Curve } from "../families/curve";
import { channelSpline } from "../spline";

export type Interval = { readonly min: number; readonly max: number };

/** The `Curve` values that are read over a parameter: `Curve.linear()`,
 *  `.step()`, `.monotone()` and `.smooth()`, the same values a ribbon's
 *  `curve` option takes. */
export type ParameterCurve = Extract<
  Curve,
  { kind: "linear" | "step" | "monotone" | "smooth" }
>;

/** What an exact function's pieces hold: a number, or a flat record of
 *  numbers (an interval, a pair of sides). */
export type Linear = number | { readonly [key: string]: number };

/** One polynomial of an exact function, over `[from, to)`: the value at `t`
 *  is `Σ coeffs[k] · (t − at0)^k`. A piece with `from === to` holds the value
 *  at one point (the last knot of a row-built function). */
export type Piece<T> = {
  readonly from: number;
  readonly to: number;
  readonly at0: number;
  readonly coeffs: readonly T[];
};

/** A function of one parameter, with the interval it is defined over. */
export type Fun<T> = {
  readonly domain: Interval;
  /** The value at `t`, for `t` in the domain. */
  readonly at: (t: number) => T;
  /** Where a new piece starts. A function built from rows has one knot per
   *  row. */
  readonly knots?: readonly number[];
  /** How a function built from rows runs between its knots. A sum of two
   *  `linear` functions is `linear`, and of two `step` functions `step`; any
   *  other combination has none, but stays exact through its pieces. */
  readonly curve?: ParameterCurve;
  /** The exact form, when there is one. Pieces are sorted, do not overlap,
   *  and cover the domain. */
  readonly pieces?: readonly Piece<T>[];
};

/** The default tolerance of a query on an opaque function, relative to the
 *  width of its domain (for a place) or absolute (for a value). */
const TOLERANCE = 1e-9;

const SAMPLES = 512;

// ---------------------------------------------------------------------------
// Values: numbers and records of numbers.

const isNumber = (v: Linear): v is number => typeof v === "number";

const vadd = <T extends Linear>(a: T, b: T): T => {
  if (isNumber(a)) return (a + (b as number)) as T;
  const out: Record<string, number> = {};
  const ra = a as Record<string, number>;
  for (const k in ra) out[k] = ra[k] + (b as Record<string, number>)[k];
  return out as T;
};

const vscale = <T extends Linear>(a: T, k: number): T => {
  if (isNumber(a)) return (k * a) as T;
  const out: Record<string, number> = {};
  const ra = a as Record<string, number>;
  for (const key in ra) out[key] = k * ra[key];
  return out as T;
};

const zeroLike = <T extends Linear>(a: T): T => {
  if (isNumber(a)) return 0 as T;
  const out: Record<string, number> = {};
  for (const k in a) out[k] = 0;
  return out as T;
};

// ---------------------------------------------------------------------------
// Polynomials with coefficients in T.

/** Horner's rule. A degree 0 polynomial is its coefficient, at any `s`, so a
 *  constant over the whole line reads the same everywhere. */
const evalPoly = <T extends Linear>(c: readonly T[], s: number): T => {
  let r = c[c.length - 1];
  for (let i = c.length - 2; i >= 0; i--) r = vadd(c[i], vscale(r, s));
  return r;
};

/** The same polynomial expanded about `at0 + d` (a Taylor shift). */
export const shiftPoly = <T extends Linear>(
  c: readonly T[],
  d: number
): T[] => {
  const out = [...c];
  if (d === 0 || out.length < 2) return out;
  const n = out.length;
  for (let i = 0; i < n - 1; i++)
    for (let j = n - 2; j >= i; j--)
      out[j] = vadd(out[j], vscale(out[j + 1], d));
  return out;
};

const addPoly = <T extends Linear>(a: readonly T[], b: readonly T[]): T[] => {
  const n = Math.max(a.length, b.length);
  const out: T[] = [];
  for (let i = 0; i < n; i++)
    out.push(
      i < a.length && i < b.length
        ? vadd(a[i], b[i])
        : i < a.length
          ? a[i]
          : b[i]
    );
  return out;
};

const derivePoly = <T extends Linear>(c: readonly T[]): T[] =>
  c.length < 2
    ? [zeroLike(c[0])]
    : c.slice(1).map((ck, k) => (k === 0 ? ck : vscale(ck, k + 1)));

/** Drop trailing zero coefficients, keeping at least one. */
const trim = (c: readonly number[]): number[] => {
  let n = c.length;
  while (n > 1 && c[n - 1] === 0) n--;
  return c.slice(0, n);
};

/** A finite point to expand a piece over `[a, b)` about. */
const originOf = (a: number, b: number): number =>
  Number.isFinite(a) ? a : Number.isFinite(b) ? b : 0;

/** The real roots of the polynomial `c` (in `s`) strictly inside `(lo, hi)`,
 *  sorted. Closed form up to degree 2; above it, the roots of the
 *  derivative split the interval into monotone runs, each bisected to the
 *  last bit. */
function realRoots(c: readonly number[], lo: number, hi: number): number[] {
  const p = trim(c);
  const deg = p.length - 1;
  if (deg < 1) return [];
  const inside = (r: number) => r > lo && r < hi;
  if (deg === 1) return [-p[0] / p[1]].filter(inside);
  if (deg === 2) {
    const [c0, c1, c2] = p;
    const disc = c1 * c1 - 4 * c2 * c0;
    if (disc < 0) return [];
    if (disc === 0) return [-c1 / (2 * c2)].filter(inside);
    const q = -0.5 * (c1 + Math.sign(c1 || 1) * Math.sqrt(disc));
    const rs = [q / c2, q === 0 ? 0 : c0 / q].sort((a, b) => a - b);
    return rs.filter(inside);
  }
  // Every root lies within the Cauchy bound, so an infinite end is clamped.
  const bound =
    1 + Math.max(...p.slice(0, deg).map((ck) => Math.abs(ck / p[deg])));
  const a = Math.max(lo, -bound);
  const b = Math.min(hi, bound);
  const crit = realRoots(derivePoly(p), a, b);
  const ends = [a, ...crit, b];
  const value = (s: number) => evalPoly(p, s);
  const roots: number[] = [];
  for (let i = 0; i + 1 < ends.length; i++) {
    let l = ends[i];
    let r = ends[i + 1];
    let vl = value(l);
    const vr = value(r);
    if (vl === 0 && i > 0) roots.push(l);
    if (Math.sign(vl) * Math.sign(vr) >= 0) continue;
    for (let k = 0; k < 200; k++) {
      const m = (l + r) / 2;
      if (m <= l || m >= r) break;
      const vm = value(m);
      if (vm === 0) {
        l = r = m;
        break;
      }
      if (Math.sign(vm) === Math.sign(vl)) {
        l = m;
        vl = vm;
      } else r = m;
    }
    roots.push((l + r) / 2);
  }
  return roots.filter(inside);
}

// ---------------------------------------------------------------------------
// Building functions.

const hull = (a: Interval, b: Interval): Interval => ({
  min: Math.min(a.min, b.min),
  max: Math.max(a.max, b.max),
});

/** Whether `t` is in the domain of `f`. */
const inside = (f: Fun<unknown>, t: number): boolean =>
  t >= f.domain.min && t <= f.domain.max;

const isPoint = <T>(p: Piece<T>): boolean => p.from === p.to;

/** The index of the last piece that starts at or before `t` (the first
 *  piece when `t` is before every piece). */
const lastStartingBy = <T>(pieces: readonly Piece<T>[], t: number): number => {
  let lo = 0;
  let hi = pieces.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pieces[mid].from <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

/** The index of the piece that holds `t`. A point piece sorts before the
 *  span that starts at its point, and holds its point: it is the value
 *  there when the function jumps (a step's last knot, or an envelope where
 *  one member's domain ends). */
const pieceIndex = <T>(pieces: readonly Piece<T>[], t: number): number => {
  const i = lastStartingBy(pieces, t);
  return i > 0 && isPoint(pieces[i - 1]) && pieces[i - 1].from === t
    ? i - 1
    : i;
};

/** The span piece (not a point piece) that covers `[t, t + ε)`, or
 *  undefined when there is none. */
const spanPiece = <T>(
  pieces: readonly Piece<T>[],
  t: number
): Piece<T> | undefined => {
  let i = lastStartingBy(pieces, t);
  while (i >= 0 && isPoint(pieces[i])) i--;
  const p = pieces[i];
  return p !== undefined && p.from <= t && t < p.to ? p : undefined;
};

const readPiece = <T extends Linear>(p: Piece<T>, t: number): T =>
  evalPoly(p.coeffs, t - p.at0);

/** An exact function from its pieces: it reads its pieces, and its knots
 *  are where they start. */
const exact = <T extends Linear>(
  domain: Interval,
  pieces: readonly Piece<T>[],
  curve?: ParameterCurve
): Fun<T> => ({
  domain,
  at: (t) => readPiece(pieces[pieceIndex(pieces, t)], t),
  knots: [...new Set(pieces.map((p) => p.from).filter(Number.isFinite))],
  ...(curve !== undefined ? { curve } : {}),
  pieces,
});

/** A function with the value `value` everywhere in `domain` (the whole line
 *  by default): what a box answers for its cross-section. */
export const constant = <T extends Linear>(
  value: T,
  domain: Interval = { min: -Infinity, max: Infinity }
): Fun<T> =>
  exact(
    domain,
    [
      {
        from: domain.min,
        to: domain.max,
        at0: originOf(domain.min, domain.max),
        coeffs: [value],
      },
    ],
    { kind: "linear" }
  );

/** Whether `f` is one value over its whole domain, as {@link constant}
 *  makes it. */
export const isConstant = (f: Fun<Linear>): boolean =>
  f.pieces !== undefined &&
  f.pieces.every((p) => p.coeffs.length === 1) &&
  f.pieces.every((p) => sameValue(p.coeffs[0], f.pieces![0].coeffs[0]));

const sameValue = (a: Linear, b: Linear): boolean =>
  isNumber(a)
    ? Object.is(a, b)
    : Object.keys(a).every((k) =>
        Object.is(a[k], (b as Record<string, number>)[k])
      );

/**
 * The function through `values` at `knots` (strictly ascending), running
 * between them as `curve` says: a function built from rows, one knot per row.
 * Its domain is from the first knot to the last. It is exact: it holds the
 * pieces `curve` draws (for `monotone` and `smooth`, the cubics of
 * `spline.ts`), and it reads each value at its knot exactly.
 */
export function through(
  knots: readonly number[],
  values: readonly number[],
  curve: ParameterCurve
): Fun<number> {
  const n = knots.length;
  if (n === 0) throw new Error("through: a function needs at least one knot.");
  if (values.length !== n)
    throw new Error(
      `through: ${n} knots but ${values.length} values; give one value per knot.`
    );
  for (let i = 1; i < n; i++)
    if (!(knots[i] > knots[i - 1]))
      throw new Error(
        `through: the knots must be strictly ascending, but knot ${i} ` +
          `(${knots[i]}) is not after knot ${i - 1} (${knots[i - 1]}).`
      );
  const pieces: Piece<number>[] = [];
  const bezier =
    curve.kind === "monotone" || curve.kind === "smooth"
      ? channelSpline(curve.kind, [...knots], [...values]).bezier
      : undefined;
  for (let i = 0; i + 1 < n; i++) {
    const t0 = knots[i];
    const h = knots[i + 1] - t0;
    const v0 = values[i];
    let coeffs: number[];
    if (curve.kind === "step") coeffs = [v0];
    else if (curve.kind === "linear") coeffs = [v0, (values[i + 1] - v0) / h];
    else {
      // A Bézier segment over u = (t − t0) / h, in powers of (t − t0).
      const [b0, b1, b2, b3] = bezier!(i);
      coeffs = [
        v0,
        (3 * (b1 - b0)) / h,
        (3 * (b0 - 2 * b1 + b2)) / (h * h),
        (b3 - 3 * b2 + 3 * b1 - b0) / (h * h * h),
      ];
    }
    pieces.push({ from: t0, to: knots[i + 1], at0: t0, coeffs });
  }
  // The last knot's own value, read exactly.
  pieces.push({
    from: knots[n - 1],
    to: knots[n - 1],
    at0: knots[n - 1],
    coeffs: [values[n - 1]],
  });
  return exact({ min: knots[0], max: knots[n - 1] }, pieces, curve);
}

/** Make an opaque function: only its `at` and its domain. `knots` are places
 *  where it may bend sharply; every query is answered to a tolerance and
 *  splits there. A spec makes one with `fun` (groupExpr.ts). */
export const opaque = <T>(
  at: (t: number) => T,
  o: { domain: Interval; knots?: readonly number[] }
): Fun<T> => ({ at, domain: o.domain, ...(o.knots ? { knots: o.knots } : {}) });

/** The identity `t ↦ t` over `domain`: what `support()` gives, the
 *  parameter itself, for a mark's position channel. It is exact (one
 *  linear piece). */
export const identity = (domain: Interval): Fun<number> =>
  domain.min === domain.max
    ? through([domain.min], [domain.min], { kind: "linear" })
    : through([domain.min, domain.max], [domain.min, domain.max], {
        kind: "linear",
      });

// ---------------------------------------------------------------------------
// Combining exact functions piece by piece.

/** The places where any of `fs` starts a new piece or ends its domain,
 *  within `domain`, sorted. */
const boundaries = (
  fs: readonly Fun<unknown>[],
  domain: Interval
): number[] => {
  const ts = new Set<number>([domain.min, domain.max]);
  for (const f of fs) {
    ts.add(f.domain.min);
    ts.add(f.domain.max);
    for (const p of f.pieces ?? []) ts.add(p.from);
  }
  return [...ts]
    .filter((t) => t >= domain.min && t <= domain.max)
    .sort((a, b) => a - b);
};

/** The pieces of `fs` over the common pieces of `domain`: for each span
 *  `[a, b)` between neighboring boundaries (and the point at the last one),
 *  each function's polynomial there expanded about one origin, or undefined
 *  where the function is not defined. `combine` makes the result's
 *  polynomial from them. */
function overPieces<T extends Linear, R extends Linear>(
  fs: readonly Fun<T>[],
  domain: Interval,
  combine: (
    polys: (readonly T[] | undefined)[],
    a: number,
    b: number,
    at0: number
  ) => Piece<R>[]
): Piece<R>[] {
  const bs = boundaries(fs, domain);
  // A point needs a piece of its own where a member's value there is not
  // the one its span goes on with: where its domain ends, or where it has
  // a point piece.
  const points = new Set<number>();
  for (const f of fs) {
    points.add(f.domain.max);
    for (const p of f.pieces!) if (isPoint(p)) points.add(p.from);
  }
  const spans: [number, number][] = [];
  for (let i = 0; i < bs.length; i++) {
    const t = bs[i];
    const next = bs[i + 1];
    if (Number.isFinite(t) && (points.has(t) || next === undefined))
      spans.push([t, t]);
    if (next !== undefined) spans.push([t, next]);
  }
  if (spans.length === 0) spans.push([bs[0], bs[0]]);
  const out: Piece<R>[] = [];
  for (const [a, b] of spans) {
    const at0 = originOf(a, b);
    // A finite point inside the span, to find which piece holds it.
    const probe = Number.isFinite(a)
      ? a
      : Number.isFinite(b)
        ? b - (Math.abs(b) + 1)
        : 0;
    const polys = fs.map((f) => {
      const p =
        a === b
          ? inside(f, a)
            ? f.pieces![pieceIndex(f.pieces!, a)]
            : undefined
          : spanPiece(f.pieces!, probe);
      return p === undefined ? undefined : shiftPoly(p.coeffs, at0 - p.at0);
    });
    out.push(...combine(polys, a, b, at0));
  }
  return out;
}

/** The curve of a sum: linear plus linear is linear, step plus step is
 *  step. */
const sumCurve = (
  a?: ParameterCurve,
  b?: ParameterCurve
): ParameterCurve | undefined =>
  a && b && a.kind === b.kind && (a.kind === "linear" || a.kind === "step")
    ? a
    : undefined;

// ---------------------------------------------------------------------------
// The operations.

/** Apply `g` to every value. The result is opaque: `g` may be any function.
 *  For an exact result use {@link add}, {@link scale}, {@link field} and
 *  {@link record}. */
export const map = <A, B>(f: Fun<A>, g: (a: A) => B): Fun<B> => ({
  domain: f.domain,
  at: (t) => g(f.at(t)),
  ...(f.knots ? { knots: f.knots } : {}),
});

/** Combine two functions pointwise over the hull of their domains; outside
 *  its own domain each reads its `zero`. The result is opaque. */
export const zip = <A, B, C>(
  f: Fun<A>,
  g: Fun<B>,
  h: (a: A, b: B) => C,
  zero: readonly [A, B]
): Fun<C> => ({
  domain: hull(f.domain, g.domain),
  at: (t) =>
    h(inside(f, t) ? f.at(t) : zero[0], inside(g, t) ? g.at(t) : zero[1]),
  knots: [...new Set([...(f.knots ?? []), ...(g.knots ?? [])])].sort(
    (a, b) => a - b
  ),
});

/** Evaluate at `u`. Outside its domain a function of numbers reads 0 (a
 *  thickness of 0). */
const evaluate = (f: Fun<number>, u: number): number =>
  inside(f, u) ? f.at(u) : 0;

/** Add two pointwise, over the hull of their domains. Outside its own
 *  domain each reads 0. Exact when both are. */
export function add<T extends Linear>(f: Fun<T>, g: Fun<T>): Fun<T> {
  const domain = hull(f.domain, g.domain);
  if (f.pieces && g.pieces) {
    const pieces = overPieces<T, T>([f, g], domain, ([p, q], a, b, at0) => {
      const coeffs =
        p && q
          ? addPoly(p, q)
          : p
            ? [...p]
            : q
              ? [...q]
              : [zeroLike(f.pieces![0].coeffs[0])];
      return [{ from: a, to: b, at0, coeffs }];
    });
    return exact(domain, pieces, sumCurve(f.curve, g.curve));
  }
  return {
    domain,
    at: (t) => {
      const inF = inside(f, t);
      const inG = inside(g, t);
      if (inF && inG) return vadd(f.at(t), g.at(t));
      if (inF) return f.at(t);
      if (inG) return g.at(t);
      return zeroLike(f.at(f.domain.min));
    },
    knots: [...new Set([...(f.knots ?? []), ...(g.knots ?? [])])].sort(
      (a, b) => a - b
    ),
  };
}

/** Multiply every value by `k`. */
export function scale<T extends Linear>(f: Fun<T>, k: number): Fun<T> {
  if (f.pieces)
    return exact(
      f.domain,
      f.pieces.map((p) => ({
        ...p,
        coeffs: p.coeffs.map((c) => vscale(c, k)),
      })),
      f.curve
    );
  return { ...f, at: (t) => vscale(f.at(t), k) };
}

/** `f − g`, as `f + (−1)·g`, which is the same number in floating point. */
export const subtract = <T extends Linear>(f: Fun<T>, g: Fun<T>): Fun<T> =>
  add(f, scale(g, -1));

/** `f` read over the parameter `u = a·t + b`, with `a > 0`: the function
 *  `u ↦ f((u − b) / a)`. This is how a function in data units is read in
 *  pixels along its parameter's axis. Exact when `f` is: each piece is the
 *  same polynomial, its `k`th coefficient divided by `aᵏ`. */
export function reparameterize<T extends Linear>(
  f: Fun<T>,
  a: number,
  b: number
): Fun<T> {
  if (!(a > 0 && Number.isFinite(a)) || !Number.isFinite(b))
    throw new Error(
      `reparameterize: the map u = a·t + b must be increasing and finite, ` +
        `but a = ${a} and b = ${b}.`
    );
  const u = (t: number) => a * t + b;
  const domain = { min: u(f.domain.min), max: u(f.domain.max) };
  if (f.pieces)
    return exact(
      domain,
      f.pieces.map((p) => ({
        from: u(p.from),
        to: u(p.to),
        at0: u(p.at0),
        coeffs: p.coeffs.map((c, k) => vscale(c, a ** -k)),
      })),
      f.curve
    );
  return {
    domain,
    at: (s) => f.at((s - b) / a),
    ...(f.knots ? { knots: f.knots.map(u) } : {}),
  };
}

/** Restrict to `cell`: the same function over the part of its domain inside
 *  the cell. This is what `partition` does. */
export function restrict<T>(f: Fun<T>, cell: Interval): Fun<T> {
  const domain = {
    min: Math.max(f.domain.min, cell.min),
    max: Math.min(f.domain.max, cell.max),
  };
  if (domain.min > domain.max)
    throw new Error(
      `restrict: the cell [${cell.min}, ${cell.max}] does not meet the ` +
        `domain [${f.domain.min}, ${f.domain.max}].`
    );
  if (f.pieces) {
    const pieces = f.pieces
      .filter(
        (p) => p.to > domain.min || (p.from === p.to && p.from >= domain.min)
      )
      .filter((p) => p.from <= domain.max)
      .map((p) => ({
        ...p,
        from: Math.max(p.from, domain.min),
        to: Math.min(p.to, domain.max),
      }));
    const out = exact(domain, pieces as Piece<T & Linear>[], f.curve) as Fun<T>;
    return out;
  }
  return {
    ...f,
    domain,
    ...(f.knots
      ? { knots: f.knots.filter((k) => k >= domain.min && k <= domain.max) }
      : {}),
  };
}

/** A record of functions as one function of records: `record({ min, max })`
 *  is a cross-section from its two edges. The domain is the hull of theirs;
 *  outside its own domain each reads 0. Exact when every member is. */
export function record<K extends string>(fields: {
  readonly [key in K]: Fun<number>;
}): Fun<{ readonly [key in K]: number }> {
  type R = { readonly [key in K]: number };
  const keys = Object.keys(fields) as K[];
  const fs = keys.map((k) => fields[k]);
  const domain = fs.slice(1).reduce((d, f) => hull(d, f.domain), fs[0].domain);
  const curves = fs.map((f) => f.curve);
  const curve = curves.reduce((a, b) => sumCurve(a, b));
  if (fs.every((f) => f.pieces)) {
    const pieces = overPieces<number, R>(fs, domain, (polys, a, b, at0) => {
      const n = Math.max(...polys.map((p) => p?.length ?? 1));
      const coeffs: R[] = [];
      for (let i = 0; i < n; i++) {
        const c = {} as Record<K, number>;
        keys.forEach((k, j) => (c[k] = polys[j]?.[i] ?? 0));
        coeffs.push(c);
      }
      return [{ from: a, to: b, at0, coeffs }];
    });
    return exact(domain, pieces, curve);
  }
  return {
    domain,
    at: (t) => {
      const out = {} as Record<K, number>;
      keys.forEach((k) => (out[k] = evaluate(fields[k], t)));
      return out;
    },
  };
}

/** One member of a function of records, as a function of numbers. Exact
 *  when `f` is. */
export function field<
  R extends { readonly [key: string]: number },
  K extends keyof R & string,
>(f: Fun<R>, key: K): Fun<number> {
  if (f.pieces)
    return exact(
      f.domain,
      f.pieces.map((p) => ({ ...p, coeffs: p.coeffs.map((c) => c[key]) })),
      f.curve
    );
  return {
    domain: f.domain,
    at: (t) => f.at(t)[key],
    ...(f.knots ? { knots: f.knots } : {}),
  };
}

/** The places an exact rule reads: the domain's ends and every place a
 *  piece starts (for a function built from rows, its knots), or, for an
 *  opaque function, its domain's ends and its knots. */
export const breakpoints = <T>(f: Fun<T>): number[] => {
  const ts = new Set<number>([f.domain.min, f.domain.max]);
  for (const p of f.pieces ?? []) ts.add(p.from);
  for (const k of f.knots ?? []) ts.add(k);
  return [...ts].filter((t) => inside(f, t)).sort((a, b) => a - b);
};

/** Whether piece `i` is followed by a piece that starts where it ends, so
 *  the value at its end is read by the next piece. */
const continued = <T>(pieces: readonly Piece<T>[], i: number): boolean =>
  i + 1 < pieces.length && pieces[i + 1].from === pieces[i].to;

/** The largest value of a polynomial over `[a, b]` (b included only when
 *  `withEnd`), with the limit at an infinite end. */
function polyMax(
  c: readonly number[],
  a: number,
  b: number,
  at0: number,
  withEnd: boolean
): number {
  const p = trim(c);
  const deg = p.length - 1;
  if (deg === 0) return p[0];
  const lead = p[deg];
  const limit = (dir: 1 | -1) =>
    Math.sign(lead) * (dir === -1 && deg % 2 === 1 ? -1 : 1) * Infinity;
  const vals: number[] = [];
  vals.push(Number.isFinite(a) ? evalPoly(p, a - at0) : limit(-1));
  if (withEnd) vals.push(Number.isFinite(b) ? evalPoly(p, b - at0) : limit(1));
  for (const r of realRoots(derivePoly(p), a - at0, b - at0))
    vals.push(evalPoly(p, r));
  return Math.max(...vals);
}

/** Golden-section search for the largest value of `g` in `[a, b]`. */
function goldenMax(
  g: (t: number) => number,
  a: number,
  b: number,
  tol: number
): number {
  const phi = (Math.sqrt(5) - 1) / 2;
  let x1 = b - phi * (b - a);
  let x2 = a + phi * (b - a);
  let f1 = g(x1);
  let f2 = g(x2);
  while (b - a > tol) {
    if (f1 < f2) {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = a + phi * (b - a);
      f2 = g(x2);
    } else {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = b - phi * (b - a);
      f1 = g(x1);
    }
  }
  return Math.max(f1, f2);
}

const finiteDomain = (f: Fun<unknown>, what: string): void => {
  if (!Number.isFinite(f.domain.min) || !Number.isFinite(f.domain.max))
    throw new Error(
      `${what}: an opaque function over an unbounded domain ` +
        `[${f.domain.min}, ${f.domain.max}] cannot be read to a tolerance.`
    );
};

/** Even samples over the domain, with its knots. */
const samples = (f: Fun<unknown>): number[] => {
  const { min, max } = f.domain;
  const ts = new Set<number>((f.knots ?? []).filter((k) => inside(f, k)));
  for (let i = 0; i <= SAMPLES; i++) ts.add(min + ((max - min) * i) / SAMPLES);
  return [...ts].sort((a, b) => a - b);
};

/** The largest value over the domain: exact for an exact function (at a
 *  piece's end or a root of its derivative), and to `tolerance` (relative to
 *  the domain's width, in the place) for an opaque one. */
export function maximum(f: Fun<number>, tolerance = TOLERANCE): number {
  if (f.pieces) {
    const ps = f.pieces;
    return Math.max(
      ...ps.map((p, i) =>
        polyMax(p.coeffs, p.from, p.to, p.at0, !continued(ps, i))
      )
    );
  }
  finiteDomain(f, "maximum");
  const ts = samples(f);
  const vs = ts.map((t) => f.at(t));
  let best = 0;
  for (let i = 1; i < vs.length; i++) if (vs[i] > vs[best]) best = i;
  const a = ts[Math.max(0, best - 1)];
  const b = ts[Math.min(ts.length - 1, best + 1)];
  const tol = tolerance * Math.max(f.domain.max - f.domain.min, 1e-300);
  return Math.max(vs[best], goldenMax(f.at, a, b, tol));
}

/** The smallest value over the domain ({@link maximum} of `−f`). */
export const minimum = (f: Fun<number>, tolerance = TOLERANCE): number =>
  -maximum(scale(f, -1), tolerance);

/** The pointwise maximum of `fs` over the hull of their domains: the upper
 *  envelope. A function reads nothing outside its domain, and where none is
 *  defined the envelope is −∞ (the upper edge of nothing). Exact when every
 *  one is: each piece is split where two cross. */
export function upperEnvelope(fs: readonly Fun<number>[]): Fun<number> {
  if (fs.length === 0) throw new Error("upperEnvelope: no functions.");
  const domain = fs.slice(1).reduce((d, f) => hull(d, f.domain), fs[0].domain);
  if (fs.every((f) => f.pieces)) {
    const pieces = overPieces<number, number>(
      fs,
      domain,
      (polys, a, b, at0) => {
        const live = polys.filter((p): p is number[] => p !== undefined);
        if (live.length === 0)
          return [{ from: a, to: b, at0, coeffs: [-Infinity] }];
        if (a === b) {
          const vs = live.map((p) => p[0]);
          const top = Math.max(...vs);
          return [
            {
              from: a,
              to: b,
              at0,
              coeffs: [vs.find((v) => Object.is(v, top)) ?? top],
            },
          ];
        }
        // Split where any two cross, then take the one on top in each part.
        // Two constants never cross, so only a pair with a slope can.
        const sloped = live.map((p) => trim(p).length > 1);
        const cuts = new Set<number>();
        for (let i = 0; i < live.length; i++) {
          if (!sloped[i]) continue;
          for (let j = 0; j < live.length; j++) {
            if (j === i || (sloped[j] && j < i)) continue;
            const diff = addPoly(
              live[i],
              live[j].map((c) => -c)
            );
            for (const r of realRoots(diff, a - at0, b - at0))
              cuts.add(r + at0);
          }
        }
        const ends = [a, ...[...cuts].sort((x, y) => x - y), b];
        const out: Piece<number>[] = [];
        for (let k = 0; k + 1 < ends.length; k++) {
          const [l, r] = [ends[k], ends[k + 1]];
          const mid =
            Number.isFinite(l) && Number.isFinite(r)
              ? (l + r) / 2
              : Number.isFinite(l)
                ? l + 1
                : Number.isFinite(r)
                  ? r - 1
                  : 0;
          const vs = live.map((p) => evalPoly(p, mid - at0));
          const top = Math.max(...vs);
          const winner =
            live[vs.findIndex((v) => Object.is(v, top))] ??
            live[vs.indexOf(top)];
          const o = originOf(l, r);
          out.push({
            from: l,
            to: r,
            at0: o,
            coeffs: shiftPoly(winner, o - at0),
          });
        }
        return out;
      }
    );
    return exact(domain, pieces);
  }
  return {
    domain,
    at: (t) => Math.max(...fs.map((f) => (inside(f, t) ? f.at(t) : -Infinity))),
    knots: [...new Set(fs.flatMap((f) => f.knots ?? []))].sort((a, b) => a - b),
  };
}

/** The pointwise minimum of `fs`: the lower envelope, +∞ where none is
 *  defined. */
export const lowerEnvelope = (fs: readonly Fun<number>[]): Fun<number> =>
  scale(upperEnvelope(fs.map((f) => scale(f, -1))), -1);

/** Adaptive Simpson's rule over `[a, b]` to `eps`. */
function simpson(
  g: (t: number) => number,
  a: number,
  b: number,
  eps: number
): number {
  const whole = (l: number, r: number, fl: number, fm: number, fr: number) =>
    ((r - l) / 6) * (fl + 4 * fm + fr);
  const rec = (
    l: number,
    r: number,
    fl: number,
    fm: number,
    fr: number,
    s: number,
    e: number,
    depth: number
  ): number => {
    const m = (l + r) / 2;
    const flm = g((l + m) / 2);
    const fmr = g((m + r) / 2);
    const left = whole(l, m, fl, flm, fm);
    const right = whole(m, r, fm, fmr, fr);
    if (depth <= 0 || Math.abs(left + right - s) <= 15 * e)
      return left + right + (left + right - s) / 15;
    return (
      rec(l, m, fl, flm, fm, left, e / 2, depth - 1) +
      rec(m, r, fm, fmr, fr, right, e / 2, depth - 1)
    );
  };
  const fa = g(a);
  const fb = g(b);
  const fm = g((a + b) / 2);
  return rec(a, b, fa, fm, fb, whole(a, b, fa, fm, fb), eps, 40);
}

/** The integral over the domain: exact, in closed form per piece, for an
 *  exact function (a step holds each value to the next knot), and to
 *  `tolerance` (absolute) for an opaque one. */
export function integrate(f: Fun<number>, tolerance = TOLERANCE): number {
  if (f.pieces) {
    let s = 0;
    for (const p of f.pieces) {
      if (p.from === p.to) continue;
      const c = trim(p.coeffs);
      if (!Number.isFinite(p.from) || !Number.isFinite(p.to)) {
        if (c.length === 1 && c[0] === 0) continue;
        return c.length === 1 ? Math.sign(c[0]) * Infinity : NaN; // only constants extend past every knot
      }
      const sa = p.from - p.at0;
      const sb = p.to - p.at0;
      let pa = sa;
      let pb = sb;
      for (let k = 0; k < c.length; k++) {
        s += (c[k] * (pb - pa)) / (k + 1);
        pa *= sa;
        pb *= sb;
      }
    }
    return s;
  }
  finiteDomain(f, "integrate");
  const ts = breakpoints(f);
  let s = 0;
  for (let i = 0; i + 1 < ts.length; i++)
    s += simpson(
      f.at,
      ts[i],
      ts[i + 1],
      tolerance / Math.max(1, ts.length - 1)
    );
  return s;
}

/** The derivative: exact for an exact function (where a step jumps, it is
 *  the derivative on either side, 0); a central difference to a tolerance
 *  for an opaque one. */
export function derivative(f: Fun<number>, tolerance = TOLERANCE): Fun<number> {
  if (f.pieces)
    return exact(
      f.domain,
      f.pieces.map((p) => ({ ...p, coeffs: derivePoly(p.coeffs) }))
    );
  finiteDomain(f, "derivative");
  const { min, max } = f.domain;
  const h = Math.cbrt(tolerance) * Math.max(max - min, 1e-300);
  return {
    domain: f.domain,
    at: (t) => {
      const l = Math.max(min, t - h);
      const r = Math.min(max, t + h);
      return (f.at(r) - f.at(l)) / (r - l);
    },
    ...(f.knots ? { knots: f.knots } : {}),
  };
}

/** Multiply two functions of numbers pointwise, over the hull of their
 *  domains. Outside its own domain each reads 0. Exact when both are: the
 *  product of two polynomials on each common piece. */
export function multiply(f: Fun<number>, g: Fun<number>): Fun<number> {
  const domain = hull(f.domain, g.domain);
  if (f.pieces && g.pieces) {
    const pieces = overPieces<number, number>(
      [f, g],
      domain,
      ([p, q], a, b, at0) => {
        if (p === undefined || q === undefined)
          return [{ from: a, to: b, at0, coeffs: [0] }];
        const coeffs = new Array<number>(p.length + q.length - 1).fill(0);
        p.forEach((pi, i) => q.forEach((qj, j) => (coeffs[i + j] += pi * qj)));
        return [{ from: a, to: b, at0, coeffs: trim(coeffs) }];
      }
    );
    return exact(domain, pieces);
  }
  return zip(f, g, (a, b) => a * b, [0, 0]);
}

/**
 * The running integral of `f` from `from`: the function whose value at `t`
 * is the integral of `f` from `from` to `t`, and whose derivative is `f`.
 * Exact for an exact function: each piece's polynomial integrated in closed
 * form, each piece continuing from where the one before it ends. For an
 * opaque function its domain must be finite, and the result holds cubic
 * pieces that match the integral to `tolerance` (absolute), with `f` as
 * their slope at their ends; they split at `f`'s knots and wherever the
 * integral bends, so the result follows the function, not the places it was
 * sampled.
 */
export function antiderivative(
  f: Fun<number>,
  from: number = f.domain.min,
  tolerance = TOLERANCE
): Fun<number> {
  if (!Number.isFinite(from))
    throw new Error(
      `antiderivative: the integral runs from ${from}; give a finite start.`
    );
  if (f.pieces) {
    // Each span's integral as a polynomial about its own origin, plus a
    // constant that makes it start where the span before it ends. A point
    // piece holds the value the span before it reaches there.
    const out: Piece<number>[] = [];
    let reached = 0;
    for (const p of f.pieces) {
      if (isPoint(p)) {
        out.push({ ...p, coeffs: [reached] });
        continue;
      }
      const coeffs = [0, ...p.coeffs.map((c, k) => c / (k + 1))];
      if (out.length > 0 && Number.isFinite(p.from))
        coeffs[0] = reached - evalPoly(coeffs, p.from - p.at0);
      const piece = { ...p, coeffs };
      out.push(piece);
      if (Number.isFinite(p.to)) reached = evalPoly(coeffs, p.to - p.at0);
    }
    // Then the whole is moved so it reads 0 at `from`. A piece of 0 slope
    // keeps one coefficient, so the integral of 0 is a constant.
    const zero = exact(f.domain, out).at(from);
    return exact(
      f.domain,
      out.map((p) => ({
        ...p,
        coeffs: trim([p.coeffs[0] - zero, ...p.coeffs.slice(1)]),
      }))
    );
  }
  finiteDomain(f, "antiderivative");
  const ts = [...new Set([...breakpoints(f), from])].sort((a, b) => a - b);
  // The integral at every breakpoint, from the first.
  const values = new Map<number, number>([[ts[0], 0]]);
  for (let i = 0; i + 1 < ts.length; i++)
    values.set(
      ts[i + 1],
      values.get(ts[i])! + simpson(f.at, ts[i], ts[i + 1], tolerance / 4)
    );
  const zero = values.get(from)!;
  // Cubic Hermite pieces through the integral, with `f` as the slope at
  // each end, bisected until they match the integral inside.
  const pieces: Piece<number>[] = [];
  const fit = (
    a: number,
    b: number,
    Fa: number,
    Fb: number,
    depth: number
  ): void => {
    const h = b - a;
    const da = f.at(a);
    const db = f.at(b);
    const coeffs = [
      Fa,
      da,
      (3 * (Fb - Fa)) / (h * h) - (2 * da + db) / h,
      (da + db) / (h * h) - (2 * (Fb - Fa)) / (h * h * h),
    ];
    // A cubic can match the middle and miss elsewhere (a sine's integral
    // over a half period, say), so the check reads the quarters too.
    const m = (a + b) / 2;
    const Fm = Fa + simpson(f.at, a, m, tolerance / 4);
    const misses = [h / 4, h / 2, (3 * h) / 4].some(
      (t) =>
        Math.abs(
          evalPoly(coeffs, t) -
            (t === h / 2 ? Fm : Fa + simpson(f.at, a, a + t, tolerance / 4))
        ) > tolerance
    );
    if (depth > 0 && misses) {
      fit(a, m, Fa, Fm, depth - 1);
      fit(m, b, Fm, Fb, depth - 1);
    } else pieces.push({ from: a, to: b, at0: a, coeffs });
  };
  for (let i = 0; i + 1 < ts.length; i++)
    fit(
      ts[i],
      ts[i + 1],
      values.get(ts[i])! - zero,
      values.get(ts[i + 1])! - zero,
      24
    );
  const last = ts[ts.length - 1];
  pieces.push({
    from: last,
    to: last,
    at0: last,
    coeffs: [values.get(last)! - zero],
  });
  return exact(f.domain, pieces);
}

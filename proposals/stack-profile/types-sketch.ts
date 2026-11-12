/**
 * Types for the stack-profile proposal ("Stacking areas and densities").
 *
 * A sketch, not library code. It imports nothing from the repo and
 * typechecks on its own:
 *
 *   npx tsc --noEmit --strict proposals/stack-profile/types-sketch.ts
 *
 * The page shows the regions between `// #region name` and `// #endregion`.
 * Names follow the #980 sketch (proposals/uncertainty-specs/types-sketch.ts
 * on branch worktree-uncertainty-specs-980): `DistExpr`, `ValueExpr`,
 * `Param`, `dist.normal(...)`. Types it restates are simplified: units are a
 * plain tag here, and #980's dependence parameter is left out.
 */

export {};

// #region function-value
type Interval = { readonly min: number; readonly max: number };

/** The `Curve` values that are read over a parameter (families/curve.ts):
 *  `Curve.linear()`, `.step()`, `.monotone()` and `.smooth()`. The same
 *  value a ribbon's `curve` option takes. Screen-space curves
 *  (`catmullRom`) and the routers are not allowed here. */
type ParameterCurve = {
  readonly kind: "linear" | "step" | "monotone" | "smooth";
};

/** A function of one parameter, with the interval it is defined over. */
type Fun<T> = {
  readonly domain: Interval;
  readonly at: (t: number) => T;
  /** Where a new piece starts. A function built from rows has one knot per
   *  row. */
  readonly knots?: readonly number[];
  /** How it runs between knots. With no curve (a kernel density, which has
   *  no knots) every query is answered to a tolerance. */
  readonly curve?: ParameterCurve;
};

/** Make a function value: the function and its domain, as Chebfun's
 *  `chebfun(f, [a, b])` and Julia's `Fun(f, a..b)` take them. */
const fun = <T>(
  at: (t: number) => T,
  o: { domain: Interval; knots?: readonly number[]; curve?: ParameterCurve }
): Fun<T> => ({ at, ...o });
// #endregion

// #region cross-section
type Box = { min: [number, number]; max: [number, number] };
interface HasBox {
  readonly box: Box;
}

/** The geometry query: for each u on the cross axis, the shape's reach
 *  below (`min`, at most 0) and above (`max`) its baseline along `axis`. */
type CrossSection = Fun<Interval>;
interface HasCrossSection {
  readonly crossSection?: (axis: 0 | 1) => CrossSection;
}

/** The helper every reader calls. A shape that does not answer is read as
 *  its box: a constant cross-section, as `defaultGeometry` falls back to
 *  the box for the other queries. So every node has one, and nothing asks
 *  "is this a box". */
const crossSection = (
  g: HasBox & HasCrossSection,
  axis: 0 | 1
): CrossSection => {
  if (g.crossSection) return g.crossSection(axis);
  const across = 1 - axis;
  const reach = { min: g.box.min[axis], max: g.box.max[axis] };
  return fun(() => reach, {
    domain: { min: g.box.min[across], max: g.box.max[across] },
    knots: [],
    curve: { kind: "linear" },
  });
};
// #endregion

// #region operations
const union = (a: readonly number[] = [], b: readonly number[] = []) =>
  a
    .concat(b)
    .filter((t, i, ts) => ts.indexOf(t) === i)
    .sort((p, q) => p - q);
const hull = (a: Interval, b: Interval): Interval => ({
  min: Math.min(a.min, b.min),
  max: Math.max(a.max, b.max),
});
const inside = (f: Fun<unknown>, t: number) =>
  t >= f.domain.min && t <= f.domain.max;

/** The curve of a pointwise sum. Linear plus linear is linear, and step
 *  plus step is step, exactly. A sum with a cubic piece (monotone, smooth)
 *  is a piecewise cubic on the union of knots, exact per piece, but it is
 *  not the curve `Curve.monotone` would draw through the summed values, so
 *  the engine keeps the pieces; the sketch leaves the curve unset. */
const sumCurve = (
  a?: ParameterCurve,
  b?: ParameterCurve
): ParameterCurve | undefined =>
  a && b && a.kind === b.kind && (a.kind === "linear" || a.kind === "step")
    ? a
    : undefined;

/** Apply `g` to every value. `g` must be linear (take an edge, negate,
 *  scale) for the curve to stay exact. */
const map = <A, B>(f: Fun<A>, g: (a: A) => B): Fun<B> => ({
  ...f,
  at: (t) => g(f.at(t)),
});

/** Combine two functions pointwise over the hull of their domains. Outside
 *  its own domain each reads its `zero` (a thickness of 0). `h` must be
 *  linear (a sum) for the curve to carry over. */
const zip = <A, B, C>(
  f: Fun<A>,
  g: Fun<B>,
  h: (a: A, b: B) => C,
  zero: readonly [A, B]
): Fun<C> => ({
  domain: hull(f.domain, g.domain),
  at: (t) =>
    h(inside(f, t) ? f.at(t) : zero[0], inside(g, t) ? g.at(t) : zero[1]),
  knots: union(f.knots, g.knots),
  curve: sumCurve(f.curve, g.curve),
});

/** 1. Evaluate at u. Outside its domain a thickness is 0. */
const evaluate = (f: Fun<number>, u: number): number =>
  inside(f, u) ? f.at(u) : 0;

/** 2. Add two, pointwise: the stack's running sum. */
const add = (f: Fun<number>, g: Fun<number>): Fun<number> =>
  zip(f, g, (a, b) => a + b, [0, 0]);

/** 3. Scale by a number: "minus half the total" for Baseline.middle(). */
const scale = (f: Fun<number>, k: number): Fun<number> => map(f, (v) => k * v);

/** 4. Restrict to a cell. This is what `partition` does. */
const restrict = <T>(f: Fun<T>, cell: Interval): Fun<T> => ({
  ...f,
  domain: {
    min: Math.max(f.domain.min, cell.min),
    max: Math.min(f.domain.max, cell.max),
  },
  knots: f.knots?.filter((k) => k >= cell.min && k <= cell.max),
});

/** The points an exact rule reads: the domain's ends and the knots. With a
 *  cubic curve or none, the engine adds points until the answer is within
 *  `tolerance` (or solves each cubic piece); the sketch samples evenly. */
const breakpoints = <T>(f: Fun<T>): number[] => {
  const ends = union([f.domain.min, f.domain.max], f.knots);
  const exact = f.curve?.kind === "linear" || f.curve?.kind === "step";
  if (exact) return ends.filter((t) => inside(f, t));
  const n = 512;
  const { min, max } = f.domain;
  const even: number[] = [];
  for (let i = 0; i <= n; i++) even.push(min + ((max - min) * i) / n);
  return union(ends, even).filter((t) => inside(f, t));
};

/** 5. Maximum and minimum over the domain: the box, and the scale domain.
 *  Exact for linear and step: the extremes are at knots. */
const maximum = (f: Fun<number>): number =>
  Math.max(...breakpoints(f).map((t) => f.at(t)));
const minimum = (f: Fun<number>): number => -maximum(scale(f, -1));

/** 6. Integrate over the domain: area, and Baseline.wiggle(). Exact for
 *  linear (trapezoids on the knots) and step (each value held to the next
 *  knot). */
const integrate = (f: Fun<number>): number => {
  const ts = breakpoints(f);
  const held = f.curve?.kind === "step";
  let s = 0;
  for (let i = 1; i < ts.length; i++) {
    const [a, b] = [f.at(ts[i - 1]), f.at(ts[i])];
    s += (ts[i] - ts[i - 1]) * (held ? a : (a + b) / 2);
  }
  return s;
};

/** A cross-section's lower or upper edge, and its thickness. */
const edge = (cs: CrossSection, side: "min" | "max"): Fun<number> =>
  map(cs, (r) => r[side]);
const thickness = (cs: CrossSection): Fun<number> =>
  map(cs, (r) => r.max - r.min);

/** What an operator writes back for each child: an offset for each u.
 *  Today it is one number, the translate. For a box child the function is
 *  constant, which is today's translate. */
type Placement = { readonly offset: Fun<number> };
// #endregion

// #region stack
/** A stack, written with the operations above and nothing else. Child i's
 *  lower edge lies on child i − 1's upper edge at every u, and `baseline`
 *  turns the thicknesses into the offset of the whole. No child is
 *  resized. */
const stack = (
  children: readonly CrossSection[],
  baseline: (thick: readonly Fun<number>[]) => Fun<number>
): Placement[] => {
  const thick = children.map(thickness);
  const base = baseline(thick);
  let below = scale(base, 0); // the sum of the thicknesses before child i
  return children.map((c, i) => {
    const offset = add(add(base, below), scale(edge(c, "min"), -1));
    below = add(below, thick[i]);
    return { offset };
  });
};

const total = (parts: readonly Fun<number>[]): Fun<number> => parts.reduce(add);
const Baseline = {
  start: () => (parts: readonly Fun<number>[]) => scale(total(parts), 0),
  middle: () => (parts: readonly Fun<number>[]) => scale(total(parts), -0.5),
};

// A box child answers with a constant cross-section, so its offset is
// constant: today's translate.
const bars = [
  crossSection({ box: { min: [0, 0], max: [10, 30] } }, 1),
  crossSection({ box: { min: [0, 0], max: [10, 20] } }, 1),
];
const placed = stack(bars, Baseline.start());
const translate = evaluate(placed[1].offset, 5); // 30
// #endregion

// #region dist
/** A unit, as a type tag (#980's `UnitTag`, reduced to its name). */
type Unit = { readonly name: string };
type Ratio = { readonly name: "ratio" };
type Count = { readonly name: "count" };
/** Mass per unit of V: the unit of a density over a variable in V. */
type Per<M extends Unit, V extends Unit> = {
  readonly name: "per";
  readonly mass: M;
  readonly of: V;
};

/** Run time: what a Dist answers. #980's `DistRep` is how a Dist is held
 *  (a family, draws, a mixture, a truncation); this is what every
 *  representation answers. It is a record of numbers and functions and
 *  nothing else, so the spec level is its lift (`Lift`, below). */
interface Dist {
  /** mass × pdf. Its domain is the support. For rows its area is the row
   *  count, so it is a density but not a probability density. */
  readonly density: Fun<number>;
  /** P(value ≤ x), a ratio. */
  readonly cdf: Fun<number>;
  /** The value whose cdf is p. */
  quantile(p: number): number;
  readonly median: number;
  readonly mean: number;
  /** t ↦ t over where the density is drawn: the identity function, whose
   *  domain is the support interval. */
  readonly support: Fun<number>;
  /** 1 for a family; the row count for rows. */
  readonly mass: number;
}

/** A cell of a partition: the same density inside the cell, 0 outside, and
 *  the mass is the cell's share w of the whole. #980's "truncated"
 *  representation. Each function member is restricted with operation 4. */
const restrictDist = (d: Dist, cell: Interval): Dist => {
  const lo = d.cdf.at(cell.min);
  const w = d.cdf.at(cell.max) - lo;
  const density = restrict(d.density, cell);
  return {
    density,
    cdf: restrict(
      map(d.cdf, (c) => Math.min(1, Math.max(0, (c - lo) / w))),
      cell
    ),
    quantile: (p) => d.quantile(lo + p * w),
    median: d.quantile(lo + 0.5 * w),
    mean:
      integrate(fun((t) => t * density.at(t), { domain: density.domain })) /
      integrate(density),
    support: restrict(d.support, cell),
    mass: d.mass * w,
  };
};

// Spec level. Each expression says what kind of value it makes, so a mark's
// types can accept or reject it.

/** One value per row. */
interface RowExpr<V extends Unit> {
  readonly kind: "row";
  readonly unit?: V;
}
/** One value per group (#980's `ValueExpr`). */
interface ValueExpr<V extends Unit> {
  readonly kind: "value";
  readonly unit?: V;
}
/** A function of a mark's parameter t: one function per group. */
interface FunctionExpr<V extends Unit> {
  readonly kind: "function";
  readonly unit?: V;
  /** t ↦ t over this function's own domain, which differs per group. */
  support(): FunctionExpr<Unit>;
}
/** A grouping key whose groups have regions (cells). */
interface KeyExpr {
  readonly kind: "key";
  readonly hasRegion: true;
}
declare const partitionBrand: unique symbol;
type Partition = { readonly [partitionBrand]: true };

/** The units of a Dist of a variable in V with mass in M. This record is
 *  what stays specific to a Dist: each member's unit follows from V and M,
 *  where a record of the user's own has to state them. */
type DistUnits<V extends Unit, M extends Unit> = {
  readonly density: Per<M, V>;
  readonly cdf: Ratio;
  readonly quantile: V;
  readonly median: V;
  readonly mean: V;
  readonly support: V;
  readonly mass: M;
};

/** An expression over a Dist of a variable in V, whose mass is in M: the
 *  run-time Dist lifted by the general rule, so the two cannot drift, plus
 *  the one thing specific to distributions. */
type DistExpr<V extends Unit, M extends Unit = Ratio> = Lift<
  Dist,
  DistUnits<V, M>
> & {
  /** A grouping key with regions: cells along the Dist's axis, each of
   *  which holds `restrictDist` of the whole. */
  bin(p: Partition): KeyExpr;
};

/** A parameter of a dist constructor: a number, a column name, or a value
 *  expression. */
type Param<V extends Unit> = number | string | ValueExpr<V> | RowExpr<V>;

declare const dist: {
  normal<V extends Unit>(p: { mean: Param<V>; sd: Param<V> }): DistExpr<V>;
  // lognormal, student, beta, ... as in #980
  /** The record of units of a Dist's members, for a reduce that returns
   *  a Dist. */
  units<V extends Unit, M extends Unit>(v: V, mass: M): DistUnits<V, M>;
};
// #endregion

// #region lift
/** A value computed once per group, lifted to an expression a spec can
 *  hold. Defined by the shape of V alone:
 *  - a number lifts to a value expression (one value per group);
 *  - a function value lifts to a function expression;
 *  - a record lifts to an object with one method per member, each
 *    returning the lift of that member. A member that is a method keeps its
 *    arguments, so `quantile(p)` stays `quantile(p)`.
 *  A bare JS function is not a value (it has no domain), so it lifts to
 *  `never`. U gives the units (see `Units`). */
type Lift<V, U> = V extends number
  ? ValueExpr<LeafUnit<U>>
  : V extends Fun<number>
    ? FunctionExpr<LeafUnit<U>>
    : V extends (...args: never[]) => unknown
      ? never
      : { readonly [K in keyof V]: LiftMember<V[K], UnitAt<U, K>> };
type LiftMember<T, U> = T extends (...args: infer A) => infer W
  ? (...args: A) => Lift<W, U>
  : () => Lift<T, U>;

/** The units of V: one unit for all of it, or a record that mirrors its
 *  shape (a method's entry is the unit of its result). */
type Units<V> =
  | Unit
  | (V extends number | Fun<number>
      ? never
      : V extends (...args: never[]) => infer W
        ? Units<W>
        : { readonly [K in keyof V]: Units<V[K]> });
type UnitAt<U, K> = U extends Unit ? U : K extends keyof U ? U[K] : never;
type LeafUnit<U> = U extends Unit ? U : never;

/** The one signature of `reduce`: any value, lifted by its shape. */
type Reduce = <T, U extends Units<T>>(
  f: (xs: readonly number[]) => T,
  o: { unit: U }
) => Lift<T, U>;
// #endregion

// #region field
/** `field("mass")` over a group of rows is the empirical Dist of those
 *  rows, with mass in rows (a count), so a field expression is the same
 *  lifted interface plus the row methods and the two custom ones. */
type FieldExpr<V extends Unit> = RowExpr<V> &
  DistExpr<V, Count> & {
    sum(): ValueExpr<V>;
    normalize(): RowExpr<Ratio>;
    /** One value per row. Called once per row with the row's value, its
     *  index, and the group's values. */
    map<R extends Unit>(
      f: (x: number, i: number, xs: readonly number[]) => number,
      o: { unit: R }
    ): RowExpr<R>;
    /** One value per group, called once per group with the group's
     *  values, and lifted by its shape. */
    reduce: Reduce;
  };
// #endregion

// #region channels
/** What a channel of any mark takes today (`DeriveMarkProps`), with the
 *  value-per-row and value-per-group kinds. A bare JS function keeps
 *  meaning a row accessor. */
type Channel<T> =
  | number
  | (keyof T & string)
  | ((d: T) => number)
  | RowExpr<Unit>
  | ValueExpr<Unit>;
/** `ribbon` and `line` also take a function value. */
type CurveChannel<T> = Channel<T> | FunctionExpr<Unit> | Fun<number>;

/** The one rule for a mark that draws along a path: it has one parameter
 *  t, and every channel that holds a function is read at the same t. So
 *  their domains must be equal. */
const checkParameter = (channels: readonly Fun<number>[]): Interval => {
  const [first, ...rest] = channels;
  for (const f of rest)
    if (f.domain.min !== first.domain.min || f.domain.max !== first.domain.max)
      throw new Error(
        "two function channels of one mark are defined over different t"
      );
  return first.domain;
};
// #endregion

// #region claim
/** A stand-in for `Pwl.Value` (ast/solver/pwl.ts): a function of the scale
 *  factor σ ≥ 0 that is a line on each of a few segments of σ. */
type Pwl =
  | {
      readonly kind: "affine";
      readonly slope: number;
      readonly intercept: number;
    }
  | {
      readonly kind: "piecewise";
      readonly segments: readonly {
        from: number;
        to: number;
        slope: number;
        intercept: number;
      }[];
    };
declare function pwlAdd(a: Pwl, b: Pwl): Pwl; // Pwl.add
declare function pwlEnvelope(vs: readonly Pwl[]): Pwl; // Pwl.envelope

type Sigma = Pwl; // a piecewise linear function of the scale factor
/** Today's claim on one axis (ast/extent.ts): the reach above and below
 *  the node's 0, and their total. */
type Extent = { ascent: Sigma; descent: Sigma; width: Sigma };

/** What a node reports up the tree before σ is solved. */
interface Claim {
  /** Today: one Extent per axis, or none for content that takes the room
   *  it is given. */
  box: [Extent | undefined, Extent | undefined];
  /** #967: the radius of a circle around the node, so `pack` fits itself. */
  enclosingRadius?: Sigma;
  /** This proposal: an Extent for each u, with u in the cross axis's DATA
   *  units, so it does not depend on that axis's own scale. */
  crossSection?: (axis: 0 | 1) => Fun<Extent>;
}

const NONE: Extent = {
  ascent: { kind: "affine", slope: 0, intercept: 0 },
  descent: { kind: "affine", slope: 0, intercept: 0 },
  width: { kind: "affine", slope: 0, intercept: 0 },
};
const addExtent = (a: Extent, b: Extent): Extent => ({
  ascent: pwlAdd(a.ascent, b.ascent),
  descent: pwlAdd(a.descent, b.descent),
  width: pwlAdd(a.width, b.width),
});
/** A stack's cross-section claim: its parts' claims added at each u. */
const stackClaim = (parts: readonly Fun<Extent>[]): Fun<Extent> =>
  parts.reduce((s, p) => zip(s, p, addExtent, [NONE, NONE]));
/** Its box claim: the hull over u, as `hullExtent` takes it. For parts
 *  built from rows the largest reach is at a knot. */
const boxClaim = (cs: Fun<Extent>): Extent => {
  const at = breakpoints(cs).map((u) => cs.at(u));
  const ascent = pwlEnvelope(at.map((e) => e.ascent));
  const descent = pwlEnvelope(at.map((e) => e.descent));
  return { ascent, descent, width: pwlAdd(ascent, descent) };
};
// #endregion

// ---------------------------------------------------------------------------
// The croissant and the custom curves, checked against the types above.
// ---------------------------------------------------------------------------

type Mark = { readonly mark: true };
type Flow = { readonly flow: true };
declare function chart<T>(rows: T[]): {
  flow(...ops: Flow[]): { mark(m: Mark): Mark };
};
declare function partition(o: { by: KeyExpr; dir: "x" | "y" }): Flow;
declare function layer(ms: Mark[]): Mark;
declare function ribbon<T>(o: {
  x?: CurveChannel<T>;
  y?: CurveChannel<T>;
  w?: CurveChannel<T>;
  h?: CurveChannel<T>;
  inset?: number;
}): Mark;
declare function line<T>(o: { x?: CurveChannel<T>; y?: CurveChannel<T> }): Mark;
declare function circle<T>(o: {
  cx?: Channel<T>;
  cy?: Channel<T>;
  r?: number;
}): Mark;
declare function rect<T>(o: {
  y?: Channel<T>;
  y2?: Channel<T>;
  w?: Channel<T>;
  h?: Channel<T>;
}): Mark;
declare function quantile(xs: readonly number[], p: number): number;
declare function median(xs: readonly number[]): number;
declare const Bin: { quantiles(n: number): Partition };
declare function field<V extends Unit = Unit>(name: string): FieldExpr<V>;
/** A kernel density estimate of the values: a Dist with mass 1 per value,
 *  over its own support. */
declare function kde(xs: readonly number[]): Dist;
declare function extent(xs: readonly number[]): Interval;

// #region croissant
type Z = { readonly name: "z" };
const params = [{ mean: 0, sd: 1 }];
const d = dist.normal<Z>({ mean: "mean", sd: "sd" }); // DistExpr<Z>
const cells = d.bin(Bin.quantiles(5)); // KeyExpr
const x = d.support(); // FunctionExpr<Z>
const h = d.density(); // FunctionExpr<Per<Ratio, Z>>
const m = d.median(); // ValueExpr<Z>
chart(params)
  .flow(partition({ by: cells, dir: "x" }))
  .mark(layer([ribbon({ x, h, inset: 3 }), circle({ cx: m, cy: 6, r: 3 })]));
// #endregion

// #region custom-curve
type Grams = { readonly name: "g" };
const grams: Grams = { name: "g" };
const count: Count = { name: "count" };

// A reduce that returns a Dist: a custom density, read like the built-in
// one. The units are the record a Dist's members have.
const mass = field<Grams>("mass").reduce((xs) => kde(xs), {
  unit: dist.units(grams, count),
}); // the same type as DistExpr<Grams, Count>, without bin
const density = mass.density(); // FunctionExpr<Per<Count, Grams>>
const q90 = mass.quantile(0.9); // ValueExpr<Grams>
const mid = mass.median(); // ValueExpr<Grams>
ribbon({ x: mass.support(), h: density });
// The same density sideways, for a violin.
ribbon({ y: mass.support(), w: density });
// A P-P plot: two distributions' cdfs read at one t.
const a = dist.normal<Z>({ mean: 0, sd: 1 });
const b = dist.normal<Z>({ mean: 0.5, sd: 1.2 });
line({ x: a.cdf(), y: b.cdf() }); // FunctionExpr<Ratio> twice

// A reduce that returns a number: one value per group.
const top = field<Grams>("mass").reduce((xs) => Math.max(...xs), {
  unit: grams,
}); // ValueExpr<Grams>

// A reduce that returns a function value: one function per group.
const share = field<Grams>("mass").reduce(
  (xs) =>
    fun((t) => xs.filter((v) => v <= t).length / xs.length, {
      domain: extent(xs),
      curve: { kind: "step" },
    }),
  { unit: { name: "ratio" } }
); // FunctionExpr<{ name: "ratio" }>

// A function that is not a distribution: a trend line fitted elsewhere.
declare const fit: { slope: number; intercept: number };
const trend = fun((t) => fit.slope * t + fit.intercept, {
  domain: { min: 1500, max: 5200 },
  curve: { kind: "linear" },
});
line({ x: fun((t) => t, { domain: trend.domain }), y: trend });

// @ts-expect-error a function value in a rect channel is a type error
rect({ h: density });
// @ts-expect-error and so is a plain one
rect({ h: trend });
// #endregion

// #region lift-examples
type USD = { readonly name: "USD" };
const usd: USD = { name: "USD" };
const price = field<USD>("price");

// A number: one value per group.
const most = price.reduce((xs) => Math.max(...xs), { unit: usd });
// ValueExpr<USD>

// A record: one method per member. The summary numbers of a box plot,
// computed once per group.
const s = price.reduce(
  (xs) => ({ lo: quantile(xs, 0.25), mid: median(xs), hi: quantile(xs, 0.75) }),
  { unit: usd }
); // { lo(): ValueExpr<USD>; mid(): ValueExpr<USD>; hi(): ValueExpr<USD> }
layer([
  rect({ w: 16, y: s.lo(), y2: s.hi() }),
  rect({ w: 16, h: 1.5, y: s.mid() }),
]);

// A record in a record: the rule applies again, member by member.
const t = price.reduce(
  (xs) => ({
    box: { lo: quantile(xs, 0.25), hi: quantile(xs, 0.75) },
    n: xs.length,
  }),
  { unit: { box: usd, n: count } }
); // t.box().lo(): ValueExpr<USD>, t.n(): ValueExpr<Count>
rect({ y: t.box().lo(), y2: t.box().hi() });

// @ts-expect-error a record is read through its members, not in a channel
rect({ y: t.box() });
// A bare function has no domain, so it lifts to `never`.
const notAValue: never = price.reduce((xs) => (u: number) => u, {
  unit: usd,
});
// @ts-expect-error a lifted value is not chained: it has no map or reduce
s.lo().map((x: number) => x);
// #endregion

const kinds: [
  DistExpr<Grams, Count>,
  ValueExpr<Grams>,
  ValueExpr<Grams>,
  ValueExpr<Grams>,
  FunctionExpr<Unit>,
  FunctionExpr<Per<Count, Grams>>,
  ValueExpr<USD>,
  ValueExpr<Count>,
] = [{ ...mass, bin: () => cells }, top, q90, mid, share, density, most, t.n()];
/** `never` is assignable to everything, so check that no lift above is
 *  `never` by accident. */
type IsNever<T> = [T] extends [never] ? true : false;
const lifted: [
  IsNever<typeof mass>,
  IsNever<typeof s>,
  IsNever<typeof t>,
  IsNever<typeof density>,
  IsNever<typeof q90>,
  IsNever<typeof notAValue>,
] = [false, false, false, false, false, true];
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const exact: [
  Exactly<typeof density, FunctionExpr<Per<Count, Grams>>>,
  Exactly<ReturnType<typeof s.lo>, ValueExpr<USD>>,
  Exactly<ReturnType<typeof t.n>, ValueExpr<Count>>,
  Exactly<typeof x, FunctionExpr<Z>>,
  Exactly<typeof m, ValueExpr<Z>>,
] = [true, true, true, true, true];
const claim: Claim = { box: [undefined, undefined] };
void [kinds, claim, translate, minimum, restrictDist, checkParameter];
void [stackClaim, boxClaim, lifted, exact];

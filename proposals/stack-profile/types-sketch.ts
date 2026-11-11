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

// #region fn
type Interval = { readonly min: number; readonly max: number };

/** A plain function value as a user writes it: no parameter yet. */
type FnInit = {
  /** The range of the parameter. It belongs to the value, so no spec names it. */
  readonly over: Interval;
  readonly at: (t: number) => number;
  /** Where `at` has a corner. Between two knots it is smooth. A function
   *  built from rows has one knot per row. */
  readonly knots?: readonly number[];
  /** How `at` runs between knots. "linear": a straight line, so sums,
   *  maxima and integrals are exact from the knots alone. "smooth": no
   *  closed form, so a maximum or an integral is found to a tolerance. */
  readonly between?: "linear" | "smooth";
};

/** A value that is a function of one hidden parameter. */
type Fn = FnInit & {
  /** Which hidden parameter this is. Two function channels of one mark
   *  must share it. The engine sets it; a user never writes it. */
  readonly param: symbol;
};
// #endregion

// #region cross-section
type Box = { min: [number, number]; max: [number, number] };
interface HasBox {
  readonly box: Box;
}

/** The geometry query: the shape's interval along `axis` at position u on
 *  the other axis, measured from the shape's baseline. */
type CrossSection = {
  /** Where the shape exists along the cross axis. */
  readonly over: Interval;
  /** Reach below (`min`, at most 0) and above (`max`) the baseline at u. */
  readonly at: (u: number) => Interval;
  readonly knots?: readonly number[];
  readonly between?: "linear" | "smooth";
};
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
  return {
    over: { min: g.box.min[across], max: g.box.max[across] },
    at: () => reach,
    knots: [],
    between: "linear",
  };
};
// #endregion

// #region operations
/** The one parameter of a cross-section's functions: position on the
 *  cross axis. Every child of one operator shares it. */
declare const U: unique symbol;

/** A cross-section's lower or upper edge, as a function of u. */
const edge = (cs: CrossSection, side: "min" | "max"): Fn => ({
  over: cs.over,
  at: (u) => cs.at(u)[side],
  knots: cs.knots,
  between: cs.between,
  param: U,
});

const union = (a: readonly number[] = [], b: readonly number[] = []) =>
  a
    .concat(b)
    .filter((t, i, ts) => ts.indexOf(t) === i)
    .sort((p, q) => p - q);
const hull = (a: Interval, b: Interval): Interval => ({
  min: Math.min(a.min, b.min),
  max: Math.max(a.max, b.max),
});
const inside = (f: FnInit, t: number) => t >= f.over.min && t <= f.over.max;
const sameParam = (f: Fn, g: Fn) => {
  if (f.param !== g.param)
    throw new Error("two functions of different hidden parameters");
};

/** 1. Evaluate at u. Outside its range a thickness is 0. */
const at = (f: Fn, u: number): number => (inside(f, u) ? f.at(u) : 0);

/** 2. Add two, pointwise. The knots are the union. This is the stack's
 *  running sum. */
const add = (f: Fn, g: Fn): Fn => {
  sameParam(f, g);
  return {
    over: hull(f.over, g.over),
    at: (u) => at(f, u) + at(g, u),
    knots: union(f.knots, g.knots),
    between:
      f.between === "linear" && g.between === "linear" ? "linear" : "smooth",
    param: f.param,
  };
};

/** 3. Scale by a number: "minus half the total" for Baseline.middle(). */
const scale = (f: Fn, k: number): Fn => ({ ...f, at: (u) => k * f.at(u) });

/** 4. Restrict to a cell. This is what `partition` does. */
const restrict = (f: Fn, cell: Interval): Fn => ({
  ...f,
  over: {
    min: Math.max(f.over.min, cell.min),
    max: Math.min(f.over.max, cell.max),
  },
  knots: f.knots?.filter((k) => k >= cell.min && k <= cell.max),
});

/** The points where an exact rule reads the function: its range's ends and
 *  its knots. For a "smooth" function the engine adds points until the
 *  answer is within `tolerance`; that loop is internal and is left out. */
const breakpoints = (f: Fn) =>
  union([f.over.min, f.over.max], f.knots).filter((t) => inside(f, t));

/** 5. Maximum and minimum over the range: the box, and the scale domain.
 *  Exact for "linear"; for "smooth", a search to `tolerance`. */
const maximum = (f: Fn, _tolerance = 0): number =>
  Math.max(...breakpoints(f).map(f.at));
const minimum = (f: Fn, tolerance = 0): number =>
  -maximum(scale(f, -1), tolerance);

/** 6. Integrate over the range: area, and Baseline.wiggle(). Exact for
 *  "linear" (the trapezoid rule on the knots is the integral). */
const integrate = (f: Fn, _tolerance = 0): number => {
  const ts = breakpoints(f);
  let s = 0;
  for (let i = 1; i < ts.length; i++)
    s += ((ts[i] - ts[i - 1]) * (f.at(ts[i]) + f.at(ts[i - 1]))) / 2;
  return s;
};

/** What an operator writes back for each child: one offset per child, a
 *  function of u. Today it is one number, the translate. For a box child
 *  the function is constant, which is today's translate. */
type Placement = { readonly offset: (u: number) => number };
// #endregion

// #region stack
/** A stack, written with the operations above and nothing else. Child i's
 *  lower edge lies on child i − 1's upper edge at every u, and `baseline`
 *  turns the total into the offset of the whole. No child is resized. */
const stack = (
  children: readonly CrossSection[],
  baseline: (parts: readonly Fn[]) => Fn
): Placement[] => {
  const lower = children.map((c) => edge(c, "min"));
  const thick = children.map((c) =>
    add(edge(c, "max"), scale(edge(c, "min"), -1))
  );
  const base = baseline(thick);
  let below = scale(base, 0); // the sum of the thicknesses before child i
  return children.map((_, i) => {
    const offset = add(add(base, below), scale(lower[i], -1));
    below = add(below, thick[i]);
    return { offset: (u) => at(offset, u) };
  });
};

const total = (parts: readonly Fn[]): Fn => parts.reduce((s, f) => add(s, f));
const Baseline = {
  start: (): ((parts: readonly Fn[]) => Fn) => (parts) =>
    scale(total(parts), 0),
  middle: (): ((parts: readonly Fn[]) => Fn) => (parts) =>
    scale(total(parts), -0.5),
};

// A box child answers with a constant cross-section, so its offset is
// constant: today's translate.
const bars = [
  crossSection({ box: { min: [0, 0], max: [10, 30] } }, 1),
  crossSection({ box: { min: [0, 0], max: [10, 20] } }, 1),
];
const placed = stack(bars, Baseline.start());
const translate = placed[1].offset(5); // 30
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
 *  representation answers. Its numbers are in the variable's unit, except
 *  where noted. */
interface Dist {
  /** The density, per unit of the variable, with area 1. */
  pdf(x: number): number;
  /** P(value ≤ x), a ratio. */
  cdf(x: number): number;
  /** The value whose cdf is p. */
  quantile(p: number): number;
  /** Where the density is drawn. */
  readonly range: Interval;
  /** 1 for a family; the row count for rows. A density is mass × pdf. */
  readonly mass: number;
  /** A cell of a partition: the same density (mass × pdf) inside the cell,
   *  0 outside. #980's "truncated" representation, with its mass kept. */
  restrict(cell: Interval): Dist;
}

/** One restriction for every Dist: the pdf is rescaled by the cell's share
 *  w, and the mass by w, so mass × pdf is unchanged inside. */
const restrictDist = (d: Dist, cell: Interval): Dist => {
  const lo = d.cdf(cell.min);
  const w = d.cdf(cell.max) - lo;
  const self: Dist = {
    pdf: (x) => (x >= cell.min && x <= cell.max ? d.pdf(x) / w : 0),
    cdf: (x) => Math.min(1, Math.max(0, (d.cdf(x) - lo) / w)),
    quantile: (p) => d.quantile(lo + p * w),
    range: {
      min: Math.max(d.range.min, cell.min),
      max: Math.min(d.range.max, cell.max),
    },
    mass: d.mass * w,
    restrict: (c) => restrictDist(self, c),
  };
  return self;
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
/** A function of a hidden parameter t: one function per group. */
interface FnExpr<V extends Unit> {
  readonly kind: "fn";
  readonly unit?: V;
  /** t ↦ t over this function's own range, sharing its parameter. */
  support(): FnExpr<Unit>;
}
/** A grouping key whose groups have regions (cells). */
interface KeyExpr {
  readonly kind: "key";
  readonly hasRegion: true;
}
declare const partitionBrand: unique symbol;
type Partition = { readonly [partitionBrand]: true };

/** An expression over a Dist of a variable in V, whose mass is in M. */
interface DistExpr<V extends Unit, M extends Unit = Ratio> {
  /** t ↦ t over `range`, in V. */
  support(): FnExpr<V>;
  /** t ↦ mass × pdf(t), in M per V. */
  density(): FnExpr<Per<M, V>>;
  median(): ValueExpr<V>;
  quantile(p: number): ValueExpr<V>;
  mean(): ValueExpr<V>;
  /** A grouping key with regions: cells along the Dist's axis. */
  bin(p: Partition): KeyExpr;
}

/** A parameter of a dist constructor: a number, a column name, or a value
 *  expression. */
type Param<V extends Unit> = number | string | ValueExpr<V> | RowExpr<V>;

declare const dist: {
  normal<V extends Unit>(p: { mean: Param<V>; sd: Param<V> }): DistExpr<V>;
  // lognormal, student, beta, ... as in #980
};
// #endregion

// #region field
/** `field("mass")` over a group of rows is the empirical Dist of those
 *  rows, with mass in rows (a count), so a field expression has the same
 *  methods. Its own methods are the per-row and per-group ones, plus the
 *  two custom ones. */
interface FieldExpr<V extends Unit> extends RowExpr<V>, DistExpr<V, Count> {
  sum(): ValueExpr<V>;
  normalize(): RowExpr<Ratio>;
  /** One value per row. Called once per row with the row's value, its
   *  index, and the group's values. */
  map<R extends Unit>(
    f: (x: number, i: number, xs: readonly number[]) => number,
    o: { unit: R }
  ): RowExpr<R>;
  /** One value per group. Called once per group with the group's values.
   *  A result that is a function (an `FnInit`, with its range) makes a
   *  function value; a number makes one value. */
  reduce<R extends Unit>(
    f: (xs: readonly number[]) => FnInit,
    o: { unit: R }
  ): FnExpr<R>;
  reduce<R extends Unit>(
    f: (xs: readonly number[]) => number,
    o: { unit: R }
  ): ValueExpr<R>;
}

/** A typed constructor for a plain function value. A plain `{ at, over }`
 *  object is the same value. */
const fn = (
  at: (t: number) => number,
  o: { over: Interval; knots?: readonly number[] }
): FnInit => ({ at, ...o });
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
type CurveChannel<T> = Channel<T> | FnExpr<Unit>;
// #endregion

// ---------------------------------------------------------------------------
// The croissant and a custom curve, checked against the types above.
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
  h?: CurveChannel<T>;
  inset?: number;
  fill?: string;
}): Mark;
declare function circle<T>(o: {
  cx?: Channel<T>;
  cy?: Channel<T>;
  r?: number;
}): Mark;
declare function rect<T>(o: { w?: Channel<T>; h?: Channel<T> }): Mark;
declare const Bin: { quantiles(n: number): Partition };
declare function field<V extends Unit = Unit>(name: string): FieldExpr<V>;
declare function kde(xs: readonly number[]): (t: number) => number;
declare function extent(xs: readonly number[]): Interval;

// #region croissant
type Z = { readonly name: "z" };
const params = [{ mean: 0, sd: 1 }];
const d = dist.normal<Z>({ mean: "mean", sd: "sd" }); // DistExpr<Z>
const cells = d.bin(Bin.quantiles(5)); // KeyExpr
const x = d.support(); // FnExpr<Z>
const h = d.density(); // FnExpr<Per<Ratio, Z>>
const m = d.median(); // ValueExpr<Z>
chart(params)
  .flow(partition({ by: cells, dir: "x" }))
  .mark(layer([ribbon({ x, h, inset: 3 }), circle({ cx: m, cy: 6, r: 3 })]));
// #endregion

// #region custom-curve
type Grams = { readonly name: "g" };
const curve = field<Grams>("mass").reduce(
  (xs) => fn(kde(xs), { over: extent(xs) }),
  { unit: { name: "count per g" } }
); // FnExpr
ribbon({ x: curve.support(), h: curve });
const top = field<Grams>("mass").reduce((xs) => Math.max(...xs), {
  unit: { name: "g" },
}); // ValueExpr
// @ts-expect-error a function value in a rect channel is a type error
rect({ h: curve });
// #endregion

const kinds: [FnExpr<Unit>, ValueExpr<Unit>] = [curve, top];
void [kinds, translate, minimum, integrate, restrict, restrictDist];

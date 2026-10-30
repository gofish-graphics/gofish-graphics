/**
 * Types and schema changes for distribution-valued data (#980).
 *
 * A sketch, not library code. It typechecks against the real gofish-ir
 * descriptor DSL and IR types (imported below), and restates the few
 * gofish-graphics types it extends. See types.md beside it for the prose.
 *
 * Layers, in order:
 *   1. Value types: T, its capabilities, Dist<T> and its representations.
 *   2. Data and schema: the column record and the column classes.
 *   3. Field-expression IR: the dist accessor and the new field ops.
 *   4. Construct descriptors: operators and marks, in the table's shape.
 *   5. Strategy families: Band, and the dist family table.
 *   6. The checker: the four errors, as types and as checker pseudo-code.
 */

import {
  t,
  ch,
  boxDims,
  paint,
  type ConstructDescriptor,
  type FieldGroup,
  type FieldSpec,
  type FieldType,
  type StrategyFamily,
} from "../../packages/gofish-ir/src/frontend/descriptors";
import type {
  AxisInterval,
  ChannelValue,
  DatumValue,
  FieldAccessor,
  FieldOpIR,
} from "../../packages/gofish-ir/src/frontend/schema";

// ===========================================================================
// 1. Value types
// ===========================================================================

/** Stand-in for gofish-graphics' `HasUnit` (ast/schema.ts:139), reduced to
 *  what the capability rules read: the unit's name, whether it has
 *  `CanAdd` (#1200), and its difference unit (`Unit.time()`'s is
 *  `Unit.duration`). */
export type UnitTag = {
  readonly name: string;
  readonly canAdd: boolean;
  readonly difference?: UnitTag;
};

/** Amounts in a unit (a column with `HasUnit`, numbers). Every amount is
 *  ordered and affine: a weighted average of amounts is an amount, even of
 *  instants and temperatures, which have no `CanAdd`. */
export type Amount<U extends UnitTag = UnitTag> = {
  readonly kind: "amount";
  readonly unit: U;
};

/** The levels of a finite domain (`HasLevels`). `Domain.ordered(levels)`
 *  adds `HasOrder` (Ordered = true); `Domain.discrete(levels)` does not. */
export type Levels<O extends boolean = boolean> = {
  readonly kind: "levels";
  readonly ordered: O;
};

/** A pair of values (a Dist over (x, y), as in an uncertain scatter). It has
 *  marginals but no single order. */
export type Pair<A extends ValueType, B extends ValueType> = {
  readonly kind: "pair";
  readonly parts: readonly [A, B];
};

export type ValueType =
  | Amount
  | Levels
  | Pair<any, any>
  | DistOf<any, Dependence>;

/** How the draws of different cells relate (design note section 4).
 *  "independent": each cell's draw 3 is its own (dist.normal over parameter
 *  columns, ggdibbler). "joint": draw 3 of every cell is one outcome of the
 *  whole model (a draws column, resample, dist.dirichlet, rvar). */
export type Dependence = "independent" | "joint";

/** A distribution over T, as a type (the thing a channel holds). */
export type DistOf<T extends ValueType, J extends Dependence = Dependence> = {
  readonly kind: "dist";
  readonly of: T;
  readonly dependence: J;
};

// Capabilities of T, in the #1200 vocabulary. Each operation on Dist<T>
// asks for one (design note section 4, the table "What Dist<T> can do").

/** CDF, quantile, median, interval: a linear order. Amounts, and levels
 *  with `HasOrder`. */
export type OrderedValue = Amount | Levels<true>;
/** Mean: an affine structure. Amounts only (also instants and °C). An
 *  ordinal level has an order but no averages. */
export type AffineValue = Amount;
/** Probability of a value: a discrete T (`HasLevels`). */
export type DiscreteValue = Levels;
/** Density (slab, gradient): a reference measure on T, length on numbers. */
export type ContinuousValue = Amount;

/** The difference unit of U: `difference` when set (instant → duration),
 *  else U itself (USD − USD is USD), as `differenceUnits` reads it today
 *  (underlyingSpace.ts). sd returns it. */
export type DiffUnit<U extends UnitTag> = U["difference"] extends UnitTag
  ? U["difference"]
  : U;

/** The probability unit: a share, which adds up (fieldExpr.ts:624,
 *  `shareQuantity`). */
export type Share = Amount<{ name: "share"; canAdd: true }>;

// Example units, as #1200 declares them.
export type USD = { name: "USD"; canAdd: true };
export type Celsius = { name: "°C"; canAdd: false };
export type Duration = { name: "duration"; canAdd: true };
export type Instant = { name: "instant"; canAdd: false; difference: Duration };

/** How a Dist is held at run time. Every representation answers the same
 *  questions (draw, quantile, cdf, mean), some exactly and some from draws.
 *  `V` is the run-time value (a number, or a level). */
export type DistRep<V> =
  /** All mass at one value: a plain cell is pure of itself. */
  | { readonly rep: "pure"; readonly value: V }
  /** A named family with parameters (dist.normal). A parameter may itself
   *  be a Dist, which makes a Dist<Dist<V>> before it is joined. */
  | {
      readonly rep: "family";
      readonly family: DistFamilyName;
      readonly params: Readonly<Record<string, number | V | DistRep<number>>>;
    }
  /** Draws, each with an id and optional weight. `key` says the ids are
   *  values of a draw-key column, shared with other cells (joint). Without
   *  `key`, the draws belong to this cell alone (independent). */
  | {
      readonly rep: "sample";
      readonly draws: readonly V[];
      readonly ids?: readonly (string | number)[];
      readonly weights?: readonly number[];
      readonly key?: { readonly column: string; readonly joint: true };
    }
  /** A weighted mixture: the fold of several rows' Dists into one, the
   *  monad's join when the parts are draws of an outer Dist. */
  | {
      readonly rep: "mixture";
      readonly parts: readonly DistRep<V>[];
      readonly weights: readonly number[];
    }
  /** A Dist restricted to [lo, hi): what a cell of
   *  `field(d).bin(Bin.quantiles(n))` holds. For a sample, it is the draws
   *  that fall in the cell, which is today's row split. */
  | {
      readonly rep: "truncated";
      readonly base: DistRep<V>;
      readonly lo: V;
      readonly hi: V;
    }
  /** A sample smoothed by a kernel (`.kde({ smoothing })`). */
  | {
      readonly rep: "smoothed";
      readonly base: DistRep<V> & { readonly rep: "sample" };
      readonly smoothing: number | "silverman";
    };

/** A nested distribution: a Dist whose values are Dists. */
export type NestedRep<V> = DistRep<DistRep<V>>;

// ===========================================================================
// Expressions (the JS surface, typed by T)
// ===========================================================================

/** A field expression with a plain T result (today's `FieldExpr`, with T
 *  as a phantom so the checker below can read it). */
export interface ValueExpr<T extends ValueType> {
  readonly type: "field" | "dist";
  readonly result?: T;
}

/** The two-ended span `.interval(p)` returns: a plain object of two
 *  quantiles, which is the IR's AxisInterval (schema.ts:906), so it fills a
 *  `dims` entry with no IR change. */
export type IntervalOf<T extends ValueType> = {
  readonly min: ValueExpr<T>;
  readonly max: ValueExpr<T>;
};

/** A Dist-valued expression: `dist.normal(...)`, `field(x).kde()`, or a
 *  column whose record says it holds draws. Each summary asks for a
 *  capability of T through its `this` type, so a summary on the wrong T is
 *  a compile error in TS, and the same check runs in the engine for
 *  Python and for untyped columns. */
export interface DistExpr<T extends ValueType, J extends Dependence> {
  readonly type: "dist";
  readonly dist?: DistOf<T, J>;

  mean(this: DistExpr<AffineValue, J>): ValueExpr<T>;
  median(this: DistExpr<OrderedValue, J>): ValueExpr<T>;
  quantile(this: DistExpr<OrderedValue, J>, p: number): ValueExpr<T>;
  interval(this: DistExpr<OrderedValue, J>, level: number): IntervalOf<T>;
  cdf(this: DistExpr<OrderedValue, J>, at: number | string): ValueExpr<Share>;
  sd<U extends UnitTag>(
    this: DistExpr<Amount<U>, J>
  ): ValueExpr<Amount<DiffUnit<U>>>;
  prob(
    this: DistExpr<DiscreteValue, J>,
    level: string | number
  ): ValueExpr<Share>;
  /** Smooth a sample. On a family Dist it is the identity. */
  kde(
    this: DistExpr<ContinuousValue, J>,
    options?: { smoothing?: number | "silverman" }
  ): DistExpr<T, J>;
}

/** A parameter of a dist constructor: a column name, a number, a field
 *  expression, or a Dist (which nests). */
type Param<T extends ValueType> =
  | string
  | number
  | ValueExpr<T>
  | DistExpr<T, Dependence>;

/** The `dist` namespace, typed. `normal`'s `sd` is in the difference unit
 *  of `mean`'s: a normal over instants takes a duration sd (papers-b). */
export declare const dist: {
  normal<U extends UnitTag = UnitTag>(p: {
    mean: Param<Amount<U>>;
    sd: Param<Amount<DiffUnit<U>>>;
  }): DistExpr<Amount<U>, "independent">;
  lognormal<U extends UnitTag = UnitTag>(p: {
    meanlog: Param<Amount>;
    sdlog: Param<Amount>;
  }): DistExpr<Amount<U>, "independent">;
  student<U extends UnitTag = UnitTag>(p: {
    df: Param<Amount>;
    mean: Param<Amount<U>>;
    scale: Param<Amount<DiffUnit<U>>>;
  }): DistExpr<Amount<U>, "independent">;
  beta(p: {
    alpha: Param<Amount>;
    beta: Param<Amount>;
  }): DistExpr<Share, "independent">;
  /** One joint over a group's rows: a draw is a whole probability vector,
   *  and each row gets its component (papers-a). */
  dirichlet(p: { alpha: Param<Amount> }): DistExpr<Share, "joint">;
  /** One categorical over a group's rows: row `level` has probability `p`. */
  categorical<O extends boolean>(p: {
    level: string;
    p: Param<Share>;
  }): DistExpr<Levels<O>, "joint">;
};

/** A column typed in the schema as draws (`{ unit, draws: "draw" }`),
 *  read in a channel. Stands for `field(name)` on such a column. */
export declare function drawsColumn<T extends ValueType>(
  name: string
): DistExpr<T, "joint">;

/** An untyped column read as its group's rows (Approach B), the empirical
 *  Dist. Its draws have no ids, so it is not joint. */
export declare function rowsColumn<T extends ValueType>(
  name: string
): DistExpr<T, "independent">;

// ===========================================================================
// 2. Data and schema
// ===========================================================================

/** Stand-in for gofish-graphics' `ColumnRecord` (ast/schema.ts:496):
 *  `{ name?, unit? }` today. The change adds two keys. */
export type ColumnRecord = {
  name?: string;
  unit?: UnitTag | string;
  /** NEW. The column holds draws, one per row, and the column `draws`
   *  says which draw each row is. Every cell that shares a draw id is one
   *  outcome of the joint. A fact about the table, like #1198's `entity`,
   *  so it goes in the record, not on the unit. */
  draws?: string;
  /** NEW. The column of each draw's weight. Needs `draws`. */
  weight?: string;
};

/** NEW column class, on a draw-key column: its values name draws.
 *  Written by the schema (from a record's `draws`) or by `sample` and
 *  `resample` on their output. */
export type HasDraws = {
  /** Whether draw k of one cell and draw k of another are one outcome. */
  joint: boolean;
  /** The number of draws, when known. */
  n?: number;
  /** The seed `sample` drew them with, so JS and Python draw alike. */
  seed?: number;
};

/** NEW column class, on a value column whose rows are draws: the draw-key
 *  column and the weight column. */
export type HasSample = { draws: string; weight?: string };

/** Changed column class: today `{ lo, hi, sorted() }`
 *  (ast/schema.ts:172). `Bin.quantiles` reads `sorted()` to find quantiles
 *  of the column (cells.ts:636). With a quantile function in its place,
 *  `Bin.quantiles` cuts a Dist key's probability with the same code, and
 *  `quantileRows` (#1231) goes away. An internal change: no user writes
 *  HasDomain. */
export type HasDomain = {
  lo: number;
  hi: number;
  /** The quantile at p of the column's values: type 7 over the sorted
   *  values for a plain column, the Dist's own for a Dist key. */
  quantile: (p: number) => number;
};

/** Stand-in for gofish-graphics' `ColumnType` (ast/schema.ts:181) with the
 *  two new classes. The record is also the wire form, so both cross to
 *  Python as they are. */
export type ColumnType = {
  HasLevels?: { levels: readonly (string | number)[] };
  HasOrder?: Record<string, never>;
  HasMidpoint?: { at: number };
  HasUnit?: {
    unit: string;
    symbol?: string;
    classes?: { CanAdd?: Record<string, never> };
  };
  HasQuantity?: { name: string };
  HasDomain?: HasDomain;
  HasInteger?: Record<string, never>;
  HasDraws?: HasDraws;
  HasSample?: HasSample;
};

/** The record a schema entry with `draws` stands for, on the wire: the
 *  value column gets HasSample, and the key column gets HasDraws. */
export const exampleSchemaWire: Record<string, ColumnType> = {
  temp: {
    HasUnit: { unit: "°C", symbol: "°C", classes: {} },
    HasSample: { draws: "draw" },
  },
  draw: { HasDraws: { joint: true } },
};

// ===========================================================================
// 3. Field-expression IR
// ===========================================================================

/** The dist families a `dist.*` call names. */
export type DistFamilyName =
  | "normal"
  | "lognormal"
  | "student"
  | "beta"
  | "dirichlet"
  | "categorical";

/** NEW accessor: `dist.normal({ mean: "mean", sd: "se" })`. It reads
 *  several columns, so it is its own tagged accessor beside FieldAccessor,
 *  as `struct({ x, y })` is (StructAccessor, schema.ts:950). */
export interface DistAccessor {
  type: "dist";
  family: DistFamilyName;
  params: Record<string, DistParamIR>;
  ops?: FieldOpIR2[];
}

export type DistParamIR =
  | number
  | string
  | FieldAccessor
  | DistAccessor
  | DatumValue;

/** The new ops. `mean` and `median` exist (schema.ts:961) and keep their
 *  wire form: on a Dist they summarize it (see types.md, "one fold"). */
export type DistOpIR =
  | { op: "quantile"; p: number }
  | { op: "cdf"; at: number | string }
  | { op: "sd" }
  | { op: "prob"; level: string | number }
  | { op: "kde"; smoothing?: number | "silverman" };

/** FieldOpIR after the change: additive. */
export type FieldOpIR2 = FieldOpIR | DistOpIR;

/** ChannelValue after the change: one more tagged branch. A
 *  `.interval(p)` adds nothing here: it is an AxisInterval. */
export type ChannelValue2 = ChannelValue | DistAccessor;

/** `d.interval(0.95)` as the wire carries it: an AxisInterval of two
 *  quantile ops, with the central-interval ends (1 − p) / 2 and (1 + p) / 2. */
export const intervalWire: AxisInterval = {
  min: {
    type: "field",
    name: "temp",
    ops: [{ op: "quantile", p: 0.025 } as unknown as FieldOpIR],
  },
  max: {
    type: "field",
    name: "temp",
    ops: [{ op: "quantile", p: 0.975 } as unknown as FieldOpIR],
  },
};
// (The casts go away once FieldOpIR is FieldOpIR2.)

// ===========================================================================
// 4. Construct descriptors
// ===========================================================================

/** The one change to the descriptor DSL: a channel that infers by folding
 *  its rows into one Dist (the mixture of the rows' Dists, a plain value
 *  being pure of itself), beside size (sum), pos (mean), color and raw
 *  (descriptors.ts:48). markChannels.generated.ts gets "dist" entries. */
export type ChannelInfer2 = "size" | "pos" | "color" | "raw" | "dist";
type DistChannelType = { kind: "channel"; inner: "number"; infer: "dist" };
type FieldSpec2 = Omit<FieldSpec, "type"> & {
  type: FieldType | DistChannelType;
};
type Descriptor2 = Omit<ConstructDescriptor, "fields"> & {
  fields: Record<string, FieldSpec2>;
};

const chDist = (doc: string): FieldSpec2 => ({
  type: { kind: "channel", inner: "number", infer: "dist" },
  doc,
});

/** Same as descriptors.ts:1308 (not exported there). */
const splitBy = (doc: string, required = false): FieldSpec => ({
  type: t.union(t.string, t.ref("FieldAccessor"), t.ref("ChunkKey")),
  ...(required ? { required: true } : {}),
  doc,
});

const levels: FieldSpec = {
  type: t.array(t.num({ exclusiveMin: 0, exclusiveMax: 1 }), {
    minItems: 1,
    uniqueItems: true,
  }),
  default: [0.66, 0.95],
  doc: "The probability of each central interval, nested from widest to narrowest.",
};

/** The two channels every signal mark takes: exactly one of them, and its
 *  name is the axis the distribution lies along. */
const distAxis: Record<string, FieldSpec2> = {
  x: chDist("The distribution, along x. Give x or y, not both."),
  y: chDist("The distribution, along y. Give x or y, not both."),
};

export const NEW_OPERATORS: Record<string, Descriptor2> = {
  sample: {
    type: "sample",
    kind: "operator",
    doc: "Turn each row into one row per draw, with a `draw` key. A Dist channel read on a drawn row reads that draw. Draws of a draws column keep their ids, so they stay joint; draws of a dist.* cell are independent.",
    fields: {
      n: {
        type: t.num({ min: 1, integer: true }),
        doc: "How many draws per row. Omitted: every stored draw of a draws column, and an error for a dist.* cell, which stores none.",
      },
      coverage: {
        type: t.num({ exclusiveMin: 0, exclusiveMax: 1 }),
        doc: "Pick n so that the range of n draws covers this share of the distribution on average: n = (1 + c) / (1 − c), so 0.95 gives 39. Not with n.",
      },
      at: {
        type: t.enum("random", "quantiles"),
        default: "random",
        doc: "random: seeded random draws. quantiles: the n quantiles at (i + 0.5) / n, as a quantile dotplot reads them.",
      },
      seed: {
        type: t.num({ integer: true }),
        doc: "The seed of the random draws. JS and Python use one generator, so a seed draws the same values on both sides.",
      },
    },
  },
  resample: {
    type: "resample",
    kind: "operator",
    doc: "Bootstrap: resample the rows with replacement n times. Each resample is one draw of the whole table, so its `draw` key is joint.",
    fields: {
      n: {
        type: t.num({ min: 1, integer: true }),
        required: true,
        doc: "How many resamples.",
      },
      seed: { type: t.num({ integer: true }), doc: "The seed." },
    },
  },
  overlay: {
    type: "overlay",
    kind: "operator",
    doc: "Put each group in the same slot, on top of each other (the z direction). Each group is drawn at opacity max(floor, w / Σw): 1 / n for n equal weights.",
    fields: {
      by: splitBy("The key whose groups overlap, usually `draw`.", true),
      weight: {
        type: t.string,
        doc: "The column of each group's weight. Omitted: the weight of the draws column's record, else equal weights.",
      },
      opacity: {
        type: t.object({
          min: {
            type: t.num({ min: 0, max: 1 }),
            default: 0.05,
            doc: "The least opacity a group is drawn at, so small marks do not vanish.",
          },
        }),
        doc: "How the groups' opacities are set.",
      },
    },
  },
  summarize: {
    type: "summarize",
    kind: "operator",
    doc: "Collapse each group to one row, with one column per named field expression (papers-a). A column's type is its expression's result type: the mean of a Dist<T> is a T.",
    fields: {
      columns: {
        type: t.record(t.ref("FieldAccessor")),
        required: true,
        doc: "Column name to field expression.",
      },
    },
  },
};

export const NEW_LEAF_MARKS: Record<string, Descriptor2> = {
  slab: {
    type: "slab",
    kind: "leaf-mark",
    include: [paint],
    doc: "The density of a distribution as a filled shape along its axis. Needs an ordered, continuous T.",
    fields: {
      ...distAxis,
      side: {
        type: t.enum("end", "start", "both"),
        default: "end",
        doc: "Which side of the line the shape grows to. both is a violin.",
      },
      normalize: {
        type: t.enum("all", "group"),
        default: "all",
        doc: "all: every slab on one density scale, so areas compare. group: each slab fills its own height.",
      },
    },
  },
  interval: {
    type: "interval",
    kind: "leaf-mark",
    include: [paint],
    doc: "Nested central intervals at `levels`, and a point at the median. With `along`, a ribbon per level through the groups of that tier, and the median line.",
    fields: {
      ...distAxis,
      levels,
      along: {
        type: t.string,
        doc: "Names a flow tier by its `by` field, as on line and ribbon: the intervals join into bands along it.",
      },
      band: {
        type: t.ref("Band"),
        doc: "How a band is formed along `along`, made by a call in the Band family. Default Band.pointwise().",
      },
    },
  },
  dots: {
    type: "dots",
    kind: "leaf-mark",
    include: [paint],
    doc: "A quantile dotplot: n quantiles of the distribution as dots, binned and stacked. The stack counts quantiles, which add, so it is not a stack of draws.",
    fields: {
      ...distAxis,
      n: {
        type: t.num({ min: 1, integer: true }),
        default: 20,
        doc: "How many dots.",
      },
    },
  },
  gradient: {
    type: "gradient",
    kind: "leaf-mark",
    include: [paint],
    doc: "A bar whose opacity follows a distribution. With one Dist end on an axis, the opacity at t follows its density. With two (x and x2), it is P(start ≤ t ≤ end), from the joint draws when they are joint, else as a product.",
    fields: {
      ...Object.fromEntries(
        Object.entries(boxDims).map(([k, spec]) => [k, spec as FieldSpec2])
      ),
      x: chDist("Start, a value or a Dist."),
      x2: chDist("End, a value or a Dist."),
      y: chDist("Start, a value or a Dist."),
      y2: chDist("End, a value or a Dist."),
    },
  },
  cdf: {
    type: "cdf",
    kind: "leaf-mark",
    include: [paint],
    doc: "The CDF of a distribution as a step or a curve. Given a plain column, the empirical CDF of the group's rows.",
    fields: { ...distAxis },
  },
  ccdf: {
    type: "ccdf",
    kind: "leaf-mark",
    include: [paint],
    doc: "The complement of cdf: P(value ≥ t).",
    fields: { ...distAxis },
  },
};

// ===========================================================================
// 5. Strategy families
// ===========================================================================

export const BAND: StrategyFamily = {
  doc: "How `interval({ along })` forms a band from the distributions along a tier: the value of its `band` option.",
  kinds: {
    pointwise: {
      doc: "At each step, the central interval of that step's distribution, and the pointwise median. The default.",
      params: {},
    },
    depth: {
      doc: "The envelope of the deepest whole draws (modified band depth): a level of 0.5 is the envelope of the deepest half. The median is the deepest draw. Needs joint draws.",
      params: {
        outliers: {
          type: t.union(t.num({ min: 0, finite: true }), t.literal(false)),
          default: 1.5,
          doc: "Draws outside this many times the widest band are outliers, drawn on their own. false draws none.",
        },
      },
    },
  },
};

/** The `dist.*` constructors as a table, in the StrategyFamily shape, so
 *  the validator, the JSON Schema and the Python generator read them as
 *  they read STRATEGIES. Lowercase, like `time`. Not in STRATEGIES itself:
 *  a dist is a value of a channel, not one choice for an option. */
const param = (doc: string, required = true): FieldSpec => ({
  type: t.union(
    t.number,
    t.string,
    t.ref("FieldAccessor"),
    t.ref("DistAccessor")
  ),
  ...(required ? { required: true } : {}),
  doc,
});
export const DIST_FAMILIES: StrategyFamily = {
  doc: "Distributions made from parameter columns. normal to beta make one Dist per row (independent). dirichlet and categorical make one joint Dist over a group's rows.",
  kinds: {
    normal: {
      doc: "Normal.",
      params: {
        mean: param("Mean, in T."),
        sd: param(
          "Standard deviation, in T's difference unit (a duration for an instant)."
        ),
      },
    },
    lognormal: {
      doc: "Log-normal.",
      params: {
        meanlog: param("Mean of the log."),
        sdlog: param("Sd of the log."),
      },
    },
    student: {
      doc: "Student's t, located and scaled.",
      params: {
        df: param("Degrees of freedom."),
        mean: param("Location, in T."),
        scale: param("Scale, in T's difference unit."),
      },
    },
    beta: {
      doc: "Beta, over shares.",
      params: { alpha: param("α."), beta: param("β.") },
    },
    dirichlet: {
      doc: "A joint over the group's rows: a draw is one probability vector.",
      params: { alpha: param("Each row's concentration.") },
    },
    categorical: {
      doc: "One categorical over the group's rows: the row's level has the row's probability.",
      params: {
        level: param("The column of levels."),
        p: param(
          "The column of probabilities. A Dist makes a Dist of categoricals."
        ),
      },
    },
  },
};

// ===========================================================================
// 6. The checker
// ===========================================================================

// --- 6a. As types: the fluent surface catches what it can see. -------------

/** An operator, with the draw key it adds and how it folds its key. */
type Op<
  Kind extends string,
  By extends string = string,
  Adds extends string = never,
> = {
  readonly kind: Kind;
  readonly by?: By;
  readonly adds?: Adds;
};
type AnyOp = Op<string, string, string>;

declare function sample(o?: {
  n?: number;
  coverage?: number;
}): Op<"sample", never, "draw">;
declare function resample(o: { n: number }): Op<"resample", never, "draw">;
declare function spread<const B extends string>(o: {
  by: B;
  dir: string;
  spacing?: number;
}): Op<"spread", B>;
declare function stack<const B extends string>(o: {
  by: B;
  dir: string;
}): Op<"stack", B>;
declare function overlay<const B extends string>(o: {
  by: B;
}): Op<"overlay", B>;

type StackByDrawError = {
  readonly error: 'stack({ by: "draw" }): "draw" is a sample index. Its sum grows with the number of draws. Place the draws with spread, overlay or time.sequence.';
};

/** Walk the flow in order, tracking the draw keys earlier steps added. A
 *  stack by one of them becomes an error type, so the call fails there. */
type CheckFlow<
  Ops extends readonly AnyOp[],
  Draws extends string = never,
> = Ops extends readonly [
  infer H extends AnyOp,
  ...infer R extends readonly AnyOp[],
]
  ? [
      H extends { kind: "stack"; by?: infer B }
        ? [B] extends [Draws]
          ? StackByDrawError
          : H
        : H,
      ...CheckFlow<R, Draws | NonNullable<H["adds"]>>,
    ]
  : [];

type AddsDraws<Ops extends readonly AnyOp[]> = [
  NonNullable<Ops[number]["adds"]>,
] extends [never]
  ? false
  : true;

/** A mark, with whether it puts a Dist in a T channel (it needs draws), and
 *  whether it connects cells over independent draws. */
type Mark<NeedsDraws extends boolean = boolean> = {
  readonly needsDraws: NeedsDraws;
};

type AnyDist = DistExpr<any, Dependence>;
type TChannel = string | number | ValueExpr<any> | AnyDist;
type HasDistIn<O> = true extends {
  [K in keyof O]: O[K] extends AnyDist ? true : false;
}[keyof O]
  ? true
  : false;

declare function rect<const O extends Record<string, TChannel>>(
  o: O
): Mark<HasDistIn<O>>;
declare function interval(o: {
  y: TChannel;
  levels?: number[];
  along?: string;
}): Mark<false>;

type ConnectError = {
  readonly error: "line({ along }) joins draw k of independent cells, so the line is not a possible path. Use joint draws, or summarize first with .interval(p) and draw a ribbon.";
};
declare function line<const O extends { y: TChannel; along: string }>(
  o: O & (O["y"] extends DistExpr<any, "independent"> ? ConnectError : unknown)
): Mark<HasDistIn<O>>;

type LiftError = {
  readonly error: "A distribution is not one value. Summarize it (.mean()), draw it (add sample() to the flow), or show it (interval, slab).";
};

interface ChartBuilder<Drawn extends boolean> {
  flow<const Ops extends readonly AnyOp[]>(
    ...ops: Ops & CheckFlow<Ops>
  ): ChartBuilder<AddsDraws<Ops>>;
  mark<M extends Mark>(
    m: Drawn extends true ? M : M extends Mark<true> ? LiftError : M
  ): void;
}
declare function chart(data: unknown[]): ChartBuilder<false>;

// --- The errors that should fire, and the charts that should pass. ---------

const sales = dist.normal<USD>({ mean: "mean", sd: "se" });
const rating = rowsColumn<Levels<true>>("rating");
const species = rowsColumn<Levels<false>>("species");
const start = dist.normal<Instant>({ mean: "start", sd: "startSd" });
const temp = drawsColumn<Amount<Celsius>>("temp");

// Summaries ask for capabilities of T.
sales.mean();
sales.interval(0.95);
rating.median(); // an ordinal has a median
// @ts-expect-error .mean() on Dist<Ordinal>: an ordinal level has no average.
rating.mean();
// @ts-expect-error .interval() on Dist<Category>: no order. Use .prob(level).
species.interval(0.95);
species.prob("Adelie");
// sd of an instant is a duration.
const spread_: ValueExpr<Amount<Duration>> = start.sd();
void spread_;

// A Dist in a T channel needs a lift in the flow.
// @ts-expect-error rect h holds Dist<USD> and nothing draws it.
chart([])
  .flow(spread({ by: "region", dir: "x" }))
  .mark(rect({ h: sales }));
chart([])
  .flow(spread({ by: "region", dir: "x" }))
  .mark(rect({ h: sales.mean() }));
chart([])
  .flow(
    spread({ by: "region", dir: "x" }),
    sample({ n: 20 }),
    spread({ by: "draw", dir: "x", spacing: 0 })
  )
  .mark(rect({ h: sales }));
chart([])
  .flow(spread({ by: "region", dir: "x" }))
  .mark(interval({ y: sales }));

// Stacking by the draw key.
// @ts-expect-error stack by "draw" after sample: the sum of a sample's draws has no meaning.
chart([]).flow(sample({ n: 20 }), stack({ by: "draw", dir: "y" }));
chart([]).flow(
  sample({ n: 20 }),
  spread({ by: "draw", dir: "x" }),
  stack({ by: "product", dir: "y" })
);
chart([]).flow(
  sample({ n: 20 }),
  overlay({ by: "draw" }),
  stack({ by: "product", dir: "y" })
);

// Connecting independent draws.
// @ts-expect-error line over draws of independent cells.
line({ y: sales, along: "year" });
line({ y: temp, along: "year" }); // joint draws: each line is one possible path

// The span: .interval(p) fills a dims entry, which is an AxisInterval.
const dimsEntry: { x: IntervalOf<Amount<Instant>> } = {
  x: start.interval(0.95),
};
void dimsEntry;
// @ts-expect-error x is one position; an interval is two. Write dims: { x: d.interval(p) }.
const oneX: ValueExpr<Amount> = start.interval(0.95);
void oneX;

// --- 6b. As checker pseudo-code: what the engine runs (JS and Python IR). ---

type Quantity = { name: string; column?: string };
type Rows = readonly Record<string, unknown>[];
declare function columnType(
  rows: Rows,
  column: string | undefined
): ColumnType | undefined;
declare function columnTypes(rows: Rows): Record<string, ColumnType>;

/** Rule 3, at a stack: in spread's split, beside the HasMidpoint read
 *  (graphicalOperators/spread.tsx:259). Static: it reads the key's type,
 *  never the rows. */
export function checkStackKey(
  by: string | undefined,
  glue: boolean,
  d: Rows
): void {
  if (!glue || by === undefined) return;
  if (columnType(d, by)?.HasDraws === undefined) return;
  throw new Error(
    `stack({ by: "${by}", dir: "y" }): "${by}" is a sample index. The draws of one value are ` +
      `a sample, and their sum grows with the number of draws, so the stacked total has no ` +
      `meaning. stack needs a key whose groups add up to a whole.\n` +
      `Place the draws with spread({ by: "${by}", dir: "x" }), with time.sequence({ by: "${by}" }), ` +
      `or stack by a category inside each draw.`
  );
}

/** Rule 3, at any other sum (a size channel, treemap, cut, .sum()): beside
 *  `checkSummable` (measure.ts:142). A sum over rows that hold more than
 *  one draw of a draw key sums a sample. This is #1198's entity check with
 *  the draw key as the repeated key, so the two should share one function. */
export function checkDrawFold(rows: Rows, where: string): void {
  for (const [column, type] of Object.entries(columnTypes(rows))) {
    if (type.HasDraws === undefined) continue;
    const ids = new Set(rows.map((r) => r[column]));
    if (ids.size > 1)
      throw new Error(
        `${where} sums ${ids.size} draws of "${column}". A sum of draws grows with their number. ` +
          `Split by "${column}" first, or take .mean().`
      );
  }
}

/** Rule 1: a Dist into a T channel. In `inferNumeric` (channels.ts:248),
 *  before the fold: a Dist-valued accessor needs a drawn row (a draw key in
 *  the rows' types, from sample or the schema) or a summary op. */
export function checkLift(
  accessor: { type: string; ops?: readonly { op: string }[] },
  rows: Rows,
  mark: string,
  channel: string,
  q: Quantity
): void {
  const isDist = accessor.type === "dist" || hasSampleColumn(accessor, rows);
  const summarized = (accessor.ops ?? []).some((o) =>
    ["mean", "median", "quantile", "sd", "cdf", "prob"].includes(o.op)
  );
  const drawn = Object.values(columnTypes(rows)).some(
    (t) => t.HasDraws !== undefined
  );
  if (!isDist || summarized || drawn) return;
  throw new Error(
    `${mark}: channel "${channel}" expects a number of ${q.name}, but it holds Dist<${q.name}>. ` +
      `A distribution is not one number. Choose one of these:\n` +
      `  - summarize it:  ${mark}({ ${channel}: field("${q.column}").mean() })\n` +
      `  - draw it:       add sample({ n: 50 }) to the flow and place the draws\n` +
      `  - show it:       use interval({ y: "${q.column}" }) or slab({ y: "${q.column}" })`
  );
}
declare function hasSampleColumn(accessor: unknown, rows: Rows): boolean;

/** Rule 4: a connecting mark across independent cells. Where a fused
 *  relational mark picks its path tier (`classifyOperator`,
 *  marks/chartBuilder.ts:210): the draw key in scope must be joint. */
export function checkConnect(
  markName: string,
  along: string,
  rows: Rows,
  field: string
): void {
  for (const [column, type] of Object.entries(columnTypes(rows))) {
    if (type.HasDraws === undefined || type.HasDraws.joint) continue;
    throw new Error(
      `${markName}({ along: "${along}" }) joins draw 3 of "${field}" in one ${along} to draw 3 in ` +
        `the next, but each ${along}'s "${field}" is an independent distribution. Draw 3 in one ` +
        `${along} has no relation to draw 3 in the next, so the line is not a possible path.\n` +
        `Use draws from one joint sample (a column record { draws: "${column}" }), or summarize ` +
        `first with field("${field}").interval(0.8) and draw a ribbon.`
    );
  }
}

/** The capability check of a summary op, for the IR (Python, untyped JS).
 *  In `evalFieldValues` (fieldExpr.ts:488). */
export function checkSummaryOp(
  op: string,
  type: ColumnType,
  field: string
): void {
  const ordered = type.HasLevels === undefined || type.HasOrder !== undefined;
  const affine = type.HasLevels === undefined;
  if (["quantile", "median", "cdf"].includes(op) && !ordered)
    throw new Error(
      `field("${field}").${op}(...): ${op} needs an order on the values, but ` +
        `Dist<Category> (${field}) has none. Use field("${field}").prob(level) for the ` +
        `probability of a category, or draw it with sample().`
    );
  if ((op === "mean" || op === "sd") && !affine)
    throw new Error(
      `field("${field}").${op}(): ${op} needs values that average, but ` +
        `${field} is ordinal: its levels have an order and no distances. Use .median() or .quantile(p).`
    );
}

// Keep the imported names used, so the file checks under noUnusedLocals.
export const _used: [typeof ch, FieldGroup | undefined] = [ch, undefined];

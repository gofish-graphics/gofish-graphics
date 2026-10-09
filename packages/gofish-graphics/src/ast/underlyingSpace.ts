// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { interval, Interval, width as intervalWidth } from "../util/interval";
import { CoordinateTransform } from "./coordinateTransforms/coord";
import {
  getMeasure,
  getValue,
  getValueFieldType,
  isAesthetic,
  isValue,
  type MaybeValue,
  type Measure,
} from "./data";
import { nice as d3Nice } from "d3-array";
import type { HasCalendar } from "./schema";
import { niceToCells, tickPartition, type CalendarPartition } from "./calendar";

// This module is the TYPE half of an axis: what the axis means, with no σ in
// it. The SIZE CLAIM half (how much room the content needs, as functions of
// σ) is the `Extent` record in `./extent.ts`, computed by a separate, later
// walk that may read these types. This module must not import `Monotonic` or
// `./extent`. That is what keeps type inference from ever reading a claim.

export type UnderlyingSpaceKind = "continuous" | "ordinal" | "undefined";

/**
 * Where a continuous space's local origin (its data 0) sits:
 *
 *   - `"pinned"`: the local origin IS data 0, so the data interval is the
 *     absolute data domain. Renders an absolute axis. (The old POSITION.)
 *   - `"free"`: the extent hangs from a baseline that nothing has placed yet.
 *     The data interval is `[−descent, ascent]` about that baseline. A parent
 *     can still pin it (a baseline align, a glued stack, the `position`
 *     operator). Renders no axis. (The old SIZE.)
 *   - `"none"`: there is no origin at all, only a width. The data interval is
 *     `[0, width]`, and only differences along it mean anything. Renders a
 *     delta axis. Produced by middle-align, and absorbing. (The old DIFFERENCE.)
 *
 * The origin state is the whole placement fact: whether an extent has
 * committed a position (`pinned`), can still be given one (`free`), or can
 * never have one (`none`) is read straight off it ({@link originOf}).
 */
export type Origin = "pinned" | "free" | "none";

/**
 * A data-driven extent on one shared scale. Every continuous kind has the same
 * shape: one signed interval in DATA units about the space's local origin,
 * plus the state of that origin ({@link Origin}). A bar of value 30 is
 * `free [0, 30]`, a bar of value −20 is `free [−20, 0]`, a scatter's x axis is
 * `pinned [min, max]`, and a middle-aligned overlay of width 7 is
 * `none [0, 7]`. Pinning a free extent is "shift the interval and pin the
 * origin" ({@link anchorAt}).
 *
 * The interval has no σ in it: pixel overhead (spread spacing, nest padding, a
 * fixed pitch, `transform.scale`) is never part of it. That overhead lives only
 * in the size claim (`Extent` in `./extent.ts`).
 *
 * A free magnitude is NOT a data axis pinned at 0: the former is placed by
 * its parent at its baseline and renders no axis, while the latter places its
 * data through its scope's map and renders an absolute axis. The distinct
 * origin states keep them apart. The folds and scope solves run one path over
 * all three; the places that still ask which origin a space has, and why, are
 * listed in the underlying-space essay ("One continuous path, and the
 * differences that remain").
 */
export type CONTINUOUS_TYPE = {
  kind: "continuous";
  /** The signed data extent about the local origin. Pinned: the absolute data
   *  domain. Free: `[−descent, ascent]` about the baseline. None: `[0, width]`. */
  dataInterval: Interval;
  /** Where the local origin sits. See {@link Origin}. */
  origin: Origin;
  /** The measure (unit) of this axis. Spaces unify per measure — see
   *  {@link mergeMeasures}. Undefined = "no claim" (permissive). */
  measure?: Measure;
  coordinateTransform?: CoordinateTransform;
  /** True when both sides of the 0 hold nonnegative amounts measured away from
   *  it, rather than signed values (#984's "mirrored side": magnitudes with a
   *  side). A stack centered on a `HasMidpoint` column builds it: a Likert
   *  chart's parts left of the center are counts too. An axis over it labels
   *  each tick with its distance from 0. A union keeps it only when every
   *  part has it ({@link allMirrored}).
   *  TODO(#995): layer axis merging, a coord's declared window, and anchorAt drop it. */
  mirrored?: true;
  /** Set when the data along this axis are instants (`HasCalendar`, from a
   *  `Schema.time()` column): epoch milliseconds read on the calendar of
   *  `zone`. An axis over it is a time axis: its ticks are calendar cells
   *  (axes/timeRows.ts), and its domain is niced outward to the cells of its
   *  inner row ({@link niceContinuous}). A union keeps it from any part that
   *  has it ({@link mergeCalendars}). */
  calendar?: HasCalendar;
};

export type ORDINAL_TYPE = {
  kind: "ordinal";
  domain?: string[]; // Top-level category keys for axis labels
  /** The measure (the grouping field, e.g. "lake") this ordinal axis encodes —
   *  the discrete analogue of a CONTINUOUS space's {@link CONTINUOUS_TYPE.measure}.
   *  Read by axis-title inference so every axis names itself off its own resolved
   *  space (continuous → measure unit, ordinal → grouping field), not a surface
   *  field-name heuristic. Undefined = "no claim". */
  measure?: Measure;
  /** True when this ordinal's keys are POSITIONAL (a `spread` with no `by` — its
   *  children were auto-keyed by index). Such a spread carries no grouping
   *  identity, so it renders no axis (unit dots packed for layout only). Set at
   *  construction from the contributing nodes' `_syntheticKey` (see
   *  `distributeSpaceFold`), never sniffed back from the domain. An
   *  explicitly-keyed or `by`-grouped ordinal leaves this false. */
  anonymous?: boolean;
};

export type UNDEFINED_TYPE = {
  kind: "undefined";
};

export type UnderlyingSpace = CONTINUOUS_TYPE | ORDINAL_TYPE | UNDEFINED_TYPE;

/** The one continuous constructor: a data interval and its origin state. A
 *  rect of value `v` is `CONTINUOUS(interval(0, v), "free")` (a negative `v`
 *  extends below its baseline), a scatter axis is
 *  `CONTINUOUS(interval(min, max), "pinned")`. {@link anchorAt} pins an
 *  existing space at a data coordinate. */
export const CONTINUOUS = (
  dataInterval: Interval,
  origin: Origin,
  measure?: Measure,
  coordinateTransform?: CoordinateTransform
): CONTINUOUS_TYPE => ({
  kind: "continuous",
  dataInterval,
  origin,
  measure,
  coordinateTransform,
});
export const isCONTINUOUS = (
  space: UnderlyingSpace
): space is CONTINUOUS_TYPE => space.kind === "continuous";

/** The space of a datum magnitude `size`: `[0, v]` with the datum's measure.
 *  Free by default (its parent places its baseline); `"none"` when the mark's
 *  position is an aesthetic, so the magnitude has only a width. */
export const magnitude = (
  size: MaybeValue<number | undefined>,
  origin: "free" | "none" = "free"
): CONTINUOUS_TYPE =>
  CONTINUOUS(interval(0, getValue(size)!), origin, getMeasure(size));

/** The absolute `[min, max]` data domain of a PINNED space, or undefined for a
 *  free magnitude or a difference. */
export const continuousInterval = (
  space: UnderlyingSpace
): Interval | undefined =>
  originIs(space, "pinned") ? space.dataInterval : undefined;

/** The origin state of a space's axis, or undefined when the axis is not
 *  continuous. Every placement question (is this extent positioned, can it
 *  still be placed, which axis does it render) is this one read. */
export const originOf = (
  space: UnderlyingSpace | undefined
): Origin | undefined =>
  space !== undefined && isCONTINUOUS(space) ? space.origin : undefined;

/** A continuous space whose origin is `origin`. */
export const originIs = (
  space: UnderlyingSpace | undefined,
  origin: Origin
): space is CONTINUOUS_TYPE => originOf(space) === origin;

/** A continuous space with an origin, pinned or free (not `none`): an extent
 *  that hangs from a place, so it can root a σ-scope that seats it. */
export const hasOrigin = (
  space: UnderlyingSpace | undefined
): space is CONTINUOUS_TYPE =>
  originIs(space, "pinned") || originIs(space, "free");

/** The axis a space renders over its data interval, one read of its origin
 *  state: a pinned space has data coordinates, so it renders an `"absolute"`
 *  axis; an origin-less one has only differences, so it renders a `"delta"`
 *  axis; a free magnitude, still waiting for its parent to place it, renders
 *  none (undefined), and neither does a non-continuous space. */
export const axisOver = (
  space: UnderlyingSpace | undefined
): "absolute" | "delta" | undefined =>
  originIs(space, "pinned")
    ? "absolute"
    : originIs(space, "none")
      ? "delta"
      : undefined;

/** A space as its scope root places it. A scope root seats a free space's
 *  baseline (its data 0) at the scope's `originPx`, so from there on the
 *  space has data coordinates: it is pinned over the same interval. Any
 *  other space is unchanged. */
export const placeBaseline = <T extends UnderlyingSpace | undefined>(
  space: T
): T =>
  originIs(space, "free")
    ? ({ ...(space as CONTINUOUS_TYPE), origin: "pinned" } as T)
    : space;

/** The data width of a CONTINUOUS space (the length of its interval). */
export const dataWidth = (space: CONTINUOUS_TYPE): number =>
  intervalWidth(space.dataInterval);

/** What an axis ticks at, which is what a scope that draws the axis nices
 *  its domain to (#659, #1057): about `count` ticks, or, on a time axis, the
 *  cells of its `rows` (`axes.x.rows`, parsed once by `layout`), whose inner
 *  row (`rows[0]`) sets the nicing. A time axis with no `rows` picks its
 *  inner row from its domain and `count` ({@link axisTickPartition}).
 *  `resolveAxes` stamps it on every node that draws an axis
 *  (`GoFishNode.axisDemand`), and the axis is drawn from the same stamp. */
export type AxisTicks = { count: number; rows?: CalendarPartition[] };

/** An axis's ticks when it asks for nothing else: about 10. */
export const DEFAULT_AXIS_TICKS: AxisTicks = { count: 10 };

/** The partition a time axis over `space` ticks at: its explicit inner row,
 *  else the one its domain picks ({@link tickPartition}). */
export const axisTickPartition = (
  space: CONTINUOUS_TYPE,
  ticks: AxisTicks
): CalendarPartition =>
  ticks.rows?.[0] ??
  tickPartition(space.dataInterval.min, space.dataInterval.max, ticks.count);

/** Nice the interval a space renders an axis over (issue #659): a pinned
 *  domain's `[min, max]`, or a delta axis's width from 0, rounded outward to
 *  the axis's ticks (`ticks`): d3-nice bounds for `ticks.count` on a numeric
 *  axis, or the cells of the axis's inner row on a time axis (a calendar
 *  space, {@link axisTickPartition}), so a scope solved with
 *  the niced space sizes content, maps positions, and (via the same interval)
 *  ticks the axis all off ONE rounded interval. The niced claim widens by the
 *  same data (`niceScope` in `./extent.ts`). The gate is {@link axisOver}:
 *  "an axis renders over this interval", not "the origin is pinned".
 *
 *  Nicing reads only the data interval and the axis's ticks (a count, or a
 *  calendar partition), never σ or pixels, so it is a pure type operation.
 *
 *  This is THE nicing operation. It is applied per σ-scope AT the scope's solve
 *  (the render root, a self-scaled region, a shared-scale scope, a datum-position
 *  scale), never as a pre-layout tree walk, so a domain that only reaches a
 *  scope through a stash cannot escape it (the original #659 bug), and a subtree
 *  that is not a scope root never nices its own subset (it inherits the scope's
 *  σ). It is DEMAND-DRIVEN: each solve site reads
 *  `GoFishNode.scopeAxisTicks`, so a scope nices its interval iff some
 *  node in its space-flow region renders an axis on the dim, and nices it to
 *  that axis's ticks. A free magnitude
 *  renders the absolute axis of the scope that places its baseline
 *  ({@link placeBaseline}), so it nices as that axis does, about its own 0
 *  (which its interval contains), and stays free. An ordinal or undefined
 *  space is returned UNCHANGED. A coord
 *  scope must NOT nice (its domain maps into a fixed coordinate range), so the
 *  coord boundary never calls this. */
export const niceContinuous = <T extends UnderlyingSpace | undefined>(
  space: T,
  ticks: AxisTicks = DEFAULT_AXIS_TICKS
): T => {
  const axis = axisOver(placeBaseline(space));
  if (axis === undefined) return space;
  const s = space as CONTINUOUS_TYPE;
  const iv = s.dataInterval;
  // An absolute axis nices its domain's ends: to round numbers, or, over
  // instants, to cell starts of its inner row. A delta axis has only a
  // width, which it nices from 0 so its steps are even (ticks 20, 40, …, 160
  // rather than 20, 40, …, 140, 147). The low edge of an origin-less
  // interval means nothing, so it stays.
  const [lo, hi] =
    axis === "absolute"
      ? s.calendar !== undefined
        ? niceToCells(
            iv.min,
            iv.max,
            axisTickPartition(s, ticks),
            s.calendar.zone
          )
        : d3Nice(iv.min, iv.max, ticks.count)
      : [iv.min, iv.min + d3Nice(0, iv.max - iv.min, ticks.count)[1]];
  return {
    ...(space as CONTINUOUS_TYPE),
    dataInterval: interval(lo, hi),
  } as T;
};

/** `space` with both sides of its 0 marked as amounts measured away from it
 *  ({@link CONTINUOUS_TYPE.mirrored}), when `when` holds; else `space`. */
export const mirrored = (
  space: UnderlyingSpace,
  when = true
): UnderlyingSpace =>
  when && isCONTINUOUS(space) ? { ...space, mirrored: true } : space;

/** Whether a union of `spaces` stays mirrored: only when every one is. */
export const allMirrored = (spaces: CONTINUOUS_TYPE[]): boolean =>
  spaces.length > 0 && spaces.every((s) => s.mirrored === true);

/** Pin a continuous space with its local origin at data coordinate `at`: shift
 *  its interval by `at` and pin the origin. A free `[−descent, ascent]` lands
 *  on `[at − descent, at + ascent]`; an origin-less `[0, width]` lands its low
 *  edge at `at`; a pinned space (whose origin is data 0) moves by `at`. Used by
 *  the `position` operator. `measure` defaults to the space's own. */
export const anchorAt = (
  space: CONTINUOUS_TYPE,
  at: number,
  measure?: Measure
): CONTINUOUS_TYPE =>
  withCalendar(
    CONTINUOUS(
      interval(space.dataInterval.min + at, space.dataInterval.max + at),
      "pinned",
      measure ?? space.measure,
      space.coordinateTransform
    ),
    space.calendar
  );

export const ORDINAL = (
  domain?: string[],
  measure?: Measure,
  anonymous?: boolean
): UnderlyingSpace => ({
  kind: "ordinal",
  domain,
  measure,
  anonymous,
});
export const isORDINAL = (space: UnderlyingSpace): space is ORDINAL_TYPE =>
  space.kind === "ordinal";

export const UNDEFINED: UnderlyingSpace = { kind: "undefined" };
export const isUNDEFINED = (space: UnderlyingSpace): space is UNDEFINED_TYPE =>
  space.kind === "undefined";

/** The space of a datum point: a pinned zero-width interval at `pos`, on a
 *  calendar when the datum is a time ({@link positionCalendar}). */
const pointAt = (pos: MaybeValue<number | undefined>): CONTINUOUS_TYPE => {
  const at = getValue(pos) ?? 0;
  return withCalendar(
    CONTINUOUS(interval(at, at), "pinned", getMeasure(pos)),
    positionCalendar(pos)
  );
};

/** The calendar of a datum position read from a time column (`HasCalendar`
 *  in the chart's schema), if it is one. */
export const positionCalendar = (
  pos: MaybeValue<unknown>
): HasCalendar | undefined => getValueFieldType(pos)?.HasCalendar;

/** `space` on `calendar` (see {@link CONTINUOUS_TYPE.calendar}), or `space`
 *  unchanged when there is none. */
export const withCalendar = <T extends CONTINUOUS_TYPE>(
  space: T,
  calendar: HasCalendar | undefined
): T => (calendar === undefined ? space : { ...space, calendar });

/**
 * The calendar of a union of spaces on one axis: the one their time parts
 * share, or undefined when no part is a time. A part with no calendar makes no
 * claim (a literal position among times), like an untagged measure. Two parts
 * on different zones are an error: one axis reads one calendar.
 */
export const mergeCalendars = (
  calendars: (HasCalendar | undefined)[]
): HasCalendar | undefined => {
  let out: HasCalendar | undefined;
  for (const c of calendars) {
    if (c === undefined) continue;
    if (out !== undefined && out.zone !== c.zone) {
      throw new Error(
        `Two time columns on one axis are read in different time zones, ` +
          `"${out.zone}" and "${c.zone}". One axis reads one calendar: give ` +
          `both columns the same zone in Schema.time({ zone }).`
      );
    }
    out ??= c;
  }
  return out;
};

/** One axis of a mark sized about a point (an ellipse, a petal): a datum
 *  position is a pinned point, else a datum size is a free magnitude, else
 *  nothing (literal sizes are resolved at layout time). */
export const pointOrMagnitude = (
  pos: MaybeValue<number | undefined>,
  size: MaybeValue<number | undefined>
): UnderlyingSpace =>
  isValue(pos) ? pointAt(pos) : isValue(size) ? magnitude(size) : UNDEFINED;

/** One axis of a glyph placed by its center or low edge (a text, an image).
 *  A datum size beside any position is an origin-less width, and a datum size
 *  with no position is a free magnitude. A datum position alone is a pinned
 *  point. With neither, the glyph's intrinsic extent is resolved at layout
 *  time, so the axis is undefined. */
export const glyphAxis = (
  pos: MaybeValue<number | undefined>,
  size: MaybeValue<number | undefined>
): UnderlyingSpace => {
  if (!isValue(size)) return isValue(pos) ? pointAt(pos) : UNDEFINED;
  return isValue(pos) || isAesthetic(pos)
    ? magnitude(size, "none")
    : magnitude(size);
};

/** A *positioning* space — one that places marks along an axis (a pinned
 *  data axis or an `ORDINAL` category axis), as opposed to a free magnitude (a
 *  mark's own extent) or `UNDEFINED`. Used to find the axis a set of marks is
 *  laid out on. */
export const isPositioningSpace = (space: UnderlyingSpace): boolean =>
  originIs(space, "pinned") || isORDINAL(space);

/** Read the measure of any space, or undefined for the measureless kind
 *  (UNDEFINED). Both CONTINUOUS (unit) and ORDINAL (grouping field) carry one. */
export const spaceMeasure = (
  space: UnderlyingSpace | undefined
): Measure | undefined =>
  space && (isCONTINUOUS(space) || isORDINAL(space))
    ? space.measure
    : undefined;

/**
 * Unify two measures as TYPES. Undefined is permissive — it means "no claim",
 * so it unifies with anything and yields the other side. Two equal measures
 * unify to themselves. Two *different* defined measures are a type error:
 * unioning extents in incompatible units onto one axis (a marginal
 * histogram's count axis vs. a scatter's millimeters) would give two units one
 * σ, so we throw loudly instead.
 *
 * This is the one policy for every continuous composition (overlays,
 * alignments, spreads, stacks, coords, a layer's datum domain), whatever the
 * origin of the extents: the measures of an axis decide how many σ-scopes it
 * needs, which is part of setting up the layout problem, not of solving it.
 * One axis holds one measure; an axis that needs two (a dual-axis chart) is
 * multi-scale (#525), not a forgotten unit.
 */
export const mergeMeasures = (
  a: Measure | undefined,
  b: Measure | undefined,
  site: MeasureSite
): Measure | undefined => {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (a === b) return a;
  throw new MeasureClash(a, b, site);
};

/** Where two measures meet: the axis (0 or 1) when the clash is on an axis,
 *  and a plain phrase for the composition, read as "(... )" in the message,
 *  e.g. "where marks are lined up". */
export type MeasureSite = { axis?: 0 | 1; where: string };

/**
 * The error for two different measures on one axis. It is raised where the
 * measures meet, which knows the axis index but not the axis's name (`x`,
 * `y`, or a coordinate space's own name such as `r`). The node whose type
 * hook raised it names the axis from where it sits in the tree
 * ({@link MeasureClash.named}) before it reaches the user.
 */
export class MeasureClash extends Error {
  constructor(
    readonly a: Measure,
    readonly b: Measure,
    readonly site: MeasureSite,
    readonly axisName?: string
  ) {
    super(MeasureClash.message(a, b, site, axisName));
    this.name = "MeasureClash";
  }

  /** This clash with its axis named, or itself when it has no axis or is
   *  already named. */
  named(name: (axis: 0 | 1) => string): MeasureClash {
    return this.site.axis === undefined || this.axisName !== undefined
      ? this
      : new MeasureClash(this.a, this.b, this.site, name(this.site.axis));
  }

  static message(
    a: Measure,
    b: Measure,
    site: MeasureSite,
    axisName: string | undefined
  ): string {
    const subject =
      site.axis === undefined
        ? "This chart combines"
        : `The ${axisName ?? (site.axis === 0 ? "x" : "y")} axis combines`;
    return (
      `${subject} two different measures, "${a}" and "${b}" (${site.where}). ` +
      `One axis can show only one measure.\n` +
      `If both are the same kind of quantity, give them the same measure, ` +
      `e.g. if both are dollars, field("${a}", "dollars") and ` +
      `field("${b}", "dollars"). To title the axis, use the axes option ` +
      `(its title).\n` +
      `If they are different kinds of quantity, each needs its own axis: ` +
      `give the inner chart its own w and h so it scales on its own.`
    );
  }
}

/**
 * Like {@link mergeMeasures}, but a conflict *forgets* (returns undefined)
 * instead of throwing. Used only for ORDINAL axes, whose measure is the
 * grouping field that names a category axis: categories set up no σ, so two
 * grouping fields on one axis lose the name, not the scale.
 */
const forgetOnConflict = (
  a: Measure | undefined,
  b: Measure | undefined
): Measure | undefined => {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a === b ? a : undefined;
};

/** Fold an array of measures with a pairwise merge. */
const foldMeasures = (
  ms: (Measure | undefined)[],
  merge: (a: Measure | undefined, b: Measure | undefined) => Measure | undefined
): Measure | undefined => ms.reduce(merge, undefined);

/**
 * Fold an array of measures with {@link mergeMeasures} (throws on a real
 * conflict). The array form of the pairwise unify-as-types guard.
 */
export const mergeAllMeasures = (
  ms: (Measure | undefined)[],
  site: MeasureSite
): Measure | undefined =>
  foldMeasures(ms, (acc, m) => mergeMeasures(acc, m, site));

/**
 * Fold an array of measures with {@link forgetOnConflict} (a conflict forgets
 * to undefined). The array form of the permissive composition merge.
 */
export const forgetAllMeasures = (
  ms: (Measure | undefined)[]
): Measure | undefined => foldMeasures(ms, forgetOnConflict);

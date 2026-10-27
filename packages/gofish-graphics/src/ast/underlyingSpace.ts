// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import {
  interval,
  Interval,
  isFinite as isFiniteInterval,
  width as intervalWidth,
} from "../util/interval";
import { CoordinateTransform } from "./coordinateTransforms/coord";
import {
  getQuantity,
  getValue,
  isAesthetic,
  isValue,
  type MaybeValue,
} from "./data";
import {
  declaredVar,
  MeasureClash,
  resolveUnit,
  rootUnit,
  unify,
  unionInOrder,
  unitOf,
  type MeasureSite,
  type Quantity,
  type UnitTerm,
  type UnitVar,
} from "./measure";

export { MeasureClash, type MeasureSite } from "./measure";
import { nice as d3Nice } from "d3-array";
import { Cell, CycleCell, type AxisCell, type KeyCell } from "./cells";
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
  /** What this axis measures: its unit, its titles, and, over instants, the
   *  zone of their calendar ({@link UnitRecord}). Spaces join records with
   *  {@link joinUnits}; read one with {@link spaceUnit}. Undefined = "no
   *  claim" (permissive). The zone is set when the data along this axis are
   *  instants (from a column in `Unit.time({ zone })`): epoch milliseconds
   *  read on the calendar of the zone. An axis over it is a time axis: its
   *  ticks are calendar cells (axes/timeRows.ts), and its domain is niced
   *  outward to the cells of its inner row ({@link niceContinuous}). */
  measure?: UnitRecord;
  coordinateTransform?: CoordinateTransform;
  /** True when both sides of the 0 hold nonnegative amounts measured away from
   *  it, rather than signed values (#984's "mirrored side": magnitudes with a
   *  side). A stack centered on a `HasMidpoint` column builds it: a Likert
   *  chart's parts left of the center are counts too. An axis over it labels
   *  each tick with its distance from 0. A union keeps it only when every
   *  part has it ({@link allMirrored}).
   *  TODO(#995): layer axis merging, a coord's declared window, and anchorAt drop it. */
  mirrored?: true;
  /** Set when every range placed along this axis is a CELL (a `partition`'s
   *  child spans its cell, cells.ts): the cells, in order. The axis then
   *  places cells, not points: on a time axis the row of the cells'
   *  partition labels each cell between its two boundary ticks
   *  (axes/elaborate.tsx). A union keeps them only when every part has them
   *  ({@link mergeCells}). */
  cells?: readonly Cell[];
};

export type ORDINAL_TYPE = {
  kind: "ordinal";
  domain?: string[]; // Top-level category keys for axis labels
  /** What titles this ordinal axis: its grouping fields (e.g. "lake"). It
   *  has no unit, since categories set up no scale. Read by axis-title
   *  inference ({@link spaceTitle}) so every axis names itself off its own
   *  resolved space, not a surface field-name heuristic. Undefined = "no
   *  claim". */
  titles?: string[];
  /** True when this ordinal's keys are POSITIONAL (a `spread` with no `by` — its
   *  children were auto-keyed by index). Such a spread carries no grouping
   *  identity, so it renders no axis (unit dots packed for layout only). Set at
   *  construction from the contributing nodes' `_syntheticKey` (see
   *  `distributeSpaceFold`), never sniffed back from the domain. An
   *  explicitly-keyed or `by`-grouped ordinal leaves this false. */
  anonymous?: boolean;
  /** Set when every key is a cell of a binned field (`field(x).bin(p)`,
   *  cells.ts): cells of the line, each once, in order of their starts, or
   *  parts of one cycle, in the cycle's order (the keys' order is
   *  `domain`'s; a key is its cell's id). The axis labels each slot with its
   *  cell's label, and a cell of a chain of bins adds a level per bin
   *  before it (its year, for a month), each labeling the run of slots in
   *  one cell (axes/elaborate.tsx). A union keeps them only when every part
   *  has them ({@link mergeAxisCells}), as a continuous axis's cells are. */
  cells?: readonly AxisCell[];
  /** True when the keys have an order: they are the levels of a column the
   *  chart's `schema` declares ordered (`HasOrder`), or cells, which are
   *  ordered by nature (cells of the line by their starts, parts of a cycle
   *  by the cycle). An axis puts an outer level's labels over ordered keys at
   *  the start of each run, and centers them over unordered ones
   *  (axes/elaborate.tsx). A union keeps it only when every part has it. */
  hasOrder?: boolean;
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
  measure?: UnitRecord,
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

/** The space of a datum magnitude `size`: `[0, v]` with the datum's units.
 *  Free by default (its parent places its baseline); `"none"` when the mark's
 *  position is an aesthetic, so the magnitude has only a width. A size is
 *  never an instant (a span of time is a duration, and `.count()` over a
 *  time column is a count): it is in the difference unit of its values'
 *  unit ({@link differenceUnits}), on no calendar. Only a position read
 *  from a time column reads on one. */
export const magnitude = (
  size: MaybeValue<number | undefined>,
  origin: "free" | "none" = "free"
): CONTINUOUS_TYPE => {
  const units = valueUnits(size);
  return CONTINUOUS(
    interval(0, getValue(size)!),
    origin,
    units && differenceUnits(units)
  );
};

/** The units of a difference of two values in units `r`: in the unit the
 *  declared unit names as its `difference`, on no calendar. A difference of
 *  two instants is a duration (`INSTANT.difference`), and a duration adds
 *  up. A unit that names none is its own difference: two amounts in USD
 *  differ by USD (#1197), and so does an unknown unit. The summands become
 *  differences too, so a fold that adds them checks the difference unit. */
export const differenceUnits = (r: UnitRecord): UnitRecord => {
  const difference = r.unit && rootUnit(r.unit)?.difference;
  if (difference === undefined) return r;
  const { zone: _, summands, ...rest } = r;
  return {
    ...rest,
    unit: declaredVar(r.titles[0] ?? difference.unit, difference),
    ...(summands !== undefined
      ? { summands: summands.map(differenceQuantity) }
      : {}),
  };
};

/** The differences {@link differenceQuantity} has made, one per quantity. */
const differenceQuantities = new WeakMap<Quantity, Quantity>();

/** `q` as a difference of two of its values: in its unit's difference unit,
 *  when the unit names one ({@link differenceUnits}). One object per `q`, so
 *  the summands of many marks hold it once ({@link joinUnits}). */
const differenceQuantity = (q: Quantity): Quantity => {
  if (q.unit?.difference === undefined) return q;
  let d = differenceQuantities.get(q);
  if (d === undefined) {
    d = { ...q, unit: q.unit.difference };
    differenceQuantities.set(q, d);
  }
  return d;
};

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

/** A space with an origin whose data interval is one value (#1107): a
 *  one-point chart, or every mark at one constant `datum`. It has no width
 *  for σ to scale, so a scope maps its value to the middle of its box
 *  (`ScopeRegistry.solveScope`). A domain that includes 0 and any other value
 *  (a bar) is never one value. */
export const isOneValue = (
  space: UnderlyingSpace | undefined
): space is CONTINUOUS_TYPE =>
  hasOrigin(space) && space.dataInterval.min === space.dataInterval.max;

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
 *  cells of its `rows`, whose inner row (`rows[0]`) sets the nicing. A time
 *  axis with no `rows` picks its inner row from its domain and `count`
 *  ({@link axisTickPartition}). `resolveAxes` stamps it on every node that
 *  draws an axis (`GoFishNode.axisDemand`), and the axis is drawn from the
 *  same stamp; a time axis stamps its rows (its levels, `axes.x.levels`)
 *  when it is elaborated, before any solve nices its domain. */
export type AxisTicks = { count: number; rows?: CalendarPartition[] };

/** An axis's ticks when it asks for nothing else: about 10. */
export const DEFAULT_AXIS_TICKS: AxisTicks = { count: 10 };

/** The partition a time axis over `space` ticks at: its explicit inner row,
 *  else the partition of the cells it places ({@link cellPartition}), else
 *  the one its domain picks ({@link tickPartition}). */
export const axisTickPartition = (
  space: CONTINUOUS_TYPE,
  ticks: AxisTicks
): CalendarPartition =>
  ticks.rows?.[0] ??
  cellPartition(space) ??
  tickPartition(space.dataInterval.min, space.dataInterval.max, ticks.count);

/** The calendar partition of the cells an axis places (`space.cells`), when
 *  they are calendar cells: a time axis over them ticks at their partition,
 *  so each cell is a cell of its inner row. */
export const cellPartition = (
  space: CONTINUOUS_TYPE
): CalendarPartition | undefined => space.cells?.[0]?.calendar?.partition;

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
 *  This is THE nicing operation. It is applied to a keyed domain AT a sized
 *  node's solve (the render root, a sized layer: `KeyedDomains.scope`, #1114),
 *  never as a pre-layout tree walk, and a node that is not sized never nices
 *  its own subset (it inherits the σ of the sized node above it). It is
 *  DEMAND-DRIVEN: a keyed domain is niced iff some node draws an axis over it
 *  (`KeyedDomains.ticksOf`), and it is niced to that axis's ticks. A free
 *  magnitude
 *  renders the absolute axis of the scope that places its baseline
 *  ({@link placeBaseline}), so it nices as that axis does, about its own 0
 *  (which its interval contains), and stays free. An ordinal or undefined
 *  space is returned UNCHANGED, and so is an empty interval (min > max) or a
 *  non-finite one, which has no ends to round. A coord
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
  // An empty interval (min > max: a column of nulls) or a non-finite one
  // (NaN) has no ends to round, over numbers or instants alike.
  if (!isFiniteInterval(iv)) return space;
  // An absolute axis nices its domain's ends: to round numbers, or, over
  // instants, to cell starts of its inner row. A delta axis has only a
  // width, which it nices from 0 so its steps are even (ticks 20, 40, …, 160
  // rather than 20, 40, …, 140, 147). The low edge of an origin-less
  // interval means nothing, so it stays.
  const [lo, hi] =
    axis === "absolute"
      ? spaceZone(s) !== undefined
        ? niceToCells(
            iv.min,
            iv.max,
            axisTickPartition(s, ticks),
            spaceZone(s)!
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
  measure?: UnitRecord
): CONTINUOUS_TYPE =>
  CONTINUOUS(
    interval(space.dataInterval.min + at, space.dataInterval.max + at),
    "pinned",
    measure ?? space.measure,
    space.coordinateTransform
  );

/** An ordinal space over `domain`, titled by the grouping field `title`. */
export const ORDINAL = (
  domain?: string[],
  title?: string,
  anonymous?: boolean,
  cells?: readonly AxisCell[],
  hasOrder?: boolean
): UnderlyingSpace => ({
  kind: "ordinal",
  domain,
  titles: title === undefined ? undefined : [title],
  anonymous,
  ...(cells !== undefined ? { cells } : {}),
  ...(hasOrder || cells !== undefined ? { hasOrder: true } : {}),
});

/** An ordinal axis's keys: plain text, or cells (`field(x).bin(p)`), which
 *  stand for their ids. */
export type OrdinalKey = string | KeyCell;

/** The ORDINAL over `keys`, in order: over cells when every key is a cell
 *  of a binned field ({@link ORDINAL_TYPE.cells}). A cell of the plane lies
 *  along no one axis, so an ordinal over those is over its keys' ids. */
export const ordinalOver = (
  keys: readonly OrdinalKey[],
  title?: string,
  anonymous?: boolean,
  hasOrder?: boolean
): UnderlyingSpace => {
  const cells = keys.every(
    (k): k is AxisCell => k instanceof Cell || k instanceof CycleCell
  )
    ? mergeAxisCells([keys])
    : undefined;
  return ORDINAL(keys.map(String), title, anonymous, cells, hasOrder);
};

/** The cells of a union of ordinal parts: {@link mergeCells} for cells of
 *  the line, and, for parts of a cycle, every part once, in the cycle's
 *  order, when all are of one cycle. Undefined when any part holds no
 *  cells, or the parts mix kinds or cycles. The siblings of a split over
 *  one key hold the same cells, so parts that are all one list are that
 *  list, and parts of one cycle with a part that holds all of it are the
 *  cycle's cells. */
export const mergeAxisCells = (
  parts: (readonly AxisCell[] | undefined)[]
): readonly AxisCell[] | undefined => {
  if (parts.length === 0 || parts.some((p) => p === undefined))
    return undefined;
  if (parts.every((p) => p === parts[0])) return parts[0];
  const all = (parts as (readonly AxisCell[])[]).flat();
  if (all.every((c): c is Cell => c instanceof Cell))
    return mergeCells(parts as (readonly Cell[])[]);
  if (!all.every((c): c is CycleCell => c instanceof CycleCell))
    return undefined;
  const cycle = all[0]?.cycle;
  if (all.some((c) => c.cycle !== cycle)) return undefined;
  if (parts.some((p) => p!.length === cycle.cells.length)) return cycle.cells;
  const byId = new Map(all.map((c) => [c.id, c]));
  return [...byId.values()].sort((a, b) => a.index - b.index);
};
export const isORDINAL = (space: UnderlyingSpace): space is ORDINAL_TYPE =>
  space.kind === "ordinal";

export const UNDEFINED: UnderlyingSpace = { kind: "undefined" };
export const isUNDEFINED = (space: UnderlyingSpace): space is UNDEFINED_TYPE =>
  space.kind === "undefined";

/** The space of a datum point: a pinned zero-width interval at `pos`, with
 *  the datum's units (on a calendar when the datum is a time). */
const pointAt = (pos: MaybeValue<number | undefined>): CONTINUOUS_TYPE => {
  const at = getValue(pos) ?? 0;
  return CONTINUOUS(interval(at, at), "pinned", valueUnits(pos));
};

/** `space` over `cells` (see {@link CONTINUOUS_TYPE.cells}), or `space`
 *  unchanged when there are none. */
export const withCells = <T extends CONTINUOUS_TYPE>(
  space: T,
  cells: readonly Cell[] | undefined
): T => (cells === undefined ? space : { ...space, cells });

/**
 * The cells of a union of parts on one axis, when they are the cells of one
 * partition of the line: every part's cells, in order of their starts, each
 * once. Undefined when any part does not hold cells (an axis that also places
 * points is not over cells), when there are no parts, and when the cells are
 * not of one partition, as two parts binned differently are not:
 *
 *  - no two cells overlap (a cell in two parts is one interval in both, so
 *    `[0, 10)` and `[5, 10)` are of two partitions), and
 *  - calendar cells share a calendar partition (`sameCells`): an axis over
 *    calendar cells labels them all by one partition's rows.
 *
 * That is what the parts agree on, not how they were binned: a `Bin.step`
 * over two domains gives cells of one partition, and a `Bin.thresholds`
 * fitted to two domains may not.
 */
export const mergeCells = (
  parts: (readonly Cell[] | undefined)[]
): readonly Cell[] | undefined => {
  if (parts.length === 0 || parts.some((p) => p === undefined))
    return undefined;
  if (parts.length === 1) return parts[0];
  const all = (parts as (readonly Cell[])[])
    .flat()
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const partition = all[0]?.calendar?.partition;
  const out: Cell[] = [];
  for (const c of all) {
    const p = c.calendar?.partition;
    if (p === undefined ? partition !== undefined : !p.sameCells(partition))
      return undefined;
    const prev = out[out.length - 1];
    // The same cell, from another part: the later part's stands for it.
    if (prev !== undefined && prev.start === c.start && prev.end === c.end)
      out[out.length - 1] = c;
    else if (prev !== undefined && c.start < prev.end) return undefined;
    else out.push(c);
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

/**
 * What the values along one axis measure:
 *
 *  - `unit`: their unit, a term of the render's union-find (`measure.ts`):
 *    a declared unit, or an unknown that unifies with anything. Two
 *    declared units that differ on one shared axis are a type error
 *    ({@link joinUnits}).
 *  - `zone`: over instants, the zone of the calendar they read on (the
 *    `zone` of their unit, `Unit.time({ zone })`). It is kept beside the
 *    unit, not in it, because the unit is a term of the union-find, which
 *    joins units by name: two instants in different zones are one unit,
 *    and their zones meet by {@link joinZones}.
 *  - `titles`: the quantities that title the axis, in the order they met:
 *    each column's declared quantity (`HasQuantity`), else its name.
 *  - `summands`: the quantities of the values in a declared unit, which a
 *    fold that adds the space sums (`Units.sum` in measure.ts checks their
 *    unit), so a stack checks the columns it adds, not every column its
 *    unit has met (#1197). A quantity in no declared unit passes any sum,
 *    so it is not listed.
 */
export type UnitRecord = {
  unit?: UnitVar;
  zone?: string;
  titles: string[];
  summands?: Quantity[];
};

/** The units of values of quantity `q`: its unit (`unitOf`: its declared
 *  unit, else the variable of its name in the type walk's union-find), its
 *  unit's zone, its name as the title, and `q` itself as a summand when its
 *  unit is declared. */
export const quantityUnits = (
  q: Quantity | undefined
): UnitRecord | undefined =>
  q === undefined
    ? undefined
    : {
        unit: unitOf(q),
        ...(q.unit?.zone !== undefined ? { zone: q.unit.zone } : {}),
        titles: [q.name],
        ...(q.unit !== undefined ? { summands: [q] } : {}),
      };

/** The units of a datum value: of the quantity it was read from; undefined
 *  for a literal, which makes no claim. */
export const valueUnits = (v: MaybeValue<unknown>): UnitRecord | undefined =>
  quantityUnits(getQuantity(v));

/**
 * THE join of two unit records that meet on one axis, in every composition
 * (overlays, alignments, spreads, stacks, coords, a layer's datum domain, a
 * rect's two ends, a `position` offset, in its difference units). An absent
 * record makes no claim and yields the other side. `shared` says whether the
 * two sides share the axis. Every composition today shares it; `false` is
 * kept for axes that will be resolved as independent (#1032's sharing plan
 * passes it there):
 *
 * | Meeting              | shared                         | not shared        |
 * | -------------------- | ------------------------------ | ----------------- |
 * | declared A, A        | one unit A                     | one unit A        |
 * | declared A, B        | {@link MeasureClash} (to #528) | two units, forget |
 * | declared A, unknown x| x is bound to A                | forget            |
 * | unknown x, x         | one unit                       | one unit          |
 * | unknown x, y         | x and y unify                  | forget            |
 *
 * A binding holds for the whole render, so an unknown bound to two
 * different declared units is a {@link MeasureClash} too. "Forget" records
 * nothing and raises nothing: the result keeps `a`'s record. A shared join
 * unions the titles and the summands. Either way the zones must agree: one
 * axis reads one calendar ({@link joinZones}).
 */
export const joinUnits = (
  a: UnitRecord | undefined,
  b: UnitRecord | undefined,
  shared: boolean,
  site: MeasureSite
): UnitRecord | undefined => {
  if (a === undefined) return b;
  if (b === undefined) return a;
  const zone = joinZones(a.zone, b.zone);
  if (shared && a.unit && b.unit) unify(a.unit, b.unit, site);
  const unit = shared ? (a.unit ?? b.unit) : a.unit;
  const titles = shared ? unionInOrder(a.titles, b.titles) : a.titles;
  const summands =
    shared && b.summands
      ? a.summands
        ? unionInOrder(a.summands, b.summands)
        : b.summands
      : a.summands;
  if (
    unit === a.unit &&
    titles === a.titles &&
    zone === a.zone &&
    summands === a.summands
  )
    return a;
  return {
    ...(unit !== undefined ? { unit } : {}),
    ...(zone !== undefined ? { zone } : {}),
    titles,
    ...(summands !== undefined ? { summands } : {}),
  };
};

/** {@link joinUnits} folded over a list. */
export const joinAllUnits = (
  records: (UnitRecord | undefined)[],
  shared: boolean,
  site: MeasureSite
): UnitRecord | undefined =>
  records.reduce<UnitRecord | undefined>(
    (acc, r) => joinUnits(acc, r, shared, site),
    undefined
  );

/** The zone of one axis's calendar: the one its time parts share. A part
 *  with no zone (a literal among times) makes no claim. Two parts in
 *  different zones are an error: one axis reads one calendar. */
const joinZones = (
  a: string | undefined,
  b: string | undefined
): string | undefined => {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (a !== b) {
    throw new Error(
      `Two time columns on one axis are read in different time zones, ` +
        `"${a}" and "${b}". One axis reads one calendar: give both columns ` +
        `the same zone in Unit.time({ zone }).`
    );
  }
  return a;
};

/** A space's {@link UnitRecord} as {@link spaceUnit} reads it: the unit
 *  replaced by its representative in the render's union-find, and no
 *  `summands`, which only a fold that adds reads. */
export type SpaceUnits = {
  unit?: UnitTerm;
  zone?: string;
  titles: string[];
};

/**
 * THE accessor for a space's units: its record with the unit replaced by its
 * union-find representative (a declared unit, or the unknown its class
 * stands for), or undefined for a space with none (an UNDEFINED or ordinal
 * space, or one over literals). Anything that asks which domain a space is
 * in or what titles it reads it here. Read it after the
 * type walk, when every binding is made.
 */
export const spaceUnit = (
  space: UnderlyingSpace | undefined
): SpaceUnits | undefined => {
  const r = space && isCONTINUOUS(space) ? space.measure : undefined;
  if (r === undefined) return undefined;
  const { unit, summands: _, ...rest } = r;
  return unit === undefined ? rest : { ...rest, unit: resolveUnit(unit) };
};

/** The zone of the calendar of a space's axis, when its data are
 *  instants. */
export const spaceZone = (
  space: UnderlyingSpace | undefined
): string | undefined =>
  space && isCONTINUOUS(space) ? space.measure?.zone : undefined;

/**
 * THE title a space gives its axis, in the SI style `Quantity (unit)`: its
 * quantities, joined with ", ", then the symbol of its unit in parentheses
 * when the unit is declared and has a symbol ("Pay (USD)"). A unit with no
 * symbol (a count, a share, an instant) adds nothing, and neither does an
 * unknown unit. The rule reads no names, so a column named "Flipper Length
 * (mm)" in "mm" titles "Flipper Length (mm) (mm)": declare its quantity
 * (`{ name: "Flipper Length", unit: Unit("mm") }`) or set the axis title.
 */
export const spaceTitle = (
  space: UnderlyingSpace | undefined
): string | undefined => {
  if (space && isORDINAL(space))
    return space.titles?.length ? space.titles.join(", ") : undefined;
  const r = spaceUnit(space);
  if (r === undefined || r.titles.length === 0) return undefined;
  const quantities = r.titles.join(", ");
  const symbol = r.unit?.kind === "declared" ? r.unit.symbol : undefined;
  return symbol === undefined ? quantities : `${quantities} (${symbol})`;
};

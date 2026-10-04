// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import {
  ORDINAL,
  UNDEFINED,
  isCONTINUOUS,
  isORDINAL,
  isUNDEFINED,
  mergeAllMeasures,
  forgetAllMeasures,
  dataWidth,
  baselineData,
  allMirrored,
  mirrored,
  type CONTINUOUS_TYPE,
  type MeasureSite,
  type Origin,
  UnderlyingSpace,
  CONTINUOUS,
} from "../underlyingSpace";
import { Extent } from "../extent";
import * as Monotonic from "../../util/monotonic";
import type { Size } from "../dims";
import * as Interval from "../../util/interval";

export type Alignment = "start" | "middle" | "end" | "baseline";

/**
 * How a fold seats a child whose position on the axis is not fixed by its
 * own data: on its baseline at the shared data 0 (`"baseline"`: an overlay, a
 * baseline alignment), or by an edge of its box (`"box"`: a start, end, or
 * middle alignment). A pinned child sits at its own data position either way.
 */
type Seat = "baseline" | "box";

/** Whether a child sits in its parent's frame at its own data coordinates:
 *  a pinned child always, a free child when seated on its baseline. An
 *  origin-less child has no data 0 to seat, so it is always a box. */
const atOwnData = (s: CONTINUOUS_TYPE, seat: Seat): boolean =>
  s.origin === "pinned" || (seat === "baseline" && s.origin === "free");

/** The data interval a child covers in its parent's frame, seated by `seat`
 *  (see {@link Seat}): its own interval, or a box `[0, width]`. */
const seatedInterval = (s: CONTINUOUS_TYPE, seat: Seat): Interval.Interval =>
  atOwnData(s, seat) ? s.dataInterval : Interval.interval(0, dataWidth(s));

/** The data interval of an overlay of `conts` seated by `seat`, whose result
 *  has origin `origin`. When the result is pinned it has data coordinates,
 *  and an origin-less child has none to give it (it has no data 0), so it
 *  adds nothing to the result's data interval; it still takes room through
 *  its claim. Otherwise every child counts by its seated interval. */
export const seatedUnion = (
  conts: CONTINUOUS_TYPE[],
  seat: Seat,
  origin: Origin
): Interval.Interval =>
  Interval.unionAll(
    ...conts
      .filter((s) => origin !== "pinned" || s.origin !== "none")
      .map((s) => seatedInterval(s, seat))
  );

/**
 * The one overlay fold: the union of the children's seated intervals, with
 * the origin the operator gives the result and the children's measures
 * unified as types, whatever their origin (a clash is an error; see
 * {@link mergeMeasures}). Children that all hold amounts on both sides of 0
 * still do together, when the result has a 0.
 */
function overlay(
  conts: CONTINUOUS_TYPE[],
  seat: Seat,
  origin: Origin,
  site: MeasureSite
): UnderlyingSpace {
  const measure = mergeAllMeasures(
    conts.map((s) => s.measure),
    site
  );
  return mirrored(
    CONTINUOUS(seatedUnion(conts, seat, origin), origin, measure),
    origin !== "none" && allMirrored(conts)
  );
}

/**
 * Union child underlying spaces along one axis for overlay-style operators
 * (layer, Porter-Duff). ORDINAL children with a non-empty domain take
 * precedence: if any such child exists, returns ORDINAL(union of keys).
 * Otherwise the result is the {@link overlay} of the continuous children,
 * each seated on its baseline, with the origin {@link overlayOrigin} gives
 * it. UNDEFINED children carry no opinion and are ignored throughout.
 */
export function unionChildSpaces(
  children: Size<UnderlyingSpace>[],
  axis: 0 | 1
): UnderlyingSpace {
  // ORDINAL with an empty/missing domain is a "no-position" placeholder
  // (e.g. from image shapes without a data-bound position), not a real axis.
  // Ignore those so sibling continuous contributions still count.
  const ordinals = children
    .map((c) => c[axis])
    .filter(isORDINAL)
    .filter((o) => o.domain && o.domain.length > 0);
  if (ordinals.length > 0) {
    const keys = new Set<string>();
    for (const ord of ordinals) {
      if (ord.domain) for (const k of ord.domain) keys.add(k);
    }
    // Carry the grouping measure through the union (FORGET on a real clash, as
    // the magnitude path does) so a category axis keeps naming itself off its
    // own space — e.g. a `Frame` wrapping a `spread(lake)` preserves "lake".
    const measure = forgetAllMeasures(ordinals.map((o) => o.measure));
    // Anonymous only if EVERY unioned ordinal is anonymous — one semantically
    // keyed child makes the union a real category axis.
    const anonymous = ordinals.every((o) => o.anonymous);
    return ORDINAL(Array.from(keys), measure, anonymous);
  }

  const axisSpaces = children.map((c) => c[axis]);
  const conts = axisSpaces.filter(isCONTINUOUS);
  if (conts.length === 0) return UNDEFINED;
  return overlay(conts, "baseline", overlayOrigin(axisSpaces), {
    axis,
    where: "where marks are drawn on top of each other",
  });
}

/** The origin of an overlay of `spaces` (each seated on its baseline): pinned
 *  when any is pinned (the overlay has a concrete position, and its free
 *  members sit at data 0); free when every one with an opinion is free (a
 *  magnitude overlay, still placeable by its parent); none otherwise. A
 *  non-continuous member with an opinion (an empty `ORDINAL([])` from an
 *  unresolved `ref()`) has an unknown position, so it keeps the overlay from
 *  being free. UNDEFINED members carry no opinion. */
export const overlayOrigin = (spaces: UnderlyingSpace[]): Origin => {
  const opinions = spaces.filter((s) => !isUNDEFINED(s));
  if (opinions.some((s) => isCONTINUOUS(s) && s.origin === "pinned"))
    return "pinned";
  return opinions.every((s) => isCONTINUOUS(s) && s.origin === "free")
    ? "free"
    : "none";
};

/**
 * The underlying space of an alignment axis: the {@link overlay} of the
 * children as the alignment seats them (on their baselines for `baseline`,
 * by their boxes otherwise). UNDEFINED children carry no opinion, as in an
 * overlay; any other non-continuous child (an ORDINAL) leaves the axis with
 * no continuous fold (UNDEFINED).
 *
 * Alignment establishes a shared baseline; it does not place it. So the
 * result's origin is the overlay's ({@link overlayOrigin}): free when every
 * child is free (a bar chart's bars, lined up on one baseline, are still one
 * magnitude a parent can place), pinned when a child is (it fixes the
 * position), and none when a child has no origin. `middle` drops it
 * (centering scrambles baselines). What places a free baseline is placement:
 * a parent constraint, a data anchor, or the scope root (see
 * `ScopeRegistry.solveScope`).
 */
export function resolveAlignmentSpace(
  spaces: UnderlyingSpace[],
  alignment: Alignment,
  axis: 0 | 1
): UnderlyingSpace {
  const opinions = spaces.filter((s) => !isUNDEFINED(s));
  const conts = opinions.filter(isCONTINUOUS);
  if (conts.length === 0 || conts.length !== opinions.length) return UNDEFINED;
  const origin: Origin = alignment === "middle" ? "none" : overlayOrigin(conts);
  return overlay(conts, alignment === "baseline" ? "baseline" : "box", origin, {
    axis,
    where: "where marks are lined up",
  });
}

/**
 * The claim of an {@link overlay} with result type `space`: the children's
 * claims seated as their types are. A child at its own data coordinates has
 * its claim's baseline at data `b` ({@link baselineData}: 0 for a free child,
 * its min for a pinned one), so at σ it reaches `b·σ + ascent` above the
 * shared 0 and `descent − b·σ` below it; any other child is its box,
 * `[0, width]`. So the pixel overhead
 * the children carry (spacing, padding) stays in the claim even though it is
 * no part of the data interval. The claim is measured from the result's
 * baseline: a free result keeps the larger reach on each side of 0 (so a
 * parent can σ-solve it with every intercept intact), and a pinned or
 * origin-less result is measured from its low edge, so its descent is 0.
 *
 * A result with no data coordinates (ordinal or undefined) still claims when
 * a child with no data coordinates does (a spread of magnitudes: its type is
 * a sequence of separate spaces, its room is σ-dependent): each such child is
 * its box, so the claim is the envelope of their widths. A continuous child
 * of such a result is no part of it on this axis (the type folded no
 * continuous space from it), so neither is its claim. With no such child
 * there is no claim.
 */
function overlayClaim(
  children: { space: UnderlyingSpace; extent: Extent | undefined }[],
  seat: Seat,
  space: UnderlyingSpace
): Extent | undefined {
  const claiming = children.filter(
    (c): c is { space: UnderlyingSpace; extent: Extent } =>
      c.extent !== undefined
  );
  if (!isCONTINUOUS(space)) {
    const boxes = claiming.filter((c) => !isCONTINUOUS(c.space));
    return boxes.length === 0
      ? undefined
      : Extent(Monotonic.envelope(boxes.map((c) => c.extent.width)));
  }
  const above: Monotonic.Monotonic[] = [];
  const below: Monotonic.Monotonic[] = [];
  for (const { space: s, extent } of claiming) {
    if (isCONTINUOUS(s) && atOwnData(s, seat)) {
      const b = baselineData(s);
      above.push(Monotonic.add(Monotonic.linear(b, 0), extent.ascent));
      below.push(Monotonic.add(extent.descent, Monotonic.linear(-b, 0)));
    } else {
      above.push(extent.width);
      below.push(Monotonic.ZERO);
    }
  }
  const up = Monotonic.envelope(above);
  const down = Monotonic.envelope(below);
  return space.origin === "free"
    ? Extent(up, down)
    : Extent(Monotonic.add(up, down));
}

/** The size claim of a {@link unionChildSpaces} overlay, given the overlay's
 *  resolved type `space` ({@link overlayClaim}). */
export function unionChildExtents(
  childExtents: Size<Extent | undefined>[],
  childSpaces: Size<UnderlyingSpace>[],
  axis: 0 | 1,
  space: UnderlyingSpace
): Extent | undefined {
  return overlayClaim(
    childSpaces.map((c, i) => ({
      space: c[axis],
      extent: childExtents[i][axis],
    })),
    "baseline",
    space
  );
}

/** The size claim of a {@link resolveAlignmentSpace} result `space`
 *  ({@link overlayClaim}). */
export function resolveAlignmentExtent(
  childExtents: (Extent | undefined)[],
  childSpaces: UnderlyingSpace[],
  alignment: Alignment,
  space: UnderlyingSpace
): Extent | undefined {
  return overlayClaim(
    childSpaces.map((s, i) => ({ space: s, extent: childExtents[i] })),
    alignment === "baseline" ? "baseline" : "box",
    space
  );
}

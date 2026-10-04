// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import {
  ORDINAL,
  UNDEFINED,
  isCONTINUOUS,
  isORDINAL,
  isUNDEFINED,
  mergeMeasures,
  mergeAllMeasures,
  forgetAllMeasures,
  spaceMeasure,
  continuousInterval,
  dataSides,
  dataWidth,
  allMirrored,
  mirrored,
  type CONTINUOUS_TYPE,
  UnderlyingSpace,
  CONTINUOUS,
  originIs,
} from "../underlyingSpace";
import { Extent, envelope, maxExtent } from "../extent";
import * as Monotonic from "../../util/monotonic";
import type { Measure } from "../data";
import type { Size } from "../dims";
import * as Interval from "../../util/interval";

export type Alignment = "start" | "middle" | "end" | "baseline";

/**
 * Union child underlying spaces along one axis for overlay-style operators
 * (layer, Porter-Duff). ORDINAL children with a non-empty domain take
 * precedence: if any such child exists, returns ORDINAL(union of keys).
 * Otherwise unions the children's data intervals (absolute for a pinned
 * child, about the baseline for a free one, `[0, w]` for a difference). When
 * at least one child is pinned, returns POSITION(union): the overlay has a
 * concrete position, and its free children are pinned at data 0.
 * When intervals came only from DIFFERENCE/SIZE, returns DIFFERENCE(width of
 * union) — the extent is known but the position is not, preserving the "no
 * inherent position" semantic so axis rendering uses interval (difference)
 * ticks rather than absolute positions.
 *
 * UNDEFINED children carry no opinion and are ignored throughout: the ORDINAL
 * filter skips them, the interval-collection path skips them, and the SIZE gate
 * filters them out before checking whether the remaining children are all SIZE.
 * So a fixed-pixel (UNDEFINED) sibling never vetoes SIZE composition.
 */
export function unionChildSpaces(
  children: Size<UnderlyingSpace>[],
  axis: 0 | 1
): UnderlyingSpace {
  // ORDINAL with an empty/missing domain is a "no-position" placeholder
  // (e.g. from image shapes without a data-bound position), not a real axis.
  // Ignore those so sibling POSITION/DIFFERENCE contributions still count.
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
  const nonUndefined = axisSpaces.filter((s) => !isUNDEFINED(s));
  const conts = axisSpaces.filter(isCONTINUOUS);
  if (conts.length === 0) return UNDEFINED;

  // Pure magnitude overlay — every child is a baseline magnitude ("free":
  // bars/stacks not yet placed). The overlay is free too, with the larger data
  // extent on each side of the shared baseline (its claim keeps the symbolic
  // Monotonics; see `unionChildExtents`). Composing different fields'
  // magnitudes is legitimate, so measures FORGET on conflict.
  //
  // A non-UNDEFINED, non-CONTINUOUS sibling (e.g. an empty `ORDINAL([])` from an
  // unresolved `ref()`) is NOT a magnitude and VETOES this path — exactly the
  // old `sized.every(isSIZE)` gate over non-undefined children. Without the veto
  // the overlay would self-scale (free magnitude) where it used to stay
  // unanchored (DIFFERENCE), so a sized child overlaid with an unresolved ref
  // would change geometry. UNDEFINED siblings (fixed-pixel) still never veto.
  if (
    nonUndefined.length === conts.length &&
    conts.every((s) => s.origin === "free")
  ) {
    const sides = conts.map(dataSides);
    return CONTINUOUS(
      Interval.interval(
        -Math.max(...sides.map((d) => d.descent)),
        Math.max(...sides.map((d) => d.ascent))
      ),
      "free",
      forgetAllMeasures(conts.map((s) => s.measure))
    );
  }

  // Mixed / data-positioned overlay: union the data intervals. This is where a
  // marginal histogram's count axis (origin 0) would silently union with a
  // scatter's millimeter axis — so unify measures as TYPES and THROW on a real
  // clash. Any anchored child gives the overlay a concrete position (POSITION);
  // an all-unanchored overlay keeps "extent known, position not" (DIFFERENCE).
  const intervals: ReturnType<typeof Interval.interval>[] = [];
  let hasAnchored = false;
  let measure: Measure | undefined;
  for (const s of conts) {
    intervals.push(s.dataInterval);
    if (s.origin === "pinned") hasAnchored = true;
    measure = mergeMeasures(measure, s.measure, "overlay union");
  }
  const union = Interval.unionAll(...intervals);
  return hasAnchored
    ? mirrored(CONTINUOUS(union, "pinned", measure), allMirrored(conts))
    : CONTINUOUS(Interval.interval(0, Interval.width(union)), "none", measure);
}

/**
 * Determine the underlying space for an alignment axis given child spaces and alignment mode.
 * Returns both the space and a flag indicating whether children came from SIZE space
 * (i.e. they have no inherent position — layout must align them).
 */
export function resolveAlignmentSpace(
  spaces: UnderlyingSpace[],
  alignment: Alignment
): UnderlyingSpace {
  const conts = spaces.filter(isCONTINUOUS);
  if (conts.length === 0 || conts.length !== spaces.length) return UNDEFINED;

  // When every child is a baseline magnitude ("free"), measures FORGET on
  // conflict — that's how a histogram's count axis carries a "count" tag
  // forward; mixed/positioned children unify measures as TYPES (throw on a real
  // clash).
  const allBaseline = conts.every((s) => s.origin === "free");
  const measure = allBaseline
    ? forgetAllMeasures(conts.map(spaceMeasure))
    : mergeAllMeasures(conts.map(spaceMeasure), "alignment");

  // `middle` DROPS the anchor (centering scrambles baselines); an already
  // unanchored ("conflict") child can't be re-anchored by alignment (it is
  // absorbing). Either way the result is unanchored.
  const drop = alignment === "middle" || conts.some((s) => s.origin === "none");

  // Baseline alignment lines the children up at their baselines, so each
  // extends `[−descent, ascent]` about the shared one. Any other alignment
  // lines up a box edge or center, so each child is its whole box `[0, width]`
  // and the union spans the widest. An anchored child keeps its own interval.
  const extent = (s: CONTINUOUS_TYPE) =>
    alignment === "baseline"
      ? s.dataInterval
      : (continuousInterval(s) ?? Interval.interval(0, dataWidth(s)));
  const union = Interval.unionAll(...conts.map(extent));

  // Children that all hold amounts on both sides of 0 still do together.
  return drop
    ? CONTINUOUS(Interval.interval(0, Interval.width(union)), "none", measure)
    : mirrored(CONTINUOUS(union, "pinned", measure), allMirrored(conts));
}

/**
 * The claim of a union of continuous children laid out on one axis, mirroring
 * the data intervals the type folds union: at σ a pinned child spans
 * `[min·σ, min·σ + width(σ)]` (its data min, then its whole claim, which is
 * how a pinned scope lays it out: see `ScopeRegistry.solvePosition`), and any
 * other child spans `[−descent, ascent]` about the shared 0 (`"baseline"`) or
 * its whole box `[0, width]` from the aligned edge (`"box"`). The claim is the
 * width of the union of those spans, so the pixel overhead the children carry
 * (spacing, padding) stays in the claim even though it is no part of the data
 * interval. A union is measured from its low edge, so its descent is 0.
 */
function unionClaim(
  children: { space: CONTINUOUS_TYPE; extent: Extent }[],
  mode: "baseline" | "box"
): Extent {
  const above: Monotonic.Monotonic[] = [];
  const below: Monotonic.Monotonic[] = [];
  for (const { space, extent } of children) {
    const iv = continuousInterval(space);
    if (iv !== undefined) {
      above.push(Monotonic.add(Monotonic.linear(iv.min, 0), extent.width));
      below.push(Monotonic.linear(-iv.min, 0));
    } else if (mode === "baseline") {
      above.push(extent.ascent);
      below.push(extent.descent);
    } else {
      above.push(extent.width);
      below.push(Monotonic.ZERO);
    }
  }
  return Extent(Monotonic.add(envelope(above), envelope(below)));
}

/** The continuous children on `axis`, each with its claim. */
const continuousChildren = (
  childExtents: (Extent | undefined)[],
  childSpaces: UnderlyingSpace[]
): { space: CONTINUOUS_TYPE; extent: Extent }[] =>
  childSpaces.flatMap((space, i) =>
    isCONTINUOUS(space) ? [{ space, extent: childExtents[i]! }] : []
  );

/**
 * The size claim of a {@link unionChildSpaces} overlay, given the overlay's
 * resolved type `space`. A free overlay keeps its children's symbolic claims
 * (the larger ascent and the larger descent about the shared baseline), so a
 * parent can σ-solve it via `inverse` with any pixel overhead intact. A pinned
 * or difference overlay claims the union of its children's claims
 * ({@link unionClaim}).
 */
export function unionChildExtents(
  childExtents: Size<Extent | undefined>[],
  childSpaces: Size<UnderlyingSpace>[],
  axis: 0 | 1,
  space: UnderlyingSpace
): Extent | undefined {
  if (!isCONTINUOUS(space)) return undefined;
  const children = continuousChildren(
    childExtents.map((c) => c[axis]),
    childSpaces.map((c) => c[axis])
  );
  if (originIs(space, "free")) return maxExtent(children.map((c) => c.extent));
  return unionClaim(children, "baseline");
}

/** The size claim of a {@link resolveAlignmentSpace} result `space`: the
 *  union of the children's claims as the alignment places them
 *  ({@link unionClaim}). */
export function resolveAlignmentExtent(
  childExtents: (Extent | undefined)[],
  childSpaces: UnderlyingSpace[],
  alignment: Alignment,
  space: UnderlyingSpace
): Extent | undefined {
  if (!isCONTINUOUS(space)) return undefined;
  return unionClaim(
    continuousChildren(childExtents, childSpaces),
    alignment === "baseline" ? "baseline" : "box"
  );
}

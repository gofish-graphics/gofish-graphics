// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import {
  CONTINUOUS,
  DIFFERENCE,
  ORDINAL,
  POSITION,
  UNDEFINED,
  isCONTINUOUS,
  isORDINAL,
  isUNDEFINED,
  mergeMeasures,
  mergeAllMeasures,
  forgetAllMeasures,
  spaceMeasure,
  continuousExtentInterval,
  UnderlyingSpace,
} from "../underlyingSpace";
import type { Measure } from "../data";
import type { Size } from "../dims";
import * as Interval from "../../util/interval";
import * as Monotonic from "../../util/monotonic";

export type Alignment = "start" | "middle" | "end" | "baseline";

/**
 * Union child underlying spaces along one axis for overlay-style operators
 * (layer, Porter-Duff). ORDINAL children with a non-empty domain take
 * precedence: if any such child exists, returns ORDINAL(union of keys).
 * Otherwise collects intervals from POSITION domains, DIFFERENCE widths (as
 * [0, w]), and SIZE values (as [0, v]). When at least one child is a true
 * POSITION, returns POSITION(union) — the overlay has a concrete position.
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
    return ORDINAL(Array.from(keys));
  }

  const axisSpaces = children.map((c) => c[axis]);
  const nonUndefined = axisSpaces.filter((s) => !isUNDEFINED(s));
  const conts = axisSpaces.filter(isCONTINUOUS);
  if (conts.length === 0) return UNDEFINED;

  // Pure magnitude overlay — every child is a baseline magnitude ("free":
  // bars/stacks not yet placed). Keep the symbolic Monotonic so the parent can
  // σ-solve via `inverse` (preserving piecewise/intercept extents that an
  // interval-at-σ=1 collapse would bake away). Composing different fields'
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
    return CONTINUOUS(
      Monotonic.max(...conts.map((s) => s.width)),
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
    intervals.push(continuousExtentInterval(s));
    if (typeof s.origin === "number") hasAnchored = true;
    measure = mergeMeasures(measure, s.measure, "overlay union");
  }
  const union = Interval.unionAll(...intervals);
  return hasAnchored
    ? POSITION(union, measure)
    : DIFFERENCE(Interval.width(union), measure);
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
  // unanchored ("impossible") child can't be re-anchored by alignment (it is
  // absorbing). Either way the result is unanchored.
  const drop =
    alignment === "middle" || conts.some((s) => s.origin === "impossible");

  const union = Interval.unionAll(...conts.map(continuousExtentInterval));

  return drop
    ? DIFFERENCE(Interval.width(union), measure)
    : POSITION(union, measure);
}

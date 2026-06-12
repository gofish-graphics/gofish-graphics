// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { Placeable } from "../_node";
import {
  DIFFERENCE,
  ORDINAL,
  POSITION,
  SIZE,
  UNDEFINED,
  isDIFFERENCE,
  isORDINAL,
  isPOSITION,
  isSIZE,
  isUNDEFINED,
  mergeMeasures,
  mergeAllMeasures,
  forgetAllMeasures,
  spaceMeasure,
  UnderlyingSpace,
} from "../underlyingSpace";
import type { Measure } from "../data";
import type { Size } from "../dims";
import { alignTargets } from "../constraints/align";
import type { AlignAnchor } from "../constraints/shared";
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

  // Preserve SIZE composition for overlay operators (layer, porterDuff):
  // when every child is SIZE on this axis, emit SIZE(Monotonic.max(...))
  // so the parent can keep solving scale factors via Monotonic.inverse.
  // SIZE∘SIZE composition is legitimate across different fields, so FORGET
  // the measure on conflict rather than throwing.
  const axisSpaces = children.map((c) => c[axis]);
  const sized = axisSpaces.filter((s) => !isUNDEFINED(s));
  if (sized.length > 0 && sized.every(isSIZE)) {
    const measure = forgetAllMeasures(sized.map((s) => s.measure));
    return SIZE(Monotonic.max(...sized.map((s) => s.domain)), measure);
  }

  // Mixed/POSITION interval collection. This is where a marginal histogram's
  // count axis (a SIZE folded into [0, run(1)]) would silently union with a
  // scatter's millimeter POSITION — so unify the measures as TYPES and THROW
  // on a real conflict.
  const intervals: ReturnType<typeof Interval.interval>[] = [];
  let hasPosition = false;
  let measure: Measure | undefined;
  for (const child of children) {
    const space = child[axis];
    if (isPOSITION(space) && space.domain) {
      hasPosition = true;
      intervals.push(space.domain);
      measure = mergeMeasures(measure, space.measure, "overlay union");
    } else if (isDIFFERENCE(space)) {
      intervals.push(Interval.interval(0, space.width));
      measure = mergeMeasures(measure, space.measure, "overlay union");
    } else if (isSIZE(space)) {
      intervals.push(Interval.interval(0, space.domain.run(1)));
      measure = mergeMeasures(measure, space.measure, "overlay union");
    }
  }
  if (intervals.length === 0) return UNDEFINED;
  const union = Interval.unionAll(...intervals);
  if (!hasPosition) return DIFFERENCE(Interval.width(union), measure);
  return POSITION(union, measure);
}

/**
 * Determine the underlying space for an alignment axis given child spaces and alignment mode.
 * Returns both the space and a flag indicating whether children came from SIZE space
 * (i.e. they have no inherent position — layout must align them).
 */
export function resolveAlignmentSpace(
  spaces: UnderlyingSpace[],
  alignment: Alignment
): { space: UnderlyingSpace; fromSize: boolean } {
  if (spaces.every((s) => isSIZE(s))) {
    const sizeValues = spaces.map((s) =>
      ((s as any).domain as { run: (x: number) => number }).run(1)
    );
    // LOAD-BEARING: the SIZE → POSITION conversion must carry the SIZE
    // children's measure forward — this is how a histogram's count axis (all
    // SIZE) gets a "count" tag that a later overlay union can compare against.
    // Forget-merge: shared when they agree, undefined when they differ.
    const measure = forgetAllMeasures(spaces.map((s) => spaceMeasure(s)));
    if (
      alignment === "start" ||
      alignment === "end" ||
      alignment === "baseline"
    ) {
      const intervals = sizeValues.map((v) => Interval.interval(0, v));
      return {
        space: POSITION(Interval.unionAll(...intervals), measure),
        fromSize: true,
      };
    }
    if (alignment === "middle") {
      return {
        space: DIFFERENCE(
          Math.max(...sizeValues.map((v) => Math.abs(v))),
          measure
        ),
        fromSize: true,
      };
    }
    return { space: UNDEFINED, fromSize: true };
  }
  if (spaces.every((s) => isDIFFERENCE(s))) {
    // Sibling difference extents being aligned should agree in units — THROW
    // on a real conflict.
    const measure = mergeAllMeasures(
      spaces.map((s) => spaceMeasure(s)),
      "alignment"
    );
    return {
      space: DIFFERENCE(
        Math.max(...spaces.map((s) => (s as any).width as number)),
        measure
      ),
      fromSize: false,
    };
  }
  if (spaces.every((s) => isPOSITION(s))) {
    const domain = Interval.unionAll(
      ...spaces.map(
        (s) => (s as any).domain as ReturnType<typeof Interval.interval>
      )
    );
    const measure = mergeAllMeasures(
      spaces.map((s) => spaceMeasure(s)),
      "alignment"
    );
    if (alignment === "middle") {
      return {
        space: DIFFERENCE(Interval.width(domain), measure),
        fromSize: false,
      };
    }
    return { space: POSITION(domain, measure), fromSize: false };
  }
  return { space: UNDEFINED, fromSize: false };
}

/**
 * Align children on a single axis using spread-style semantics. Thin wrapper
 * over the shared `alignTargets` walk (see `constraints/align.ts`) supplying
 * spread's `readPlaced` reader (a `"baseline"` anchor pins to 0 and missing
 * extents are tolerated). The no-sibling fallback is the shared
 * space-kind-dispatched rule (`alignFallbackBaseline`): a scaled (posScale)
 * axis falls back to the scale origin `posScale(0)`, a pixel-pure axis to the
 * layer-box edge.
 *
 * Guard: when children already have data-driven positions via posScale
 * (fromSize is false and alignment !== "middle"), skip — the children
 * already know where they belong.
 */
export function alignChildren(
  children: Placeable[],
  axis: 0 | 1,
  alignment: Alignment,
  size: number,
  posScale: ((v: number) => number) | undefined,
  fromSize: boolean
): void {
  // Skip when children have data-driven positions, unless they came from
  // SIZE space (no inherent position) or middle alignment forces centering.
  if (posScale && !fromSize && alignment !== "middle") return;

  const anchors = new Array<AlignAnchor>(children.length).fill(alignment);
  alignTargets(
    children,
    axis === 0 ? "x" : "y",
    anchors,
    {
      readPlaced: (child, idx, a) =>
        a === "baseline"
          ? 0
          : a === "start"
            ? (child.dims[idx].min ?? 0)
            : a === "middle"
              ? (child.dims[idx].center ?? child.dims[idx].min ?? 0)
              : (child.dims[idx].max ?? child.dims[idx].min ?? 0),
    },
    { size, posScale }
  );
}

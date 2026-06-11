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
  UnderlyingSpace,
} from "../underlyingSpace";
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

  // Preserve SIZE composition for overlay operators (layer, porterDuff):
  // when every child is SIZE on this axis, emit SIZE(Monotonic.max(...))
  // so the parent can keep solving scale factors via Monotonic.inverse.
  const axisSpaces = children.map((c) => c[axis]);
  const sized = axisSpaces.filter((s) => !isUNDEFINED(s));
  if (sized.length > 0 && sized.every(isSIZE)) {
    return SIZE(Monotonic.max(...sized.map((s) => s.domain)));
  }

  const intervals: ReturnType<typeof Interval.interval>[] = [];
  let hasPosition = false;
  for (const child of children) {
    const space = child[axis];
    if (isPOSITION(space) && space.domain) {
      hasPosition = true;
      intervals.push(space.domain);
    } else if (isDIFFERENCE(space)) {
      intervals.push(Interval.interval(0, space.width));
    } else if (isSIZE(space)) {
      intervals.push(Interval.interval(0, space.domain.run(1)));
    }
  }
  if (intervals.length === 0) return UNDEFINED;
  const union = Interval.unionAll(...intervals);
  if (!hasPosition) return DIFFERENCE(Interval.width(union));
  return POSITION(union);
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
    if (
      alignment === "start" ||
      alignment === "end" ||
      alignment === "baseline"
    ) {
      const intervals = sizeValues.map((v) => Interval.interval(0, v));
      return {
        space: POSITION(Interval.unionAll(...intervals)),
        fromSize: true,
      };
    }
    if (alignment === "middle") {
      return {
        space: DIFFERENCE(Math.max(...sizeValues.map((v) => Math.abs(v)))),
        fromSize: true,
      };
    }
    return { space: UNDEFINED, fromSize: true };
  }
  if (spaces.every((s) => isDIFFERENCE(s))) {
    return {
      space: DIFFERENCE(
        Math.max(...spaces.map((s) => (s as any).width as number))
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
    if (alignment === "middle") {
      return { space: DIFFERENCE(Interval.width(domain)), fromSize: false };
    }
    return { space: POSITION(domain), fromSize: false };
  }
  return { space: UNDEFINED, fromSize: false };
}

/**
 * Align children on a single axis using spread-style semantics.
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

  const isFixed = (child: Placeable) => child.dims[axis].min !== undefined;
  const fixedChildren = children.filter(isFixed);

  const anchorMap = {
    start: "min",
    middle: "center",
    end: "max",
    baseline: "baseline",
  } as const;

  const getBaseline = (child: Placeable): number => {
    const dim = child.dims[axis];
    const anchor = anchorMap[alignment];
    if (anchor === "baseline") return 0;
    return dim[anchor] ?? dim.min ?? 0;
  };

  const baseline =
    fixedChildren.length > 0
      ? getBaseline(fixedChildren[0])
      : alignment === "middle"
        ? size / 2
        : posScale
          ? posScale(0)
          : 0;

  const placeAnchor = anchorMap[alignment];

  for (const child of children) {
    if (isFixed(child)) continue;
    child.place(axis, baseline, placeAnchor);
  }
}

// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Axis, AlignAnchor, ConstraintRef } from "./shared";
import type { Placeable } from "../_node";
import { getMeasure, getValue, isValue, type MaybeValue } from "../data";
import type { PlacementFactEmitter, RelationAnchor } from "./placementFacts";
import {
  CONTINUOUS_TYPE,
  ORDINAL,
  POSITION,
  SIZE,
  UNDEFINED,
  UnderlyingSpace,
  forgetAllMeasures,
  isBaselineMagnitude,
  isPOSITION,
  mirrored,
  spaceMeasure,
} from "../underlyingSpace";
import * as Monotonic from "../../util/monotonic";
import * as Interval from "../../util/interval";

export interface DistributeOptions {
  dir: Axis;
  spacing?: number;
  /** How adjacent children in the chain relate:
   *  - `"edge"` (default): `start[i+1] = end[i] + spacing` — spacing is the gap
   *    between facing edges (content-dependent).
   *  - `"start" | "middle" | "end" | "baseline"`: fixed-pitch anchor chaining —
   *    `anchor[i+1] = anchor[i] + spacing` — spacing is a fixed,
   *    content-independent anchor-to-anchor pitch (`"middle"` is
   *    center-to-center). */
  anchor?: AlignAnchor | "edge";
  order?: "forward" | "reverse";
  /** Stack semantics: glue children together (sizes sum into a POSITION at the
   *  layer) instead of slicing a budget. Forces `spacing` to 0. Mirrors
   *  spread's `glue`. */
  glue?: boolean;
  /** The measure for an ORDINAL fold — the grouping field (spread's `by`) — so a
   *  category axis names itself off its own space, like a continuous axis does. */
  measure?: string;
  /** A stack's origin (glue only): see {@link DistributeOrigin}. Omitted, it
   *  is the tail of the first part laid out. */
  origin?: DistributeOrigin;
}

/**
 * Where a stack's origin lies: its baseline, the 0 its running sums start
 * from, which the layer seats at the measure's origin (#773). It is the point
 * `fraction` of the way from the tail of part `child` to its head. The default
 * is the first part's tail; a stack over a column with `HasCenter` puts it at
 * the center of the column's order (#984), and then `center` names that
 * column: the parts must be nonnegative amounts, and the stack's space holds
 * magnitudes on both sides of its 0 (`CONTINUOUS_TYPE.mirrored`).
 */
export type DistributeOrigin = {
  child: string;
  fraction: number;
  center?: string;
};

export interface DistributeConstraint {
  type: "distribute";
  dir: Axis;
  spacing: number;
  anchor: AlignAnchor | "edge";
  order: "forward" | "reverse";
  glue: boolean;
  children: ConstraintRef[];
  measure?: string;
  origin?: DistributeOrigin;
}

export const createDistributeConstraint = (
  options: DistributeOptions,
  children: ConstraintRef[]
): DistributeConstraint => ({
  type: "distribute",
  dir: options.dir,
  // Glue pins spacing ≡ 0 for both the space fold and placement-solver
  // relations, so glued children touch.
  spacing: options.glue ? 0 : (options.spacing ?? 8),
  anchor: options.anchor ?? "edge",
  order: options.order ?? "forward",
  glue: options.glue ?? false,
  children,
  measure: options.measure,
  ...(options.glue && options.origin !== undefined
    ? { origin: options.origin }
    : {}),
});

/** The origin of a stack over `ordered` (its parts in placement order): the
 *  declared origin when its part is among them, else the first part's tail. */
export function distributeOrigin(
  constraint: Pick<DistributeConstraint, "origin">,
  ordered: readonly { name: string }[]
): { index: number; fraction: number; center?: string } {
  const origin = constraint.origin;
  const index =
    origin === undefined
      ? -1
      : ordered.findIndex((child) => child.name === origin.child);
  return index < 0
    ? { index: 0, fraction: 0 }
    : { index, fraction: origin!.fraction, center: origin!.center };
}

/** `children` in placement order — reversed for `order: "reverse"`. The result
 *  is read-only: the forward case is the caller's own array. */
export function distributeChildrenInPlacementOrder(
  constraint: DistributeConstraint,
  children: readonly ConstraintRef[] = constraint.children
): readonly ConstraintRef[] {
  return constraint.order === "reverse" ? [...children].reverse() : children;
}

export function distributePlacementAnchors({
  anchor,
  glue,
}: Pick<DistributeConstraint, "anchor" | "glue">): {
  from: RelationAnchor;
  to: RelationAnchor;
} {
  // Fixed-pitch anchors (start/middle/end/baseline) relate the SAME anchor on
  // both sides of the chain edge (anchor[i+1] = anchor[i] + spacing); "edge"
  // relates the facing edges (end of prev → start of cur). A stack (glue) lays
  // its parts end to end as vectors (#773): each part's tail (its baseline)
  // sits on the previous part's head, so a negative part goes back. A part
  // with no data baseline has tail = start and head = end, so for such parts
  // and for positive bars this is the facing-edge chain.
  if (glue) return { from: "head", to: "tail" };
  return anchor === "edge"
    ? { from: "end", to: "start" }
    : { from: anchor, to: anchor };
}

export function lowerDistributePlacement(
  constraint: DistributeConstraint,
  owner: string,
  {
    emitter,
    targets,
    isInitiallyPlaced,
  }: {
    emitter: PlacementFactEmitter;
    targets: Pick<Map<string, Placeable>, "has" | "get">;
    isInitiallyPlaced: (axis: Axis, name: string) => boolean;
  }
): void {
  const children = constraint.children.filter((child) =>
    targets.has(child.name)
  );
  const ordered = distributeChildrenInPlacementOrder(constraint, children);
  if (ordered.length === 0) return;
  const anchors = distributePlacementAnchors(constraint);
  // A fixed-pitch chain on y is an OVERLAY, not a tiling: the targets' allocated
  // y bands are just leftover slices, unrelated to where the chained anchor
  // sits. Stamp the chained anchor on each target so a target that later opens
  // its own y-up flip scope mirrors about that anchor (see `Placeable.
  // pitchAnchorY` and `scopeBox` in coordinateTransforms/bake.ts) — keeping the
  // painted anchors exactly where this chain solved them, at exact pitch.
  if (constraint.anchor !== "edge" && constraint.dir === "y") {
    for (const child of ordered) {
      const target = targets.get(child.name);
      if (target) target.pitchAnchorY = constraint.anchor;
    }
  }
  for (let i = 1; i < ordered.length; i++) {
    // A chain edge whose endpoints both arrived pre-positioned is a consistency
    // check, not an owning relation: confluence governs the unknown positions.
    if (
      isInitiallyPlaced(constraint.dir, ordered[i - 1].name) &&
      isInitiallyPlaced(constraint.dir, ordered[i].name)
    )
      continue;
    emitter.relate({
      axis: constraint.dir,
      from: { name: ordered[i - 1].name, anchor: anchors.from },
      to: { name: ordered[i].name, anchor: anchors.to },
      gap: constraint.spacing,
      owner,
    });
  }
  // A spread's chain starts at its first member. A stack's chain also carries
  // its origin, which the solver's free-origin fallback seats at the measure's
  // origin (#773): the first part's tail, or the center of a `HasCenter`
  // column's order (#984).
  if (!constraint.glue) {
    emitter.include({ axis: constraint.dir, name: ordered[0].name, owner });
    return;
  }
  const origin = distributeOrigin(constraint, ordered);
  emitter.include({
    axis: constraint.dir,
    name: ordered[origin.index].name,
    owner,
    origin: origin.fraction,
  });
}

/**
 * The distribute constraint's *space-resolution* contribution — the bottom-up
 * half that makes `layer + distribute` claim the same underlying space a
 * `spread` does. Mirrors spread.tsx's stack-axis dispatch exactly (spread's
 * `resolveUnderlyingSpace`), including the explicit-size override and the glue
 * (stack) variant, so phase-3 spread can delegate to it wholesale:
 *
 *  - explicit `opts.size` (a value) → SIZE(linear(value, 0)) — the spread's own
 *    size wins over any children-derived claim.
 *  - glue → POSITION over the parts laid end to end from the stack's origin
 *    (each part's baseline on the previous part's head; `[0, Σ widths]` when
 *    no part has a descent and the origin is the first part's tail) when
 *    all-POSITION or all-SIZE; ORDINAL(keys) when any child is keyed; else
 *    UNDEFINED.
 *  - non-glue, all-SIZE & data-driven (some non-constant Monotonic) → SIZE
 *    composition (Monotonic.add + spacing·(n−1) for "edge"; the
 *    unknown-Monotonic fixed-pitch form for start/middle/end/baseline), so a
 *    parent can solve a scale factor via Monotonic.inverse (auto-fit).
 *  - non-glue, any child keyed → ORDINAL.
 *  - non-glue, all-SIZE constant → SIZE composition.
 *  - non-glue, all-POSITION → POSITION([0, Σ widths]).
 *  - anything else → UNDEFINED (caller falls back to its default union).
 *
 * Measures forget-merge on conflict, like spread. `keys` are the targets'
 * ordinal keys (node.key) in the same order as `targetSpaces`; only used to
 * pick the ORDINAL branch. This is ref-independent (plain arrays) so spread can
 * call it with its positional children and the layer with its name-resolved
 * targets.
 */
export function distributeSpaceFold(
  targetSpaces: UnderlyingSpace[],
  keys: (string | undefined)[],
  opts: {
    spacing: number;
    anchor: AlignAnchor | "edge";
    glue?: boolean;
    /** Explicit size on the spread/layer's stack axis; overrides children. */
    size?: MaybeValue<number>;
    /** The measure for an ORDINAL result — the grouping field (spread's `by`),
     *  so a category axis names itself off its own space, just as a continuous
     *  axis's measure is its field. (Distinct from `childMeasure` below, which
     *  is the continuous measure composed from the children for a SIZE/POSITION
     *  result.) */
    measure?: string;
    /** True when every contributing child was POSITIONALLY keyed (a `spread`
     *  with no `by`): the folded ORDINAL is anonymous and renders no axis. */
    anonymous?: boolean;
    /** A stack's origin, by index into `targetSpaces` (see
     *  {@link distributeOrigin}). Omitted: the first part's tail. */
    origin?: { index: number; fraction: number; center?: string };
  }
): UnderlyingSpace {
  const n = targetSpaces.length;
  if (n === 0) return UNDEFINED;
  const childMeasure = forgetAllMeasures(
    targetSpaces.map((s) => spaceMeasure(s))
  );

  // Explicit size on the stack axis dominates the children-derived claim.
  if (opts.size !== undefined && isValue(opts.size)) {
    return SIZE(
      Monotonic.linear(getValue(opts.size)!, 0),
      getMeasure(opts.size)
    );
  }

  const namedKeys = keys.filter((k): k is string => k !== undefined);
  const spacing = opts.glue ? 0 : opts.spacing;
  // A "free" baseline magnitude composes its Monotonic + spacing; an anchored
  // data-positioned child sums its data widths WITHOUT spacing. The two paths
  // stay distinct: collapsing them injects spacing into already-positioned
  // extents.
  const allSize = targetSpaces.every(isBaselineMagnitude);
  const allPosition = targetSpaces.every(isPOSITION);
  const widthAt1 = (s: UnderlyingSpace): number =>
    (s as CONTINUOUS_TYPE).width.run(1);
  const sumWidths = (): number =>
    targetSpaces.map(widthAt1).reduce((a, b) => a + b, 0);

  if (opts.glue) {
    // STACK semantics: the parts lie end to end as vectors (#773), each one's
    // baseline on the previous one's head, starting from the first part's
    // baseline at 0. The stack is an anchored POSITION over everything the
    // parts cover: each part spans `[at − descent, at + ascent]` about the
    // running sum `at` of the parts before it, then moves `at` by
    // `ascent − descent`. With only positive parts this is `[0, Σ widths]`; a
    // negative part goes back, so (30, −25, 10, −50) spans [−35, 30]. A
    // positioned part has descent 0, so it counts as its whole width.
    //
    // The stack's 0 is its origin (`opts.origin`): the first part's tail by
    // default, so the running sums start at 0. A centered origin (a `by`
    // column with HasCenter, #984) lies inside the run, at `fraction` of the
    // way from part `index`'s tail to its head, and the extent shifts so it
    // sits at 0: the parts before the center (and half of a fixed middle
    // level) lie below 0, the rest above. So (5, 10, 20, 40, 25) centered on
    // the middle of the 20 spans [−25, 75].
    if (allSize || allPosition) {
      const origin = opts.origin ?? { index: 0, fraction: 0 };
      let at = 0;
      let lo = 0;
      let hi = 0;
      let zero = 0;
      (targetSpaces as CONTINUOUS_TYPE[]).forEach((s, i) => {
        const ascent = s.ascent.run(1);
        const descent = s.descent.run(1);
        if (origin.center !== undefined && descent > 0) {
          throw new Error(
            `stack({ by: "${origin.center}" }): a centered stack's parts are ` +
              `nonnegative amounts, but the part for ` +
              `${keys[i] !== undefined ? `"${keys[i]}"` : `child ${i + 1}`} ` +
              `is negative. ` +
              `"${origin.center}" has HasCenter (declared with ` +
              `\`.diverging()\`), so the stack's 0 is the center of its ` +
              `order and each part lies on the side its level is on; a ` +
              `negative amount has no meaning there.`
          );
        }
        if (i === origin.index)
          zero = at + origin.fraction * (ascent - descent);
        lo = Math.min(lo, at - descent);
        hi = Math.max(hi, at + ascent);
        at += ascent - descent;
      });
      const space = POSITION(
        Interval.interval(lo - zero, hi - zero),
        childMeasure
      );
      // Centered, the parts on both sides of 0 are amounts measured away
      // from it.
      return origin.center !== undefined ? mirrored(space) : space;
    }
    if (namedKeys.length > 0)
      return ORDINAL(namedKeys, opts.measure, opts.anonymous);
    return UNDEFINED;
  }

  const childDomains = allSize
    ? targetSpaces.map((s) => (s as CONTINUOUS_TYPE).width)
    : [];
  const dataDriven =
    allSize && childDomains.some((d) => !Monotonic.isConstant(d));
  // Fixed-pitch extents: `(n−1)·spacing` of chain plus an amplitude ALLOWANCE
  // attributed to the side of the chain where content actually extends,
  // relative to the chained anchor (the painted side — a fixed-pitch chain's
  // rows mirror about their chained anchor at paint, see `pitchAnchorY`):
  //  - "middle": content extends half above / half below every anchor — the
  //    EXACT symmetric form `h_first/2 + (n−1)·s + h_last/2` (unchanged; the
  //    original center mode).
  //  - "baseline" / "start": content rises entirely ABOVE each anchor, so the
  //    allowance sits above the chain HEAD: `max_k(h_k − k·s)⁺ + (n−1)·s`
  //    (k in chain order — the binding row is whichever peak clears the rows
  //    chained above it).
  //  - "end": the mirror image — content hangs BELOW each anchor, allowance
  //    below the chain TAIL: `max_k(h_k − (n−1−k)·s)⁺ + (n−1)·s`.
  // The per-k max assumes each child's extent lies wholly on one side of its
  // anchor (true for SIZE claims — baseline magnitudes) and that the fold's
  // child order is the chain order (compose.ts passes placement order).
  const composeSize = (): Monotonic.Monotonic => {
    if (opts.anchor === "edge")
      return Monotonic.adds(Monotonic.add(...childDomains), spacing * (n - 1));
    if (opts.anchor === "middle")
      return Monotonic.unknown(
        (scaleFactor: number) =>
          childDomains[0].run(scaleFactor) / 2 +
          spacing * (n - 1) +
          childDomains[childDomains.length - 1].run(scaleFactor) / 2
      );
    const anchor = opts.anchor;
    return Monotonic.unknown((scaleFactor: number) => {
      let allowance = 0;
      for (let k = 0; k < n; k++) {
        const pitchesFromAnchoredEnd = anchor === "end" ? n - 1 - k : k;
        allowance = Math.max(
          allowance,
          childDomains[k].run(scaleFactor) - spacing * pitchesFromAnchoredEnd
        );
      }
      return Math.max(0, allowance) + spacing * (n - 1);
    });
  };

  // Along a spread chain each child is a box: it contributes its total extent
  // (ascent + descent), and the composed extent sits above the chain's start.
  // (A stack, above, keeps the signs instead.)
  if (dataDriven) return SIZE(composeSize(), childMeasure);
  if (namedKeys.length > 0)
    return ORDINAL(namedKeys, opts.measure, opts.anonymous);
  if (allSize) return SIZE(composeSize(), childMeasure);
  if (allPosition)
    return POSITION(Interval.interval(0, sumWidths()), childMeasure);
  return UNDEFINED;
}

// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Anchor, Dimensions, Direction, FancyDirection } from "../dims";
import type { UnderlyingSpace } from "../underlyingSpace";
import type { Arith } from "../solver/arith";
import { axisIndex, type AlignAnchor, type Axis } from "./shared";
import type {
  AnchorFact,
  AnchorProgram,
  PlacementFactEmitter,
  PlacementParticipantRequest,
  PlacementPinRequest,
  PlacementRelationRequest,
  PlacementSizePinRequest,
  RelationAnchor,
} from "./placementFacts";
import { emptyAnchorProgram } from "./placementFacts";
import { originIs } from "../underlyingSpace";

export const BOX_ANCHOR: Record<AlignAnchor, Anchor> = {
  start: "min",
  middle: "center",
  end: "max",
  baseline: "baseline",
};

/**
 * What the placement solve reads of a target, in the arithmetic `T` it runs
 * in ({@link Arith}): its box (`dims`, a `min` where it is already placed),
 * its anchors in its local frame, its plot, and its type. A laid node
 * (`Placeable`) is one in numbers; the claim walk's stand-in for a child
 * (`claimPlacement.ts`) is one in values in σ, read off the child's claim.
 */
export type SolvePlaceable<T> = {
  dims: Dimensions<T>;
  localAnchor?: (axis: FancyDirection, anchor: Anchor) => T | undefined;
  localPlotSpan?: (axis: 0 | 1) => [T, T] | undefined;
  spaceOn?: (dir: Direction) => UnderlyingSpace | undefined;
};

/** The offset of a target's data baseline from its `min` on `axis`, or
 *  undefined when the target is not a baseline magnitude there (it has no
 *  data baseline of its own). */
export function freeBaselineOffset<T>(
  A: Arith<T>,
  target: SolvePlaceable<T>,
  axis: Axis
): T | undefined {
  const space = target.spaceOn?.(axisIndex(axis));
  if (!originIs(space, "free")) return undefined;
  return anchorOffset(A, target, axis, "baseline");
}

/** The offset of a target's `anchor` from its box `min`, in absolute pixels
 *  (the substitution that reduces an anchor equation to a `min` equation), for a
 *  WEAK (layout-frame) cell — it reads the target's `localAnchor`, else its
 *  layout size. A size-strong (interval/span) cell does NOT come through here:
 *  its local frame is `[0, size]` with the size only known post-closure, so the
 *  solver uses {@link strongAnchorOffset}. `tail` and `head` are as defined at
 *  {@link RelationAnchor}. */
export function anchorOffset<T>(
  A: Arith<T>,
  target: SolvePlaceable<T>,
  axis: Axis,
  anchor: RelationAnchor,
  // Read the anchor off the target's plot (`localPlotSpan`): a chain lays
  // its parts by their plots, so the dressing beside a part (a value label,
  // a nested chart's chrome) never moves it (#1032).
  plot = false
): T | undefined {
  if (anchor === "tail" || anchor === "head") {
    const tail = freeBaselineOffset(A, target, axis) ?? A.zero;
    if (anchor === "tail") return tail;
    const end = anchorOffset(A, target, axis, "end", plot);
    return end === undefined ? undefined : A.sub(end, tail);
  }
  const span = plot ? target.localPlotSpan?.(axisIndex(axis)) : undefined;
  if (span !== undefined && anchor !== "baseline") {
    const min = target.localAnchor?.(axis, "min") ?? A.zero;
    const at =
      anchor === "start"
        ? span[0]
        : anchor === "end"
          ? span[1]
          : A.scale(0.5, A.add(span[0], span[1]));
    return A.sub(at, min);
  }
  const local = target.localAnchor?.(axis, BOX_ANCHOR[anchor]);
  const localMin = target.localAnchor?.(axis, "min");
  if (local !== undefined && localMin !== undefined)
    return A.sub(local, localMin);

  // With no local anchor, the box is `[0, size]` from its layout size, as a
  // size-strong cell's is from its closed size. Unlike that cell, it may
  // still have a data baseline, which only `localAnchor` knows; and its start
  // needs no size.
  if (anchor === "baseline") return undefined;
  if (anchor === "start") return A.zero;
  const size = target.dims[axisIndex(axis)].size;
  return size === undefined ? undefined : strongAnchorOffset(A, size, anchor);
}

/** {@link anchorOffset} for a size-strong (interval/span) cell, whose local
 *  frame is `[0, size]` with `size` its closed size. It has no data baseline,
 *  so its baseline and tail are its start and its head its end. */
export function strongAnchorOffset<T>(
  A: Arith<T>,
  size: T,
  anchor: RelationAnchor
): T {
  if (anchor === "start" || anchor === "baseline" || anchor === "tail")
    return A.zero;
  return anchor === "middle" ? A.scale(0.5, A.abs(size)) : A.abs(size);
}

/**
 * Lowers each constraint to anchor facts (`AnchorProgram`) — a node anchor named
 * directly, WITHOUT the numeric anchor→min pre-evaluation. Offsets are resolved
 * later, in the solver's cell closure + difference-graph reduction, once sizes
 * are known. Membership is gated at solve time (`reduceToAxisProblem` drops a
 * fact whose weak offset cannot be resolved), so lowering only guards that the
 * target exists.
 */
export class PlacementProgramLowerer<T> implements PlacementFactEmitter<T> {
  readonly anchorProgram: AnchorProgram<T> = emptyAnchorProgram<T>();

  constructor(private readonly targets: Map<string, SolvePlaceable<T>>) {}

  private anchorFacts(axis: Axis): AnchorFact<T>[] {
    return this.anchorProgram.axes[axisIndex(axis)];
  }

  private target(name: string): SolvePlaceable<T> | undefined {
    return this.targets.get(name);
  }

  pin(request: PlacementPinRequest<T>): void {
    if (!this.target(request.target.name)) return;
    this.anchorFacts(request.axis).push({
      type: "anchor-pin",
      node: request.target.name,
      axis: request.axis,
      anchor: request.target.anchor,
      value: request.value,
      owner: request.owner,
    });
  }

  include(request: PlacementParticipantRequest): void {
    if (!this.target(request.name)) return;
    this.anchorFacts(request.axis).push({
      type: "anchor-participant",
      node: request.name,
      axis: request.axis,
      owner: request.owner,
      origin: request.origin,
    });
  }

  relate(request: PlacementRelationRequest<T>): void {
    if (!this.target(request.from.name) || !this.target(request.to.name))
      return;
    this.anchorFacts(request.axis).push({
      type: "anchor-relation",
      axis: request.axis,
      from: { node: request.from.name, anchor: request.from.anchor },
      to: { node: request.to.name, anchor: request.to.anchor },
      gap: request.gap,
      owner: request.owner,
      chain: request.chain,
    });
  }

  pinSize(request: PlacementSizePinRequest<T>): void {
    if (!this.target(request.name)) return;
    this.anchorFacts(request.axis).push({
      type: "size-pin",
      node: request.name,
      axis: request.axis,
      value: request.value,
      owner: request.owner,
    });
  }
}

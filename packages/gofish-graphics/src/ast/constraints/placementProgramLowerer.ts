// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import type { Anchor } from "../dims";
import { axisIndex, type AlignAnchor, type Axis } from "./shared";
import type {
  AnchorFact,
  AnchorProgram,
  PlacementFactEmitter,
  PlacementParticipantRequest,
  PlacementPinRequest,
  PlacementRelationRequest,
} from "./placementFacts";
import { emptyAnchorProgram } from "./placementFacts";

export const BOX_ANCHOR: Record<AlignAnchor, Anchor> = {
  start: "min",
  middle: "center",
  end: "max",
  baseline: "baseline",
};

/** The offset of a target's `anchor` from its box `min`, in absolute pixels
 *  (the substitution that reduces an anchor equation to a `min` equation), for a
 *  WEAK (layout-frame) cell — it reads the target's `localAnchor`, else its
 *  layout size. A size-strong (interval/span) cell does NOT come through here:
 *  the solver reads its offset from the closed {@link BBox} directly, since its
 *  local frame is `[0, size]` with the size only known post-closure. */
export function anchorOffset(
  target: Placeable,
  axis: Axis,
  anchor: AlignAnchor
): number | undefined {
  const local = target.localAnchor?.(axis, BOX_ANCHOR[anchor]);
  const localMin = target.localAnchor?.(axis, "min");
  if (local !== undefined && localMin !== undefined) return local - localMin;

  const size = target.dims[axisIndex(axis)].size;
  if (anchor === "baseline") return undefined;
  if (anchor === "start") return 0;
  if (size === undefined) return undefined;
  return anchor === "middle" ? Math.abs(size) / 2 : Math.abs(size);
}

/**
 * Lowers each constraint to anchor facts (`AnchorProgram`) — a node anchor named
 * directly, WITHOUT the numeric anchor→min pre-evaluation. Offsets are resolved
 * later, in the solver's cell closure + difference-graph reduction, once sizes
 * are known. Membership is gated at solve time (`reduceToAxisProblem` drops a
 * fact whose weak offset cannot be resolved), so lowering only guards that the
 * target exists.
 */
export class PlacementProgramLowerer implements PlacementFactEmitter {
  readonly anchorProgram: AnchorProgram = emptyAnchorProgram();

  constructor(private readonly targets: Map<string, Placeable>) {}

  private anchorFacts(axis: Axis): AnchorFact[] {
    return this.anchorProgram.axes[axisIndex(axis)];
  }

  private target(name: string): Placeable | undefined {
    return this.targets.get(name);
  }

  pin(request: PlacementPinRequest): void {
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
    });
  }

  relate(request: PlacementRelationRequest): void {
    if (!this.target(request.from.name) || !this.target(request.to.name))
      return;
    this.anchorFacts(request.axis).push({
      type: "anchor-relation",
      axis: request.axis,
      from: { node: request.from.name, anchor: request.from.anchor },
      to: { node: request.to.name, anchor: request.to.anchor },
      gap: request.gap,
      owner: request.owner,
    });
  }
}

// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import type { Anchor } from "../dims";
import { axisIndex, type AlignAnchor, type Axis } from "./shared";
import type {
  PlacementFact,
  PlacementFactEmitter,
  PlacementParticipantRequest,
  PlacementPinRequest,
  PlacementProgram,
  PlacementRelationRequest,
} from "./placementFacts";
import {
  anchorExpr,
  emptyPlacementProgram,
  participantFact,
  pinFact,
  relationFact,
} from "./placementFacts";

const BOX_ANCHOR: Record<AlignAnchor, Anchor> = {
  start: "min",
  middle: "center",
  end: "max",
  baseline: "baseline",
};

function anchorOffset(
  target: Placeable,
  axis: Axis,
  anchor: AlignAnchor,
  spannedSize: number | undefined
): number | undefined {
  if (spannedSize !== undefined) {
    if (anchor === "start" || anchor === "baseline") return 0;
    return anchor === "middle"
      ? Math.abs(spannedSize) / 2
      : Math.abs(spannedSize);
  }

  const local = target.localAnchor?.(axis, BOX_ANCHOR[anchor]);
  const localMin = target.localAnchor?.(axis, "min");
  if (local !== undefined && localMin !== undefined) return local - localMin;

  const size = target.dims[axisIndex(axis)].size;
  if (anchor === "baseline") return undefined;
  if (anchor === "start") return 0;
  if (size === undefined) return undefined;
  return anchor === "middle" ? Math.abs(size) / 2 : Math.abs(size);
}

export class PlacementProgramLowerer implements PlacementFactEmitter {
  readonly program = emptyPlacementProgram();

  constructor(
    private readonly targets: Map<string, Placeable>,
    private readonly spannedSize: (
      axis: Axis,
      name: string
    ) => number | undefined
  ) {}

  private facts(axis: Axis): PlacementFact[] {
    return this.program.axes[axisIndex(axis)];
  }

  addFact(fact: PlacementFact): void {
    if (fact.type === "pin") {
      this.facts(fact.expr.axis).push(fact);
      return;
    }
    if (fact.type === "relation") {
      this.facts(fact.from.axis).push(fact);
      return;
    }
    this.facts(fact.axis).push(fact);
  }

  private target(name: string): Placeable | undefined {
    return this.targets.get(name);
  }

  pin(request: PlacementPinRequest): void {
    const target = this.target(request.target.name);
    if (!target) return;
    const offset = anchorOffset(
      target,
      request.axis,
      request.target.anchor,
      this.spannedSize(request.axis, request.target.name)
    );
    if (offset === undefined) return;
    this.facts(request.axis).push(
      pinFact(
        anchorExpr(request.target.name, request.axis, "start"),
        request.value - offset,
        request.owner
      )
    );
  }

  include(request: PlacementParticipantRequest): void {
    if (!this.target(request.name)) return;
    this.facts(request.axis).push(
      participantFact(request.name, request.axis, request.owner)
    );
  }

  relate(request: PlacementRelationRequest): void {
    const fromTarget = this.target(request.from.name);
    const toTarget = this.target(request.to.name);
    if (!fromTarget || !toTarget) return;
    const fromOffset = anchorOffset(
      fromTarget,
      request.axis,
      request.from.anchor,
      this.spannedSize(request.axis, request.from.name)
    );
    const toOffset = anchorOffset(
      toTarget,
      request.axis,
      request.to.anchor,
      this.spannedSize(request.axis, request.to.name)
    );
    if (fromOffset === undefined || toOffset === undefined) return;
    this.facts(request.axis).push(
      relationFact(
        anchorExpr(request.from.name, request.axis, "start"),
        anchorExpr(request.to.name, request.axis, "start"),
        fromOffset + request.gap - toOffset,
        request.owner
      )
    );
  }
}

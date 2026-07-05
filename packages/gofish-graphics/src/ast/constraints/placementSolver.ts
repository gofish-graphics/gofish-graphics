// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import {
  lowerPlacementConstraints,
  type PlacementConstraint,
} from "./placementLowering";
import type { SpanExtent } from "./span";
import { type Axis, type ConstraintPosScales } from "./shared";
import type { NodeId, PlacementFact } from "./placementFacts";
import {
  axisName,
  placementKey,
  solveAxisProblem,
  type AxisProblem,
  type PlacementConflict,
  type PlacementPinClaim,
} from "./differenceGraph";
import { shadowCheckRank2Placement } from "./rank2Placement";

export {
  compilePlacementCoordinate,
  lowerPlacementConstraints,
} from "./placementLowering";
export type { PlacementConflict } from "./differenceGraph";

const spanExtentKey = (extent: SpanExtent): string =>
  placementKey(extent.axis, extent.name);

function indexSpanExtents(extents: SpanExtent[]): Map<string, SpanExtent> {
  const byKey = new Map<string, SpanExtent>();
  for (const extent of extents) byKey.set(spanExtentKey(extent), extent);
  return byKey;
}

function classifyAxisFacts(
  facts: PlacementFact[],
  spanExtents: Map<string, SpanExtent>
): AxisProblem {
  const relations: AxisProblem["relations"] = [];
  const pins: PlacementPinClaim[] = [];
  const participantFacts: AxisProblem["participantFacts"] = [];
  const participants = new Set<NodeId>();

  for (const fact of facts) {
    if (fact.type === "pin") {
      participants.add(fact.expr.node);
      pins.push({ node: fact.expr.node, value: fact.value, owner: fact.owner });
      continue;
    }

    if (fact.type === "relation") {
      participants.add(fact.from.node);
      participants.add(fact.to.node);
      relations.push(fact);
      continue;
    }

    if (fact.type === "participant") {
      participants.add(fact.name);
      participantFacts.push(fact);
      continue;
    }

    participants.add(fact.name);

    if (fact.edge === "min") {
      pins.push({ node: fact.name, value: fact.value, owner: fact.owner });
      continue;
    }

    const span = spanExtents.get(placementKey(fact.axis, fact.name));
    if (span) {
      pins.push({
        node: fact.name,
        value: fact.value - span.size,
        owner: fact.owner,
      });
    }
  }

  return { relations, pins, participantFacts, participants };
}

function solveAxis(
  axis: Axis,
  facts: PlacementFact[],
  spanExtents: Map<string, SpanExtent>
): { positions: Map<NodeId, number>; conflicts: PlacementConflict[] } {
  return solveAxisProblem(axis, classifyAxisFacts(facts, spanExtents));
}

export function solvePlacementConstraints(
  constraints: PlacementConstraint[],
  targets: Map<string, Placeable>,
  sizes: [number, number],
  posScales?: ConstraintPosScales
): PlacementConflict[] {
  const lowered = lowerPlacementConstraints(
    constraints,
    targets,
    sizes,
    posScales
  );
  const spanExtentByKey = indexSpanExtents(lowered.spanExtents);

  const results = [
    solveAxis("x", lowered.program.axes[0], spanExtentByKey),
    solveAxis("y", lowered.program.axes[1], spanExtentByKey),
  ] as const;
  const conflicts = results.flatMap((result) => result.conflicts);
  if (conflicts.length > 0) {
    const conflict = conflicts[0];
    throw new Error(
      `Constraint placement conflict on ${conflict.axis}: ${conflict.owner} ` +
        `asserts ${conflict.asserted}, but ${conflict.priorOwner} implies ` +
        `${conflict.implied}`
    );
  }

  // Rank-2 shadow (#39 stage 5a): run the anchor-fact solve alongside and assert
  // it reproduces the rank-1 `(min, size)`. Reads pre-commit target state, same
  // as the shipped lowering did; zero-cost unless GOFISH_SOLVER_CHECK is set.
  shadowCheckRank2Placement(
    lowered.anchorProgram,
    results.map((r) => r.positions) as [
      Map<NodeId, number>,
      Map<NodeId, number>,
    ],
    spanExtentByKey,
    targets
  );

  results.forEach((result, axisIndexValue) => {
    const axis = axisIndexValue as 0 | 1;
    const axisLabel = axisName(axis);
    for (const [name, min] of result.positions) {
      const target = targets.get(name);
      if (!target) continue;
      const span = spanExtentByKey.get(placementKey(axisLabel, name));
      if (span && target.setExtent) {
        target.setExtent(axisLabel, { min, max: min + span.size }, span.owner);
      } else if (target.pinAnchor) target.pinAnchor(axis, min, "min");
      else target.place(axis, min, "min");
    }
  });
  return conflicts;
}

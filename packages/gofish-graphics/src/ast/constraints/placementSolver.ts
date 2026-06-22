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
import type {
  NodeId,
  PlacementFact,
  PlacementParticipant,
  PlacementRelation,
} from "./placementFacts";

export {
  compilePlacementCoordinate,
  lowerPlacementConstraints,
} from "./placementLowering";

export interface PlacementConflict {
  axis: Axis;
  owner: string;
  priorOwner: string;
  asserted: number;
  implied: number;
}

type PlacementPinClaim = {
  node: NodeId;
  value: number;
  owner: string;
};

type AxisProblem = {
  relations: PlacementRelation[];
  pins: PlacementPinClaim[];
  participantFacts: PlacementParticipant[];
  participants: Set<NodeId>;
};

type RelationEdge = {
  node: NodeId;
  delta: number;
  owner: string;
};

type RelationComponents = {
  relative: Map<NodeId, number>;
  componentOf: Map<NodeId, number>;
  components: NodeId[][];
  conflicts: PlacementConflict[];
};

const TOLERANCE = 1e-6;

const axisName = (axis: 0 | 1): Axis => (axis === 0 ? "x" : "y");
const placementKey = (axis: Axis, name: string): string => `${axis}:${name}`;
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
  const relations: PlacementRelation[] = [];
  const pins: PlacementPinClaim[] = [];
  const participantFacts: PlacementParticipant[] = [];
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

function buildRelationGraph(
  relations: PlacementRelation[]
): Map<NodeId, RelationEdge[]> {
  const adjacency = new Map<NodeId, RelationEdge[]>();
  const addEdge = (from: NodeId, to: NodeId, delta: number, owner: string) => {
    const list = adjacency.get(from) ?? [];
    list.push({ node: to, delta, owner });
    adjacency.set(from, list);
  };

  for (const relation of relations) {
    addEdge(
      relation.from.node,
      relation.to.node,
      relation.offset,
      relation.owner
    );
    addEdge(
      relation.to.node,
      relation.from.node,
      -relation.offset,
      relation.owner
    );
  }

  return adjacency;
}

function solveRelationComponents(
  axis: Axis,
  problem: AxisProblem
): RelationComponents {
  const adjacency = buildRelationGraph(problem.relations);
  const relative = new Map<NodeId, number>();
  const componentOf = new Map<NodeId, number>();
  const components: NodeId[][] = [];
  const conflicts: PlacementConflict[] = [];

  for (const start of [...problem.participants].sort()) {
    if (relative.has(start)) continue;
    const component = components.length;
    const nodes: NodeId[] = [];
    const queue: NodeId[] = [start];
    relative.set(start, 0);
    componentOf.set(start, component);
    while (queue.length > 0) {
      const current = queue.shift()!;
      nodes.push(current);
      for (const edge of adjacency.get(current) ?? []) {
        const expected = relative.get(current)! + edge.delta;
        const prior = relative.get(edge.node);
        if (prior === undefined) {
          relative.set(edge.node, expected);
          componentOf.set(edge.node, component);
          queue.push(edge.node);
        } else if (Math.abs(prior - expected) > TOLERANCE) {
          conflicts.push({
            axis,
            owner: edge.owner,
            priorOwner: "relation graph",
            asserted: expected,
            implied: prior,
          });
        }
      }
    }
    components.push(nodes);
  }

  return { relative, componentOf, components, conflicts };
}

function solveAxis(
  axis: Axis,
  facts: PlacementFact[],
  spanExtents: Map<string, SpanExtent>
): { positions: Map<NodeId, number>; conflicts: PlacementConflict[] } {
  const problem = classifyAxisFacts(facts, spanExtents);
  const { relative, componentOf, components, conflicts } =
    solveRelationComponents(axis, problem);

  const offsets = new Map<number, { value: number; owner: string }>();
  const applyPin = (node: NodeId, value: number, owner: string) => {
    const component = componentOf.get(node);
    const rel = relative.get(node);
    if (component === undefined || rel === undefined) return;
    const assertedOffset = value - rel;
    const prior = offsets.get(component);
    if (prior === undefined) {
      offsets.set(component, { value: assertedOffset, owner });
    } else if (Math.abs(prior.value - assertedOffset) > TOLERANCE) {
      conflicts.push({
        axis,
        owner,
        priorOwner: prior.owner,
        asserted: value,
        implied: rel + prior.value,
      });
    }
  };
  for (const pin of problem.pins) applyPin(pin.node, pin.value, pin.owner);

  const distributeOriginFor = (component: number): NodeId | undefined => {
    const outgoing = new Set<NodeId>();
    const incoming = new Set<NodeId>();
    for (const relation of problem.relations) {
      if (!relation.owner.startsWith("distribute[")) continue;
      if (componentOf.get(relation.from.node) !== component) continue;
      outgoing.add(relation.from.node);
      incoming.add(relation.to.node);
    }
    return [...outgoing].filter((node) => !incoming.has(node)).sort()[0];
  };

  for (let component = 0; component < components.length; component++) {
    if (offsets.has(component)) continue;
    const origin = distributeOriginFor(component);
    if (origin !== undefined) {
      offsets.set(component, {
        value: -(relative.get(origin) ?? 0),
        owner: "sequence-origin",
      });
      continue;
    }
    const min = Math.min(
      ...components[component].map((node) => relative.get(node) ?? 0)
    );
    offsets.set(component, {
      value: -min,
      owner: "normalized-origin",
    });
  }

  const positions = new Map<NodeId, number>();
  for (const [node, rel] of relative) {
    const component = componentOf.get(node)!;
    positions.set(node, rel + offsets.get(component)!.value);
  }
  return { positions, conflicts };
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

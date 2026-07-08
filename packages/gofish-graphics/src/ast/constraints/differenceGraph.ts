// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Axis } from "./shared";
import type {
  NodeId,
  PlacementParticipant,
  PlacementRelation,
} from "./placementFacts";

/**
 * The relational (difference-graph) half of the placement solver
 * (`placementSolver.ts`). Everything here works on `start`(min)-anchored
 * difference constraints: an {@link AxisProblem} of pins, relations, and
 * participants over one axis, solved by BFS components + pin offsets +
 * distribute/normalized origin fallbacks. It is anchor-agnostic — the rank-2
 * solve reduces each fact to a `min` position (substituting anchor offsets from
 * the closed cell sizes) BEFORE handing it here, so the graph itself never sees
 * an anchor.
 */

export interface PlacementConflict {
  axis: Axis;
  owner: string;
  priorOwner: string;
  asserted: number;
  implied: number;
}

export type PlacementPinClaim = {
  node: NodeId;
  value: number;
  owner: string;
};

export type AxisProblem = {
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

export const TOLERANCE = 1e-6;

export const axisName = (axis: 0 | 1): Axis => (axis === 0 ? "x" : "y");
export const placementKey = (axis: Axis, name: string): string =>
  `${axis}:${name}`;

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

/**
 * Solve one axis's {@link AxisProblem} into an absolute `min` per node. Pins fix
 * each relation component's offset; a component with no pin falls back to the
 * distribute sequence-origin (its first `distribute[`-owned source) or a
 * normalized origin (its minimum coordinate at 0). This is the general half of
 * the placement solver, unchanged from the pre-extraction `solveAxis`.
 */
export function solveAxisProblem(
  axis: Axis,
  problem: AxisProblem
): { positions: Map<NodeId, number>; conflicts: PlacementConflict[] } {
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

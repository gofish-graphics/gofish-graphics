// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Axis } from "./shared";
import type { Arith } from "../solver/arith";
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
 * an anchor. It runs in any {@link Arith}: numbers at layout, values in σ in
 * the claim walk, where a cycle closes when its two sides agree at every σ.
 */

export interface PlacementConflict {
  axis: Axis;
  owner: string;
  priorOwner: string;
  asserted: number;
  implied: number;
}

export type PlacementPinClaim<T = number> = {
  node: NodeId;
  value: T;
  owner: string;
};

export type AxisProblem<T = number> = {
  relations: PlacementRelation<T>[];
  pins: PlacementPinClaim<T>[];
  participantFacts: PlacementParticipant[];
  participants: Set<NodeId>;
  /** For a member of a chain of baselines, the offset of its baseline from
   *  its `min`: such a chain starts at its first member's origin, not its
   *  edge (see the sequence origin in `solveAxisProblem`). */
  chainAnchors?: Map<NodeId, T>;
};

type RelationEdge<T> = {
  node: NodeId;
  delta: T;
  owner: string;
};

type RelationComponents<T> = {
  relative: Map<NodeId, T>;
  componentOf: Map<NodeId, number>;
  components: NodeId[][];
  conflicts: PlacementConflict[];
};

export const TOLERANCE = 1e-6;

/** The owning layer's free-child origin on one axis (#773): the pixel at
 *  which a free node's baseline sits, and the baseline offset from `min` of
 *  each participant whose baseline nothing else places (a free participant,
 *  or the part of a stack that carries its origin). */
export type FreeOriginInput<T = number> = {
  value: T;
  baselines: Map<NodeId, T>;
};

function buildRelationGraph<T>(
  A: Arith<T>,
  relations: PlacementRelation<T>[]
): Map<NodeId, RelationEdge<T>[]> {
  const adjacency = new Map<NodeId, RelationEdge<T>[]>();
  const addEdge = (from: NodeId, to: NodeId, delta: T, owner: string) => {
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
      A.negate(relation.offset),
      relation.owner
    );
  }

  return adjacency;
}

function solveRelationComponents<T>(
  A: Arith<T>,
  axis: Axis,
  problem: AxisProblem<T>
): RelationComponents<T> {
  const adjacency = buildRelationGraph(A, problem.relations);
  const relative = new Map<NodeId, T>();
  const componentOf = new Map<NodeId, number>();
  const components: NodeId[][] = [];
  const conflicts: PlacementConflict[] = [];

  for (const start of [...problem.participants].sort()) {
    if (relative.has(start)) continue;
    const component = components.length;
    const nodes: NodeId[] = [];
    const queue: NodeId[] = [start];
    let head = 0;
    relative.set(start, A.zero);
    componentOf.set(start, component);
    while (head < queue.length) {
      const current = queue[head++];
      nodes.push(current);
      for (const edge of adjacency.get(current) ?? []) {
        const expected = A.add(relative.get(current)!, edge.delta);
        const prior = relative.get(edge.node);
        if (prior === undefined) {
          relative.set(edge.node, expected);
          componentOf.set(edge.node, component);
          queue.push(edge.node);
        } else if (
          !A.agree(expected, prior, TOLERANCE, {
            owner: edge.owner,
            priorOwner: "relation graph",
          })
        ) {
          conflicts.push({
            axis,
            owner: edge.owner,
            priorOwner: "relation graph",
            asserted: A.report(expected),
            implied: A.report(prior),
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
 * free origin (its determined free baseline at the layer's origin pixel), the
 * distribute sequence-origin (the first source of its chain relations, seated
 * at 0 by the point the chain starts from: its start edge, or for a chain of
 * baselines its origin), or a normalized origin (its minimum coordinate at
 * 0). This is the general half of
 * the placement solver.
 */
export function solveAxisProblem<T>(
  A: Arith<T>,
  axis: Axis,
  problem: AxisProblem<T>,
  freeOrigin?: FreeOriginInput<T>
): { positions: Map<NodeId, T>; conflicts: PlacementConflict[] } {
  const { relative, componentOf, components, conflicts } =
    solveRelationComponents(A, axis, problem);

  const offsets = new Map<number, { value: T; owner: string }>();
  const applyPin = (node: NodeId, value: T, owner: string) => {
    const component = componentOf.get(node);
    const rel = relative.get(node);
    if (component === undefined || rel === undefined) return;
    const assertedOffset = A.sub(value, rel);
    const prior = offsets.get(component);
    if (prior === undefined) {
      offsets.set(component, { value: assertedOffset, owner });
    } else if (
      !A.agree(value, A.add(rel, prior.value), TOLERANCE, {
        owner,
        priorOwner: prior.owner,
      })
    ) {
      conflicts.push({
        axis,
        owner,
        priorOwner: prior.owner,
        asserted: A.report(value),
        implied: A.report(A.add(rel, prior.value)),
      });
    }
  };
  for (const pin of problem.pins) applyPin(pin.node, pin.value, pin.owner);

  const distributeOriginFor = (component: number): NodeId | undefined => {
    const outgoing = new Set<NodeId>();
    const incoming = new Set<NodeId>();
    for (const relation of problem.relations) {
      if (!relation.chain) continue;
      if (componentOf.get(relation.from.node) !== component) continue;
      outgoing.add(relation.from.node);
      incoming.add(relation.to.node);
    }
    return [...outgoing].filter((node) => !incoming.has(node)).sort()[0];
  };

  // The component's baseline, joined over the nodes listed in
  // `freeOrigin.baselines`: undefined (none) → determined (they all agree) →
  // impossible (two disagree). The caller lists only baselines nothing else
  // places, so a stack chain contributes its origin (on whichever part
  // carries it). A spread chain packs its members' boxes end to end from its
  // first member's start, so it has no baseline at all: a component holding
  // one is impossible, whatever else it holds (a free node aligned to one of
  // its members has a baseline, but seating it would move the whole spread
  // off its start). Only a determined baseline is returned; impossible places
  // like undefined.
  const sharedFreeBaseline = (component: number): T | undefined => {
    if (freeOrigin === undefined) return undefined;
    const holdsSpread = problem.relations.some(
      (relation) =>
        relation.chain === "spread" &&
        componentOf.get(relation.from.node) === component
    );
    if (holdsSpread) return undefined;
    let shared: T | undefined;
    for (const node of components[component]) {
      const offset = freeOrigin.baselines.get(node);
      if (offset === undefined) continue;
      const at = A.add(relative.get(node)!, offset);
      if (shared === undefined) shared = at;
      else if (!A.near(shared, at, TOLERANCE)) return undefined;
    }
    return shared;
  };

  for (let component = 0; component < components.length; component++) {
    if (offsets.has(component)) continue;
    // Free origin (#773): a component with a determined baseline seats it at
    // the layer's origin pixel, so a signed extent grows from the axis's 0
    // and a stack's running sums start there. An undefined or impossible
    // baseline (e.g. a spread chain along the axis, or an `end`/`middle`
    // alignment of free nodes) has nothing to seat, so the component uses the
    // sequence or normalized origin below.
    const baseline = sharedFreeBaseline(component);
    if (freeOrigin !== undefined && baseline !== undefined) {
      offsets.set(component, {
        value: A.sub(freeOrigin.value, baseline),
        owner: "free-origin",
      });
      continue;
    }
    const origin = distributeOriginFor(component);
    if (origin !== undefined) {
      offsets.set(component, {
        value: A.negate(
          A.add(
            relative.get(origin) ?? A.zero,
            problem.chainAnchors?.get(origin) ?? A.zero
          )
        ),
        owner: "sequence-origin",
      });
      continue;
    }
    // The component's minimum at 0: its offset is `−min = max(−rel)`.
    offsets.set(component, {
      value: A.max(
        components[component].map((node) => A.negate(relative.get(node)!))
      ),
      owner: "normalized-origin",
    });
  }

  const positions = new Map<NodeId, T>();
  for (const [node, rel] of relative) {
    const component = componentOf.get(node)!;
    positions.set(node, A.add(rel, offsets.get(component)!.value));
  }
  return { positions, conflicts };
}

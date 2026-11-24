// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Axis } from "./shared";
import type { Arith } from "../solver/arith";
import {
  anchorExpr,
  relationFact,
  type NodeId,
  type PlacementMean,
  type PlacementMinGap,
  type PlacementParticipant,
  type PlacementRelation,
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
 *
 * Beside the exact facts it takes minimum gaps (`minGaps`) and means of
 * positions (`means`). The exact facts are solved first, into rigid groups
 * (the components), and the minimum gaps then separate the groups by the
 * longest path over them ({@link separateGroups}).
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
  /** Minimum gaps, `to.min ≥ from.min + offset`, which separate the rigid
   *  groups the exact facts make ({@link separateGroups}). */
  minGaps?: PlacementMinGap<T>[];
  /** Means of positions, `target.min = mean(operands.min) + offset`. */
  means?: PlacementMean<T>[];
  /** The size of each node a minimum gap names: the greatest solution of
   *  the gaps keeps every group inside the least solution's span. */
  sizes?: Map<NodeId, T>;
  /** Where the minimum gaps put the groups where they leave room (the
   *  slack rule, `Slack.at(t)`): a fraction from 0, the least solution, to
   *  1, the greatest. One per axis problem, since the gaps a scope solves
   *  on an axis share their room. Default 0. */
  slack?: number;
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
 *  or the part of a chain that carries its origin). `stated` lists the
 *  parts that carry a chain's stated 0: every part of a stack, or a spread's given a
 *  `baseline`. */
export type FreeOriginInput<T = number> = {
  value: T;
  baselines: Map<NodeId, T>;
  stated?: ReadonlySet<NodeId>;
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
  participants: Set<NodeId>,
  relations: PlacementRelation<T>[]
): RelationComponents<T> {
  const adjacency = buildRelationGraph(A, relations);
  const relative = new Map<NodeId, T>();
  const componentOf = new Map<NodeId, number>();
  const components: NodeId[][] = [];
  const conflicts: PlacementConflict[] = [];

  for (const start of [...participants].sort()) {
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

/** The weighted mean of `mean`'s operands, each read by `at`: `Σ weight ·
 *  at(node)`, the weights summing to 1. */
const meanOf = <T>(
  A: Arith<T>,
  mean: PlacementMean<T>,
  at: (node: NodeId) => T
): T =>
  A.add(...mean.operands.map(({ node, weight }) => A.scale(weight, at(node))));

/** The least of `xs` (at least one). */
const minOf = <T>(A: Arith<T>, xs: readonly T[]): T =>
  A.negate(A.max(xs.map((x) => A.negate(x))));

/**
 * The rigid groups: the components of the exact relations, together with
 * each mean whose operands one group already holds. Such a mean is an exact
 * relation, `target − operand₀ = mean(rel) − rel₀`, since the operands'
 * places within their group are known, so it joins the target's group to
 * theirs (or, when the target is in it already, checks it). That can put
 * another mean's operands in one group, so this runs until nothing
 * changes. A mean whose operands lie in two groups is not a difference of
 * two positions, so it stays `pending`: it is placed once the groups are
 * (in {@link solveAxisProblem}).
 */
function rigidGroups<T>(
  A: Arith<T>,
  axis: Axis,
  problem: AxisProblem<T>
): {
  relations: PlacementRelation<T>[];
  pending: PlacementMean<T>[];
  solved: RelationComponents<T>;
} {
  let relations = problem.relations;
  const pending = [...(problem.means ?? [])];
  let solved = solveRelationComponents(
    A,
    axis,
    problem.participants,
    relations
  );
  for (;;) {
    const joined: PlacementRelation<T>[] = [];
    for (let k = 0; k < pending.length; ) {
      const mean = pending[k];
      const groups = new Set(
        mean.operands.map(({ node }) => solved.componentOf.get(node))
      );
      if (groups.size !== 1) {
        k++;
        continue;
      }
      const rel = (node: NodeId) => solved.relative.get(node)!;
      const first = mean.operands[0].node;
      const at = A.add(meanOf(A, mean, rel), mean.offset);
      joined.push(
        relationFact(
          anchorExpr(first, axis, "start"),
          anchorExpr(mean.target, axis, "start"),
          A.sub(at, rel(first)),
          mean.owner
        )
      );
      pending.splice(k, 1);
    }
    if (joined.length === 0) return { relations, pending, solved };
    relations = [...relations, ...joined];
    solved = solveRelationComponents(A, axis, problem.participants, relations);
  }
}

/** The group of pinned components in {@link separateGroups}: every pin is
 *  an exact gap from the layer's origin, so the pinned components are one
 *  rigid group, placed absolutely. */
const PINNED = -1;

/**
 * Separate the rigid groups by the minimum gaps (`problem.minGaps`), and
 * return the structure the rest of the solve places: each set of groups
 * the gaps connect (a cluster) becomes one component, its groups at the
 * places the gaps give them. Two gaps between one pair of groups compose by
 * their max, and a gap between two nodes of one group only checks it.
 *
 * Each cluster is solved by the longest path over its groups. A gap names
 * two nodes, and a group is placed by one offset, so a gap out of a group at
 * one member and back into it at another is no cycle of positions: what it
 * passes sits between the two members, in the room their exact distance
 * leaves. So the groups the gaps lead around and back into make one
 * strongly connected set, the sets are solved in an order where every gap
 * between two sets points forward, and inside a set the longest paths
 * between its groups place them. A path around a set longer than 0 is
 * room the gaps need and the exact distances do not leave: a loud error
 * that says how much is missing ({@link roomHolds}). A cycle that comes back
 * to the node it left is a cycle of gaps, an error too ({@link noGapCycle}).
 * The least solution puts each group of a set that no gap leads into with
 * its start at 0 at least (an unpinned cluster's own 0, which the origin
 * fallbacks then seat) and every other group as near the start as its gaps
 * allow. The greatest solution is the least one of the mirrored problem,
 * inside the least solution's span: each group of a set no gap leads out of
 * ends where the least solution ends at most. A
 * minimum gap gives each group a range of positions, from its least place
 * to its greatest, and the problem's slack rule (`problem.slack`, a
 * fraction `t`) puts it at `(1 − t) · least + t · greatest`: the least
 * solution at 0, the greatest at 1, their mean at 0.5. A cluster that
 * holds the pinned group is then moved as one so that the
 * pins hold: the pins place the cluster, and never conflict with its gaps.
 * This is `solveSeparations` of the
 * "Proposals/User Space Separation" stories, over groups.
 *
 * It needs only `add` and `max` (and `negate`, for the greatest solution),
 * so it runs in every {@link Arith}, formulas included: a claim is a max of
 * sums, which layout evaluates at its σ. The one comparison, whether the
 * room holds, is an `agree` of the longest path around a set with 0, which
 * in formulas is a check layout makes at its σ.
 */
function separateGroups<T>(
  A: Arith<T>,
  axis: Axis,
  problem: AxisProblem<T>,
  solved: RelationComponents<T>
): RelationComponents<T> {
  const { relative, componentOf, components } = solved;
  const conflicts = [...solved.conflicts];
  // The pinned components are one group, the origin's, placed absolutely by
  // the first pin of each (the rest of the solve checks the others).
  const pinOffset = new Map<number, T>();
  for (const pin of problem.pins) {
    const c = componentOf.get(pin.node);
    if (c === undefined || pinOffset.has(c)) continue;
    pinOffset.set(c, A.sub(pin.value, relative.get(pin.node)!));
  }
  const groupOf = (node: NodeId) => {
    const c = componentOf.get(node)!;
    return pinOffset.has(c) ? PINNED : c;
  };
  // A node's place in its group's frame.
  const inGroup = (node: NodeId): T => {
    const offset = pinOffset.get(componentOf.get(node)!);
    const rel = relative.get(node)!;
    return offset === undefined ? rel : A.add(rel, offset);
  };
  const nodesOf = (group: number): NodeId[] =>
    group === PINNED
      ? [...pinOffset.keys()].flatMap((c) => components[c])
      : components[group];

  // The gaps between groups, `o[to] − o[from] ≥ w`, one per ordered pair.
  type Edge = { from: number; to: number; w: T; owners: string[] };
  const edges = new Map<string, Edge>();
  for (const gap of problem.minGaps ?? []) {
    if (!componentOf.has(gap.from) || !componentOf.has(gap.to)) continue;
    const from = groupOf(gap.from);
    const to = groupOf(gap.to);
    const w = A.add(gap.offset, A.sub(inGroup(gap.from), inGroup(gap.to)));
    if (from === to) {
      // The exact facts place both ends already: the gap only checks them.
      if (
        !A.agree(A.max([w, A.zero]), A.zero, TOLERANCE, {
          owner: gap.owner,
          priorOwner: "an exact gap",
        })
      )
        conflicts.push({
          axis,
          owner: gap.owner,
          priorOwner: "an exact gap",
          asserted: A.report(gap.offset),
          implied: A.report(A.sub(gap.offset, w)),
        });
      continue;
    }
    const key = `${from}>${to}`;
    const prior = edges.get(key);
    edges.set(
      key,
      prior === undefined
        ? { from, to, w, owners: [gap.owner] }
        : {
            from,
            to,
            w: A.max([prior.w, w]),
            owners: [...prior.owners, gap.owner],
          }
    );
  }
  if (edges.size === 0) return { ...solved, conflicts };

  // The clusters: the groups the gaps connect.
  const parent = new Map<number, number>();
  const find = (g: number): number => {
    let root = g;
    while (parent.has(root) && parent.get(root) !== root)
      root = parent.get(root)!;
    parent.set(g, root);
    return root;
  };
  for (const { from, to } of edges.values()) {
    if (!parent.has(from)) parent.set(from, from);
    if (!parent.has(to)) parent.set(to, to);
    parent.set(find(from), find(to));
  }
  const clusters = new Map<number, number[]>();
  for (const g of [...parent.keys()].sort((a, b) => a - b)) {
    const root = find(g);
    const list = clusters.get(root) ?? [];
    list.push(g);
    clusters.set(root, list);
  }
  const into = new Map<number, Edge[]>();
  const outOf = new Map<number, Edge[]>();
  for (const edge of edges.values()) {
    into.set(edge.to, [...(into.get(edge.to) ?? []), edge]);
    outOf.set(edge.from, [...(outOf.get(edge.from) ?? []), edge]);
  }
  const describe = (g: number) =>
    g === PINNED ? "the pinned nodes" : `{${nodesOf(g).join(", ")}}`;

  // A cycle of gaps that comes back to the node it left (each group on it
  // entered and left at one node) says a node is at least the sum of the
  // gaps after itself, which no positive gap allows: an error, found from
  // the gaps alone, before any value is known.
  noGapCycle(
    problem.minGaps ?? [],
    (node) => (componentOf.has(node) ? groupOf(node) : undefined),
    axis,
    describe
  );

  const t = problem.slack ?? 0;
  const offsets = new Map<number, T>();
  for (const groups of clusters.values()) {
    // Each group's extent in its own frame.
    const lo = new Map<number, T>();
    const hi = new Map<number, T>();
    for (const g of groups) {
      const nodes = nodesOf(g);
      lo.set(g, minOf(A, nodes.map(inGroup)));
      hi.set(
        g,
        A.max(
          nodes.map((n) => A.add(inGroup(n), problem.sizes?.get(n) ?? A.zero))
        )
      );
    }
    // The groups gaps lead around and back into (a gap out of a group at
    // one member and back in at another, which leaves room between them):
    // the strongly connected sets of groups, in an order where every gap
    // between two sets points forward.
    const sets = stronglyConnected(groups, outOf);
    const setOf = new Map<number, number>();
    sets.forEach((set, k) => set.forEach((g) => setOf.set(g, k)));
    // In each set, the longest path between two groups over its own gaps
    // (`undefined` where none leads), from a group to itself at least 0.
    const within = sets.map((set) =>
      longestPaths(A, set, outOf, (e) => setOf.get(e.to) === setOf.get(e.from))
    );
    sets.forEach((set, k) => {
      if (set.length === 1) return;
      roomHolds(A, axis, set, within[k], into, describe);
    });
    const D = (g: number, h: number) => within[setOf.get(g)!].get(g)!.get(h);
    // The least solution: a set no gap leads into has each group's start at
    // 0 at least, any other set each group as near the start as the gaps
    // into the set allow; inside a set, each group as near as its paths
    // from those allow.
    const least = new Map<number, T>();
    for (const set of sets) {
      const base = new Map<number, T>();
      const entering = (g: number) =>
        (into.get(g) ?? []).filter((e) => !set.includes(e.from));
      const sourced = set.every((g) => entering(g).length === 0);
      for (const g of set) {
        const ins = entering(g);
        if (sourced) base.set(g, A.negate(lo.get(g)!));
        else if (ins.length > 0)
          base.set(g, A.max(ins.map((e) => A.add(least.get(e.from)!, e.w))));
      }
      for (const g of set) {
        const from: T[] = [];
        for (const [h, b] of base) {
          const d = D(h, g);
          if (d !== undefined) from.push(A.add(b, d));
        }
        least.set(g, A.max(from));
      }
    }
    const end = A.max(groups.map((g) => A.add(least.get(g)!, hi.get(g)!)));
    // The greatest solution, mirrored: a set no gap leads out of has each
    // group ending where the least solution ends at most.
    const greatest = new Map<number, T>();
    for (const set of [...sets].reverse()) {
      const cap = new Map<number, T>();
      const leaving = (g: number) =>
        (outOf.get(g) ?? []).filter((e) => !set.includes(e.to));
      const sunk = set.every((g) => leaving(g).length === 0);
      for (const g of set) {
        const outs = leaving(g);
        if (sunk) cap.set(g, A.sub(end, hi.get(g)!));
        else if (outs.length > 0)
          cap.set(
            g,
            minOf(
              A,
              outs.map((e) => A.sub(greatest.get(e.to)!, e.w))
            )
          );
      }
      for (const g of set) {
        const to: T[] = [];
        for (const [h, c] of cap) {
          const d = D(g, h);
          if (d !== undefined) to.push(A.sub(c, d));
        }
        greatest.set(g, minOf(A, to));
      }
    }
    const order = sets.flat();
    // The slack rule: each group `t` of the way from its least place to
    // its greatest.
    const chosen = new Map(
      order.map((g) => [
        g,
        A.add(A.scale(1 - t, least.get(g)!), A.scale(t, greatest.get(g)!)),
      ])
    );
    // A cluster that holds the pinned group moves as one so the pins hold.
    const shift = chosen.has(PINNED)
      ? A.negate(chosen.get(PINNED)!)
      : undefined;
    for (const [g, o] of chosen)
      offsets.set(g, shift === undefined ? o : A.add(o, shift));
  }

  // Each cluster is one component, with its groups at their places; every
  // other component is as it was.
  const next: RelationComponents<T> = {
    relative: new Map(),
    componentOf: new Map(),
    components: [],
    conflicts,
  };
  const add = (nodes: NodeId[], at: (node: NodeId) => T) => {
    const index = next.components.length;
    next.components.push(nodes);
    for (const node of nodes) {
      next.relative.set(node, at(node));
      next.componentOf.set(node, index);
    }
  };
  const placed = new Set<number>();
  for (const groups of clusters.values()) {
    const nodes: NodeId[] = [];
    for (const g of groups) {
      nodes.push(...nodesOf(g));
      if (g === PINNED) pinOffset.forEach((_, c) => placed.add(c));
      else placed.add(g);
    }
    add(nodes, (node) => A.add(inGroup(node), offsets.get(groupOf(node))!));
  }
  components.forEach((nodes, c) => {
    if (!placed.has(c)) add(nodes, (node) => relative.get(node)!);
  });
  return next;
}

/**
 * A loud error if the gaps between two groups make a cycle over nodes: one
 * that leaves a node and comes back to that same node. Such a cycle says the
 * node is at least the sum of the gaps after itself. A cycle over groups
 * that enters a group at one member and leaves it at another is no such
 * cycle: the exact distance between the two members is the room the gaps
 * share, which {@link roomHolds} checks.
 */
function noGapCycle(
  gaps: readonly PlacementMinGap<unknown>[],
  groupOf: (node: NodeId) => number | undefined,
  axis: Axis,
  describe: (g: number) => string
): void {
  const into = new Map<NodeId, PlacementMinGap<unknown>[]>();
  const outOf = new Map<NodeId, NodeId[]>();
  const nodes = new Set<NodeId>();
  for (const gap of gaps) {
    const from = groupOf(gap.from);
    const to = groupOf(gap.to);
    if (from === undefined || to === undefined || from === to) continue;
    nodes.add(gap.from);
    nodes.add(gap.to);
    into.set(gap.to, [...(into.get(gap.to) ?? []), gap]);
    outOf.set(gap.from, [...(outOf.get(gap.from) ?? []), gap.to]);
  }
  // Kahn's: what is left has a gap into it from another node left.
  const ins = new Map([...nodes].map((n) => [n, (into.get(n) ?? []).length]));
  const order = [...nodes].filter((n) => ins.get(n) === 0);
  for (let k = 0; k < order.length; k++)
    for (const to of outOf.get(order[k]) ?? []) {
      ins.set(to, ins.get(to)! - 1);
      if (ins.get(to) === 0) order.push(to);
    }
  if (order.length === nodes.size) return;
  const done = new Set(order);
  const left = new Set([...nodes].filter((n) => !done.has(n)));
  // Walking back along the gaps into what is left closes a cycle.
  const path: NodeId[] = [];
  const owners: string[] = [];
  let at = [...left][0];
  while (!path.includes(at)) {
    path.push(at);
    const gap = into.get(at)!.find((e) => left.has(e.from))!;
    owners.push(gap.owner);
    at = gap.from;
  }
  const start = path.indexOf(at);
  const cycle = path.slice(start).reverse();
  const cycleOwners = owners.slice(start).reverse();
  throw new Error(
    `Minimum gaps on ${axis} form a cycle: ` +
      `${[...cycle, cycle[0]].map((n) => describe(groupOf(n)!)).join(" → ")} ` +
      `(${[...new Set(cycleOwners)].join(", ")}). Each gap puts its second ` +
      `operand after its first, so a cycle of them has no least solution. ` +
      `State an exact gap where two operands must be a fixed distance apart.`
  );
}

/** The strongly connected sets of `groups` under the gaps `outOf` (Tarjan's),
 *  in an order where every gap between two sets points forward. */
function stronglyConnected(
  groups: number[],
  outOf: Map<number, { to: number }[]>
): number[][] {
  const index = new Map<number, number>();
  const low = new Map<number, number>();
  const stack: number[] = [];
  const onStack = new Set<number>();
  const sets: number[][] = [];
  const visit = (g: number) => {
    index.set(g, index.size);
    low.set(g, index.get(g)!);
    stack.push(g);
    onStack.add(g);
    for (const { to } of outOf.get(g) ?? []) {
      if (!index.has(to)) {
        visit(to);
        low.set(g, Math.min(low.get(g)!, low.get(to)!));
      } else if (onStack.has(to))
        low.set(g, Math.min(low.get(g)!, index.get(to)!));
    }
    if (low.get(g) !== index.get(g)) return;
    const set: number[] = [];
    for (;;) {
      const h = stack.pop()!;
      onStack.delete(h);
      set.push(h);
      if (h === g) break;
    }
    sets.push(set.sort((a, b) => a - b));
  };
  for (const g of groups) if (!index.has(g)) visit(g);
  // Tarjan's finds a set after every set its gaps lead to.
  return sets.reverse();
}

/** The longest path from each group of `set` to each other over the gaps
 *  `keep` passes (Floyd–Warshall in `max` and `add`), `undefined` where no
 *  path leads; from a group to itself 0, or the longest cycle through it
 *  when that is longer. */
function longestPaths<T>(
  A: Arith<T>,
  set: number[],
  outOf: Map<number, { from: number; to: number; w: T }[]>,
  keep: (e: { from: number; to: number }) => boolean
): Map<number, Map<number, T | undefined>> {
  const D = new Map(
    set.map((g) => [g, new Map<number, T | undefined>([[g, A.zero]])])
  );
  if (set.length === 1) return D;
  for (const g of set)
    for (const e of outOf.get(g) ?? []) if (keep(e)) D.get(g)!.set(e.to, e.w);
  for (const k of set)
    for (const i of set) {
      const ik = D.get(i)!.get(k);
      if (ik === undefined) continue;
      for (const j of set) {
        const kj = D.get(k)!.get(j);
        if (kj === undefined) continue;
        const through = A.add(ik, kj);
        const prior = D.get(i)!.get(j);
        D.get(i)!.set(
          j,
          prior === undefined ? through : A.max([prior, through])
        );
      }
    }
  return D;
}

/**
 * A loud error unless the gaps around a strongly connected `set` of groups
 * fit in the room its exact distances leave. A gap out of a group at one
 * member and gaps back into it at another hold what they pass between the
 * two members, which the exact constraints place a fixed distance apart; a
 * path around that is longer than 0 (`paths`, from a group to itself) is
 * room the gaps need and the exact distance does not give. In formulas the
 * check waits for layout's σ (`Arith.agree`).
 */
function roomHolds<T>(
  A: Arith<T>,
  axis: Axis,
  set: number[],
  paths: Map<number, Map<number, T | undefined>>,
  into: Map<number, { from: number; owners: string[] }[]>,
  describe: (g: number) => string
): void {
  const owners = [
    ...new Set(
      set.flatMap((g) =>
        (into.get(g) ?? [])
          .filter((e) => set.includes(e.from))
          .flatMap((e) => e.owners)
      )
    ),
  ]
    .sort()
    .join(", ");
  const groups = set.map(describe).join(", ");
  for (const g of set) {
    const short = paths.get(g)!.get(g)!;
    if (
      A.agree(short, A.zero, TOLERANCE, {
        owner: `the room minimum gaps (${owners}) need between ${groups} past what their exact constraints leave`,
        priorOwner: "a placement that fits",
      })
    )
      continue;
    throw new Error(
      `Minimum gaps on ${axis} need more room than exact constraints leave: ` +
        `the gaps (${owners}) lead out of ${describe(g)} and back into it, ` +
        `and the exact constraints hold its members a fixed distance ` +
        `apart, ${A.report(short)} px short of the room the gaps need ` +
        `(placing ${groups}). Leave more room between the exactly placed ` +
        `nodes, or make the gaps smaller.`
    );
  }
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
  const grouped = rigidGroups(A, axis, problem);
  const { relative, componentOf, components, conflicts } =
    problem.minGaps !== undefined && problem.minGaps.length > 0
      ? separateGroups(A, axis, problem, grouped.solved)
      : grouped.solved;
  // The chain edges, exact or minimum: a chain starts at its first member.
  const chainLinks = [
    ...grouped.relations
      .filter((relation) => relation.chain)
      .map((relation) => ({
        from: relation.from.node,
        to: relation.to.node,
      })),
    ...(problem.minGaps ?? []).filter((gap) => gap.chain),
  ];

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
    for (const link of chainLinks) {
      if (componentOf.get(link.from) !== component) continue;
      outgoing.add(link.from);
      incoming.add(link.to);
    }
    return [...outgoing].filter((node) => !incoming.has(node)).sort()[0];
  };

  // The component's baseline, joined over the nodes listed in
  // `freeOrigin.baselines`: undefined (none) → determined (they all agree) →
  // impossible (two disagree). The caller lists only baselines nothing else
  // places, so a chain that states its 0 contributes its origin (on
  // whichever part carries it). A spread chain that states none packs its
  // members' boxes end to end from its first member's start, so it has no
  // baseline at all: a component holding one is impossible, whatever else
  // it holds (a free node aligned to one of its members has a baseline, but
  // seating it would move the whole spread off its start). Only a
  // determined baseline is returned; impossible places like undefined.
  const sharedFreeBaseline = (component: number): T | undefined => {
    if (freeOrigin === undefined) return undefined;
    const holdsSpread = chainLinks.some(
      (link) => componentOf.get(link.from) === component
    );
    const states = components[component].some(
      (node) => freeOrigin.stated?.has(node) === true
    );
    if (holdsSpread && !states) return undefined;
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

  placeMeans(A, axis, grouped.pending, {
    relative,
    componentOf,
    offsets,
    conflicts,
    separated: new Set(
      (problem.minGaps ?? []).flatMap((gap) =>
        [gap.from, gap.to].map((node) => componentOf.get(node))
      )
    ),
  });

  const positions = new Map<NodeId, T>();
  for (const [node, rel] of relative) {
    const component = componentOf.get(node)!;
    positions.set(node, A.add(rel, offsets.get(component)!.value));
  }
  return { positions, conflicts };
}

/** The owners of the offsets a component falls back to when nothing
 *  places it. */
const FALLBACKS = new Set([
  "free-origin",
  "sequence-origin",
  "normalized-origin",
]);

/**
 * Place each mean whose operands lie in more than one group, once those
 * groups are placed: its target's component moves so the target is at the
 * mean. This is an ordered pass, not a solve. A mean whose operands lie in
 * one group is an exact relation, and {@link rigidGroups} has made it one;
 * one across groups is a linear equation over several positions, which the
 * difference graph (equations `b − a = c` only) cannot hold. So the honest
 * subset is the one-directional case: the operands are placed by other
 * facts first, and then the mean places the target. A target that something
 * else places too (a pin, another mean) is checked against the mean
 * instead. A target in a group its own operands are in, or one that
 * minimum gaps separate, would need the equation solved with the rest, and
 * is a loud error. Means wait for the means that place their operands, and
 * a cycle of them is an error too.
 */
function placeMeans<T>(
  A: Arith<T>,
  axis: Axis,
  pending: PlacementMean<T>[],
  {
    relative,
    componentOf,
    offsets,
    conflicts,
    separated,
  }: {
    relative: Map<NodeId, T>;
    componentOf: Map<NodeId, number>;
    offsets: Map<number, { value: T; owner: string }>;
    conflicts: PlacementConflict[];
    separated: Set<number | undefined>;
  }
): void {
  const left = [...pending];
  const at = (node: NodeId) =>
    A.add(relative.get(node)!, offsets.get(componentOf.get(node)!)!.value);
  while (left.length > 0) {
    const targets = new Set(left.map((m) => componentOf.get(m.target)));
    const k = left.findIndex((m) =>
      m.operands.every(({ node }) => !targets.has(componentOf.get(node)))
    );
    if (k < 0) {
      const mean = left[0];
      const own = mean.operands.some(
        ({ node }) => componentOf.get(node) === componentOf.get(mean.target)
      );
      throw new Error(
        own
          ? `${mean.owner} on ${axis}: "${mean.target}" is placed together ` +
            `with some of the nodes it is the mean of ` +
            `(${mean.operands.map(({ node }) => node).join(", ")}), by ` +
            `exact constraints or minimum ` +
            `gaps, but not with all of them. The mean is placed after its ` +
            `operands, so its target cannot also take part in placing them.`
          : `Means on ${axis} form a cycle: ${left
              .map((m) => m.owner)
              .join(", ")} each wait for another to place an operand.`
      );
    }
    const [mean] = left.splice(k, 1);
    const value = A.add(meanOf(A, mean, at), mean.offset);
    const component = componentOf.get(mean.target)!;
    const prior = offsets.get(component)!;
    if (!FALLBACKS.has(prior.owner)) {
      if (
        !A.agree(value, at(mean.target), TOLERANCE, {
          owner: mean.owner,
          priorOwner: prior.owner,
        })
      )
        conflicts.push({
          axis,
          owner: mean.owner,
          priorOwner: prior.owner,
          asserted: A.report(value),
          implied: A.report(at(mean.target)),
        });
      continue;
    }
    if (separated.has(component))
      throw new Error(
        `${mean.owner} on ${axis}: "${mean.target}" is separated from other ` +
          `nodes by minimum gaps, and is the mean of nodes in other groups. ` +
          `The mean is placed after the gaps are, so it cannot also take ` +
          `part in them. Put the target in a group with its operands.`
      );
    offsets.set(component, {
      value: A.sub(value, relative.get(mean.target)!),
      owner: mean.owner,
    });
  }
}

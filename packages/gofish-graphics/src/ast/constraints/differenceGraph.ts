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
  type Slack,
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

/** The mean of `xs` (at least one). */
const meanOf = <T>(A: Arith<T>, xs: readonly T[]): T =>
  A.scale(1 / xs.length, A.add(...xs));

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
        mean.operands.map((node) => solved.componentOf.get(node))
      );
      if (groups.size !== 1) {
        k++;
        continue;
      }
      const rels = mean.operands.map((node) => solved.relative.get(node)!);
      const at = A.add(meanOf(A, rels), mean.offset);
      joined.push(
        relationFact(
          anchorExpr(mean.operands[0], axis, "start"),
          anchorExpr(mean.target, axis, "start"),
          A.sub(at, rels[0]),
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
 * Each cluster is solved by the longest path over its groups, in an order
 * where every gap points forward (a cycle of gaps is an error). The least
 * solution puts a group that no gap leads into with its start at 0 (an
 * unpinned cluster's own 0, which the origin fallbacks then seat) and every
 * other group as near the start as its gaps allow. The greatest solution is
 * the least one of the mirrored problem, inside the least solution's span:
 * a group no gap leads out of ends where the least solution ends. A
 * cluster's `slack` picks one of them, or their mean (`"center"`). A
 * cluster that holds the pinned group is then moved as one so that the
 * pins hold: the pins place the cluster, and never conflict with its gaps.
 * This is `solveSeparations` of the
 * "Proposals/User Space Separation" stories, over groups.
 *
 * It needs only `add` and `max` (and `negate`, for the greatest solution),
 * so it runs in every {@link Arith}, formulas included: a claim is a max of
 * sums, which layout evaluates at its σ.
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
  const slacks = new Map<number, { slack: Slack; owner: string }[]>();
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
    for (const g of [from, to]) {
      const list = slacks.get(g) ?? [];
      list.push({ slack: gap.slack, owner: gap.owner });
      slacks.set(g, list);
    }
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

  const offsets = new Map<number, T>();
  for (const groups of clusters.values()) {
    // The cluster's slack: every gap in it must agree.
    const stated = groups.flatMap((g) => slacks.get(g) ?? []);
    const slack = stated[0].slack;
    const other = stated.find((s) => s.slack !== slack);
    if (other !== undefined)
      throw new Error(
        `Minimum gaps on ${axis}: ${stated[0].owner} puts the slack at ` +
          `"${slack}" but ${other.owner} puts it at "${other.slack}", and ` +
          `their gaps separate the same nodes. Give them one \`justify\`.`
      );
    const order = forwardOrder(groups, into, outOf, axis, describe);
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
    const least = new Map<number, T>();
    for (const g of order) {
      const ins = into.get(g) ?? [];
      least.set(
        g,
        ins.length === 0
          ? A.negate(lo.get(g)!)
          : A.max(ins.map((e) => A.add(least.get(e.from)!, e.w)))
      );
    }
    let chosen = least;
    if (slack !== "start") {
      const end = A.max(order.map((g) => A.add(least.get(g)!, hi.get(g)!)));
      const greatest = new Map<number, T>();
      for (const g of [...order].reverse()) {
        const outs = outOf.get(g) ?? [];
        greatest.set(
          g,
          outs.length === 0
            ? A.sub(end, hi.get(g)!)
            : minOf(
                A,
                outs.map((e) => A.sub(greatest.get(e.to)!, e.w))
              )
        );
      }
      chosen =
        slack === "end"
          ? greatest
          : new Map(
              order.map((g) => [
                g,
                A.scale(0.5, A.add(least.get(g)!, greatest.get(g)!)),
              ])
            );
    }
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

/** `groups` in an order where every gap points forward (Kahn's), or a loud
 *  error naming a cycle of gaps. */
function forwardOrder(
  groups: number[],
  into: Map<number, { from: number; owners: string[] }[]>,
  outOf: Map<number, { to: number }[]>,
  axis: Axis,
  describe: (g: number) => string
): number[] {
  const ins = new Map(groups.map((g) => [g, (into.get(g) ?? []).length]));
  const order = groups.filter((g) => ins.get(g) === 0);
  for (let k = 0; k < order.length; k++)
    for (const { to } of outOf.get(order[k]) ?? []) {
      ins.set(to, ins.get(to)! - 1);
      if (ins.get(to) === 0) order.push(to);
    }
  if (order.length === groups.length) return order;
  // Every group left has a gap into it from another group left, so walking
  // back along them closes a cycle.
  const left = new Set(groups.filter((g) => !order.includes(g)));
  const path: number[] = [];
  const owners: string[][] = [];
  let at = [...left][0];
  while (!path.includes(at)) {
    path.push(at);
    const edge = into.get(at)!.find((e) => left.has(e.from))!;
    owners.push(edge.owners);
    at = edge.from;
  }
  const start = path.indexOf(at);
  const cycle = path.slice(start).reverse();
  const cycleOwners = owners.slice(start).reverse().flat();
  throw new Error(
    `Minimum gaps on ${axis} form a cycle: ` +
      `${[...cycle, cycle[0]].map(describe).join(" → ")} ` +
      `(${[...new Set(cycleOwners)].join(", ")}). Each gap puts its second ` +
      `operand after its first, so a cycle of them has no least solution. ` +
      `State an exact gap where two operands must be a fixed distance apart.`
  );
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
      m.operands.every((node) => !targets.has(componentOf.get(node)))
    );
    if (k < 0) {
      const mean = left[0];
      const own = mean.operands.some(
        (node) => componentOf.get(node) === componentOf.get(mean.target)
      );
      throw new Error(
        own
          ? `${mean.owner} on ${axis}: "${mean.target}" is placed together ` +
            `with some of the nodes it is the mean of ` +
            `(${mean.operands.join(", ")}), by exact constraints or minimum ` +
            `gaps, but not with all of them. The mean is placed after its ` +
            `operands, so its target cannot also take part in placing them.`
          : `Means on ${axis} form a cycle: ${left
              .map((m) => m.owner)
              .join(", ")} each wait for another to place an operand.`
      );
    }
    const [mean] = left.splice(k, 1);
    const value = A.add(meanOf(A, mean.operands.map(at)), mean.offset);
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

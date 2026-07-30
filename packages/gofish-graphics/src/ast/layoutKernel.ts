// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Core Layout Semantics v0 — /internals/core/layout-kernel
// </gofish-wiki>

/**
 * Pure reference subkernel for known-size placement inside one Frame.
 *
 * A Fragment is an immutable set of facts. A Layer is only fragment union;
 * geometry, dependency order, and paint order remain separate relations. Frame
 * ownership, name resolution, scale solving, and coordinate transport happen
 * before this stage. A PlacedPort is already resolved in this Frame's coordinates.
 */

declare const nodeIdBrand: unique symbol;
declare const placedPortIdBrand: unique symbol;

export type NodeId = string & { readonly [nodeIdBrand]: "NodeId" };
export type PlacedPortId = string & {
  readonly [placedPortIdBrand]: "PlacedPortId";
};
export type Axis = "x" | "y";
export type Anchor = "start" | "middle" | "end" | "baseline";
export type AxisValues<T> = Readonly<Record<Axis, T>>;

export const TOLERANCE = 1e-9;

export function nodeId(value: string): NodeId {
  if (value.length === 0) throw new Error("NodeId must not be empty");
  return value as NodeId;
}

export function placedPortId(value: string): PlacedPortId {
  if (value.length === 0) throw new Error("PlacedPortId must not be empty");
  return value as PlacedPortId;
}

export interface KnownSizeNode {
  readonly id: NodeId;
  readonly size: AxisValues<number>;
  /** Local baseline offset from min; zero when omitted. */
  readonly baseline?: Readonly<Partial<Record<Axis, number>>>;
}

export interface NodeAnchorPort {
  readonly kind: "node-anchor";
  readonly node: NodeId;
  readonly anchor: Anchor;
}

export interface PlacedPortRef {
  readonly kind: "placed-port";
  readonly port: PlacedPortId;
}

/**
 * Immutable coordinate exported by already placed geometry and transported into
 * this solve region by an upstream Frame/ref dependency.
 */
export interface PlacedPort {
  readonly id: PlacedPortId;
  readonly axis: Axis;
  readonly value: number;
}

export type RelationPort = NodeAnchorPort | PlacedPortRef;

/** Placed ports are read-only by construction: only node anchors may be pinned. */
export interface PinFact {
  readonly axis: Axis;
  readonly target: NodeAnchorPort;
  readonly value: number;
}

/** Directed equation: `to = from + gap`. */
export interface RelationFact {
  readonly axis: Axis;
  readonly from: RelationPort;
  readonly to: RelationPort;
  readonly gap: number;
}

export interface DependencyEdge {
  readonly before: NodeId;
  readonly after: NodeId;
}

export interface PaintEdge {
  readonly before: NodeId;
  readonly after: NodeId;
}

export interface Fragment {
  readonly nodes: readonly KnownSizeNode[];
  readonly placedPorts: readonly PlacedPort[];
  readonly pins: readonly PinFact[];
  readonly relations: readonly RelationFact[];
  readonly dependencies: readonly DependencyEdge[];
  readonly paint: readonly PaintEdge[];
}

export type FragmentInput = { readonly [K in keyof Fragment]?: Fragment[K] };

const freeze = <T extends object>(value: T): Readonly<T> =>
  Object.freeze(value);
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const normalized = (value: number): number =>
  Object.is(value, -0) ? 0 : value;
const numberKey = (value: number): string => {
  const n = normalized(value);
  if (Number.isNaN(n)) return "NaN";
  if (n === Infinity) return "+Infinity";
  if (n === -Infinity) return "-Infinity";
  return String(n);
};
const tupleKey = (...parts: readonly string[]): string => JSON.stringify(parts);

export const knownSizeNode = (
  id: NodeId,
  x: number,
  y: number,
  baseline?: Readonly<Partial<Record<Axis, number>>>
): KnownSizeNode =>
  freeze({
    id,
    size: freeze({ x, y }),
    baseline:
      baseline === undefined
        ? undefined
        : freeze({ x: baseline.x, y: baseline.y }),
  });
export const anchorPort = (node: NodeId, anchor: Anchor): NodeAnchorPort =>
  freeze({ kind: "node-anchor", node, anchor });
export const placedPortRef = (port: PlacedPortId): PlacedPortRef =>
  freeze({ kind: "placed-port", port });
export const placedPort = (
  id: PlacedPortId,
  axis: Axis,
  value: number
): PlacedPort => freeze({ id, axis, value });
export const pin = (
  axis: Axis,
  target: NodeAnchorPort,
  value: number
): PinFact => freeze({ axis, target, value });
export const relation = (
  axis: Axis,
  from: RelationPort,
  to: RelationPort,
  gap = 0
): RelationFact => freeze({ axis, from, to, gap });
export const dependency = (before: NodeId, after: NodeId): DependencyEdge =>
  freeze({ before, after });
export const paintBefore = (before: NodeId, after: NodeId): PaintEdge =>
  freeze({ before, after });

const endpointKey = (port: RelationPort): string =>
  port.kind === "node-anchor"
    ? tupleKey("node", port.node, port.anchor)
    : tupleKey("placed", port.port);
const nodeKey = (node: KnownSizeNode): string =>
  tupleKey(
    node.id,
    numberKey(node.size.x),
    numberKey(node.size.y),
    node.baseline?.x === undefined ? "" : numberKey(node.baseline.x),
    node.baseline?.y === undefined ? "" : numberKey(node.baseline.y)
  );
const portKey = (port: PlacedPort): string =>
  tupleKey(port.id, port.axis, numberKey(port.value));
const pinKey = (fact: PinFact): string =>
  tupleKey(fact.axis, endpointKey(fact.target), numberKey(fact.value));
const relationKey = (fact: RelationFact): string =>
  tupleKey(
    fact.axis,
    endpointKey(fact.from),
    endpointKey(fact.to),
    numberKey(fact.gap)
  );
const edgeKey = (edge: DependencyEdge | PaintEdge): string =>
  tupleKey(edge.before, edge.after);

function canonical<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
  copy: (value: T) => T
): readonly T[] {
  const unique = new Map<string, T>();
  for (const value of values) {
    const item = copy(value);
    const key = keyOf(item);
    if (!unique.has(key)) unique.set(key, item);
  }
  return freeze(
    [...unique.entries()]
      .sort(([a], [b]) => compare(a, b))
      .map(([, value]) => value)
  );
}

const copyEndpoint = (port: RelationPort): RelationPort =>
  port.kind === "node-anchor"
    ? anchorPort(port.node, port.anchor)
    : placedPortRef(port.port);

/** Canonical immutable fact bag; caller array order is discarded. */
export function fragment(input: FragmentInput = {}): Fragment {
  return freeze({
    nodes: canonical(input.nodes ?? [], nodeKey, (node) =>
      knownSizeNode(node.id, node.size.x, node.size.y, node.baseline)
    ),
    placedPorts: canonical(input.placedPorts ?? [], portKey, (port) =>
      placedPort(port.id, port.axis, port.value)
    ),
    pins: canonical(input.pins ?? [], pinKey, (fact) =>
      freeze({
        axis: fact.axis,
        target: copyEndpoint(fact.target as RelationPort) as NodeAnchorPort,
        value: fact.value,
      })
    ),
    relations: canonical(input.relations ?? [], relationKey, (fact) =>
      relation(
        fact.axis,
        copyEndpoint(fact.from),
        copyEndpoint(fact.to),
        fact.gap
      )
    ),
    dependencies: canonical(input.dependencies ?? [], edgeKey, (edge) =>
      dependency(edge.before, edge.after)
    ),
    paint: canonical(input.paint ?? [], edgeKey, (edge) =>
      paintBefore(edge.before, edge.after)
    ),
  });
}

export const EMPTY_FRAGMENT: Fragment = fragment();

/** Set union: associative, commutative, and idempotent. */
export function composeFragments(...parts: readonly Fragment[]): Fragment {
  return fragment({
    nodes: parts.flatMap((part) => part.nodes),
    placedPorts: parts.flatMap((part) => part.placedPorts),
    pins: parts.flatMap((part) => part.pins),
    relations: parts.flatMap((part) => part.relations),
    dependencies: parts.flatMap((part) => part.dependencies),
    paint: parts.flatMap((part) => part.paint),
  });
}

/** Transparent nesting. A semantic Frame belongs above this kernel. */
export const layer = (...children: readonly Fragment[]): Fragment =>
  composeFragments(...children);

export type ConflictKind =
  | "duplicate-node-definition"
  | "duplicate-placed-port-definition"
  | "invalid-number"
  | "unknown-node"
  | "unknown-placed-port"
  | "placed-port-axis-mismatch"
  | "read-only-port-write"
  | "inconsistent-placed-relation"
  | "inconsistent-relation-cycle"
  | "inconsistent-pins"
  | "dependency-cycle"
  | "paint-cycle";

export interface LayoutConflict {
  readonly kind: ConflictKind;
  readonly message: string;
  readonly axis?: Axis;
  readonly ids: readonly string[];
  readonly asserted?: number;
  readonly implied?: number;
}

export interface ConflictOutcome {
  readonly status: "conflict";
  readonly conflict: LayoutConflict;
}

type ConflictDetails = Partial<
  Pick<LayoutConflict, "axis" | "asserted" | "implied">
>;
const fail = (
  kind: ConflictKind,
  message: string,
  ids: readonly string[],
  details: ConflictDetails = {}
): ConflictOutcome =>
  freeze({
    status: "conflict",
    conflict: freeze({ kind, message, ids: freeze([...ids]), ...details }),
  });

interface Prepared {
  readonly status: "prepared";
  readonly nodes: ReadonlyMap<NodeId, KnownSizeNode>;
  readonly ports: ReadonlyMap<PlacedPortId, PlacedPort>;
}

type PreparedOutcome = Prepared | ConflictOutcome;

function prepare(input: Fragment): PreparedOutcome {
  const nodes = new Map<NodeId, KnownSizeNode>();
  const ports = new Map<PlacedPortId, PlacedPort>();
  for (const node of input.nodes) {
    const prior = nodes.get(node.id);
    if (prior !== undefined && nodeKey(prior) !== nodeKey(node))
      return fail(
        "duplicate-node-definition",
        `Node ${node.id} has incompatible definitions`,
        [node.id]
      );
    nodes.set(node.id, node);
    for (const axis of ["x", "y"] as const) {
      const size = node.size[axis];
      if (!Number.isFinite(size) || size < 0)
        return fail("invalid-number", `Invalid ${axis} size on ${node.id}`, [
          node.id,
        ]);
      const baseline = node.baseline?.[axis];
      if (baseline !== undefined && !Number.isFinite(baseline))
        return fail(
          "invalid-number",
          `Invalid ${axis} baseline on ${node.id}`,
          [node.id]
        );
    }
  }
  for (const port of input.placedPorts) {
    const prior = ports.get(port.id);
    if (prior !== undefined && portKey(prior) !== portKey(port))
      return fail(
        "duplicate-placed-port-definition",
        `Placed port ${port.id} has incompatible definitions`,
        [port.id]
      );
    if (!Number.isFinite(port.value))
      return fail("invalid-number", `Invalid placed port ${port.id}`, [
        port.id,
      ]);
    ports.set(port.id, port);
  }

  const requireEndpoint = (
    endpoint: RelationPort,
    axis: Axis
  ): ConflictOutcome | undefined => {
    if (endpoint.kind === "node-anchor")
      return nodes.has(endpoint.node)
        ? undefined
        : fail("unknown-node", `Unknown node ${endpoint.node}`, [
            endpoint.node,
          ]);
    const port = ports.get(endpoint.port);
    if (port === undefined)
      return fail(
        "unknown-placed-port",
        `Unknown placed port ${endpoint.port}`,
        [endpoint.port]
      );
    return port.axis === axis
      ? undefined
      : fail(
          "placed-port-axis-mismatch",
          `Placed port ${port.id} is ${port.axis}, not ${axis}`,
          [port.id],
          { axis }
        );
  };

  for (const fact of input.pins) {
    const target = fact.target as RelationPort;
    if (target.kind === "placed-port")
      return fail(
        "read-only-port-write",
        `Placed port ${target.port} is read-only`,
        [target.port]
      );
    if (!Number.isFinite(fact.value))
      return fail("invalid-number", `Invalid pin on ${target.node}`, [
        target.node,
      ]);
    const error = requireEndpoint(target, fact.axis);
    if (error !== undefined) return error;
  }
  for (const fact of input.relations) {
    if (!Number.isFinite(fact.gap))
      return fail("invalid-number", "Invalid relation gap", [
        endpointKey(fact.from),
        endpointKey(fact.to),
      ]);
    const error =
      requireEndpoint(fact.from, fact.axis) ??
      requireEndpoint(fact.to, fact.axis);
    if (error !== undefined) return error;
  }
  for (const edge of [...input.dependencies, ...input.paint]) {
    if (!nodes.has(edge.before))
      return fail("unknown-node", `Unknown node ${edge.before}`, [edge.before]);
    if (!nodes.has(edge.after))
      return fail("unknown-node", `Unknown node ${edge.after}`, [edge.after]);
  }
  return { status: "prepared", nodes, ports };
}

export interface PotentialEquation {
  readonly from: NodeId;
  readonly to: NodeId;
  /** `to.min = from.min + delta`. */
  readonly delta: number;
}

export interface PotentialPin {
  readonly node: NodeId;
  /** Absolute value of `node.min`. */
  readonly value: number;
  readonly source: "pin" | "placed-port";
}

export interface LoweredAxis {
  readonly status: "lowered";
  readonly axis: Axis;
  readonly nodes: readonly NodeId[];
  readonly equations: readonly PotentialEquation[];
  readonly pins: readonly PotentialPin[];
}

export type LowerAxisOutcome = LoweredAxis | ConflictOutcome;

const anchorOffset = (
  node: KnownSizeNode,
  axis: Axis,
  anchor: Anchor
): number => {
  if (anchor === "start") return 0;
  if (anchor === "middle") return node.size[axis] / 2;
  if (anchor === "end") return node.size[axis];
  return node.baseline?.[axis] ?? 0;
};

type EndpointTerm =
  | { readonly node: NodeId; readonly offset: number }
  | { readonly value: number };

const endpointTerm = (
  endpoint: RelationPort,
  axis: Axis,
  prepared: Prepared
): EndpointTerm => {
  if (endpoint.kind === "placed-port")
    return { value: prepared.ports.get(endpoint.port)!.value };
  const node = prepared.nodes.get(endpoint.node)!;
  return { node: node.id, offset: anchorOffset(node, axis, endpoint.anchor) };
};

function lowerPrepared(
  input: Fragment,
  prepared: Prepared,
  axis: Axis
): LowerAxisOutcome {
  const equations: PotentialEquation[] = [];
  const pins: PotentialPin[] = [];
  const addPin = (
    node: NodeId,
    value: number,
    source: PotentialPin["source"]
  ) => pins.push(freeze({ node, value: normalized(value), source }));

  for (const fact of input.pins) {
    if (fact.axis !== axis) continue;
    const node = prepared.nodes.get(fact.target.node)!;
    addPin(
      node.id,
      fact.value - anchorOffset(node, axis, fact.target.anchor),
      "pin"
    );
  }
  for (const fact of input.relations) {
    if (fact.axis !== axis) continue;
    const from = endpointTerm(fact.from, axis, prepared);
    const to = endpointTerm(fact.to, axis, prepared);
    if ("node" in from && "node" in to)
      equations.push(
        freeze({
          from: from.node,
          to: to.node,
          delta: normalized(from.offset + fact.gap - to.offset),
        })
      );
    else if ("value" in from && "node" in to)
      addPin(to.node, from.value + fact.gap - to.offset, "placed-port");
    else if ("node" in from && "value" in to)
      addPin(from.node, to.value - fact.gap - from.offset, "placed-port");
    else if (
      "value" in from &&
      "value" in to &&
      Math.abs(to.value - from.value - fact.gap) > TOLERANCE
    )
      return fail(
        "inconsistent-placed-relation",
        `Placed relation on ${axis} is inconsistent`,
        [endpointKey(fact.from), endpointKey(fact.to)],
        { axis, asserted: to.value, implied: from.value + fact.gap }
      );
  }
  return freeze({
    status: "lowered",
    axis,
    nodes: freeze([...prepared.nodes.keys()].sort(compare)),
    equations: canonical(
      equations,
      (item) => tupleKey(item.from, item.to, numberKey(item.delta)),
      (item) => item
    ),
    pins: canonical(
      pins,
      (item) => tupleKey(item.node, numberKey(item.value), item.source),
      (item) => item
    ),
  });
}

/** Lower anchors to one-dimensional potential equations. */
export function lowerAnchors(input: Fragment, axis: Axis): LowerAxisOutcome {
  const prepared = prepare(input);
  return prepared.status === "conflict"
    ? prepared
    : lowerPrepared(input, prepared, axis);
}

export interface SolvedCell {
  readonly node: NodeId;
  readonly min: number;
  readonly size: number;
}

export interface SolvedComponent {
  readonly id: NodeId;
  readonly nodes: readonly NodeId[];
  readonly pinned: boolean;
}

export interface SolvedAxis {
  readonly cells: readonly SolvedCell[];
  readonly components: readonly SolvedComponent[];
}

interface PotentialEdge {
  readonly node: NodeId;
  readonly delta: number;
}

function solveAxis(
  lowered: LoweredAxis,
  nodes: ReadonlyMap<NodeId, KnownSizeNode>
): SolvedAxis | ConflictOutcome {
  const graph = new Map<NodeId, PotentialEdge[]>();
  for (const id of lowered.nodes) graph.set(id, []);
  const add = (from: NodeId, node: NodeId, delta: number) => {
    const edges = graph.get(from)!;
    if (!edges.some((edge) => edge.node === node && edge.delta === delta))
      edges.push(freeze({ node, delta }));
  };
  for (const equation of lowered.equations) {
    add(equation.from, equation.to, equation.delta);
    add(equation.to, equation.from, -equation.delta);
  }
  for (const edges of graph.values())
    edges.sort((a, b) => compare(a.node, b.node) || a.delta - b.delta);

  const relative = new Map<NodeId, number>();
  const componentOf = new Map<NodeId, number>();
  const components: NodeId[][] = [];
  for (const root of lowered.nodes) {
    if (relative.has(root)) continue;
    const index = components.length;
    const members: NodeId[] = [];
    const queue: NodeId[] = [root];
    relative.set(root, 0);
    componentOf.set(root, index);
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      members.push(current);
      for (const edge of graph.get(current)!) {
        const expected = normalized(relative.get(current)! + edge.delta);
        const prior = relative.get(edge.node);
        if (prior === undefined) {
          relative.set(edge.node, expected);
          componentOf.set(edge.node, index);
          queue.push(edge.node);
        } else if (Math.abs(prior - expected) > TOLERANCE)
          return fail(
            "inconsistent-relation-cycle",
            `Relation cycle on ${lowered.axis} is inconsistent`,
            [current, edge.node],
            { axis: lowered.axis, asserted: expected, implied: prior }
          );
      }
    }
    components.push(members.sort(compare));
  }

  const pinOffsets = new Map<number, { node: NodeId; value: number }[]>();
  for (const pin of lowered.pins) {
    const index = componentOf.get(pin.node)!;
    const values = pinOffsets.get(index) ?? [];
    values.push({
      node: pin.node,
      value: normalized(pin.value - relative.get(pin.node)!),
    });
    pinOffsets.set(index, values);
  }

  const translations = new Map<number, number>();
  for (let index = 0; index < components.length; index++) {
    const values = pinOffsets.get(index);
    if (values === undefined) {
      const min = Math.min(...components[index].map((id) => relative.get(id)!));
      translations.set(index, normalized(-min));
      continue;
    }
    values.sort((a, b) => a.value - b.value || compare(a.node, b.node));
    const first = values[0];
    const last = values[values.length - 1];
    if (Math.abs(last.value - first.value) > TOLERANCE)
      return fail(
        "inconsistent-pins",
        `Pins on ${lowered.axis} component ${components[index][0]} disagree`,
        [first.node, last.node],
        {
          axis: lowered.axis,
          asserted: last.value,
          implied: first.value,
        }
      );
    translations.set(index, first.value);
  }

  return freeze({
    cells: freeze(
      lowered.nodes.map((id) => {
        const index = componentOf.get(id)!;
        return freeze({
          node: id,
          min: normalized(relative.get(id)! + translations.get(index)!),
          size: nodes.get(id)!.size[lowered.axis],
        });
      })
    ),
    components: freeze(
      components.map((members, index) =>
        freeze({
          id: members[0],
          nodes: freeze([...members]),
          pinned: pinOffsets.has(index),
        })
      )
    ),
  });
}

export interface ScheduledOrder {
  readonly status: "scheduled";
  readonly order: readonly NodeId[];
}

export type ScheduleOutcome = ScheduledOrder | ConflictOutcome;

function findCycle(
  nodes: readonly NodeId[],
  graph: ReadonlyMap<NodeId, readonly NodeId[]>
): readonly NodeId[] {
  const state = new Map<NodeId, 0 | 1 | 2>();
  const stack: NodeId[] = [];
  const at = new Map<NodeId, number>();
  let cycle: NodeId[] = [];
  const visit = (node: NodeId): boolean => {
    state.set(node, 1);
    at.set(node, stack.length);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if ((state.get(next) ?? 0) === 0 && visit(next)) return true;
      if (state.get(next) === 1) {
        cycle = stack.slice(at.get(next)!);
        return true;
      }
    }
    stack.pop();
    at.delete(node);
    state.set(node, 2);
    return false;
  };
  for (const node of nodes)
    if ((state.get(node) ?? 0) === 0 && visit(node)) break;

  const compareCycles = (left: readonly NodeId[], right: readonly NodeId[]) => {
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      const order = compare(left[index], right[index]);
      if (order !== 0) return order;
    }
    return left.length - right.length;
  };
  let best = cycle;
  for (let index = 1; index < cycle.length; index++) {
    const rotated = [...cycle.slice(index), ...cycle.slice(0, index)];
    if (compareCycles(rotated, best) < 0) best = rotated;
  }
  return freeze(best.length === 0 ? [] : [...best, best[0]]);
}

function schedule(
  nodes: readonly NodeId[],
  edges: readonly (DependencyEdge | PaintEdge)[],
  kind: "dependency" | "paint"
): ScheduleOutcome {
  const graph = new Map<NodeId, NodeId[]>();
  const degree = new Map<NodeId, number>();
  for (const node of nodes) {
    graph.set(node, []);
    degree.set(node, 0);
  }
  for (const edge of edges) {
    const next = graph.get(edge.before)!;
    if (next.includes(edge.after)) continue;
    next.push(edge.after);
    degree.set(edge.after, degree.get(edge.after)! + 1);
  }
  for (const next of graph.values()) next.sort(compare);

  const ready = nodes.filter((node) => degree.get(node) === 0).sort(compare);
  const order: NodeId[] = [];
  while (ready.length > 0) {
    const node = ready.shift()!;
    order.push(node);
    for (const next of graph.get(node)!) {
      degree.set(next, degree.get(next)! - 1);
      if (degree.get(next) === 0) {
        ready.push(next);
        ready.sort(compare);
      }
    }
  }
  if (order.length === nodes.length)
    return { status: "scheduled", order: freeze(order) };
  const cycle = findCycle(nodes, graph);
  const label = kind === "dependency" ? "Dependency" : "Paint";
  return fail(
    kind === "dependency" ? "dependency-cycle" : "paint-cycle",
    `${label} cycle: ${cycle.join(" -> ")}`,
    cycle
  );
}

const scheduleKind = (
  input: Fragment,
  kind: "dependency" | "paint"
): ScheduleOutcome => {
  const prepared = prepare(input);
  return prepared.status === "conflict"
    ? prepared
    : schedule(
        [...prepared.nodes.keys()].sort(compare),
        input[kind === "dependency" ? "dependencies" : "paint"],
        kind
      );
};

export const scheduleDependencies = (input: Fragment): ScheduleOutcome =>
  scheduleKind(input, "dependency");
export const schedulePaint = (input: Fragment): ScheduleOutcome =>
  scheduleKind(input, "paint");

export interface SolvedLayout {
  readonly status: "solved";
  readonly axes: AxisValues<SolvedAxis>;
  readonly dependencyOrder: readonly NodeId[];
  readonly paintOrder: readonly NodeId[];
}

export type SolveOutcome = SolvedLayout | ConflictOutcome;

/** Solve atomically: a conflict never returns partial coordinates. */
export function solveFragment(input: Fragment): SolveOutcome {
  const prepared = prepare(input);
  if (prepared.status === "conflict") return prepared;
  const ids = [...prepared.nodes.keys()].sort(compare);
  const dependencyOrder = schedule(ids, input.dependencies, "dependency");
  if (dependencyOrder.status === "conflict") return dependencyOrder;
  const paintOrder = schedule(ids, input.paint, "paint");
  if (paintOrder.status === "conflict") return paintOrder;
  const x = lowerPrepared(input, prepared, "x");
  if (x.status === "conflict") return x;
  const y = lowerPrepared(input, prepared, "y");
  if (y.status === "conflict") return y;
  const solvedX = solveAxis(x, prepared.nodes);
  if ("status" in solvedX) return solvedX;
  const solvedY = solveAxis(y, prepared.nodes);
  if ("status" in solvedY) return solvedY;
  return freeze({
    status: "solved",
    axes: freeze({ x: solvedX, y: solvedY }),
    dependencyOrder: dependencyOrder.order,
    paintOrder: paintOrder.order,
  });
}

/** Translate absolute facts; relative and ordering facts are unchanged. */
export function translateFragment(
  input: Fragment,
  offset: AxisValues<number>
): Fragment {
  return fragment({
    ...input,
    placedPorts: input.placedPorts.map((port) =>
      placedPort(port.id, port.axis, port.value + offset[port.axis])
    ),
    pins: input.pins.map((fact) =>
      pin(fact.axis, fact.target, fact.value + offset[fact.axis])
    ),
  });
}

export function solvedMin(
  solved: SolvedLayout,
  axis: Axis,
  id: NodeId
): number | undefined {
  return solved.axes[axis].cells.find((cell) => cell.node === id)?.min;
}

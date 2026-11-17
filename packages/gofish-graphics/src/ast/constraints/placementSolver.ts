// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { BBox } from "./bbox";
import type { Arith } from "../solver/arith";
import {
  lowerPlacementConstraints,
  type PlacementConstraint,
  type ScaleOf,
} from "./placementLowering";
import type { GridTracks } from "./grid";
import type { GapOf } from "./gap";
import {
  axisIndex,
  axisName,
  type Axis,
  type FreeOrigin,
  type KeyOf,
} from "./shared";
import {
  anchorExpr,
  participantFact,
  relationFact,
  type AnchorFact,
  type RelationAnchor,
  type ChainPath,
  type StackPoint,
  type NodeId,
} from "./placementFacts";
import {
  anchorOffset,
  freeBaselineOffset,
  strongAnchorOffset,
  type SolvePlaceable,
  type SpanOf,
} from "./placementProgramLowerer";
import {
  solveAxisProblem,
  type AxisProblem,
  type PlacementConflict,
  type PlacementPinClaim,
} from "./differenceGraph";

export {
  compilePlacementCoordinate,
  lowerPlacementConstraints,
} from "./placementLowering";
export type { PlacementConflict } from "./differenceGraph";

/**
 * The rank-2 placement solve (#39 stage 5): resolve each (node, axis) box
 * `(min, size)` from the ANCHOR program — facts that name a node anchor without
 * a pre-evaluated `min` offset — in two phases:
 *
 *   1. Cell closure. A per-node {@link BBox} fed the node's STRONG anchor pins
 *      (constraint-owned; not the weak `self-placement` seed). A cell that
 *      reaches rank 2 — an interval/span target's two edges — has its size
 *      determined and its local frame resets to `[0, size]`; every other cell
 *      takes its weak layout size. This is exactly `setExtent`'s two-tier reset,
 *      made explicit.
 *   2. Difference graph. With sizes known, every anchor reduces to `min + offset`
 *      via the same {@link anchorOffset} arithmetic — moved from lowering-time to
 *      post-closure — and the reduced pins/relations go through the shared
 *      {@link solveAxisProblem} (BFS components, pin offsets, distribute/normalized
 *      origins), unchanged.
 *
 * Every solved cell writes back through one path: a size-strong cell sets its
 * extent (`setExtent`), a position-only cell pins its `min` anchor.
 *
 * The solve runs in an {@link Arith} `A`. The claim walk solves a layer's
 * program once over its children's claims, in formulas in σ and in what
 * only layout measures ({@link solvePlacementCells}, `claimPlacement.ts`);
 * layout evaluates them and writes each cell back.
 */

/** A solved (node, axis) box: absolute `min`, `size`, and whether the size was
 *  rank-2 determined by strong pins (so the write-back sets the extent). */
export type SolvedCell<T = number> = {
  min: T;
  size: T | undefined;
  sizeStrong: boolean;
  /** Owner of the strong size equations, for the extent write-back. */
  sizeOwner?: string;
};

/**
 * Cell closure for one axis. Each node's STRONG anchor pins seed a {@link BBox};
 * a cell that reaches rank 2 (an interval/span target's two edges) yields a
 * determined size with the owner of its equations. The `self-placement` seed is
 * weak and never contributes, and `baseline` is not a size-determining box key.
 * A BBox over-determination (e.g. two conflicting intervals on one target)
 * surfaces as a named {@link PlacementConflict}.
 */
function closeSizes<T>(
  A: Arith<T>,
  axis: Axis,
  pins: AnchorFact<T>[]
): {
  sizes: Map<NodeId, T>;
  owners: Map<NodeId, string>;
  conflicts: PlacementConflict[];
} {
  const boxes = new Map<NodeId, BBox<T>>();
  const boxOwner = new Map<NodeId, string>();
  const conflicts: PlacementConflict[] = [];
  for (const fact of pins) {
    if (fact.type !== "anchor-pin" && fact.type !== "size-pin") continue;
    if (fact.owner === "self-placement") continue; // weak seed, not a strong fact
    if (fact.type === "anchor-pin" && fact.anchor === "baseline") continue; // baseline is not a size box key
    // start→min, middle→center, end→max — the same edge classification
    // `anchorOffset` applies (a non-canonical value falls to the same branch).
    // A size-pin (#726, align `"size"`) writes the `size` key directly,
    // independent of any anchor.
    const boxKey =
      fact.type === "size-pin"
        ? "size"
        : fact.anchor === "start"
          ? "min"
          : fact.anchor === "middle"
            ? "center"
            : "max";
    let box = boxes.get(fact.node);
    if (!box) {
      boxes.set(fact.node, (box = new BBox(A)));
      boxOwner.set(fact.node, fact.owner);
    }
    const conflict = box.add(boxKey, fact.value, fact.owner);
    if (conflict) {
      conflicts.push({
        axis,
        owner: conflict.owner ?? fact.owner,
        priorOwner: conflict.priorOwner ?? boxOwner.get(fact.node) ?? "cell",
        asserted: conflict.asserted,
        implied: conflict.implied,
      });
    }
  }
  const sizes = new Map<NodeId, T>();
  const owners = new Map<NodeId, string>();
  for (const [node, box] of boxes) {
    // Not gated on `box.solved`: a rank-1 box holding only a direct `"size"`
    // pin (align `"size"`, no companion anchor) still reads its size back
    // (`BBox.read` falls back to the direct pin when under-determined) — that
    // is exactly the "size without a determined position" case.
    const size = box.readValue("size");
    if (size !== undefined) {
      sizes.set(node, size);
      owners.set(node, boxOwner.get(node)!);
    }
  }
  return { sizes, owners, conflicts };
}

/** The offset of `node`'s `anchor` from its `min` on `axis`. A size-strong
 *  (interval/span) cell's reads straight off its closed size, now that sizes
 *  are known; any other cell's off its target's layout. */
function nodeAnchorOffset<T>(
  A: Arith<T>,
  node: NodeId,
  anchor: RelationAnchor,
  axis: Axis,
  strongSizes: Map<NodeId, T>,
  targets: Map<string, SolvePlaceable<T>>,
  span: SpanOf = "box"
): T | undefined {
  const strong = strongSizes.get(node);
  if (strong !== undefined) return strongAnchorOffset(A, strong, anchor);
  const target = targets.get(node);
  return target && anchorOffset(A, target, axis, anchor, span);
}

/** The offset from the `min` of the chain part `node` of the chain's 0,
 *  `origin` ({@link StackPoint}), when the part carries it (`offsetOf`
 *  gives each anchor's offset on a node from that node's `min`): a point on
 *  the part, which is a place on the path of that one part from its tail to
 *  its head, a place along the chain's path ({@link ChainPath}), which
 *  adds each part's way through and the gaps between them, or a stack's
 *  part's data offset before its tail. */
function stackOriginOffset<T>(
  A: Arith<T>,
  offsetOf: (node: NodeId, anchor: RelationAnchor) => T | undefined,
  node: NodeId,
  origin: StackPoint<T>
): T | undefined {
  if ("tail" in origin) {
    const tail = offsetOf(node, "tail");
    return tail === undefined ? undefined : A.sub(tail, origin.tail);
  }
  // A word names a point of the part as `alignment` does: a point of its
  // box, or its own 0 (`"baseline"`), which for a part with a data baseline
  // is its tail, and for a nested spread or stack is where its baseline is.
  const fraction = "along" in origin ? origin.along : origin.point;
  if (typeof fraction !== "number") return offsetOf(node, fraction);
  const path: ChainPath<T> =
    "along" in origin
      ? origin.chain
      : { parts: [node], start: "tail", end: "head", from: "head", to: "tail" };
  const start = offsetOf(node, path.start);
  if (fraction === 0 || start === undefined) return start;
  const last = path.parts.length - 1;
  let length = A.zero;
  for (let i = 0; i <= last; i++) {
    const part = path.parts[i];
    const entry = offsetOf(part, i === 0 ? path.start : path.to);
    const exit = offsetOf(part, i === last ? path.end : path.from);
    if (entry === undefined || exit === undefined) return undefined;
    length = A.add(length, A.sub(exit, entry));
    if (i > 0 && path.gap !== undefined) length = A.add(length, path.gap);
  }
  return A.add(start, A.scale(fraction, length));
}

/** Reduce one axis's anchor facts to a `min`-anchored {@link AxisProblem}, using
 *  the closed sizes to substitute each anchor's offset from `min`. */
function reduceToAxisProblem<T>(
  A: Arith<T>,
  axis: Axis,
  facts: AnchorFact<T>[],
  strongSizes: Map<NodeId, T>,
  targets: Map<string, SolvePlaceable<T>>,
  apart?: Set<string>
): AxisProblem<T> {
  const relations: AxisProblem<T>["relations"] = [];
  const pins: PlacementPinClaim<T>[] = [];
  const participantFacts: AxisProblem<T>["participantFacts"] = [];
  const participants = new Set<NodeId>();
  const chainAnchors = new Map<NodeId, T>();

  // A chain lays its parts by their plots (`anchorOffset`'s `span`).
  const resolveOffset = (
    node: NodeId,
    anchor: RelationAnchor,
    span: SpanOf = "box"
  ) => nodeAnchorOffset(A, node, anchor, axis, strongSizes, targets, span);
  // A chain edge between two parts of the plot lays them by their plots.
  // One to a part that is no part of the plot (dressing, chrome) lays that
  // part by its whole box and the other by its box without its dressing:
  // an axis line sits past its own box, beside what it dresses less the
  // outlines and labels that dress it, which draw over it. Inner chrome is
  // no dressing, so a title sits past the tick labels.
  const chainSpan = (isApart: boolean, otherApart: boolean): SpanOf =>
    isApart ? "box" : otherApart ? "bare" : "plot";

  for (const fact of facts) {
    // A size-pin only feeds `closeSizes`'s box closure (above) — it has no
    // anchor/position content of its own, so the difference graph never sees
    // it. When it stays rank-1 (no companion anchor pin lands on this node),
    // the target's size is under-determined here and keeps whatever its own
    // layout gave it — exactly "size" without movement.
    if (fact.type === "size-pin") continue;
    if (fact.type === "anchor-pin") {
      const offset = resolveOffset(fact.node, fact.anchor);
      if (offset === undefined) continue;
      participants.add(fact.node);
      pins.push({
        node: fact.node,
        value: A.sub(fact.value, offset),
        owner: fact.owner,
      });
      continue;
    }
    if (fact.type === "anchor-relation") {
      const chain = fact.chain !== undefined;
      const fromApart = apart?.has(fact.from.node) === true;
      const toApart = apart?.has(fact.to.node) === true;
      const fromOffset = resolveOffset(
        fact.from.node,
        fact.from.anchor,
        chain ? chainSpan(fromApart, toApart) : "box"
      );
      const toOffset = resolveOffset(
        fact.to.node,
        fact.to.anchor,
        chain ? chainSpan(toApart, fromApart) : "box"
      );
      if (fromOffset === undefined || toOffset === undefined) continue;
      participants.add(fact.from.node);
      participants.add(fact.to.node);
      // A chain of baselines (a fixed pitch between origins) starts at its
      // first member's origin; any other chain starts at its first member's
      // start edge.
      if (
        fact.chain === true &&
        fact.from.anchor === "baseline" &&
        fact.to.anchor === "baseline"
      ) {
        chainAnchors.set(fact.from.node, fromOffset);
        chainAnchors.set(fact.to.node, toOffset);
      }
      relations.push(
        relationFact(
          anchorExpr(fact.from.node, axis, "start"),
          anchorExpr(fact.to.node, axis, "start"),
          A.sub(A.add(fromOffset, fact.gap), toOffset),
          fact.owner,
          fact.chain
        )
      );
      continue;
    }
    // anchor-participant
    participants.add(fact.node);
    participantFacts.push(participantFact(fact.node, axis, fact.owner));
  }

  return { relations, pins, participantFacts, participants, chainAnchors };
}

/** Solve one axis's anchor program into `(min, size)` per node, plus any cell or
 *  graph over-determination conflicts. */
function solveRank2Axis<T>(
  A: Arith<T>,
  axis: Axis,
  facts: AnchorFact<T>[],
  targets: Map<string, SolvePlaceable<T>>,
  freeOrigin: T | undefined,
  apart?: Set<string>
): SolvedAxis<T> {
  const {
    sizes,
    owners,
    conflicts: sizeConflicts,
  } = closeSizes(A, axis, facts);
  const problem = reduceToAxisProblem(A, axis, facts, sizes, targets, apart);
  const idx = axisIndex(axis);
  // The participants that carry a baseline the free origin may seat, and each
  // one's baseline offset from its `min` (#773). A free participant (a
  // baseline magnitude) carries its own. A chain along the axis places its
  // members' baselines instead, so it carries one only where it states its
  // 0: its origin (`AnchorParticipantFact.origin`), on whichever part
  // carries it, a size-strong part included. A spread states one only when
  // it is given a `baseline`; one that is not keeps its sequence origin, its
  // start. A stack has no chain: every part carries the stack's 0, as its
  // data offset before its tail.
  //
  // A node's 0 is where its baseline says. A chain that says where (its
  // origin) has its origin seated at the layer's data 0, or at the layer's
  // own 0 (pixel 0) where the layer has no data 0: a stack whose 0 is its
  // middle has no data 0, and its 0 is still its middle. A free
  // participant's baseline is its data 0, which only a layer with a data 0
  // seats.
  const freeBaselines = new Map<NodeId, T>();
  const placedByChain = new Set<NodeId>();
  const stackOrigins = new Map<NodeId, StackPoint<T>>();
  for (const fact of facts) {
    if (fact.type === "anchor-participant" && fact.origin !== undefined)
      stackOrigins.set(fact.node, fact.origin);
    if (fact.type !== "anchor-relation" || !fact.chain) continue;
    placedByChain.add(fact.from.node);
    placedByChain.add(fact.to.node);
  }
  const baselineOffset = (node: NodeId): T | undefined => {
    const origin = stackOrigins.get(node);
    if (origin !== undefined)
      return stackOriginOffset(
        A,
        (n, anchor) => nodeAnchorOffset(A, n, anchor, axis, sizes, targets),
        node,
        origin
      );
    // An interval (size-strong) has no baseline, and a chain places its
    // other members' baselines.
    if (freeOrigin === undefined || sizes.has(node) || placedByChain.has(node))
      return undefined;
    const target = targets.get(node);
    return target && freeBaselineOffset(A, target, axis);
  };
  for (const node of problem.participants) {
    const offset = baselineOffset(node);
    if (offset !== undefined) freeBaselines.set(node, offset);
  }
  const { positions, conflicts: graphConflicts } = solveAxisProblem(
    A,
    axis,
    problem,
    {
      value: freeOrigin ?? A.zero,
      baselines: freeBaselines,
      stated: new Set(stackOrigins.keys()),
    }
  );

  const cells = new Map<NodeId, SolvedCell<T>>();
  for (const [node, min] of positions) {
    const strong = sizes.get(node);
    const size = strong ?? targets.get(node)?.dims[idx].size;
    cells.set(node, {
      min,
      size,
      sizeStrong: strong !== undefined,
      sizeOwner: owners.get(node),
    });
  }
  // A determined size with no solved position: align `"size"` with no
  // companion anchor pin never becomes a difference-graph participant, so it
  // never surfaces in `positions` above — it still needs a write-back, just
  // the size, with no position coupling (#726).
  const sizeOnly = new Map<NodeId, { size: T; owner: string }>();
  for (const [node, size] of sizes) {
    if (cells.has(node)) continue;
    sizeOnly.set(node, { size, owner: owners.get(node)! });
  }
  return { cells, sizeOnly, conflicts: [...sizeConflicts, ...graphConflicts] };
}

/** One axis of a solve: each placed cell, each cell given a size and no
 *  place, and the over-determinations found. */
export type SolvedAxis<T = number> = {
  cells: Map<NodeId, SolvedCell<T>>;
  sizeOnly: Map<NodeId, { size: T; owner: string }>;
  conflicts: PlacementConflict[];
};

/** A nested operand (see `NestedOperand`) rigidly attached to the layer
 *  child that contains it: `operand.min = container.min + gap` per axis. */
export type RigidAttachment<T = number> = { container: string; gap: [T, T] };

/**
 * Solve the placement of `targets` under `constraints` into a box per (node,
 * axis), without writing it back. The claim walk solves it once per layer
 * and axis, and layout writes back what it evaluates to
 * (`claimPlacement.ts`, `layer`).
 */
export function solvePlacementCells<T>(
  A: Arith<T>,
  constraints: PlacementConstraint[],
  keyOf: KeyOf,
  targets: Map<string, SolvePlaceable<T>>,
  // The layer's box on each axis, which a discrete position divides.
  sizes: readonly [T, T],
  // The gap a chain or table lays out between its parts (`GoFishNode.gapOf`).
  gapOf: GapOf,
  // The frame each `position` maps its datums through (`ScaleOf`).
  scaleOf?: ScaleOf<T>,
  gridTracks?: GridTracks<T>,
  dataPositioned?: [Set<string>, Set<string>],
  rigid?: Map<string, RigidAttachment<T>>,
  freeOrigin?: FreeOrigin<T>,
  // Per axis, the targets that are no part of the plot (dressing, chrome):
  // a chain edge between two others lays them by their plots.
  apart?: [Set<string>, Set<string>]
): readonly [SolvedAxis<T>, SolvedAxis<T>] {
  const lowered = lowerPlacementConstraints(
    A,
    constraints,
    keyOf,
    targets,
    sizes,
    gapOf,
    scaleOf,
    gridTracks,
    dataPositioned
  );
  // Tie each nested operand to its container on every axis it takes part in,
  // so the solve moves the container with it (one rigid body).
  if (rigid) {
    lowered.anchorProgram.axes.forEach((facts, idx) => {
      const axis = axisName(idx as 0 | 1);
      for (const [operand, { container, gap }] of rigid) {
        const mentioned = facts.some((f) =>
          f.type === "anchor-relation"
            ? f.from.node === operand || f.to.node === operand
            : f.node === operand
        );
        if (!mentioned) continue;
        facts.push({
          type: "anchor-relation",
          axis,
          from: { node: container, anchor: "start" },
          to: { node: operand, anchor: "start" },
          gap: gap[idx],
          owner: `nested operand "${operand}"`,
        });
      }
    });
  }

  return [
    solveRank2Axis(
      A,
      "x",
      lowered.anchorProgram.axes[0],
      targets,
      freeOrigin?.[0],
      apart?.[0]
    ),
    solveRank2Axis(
      A,
      "y",
      lowered.anchorProgram.axes[1],
      targets,
      freeOrigin?.[1],
      apart?.[1]
    ),
  ] as const;
}

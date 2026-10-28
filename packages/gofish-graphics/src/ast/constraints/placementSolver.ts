// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import { BBox } from "./bbox";
import { numbers, type Arith } from "../solver/arith";
import {
  lowerPlacementConstraints,
  type PlacementConstraint,
} from "./placementLowering";
import type { TrackLayout } from "./grid";
import {
  axisIndex,
  axisName,
  type Axis,
  type ConstraintPosScales,
  type FreeOrigin,
} from "./shared";
import {
  anchorExpr,
  participantFact,
  relationFact,
  type AnchorFact,
  type RelationAnchor,
  type NodeId,
} from "./placementFacts";
import {
  anchorOffset,
  freeBaselineOffset,
  strongAnchorOffset,
  type SolvePlaceable,
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
 * The solve runs in an {@link Arith} `A`. Layout solves in numbers and writes
 * back ({@link solvePlacementConstraints}); the claim walk solves the same
 * program over its children's claims in values in σ ({@link
 * solvePlacementCells}), so each box it reads is a function of σ.
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
  const boxes = new Map<NodeId, BBox>();
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
      boxes.set(fact.node, (box = new BBox()));
      boxOwner.set(fact.node, fact.owner);
    }
    const conflict = box.add(boxKey, A.toValue(fact.value), fact.owner);
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
    const size = box.readMono("size");
    if (size !== undefined) {
      sizes.set(node, A.fromValue(size));
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
  plot = false
): T | undefined {
  const strong = strongSizes.get(node);
  if (strong !== undefined) return strongAnchorOffset(A, strong, anchor);
  const target = targets.get(node);
  return target && anchorOffset(A, target, axis, anchor, plot);
}

/** The offset from its `min` of the point `fraction` of the way from a stack
 *  part's tail to its head (`offsetOf` gives each anchor's offset): the
 *  stack's origin when the part carries it. */
function stackOriginOffset<T>(
  A: Arith<T>,
  offsetOf: (anchor: RelationAnchor) => T | undefined,
  fraction: number
): T | undefined {
  const tail = offsetOf("tail");
  if (fraction === 0 || tail === undefined) return tail;
  const head = offsetOf("head");
  return head === undefined
    ? undefined
    : A.add(tail, A.scale(fraction, A.sub(head, tail)));
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

  // A chain lays its parts by their plots (`anchorOffset`'s `plot`).
  const resolveOffset = (node: NodeId, anchor: RelationAnchor, plot = false) =>
    nodeAnchorOffset(A, node, anchor, axis, strongSizes, targets, plot);

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
      // A chain edge between two parts of the plot lays them by their
      // plots; one to dressing or chrome places it past the whole box.
      const chain =
        fact.chain !== undefined &&
        apart?.has(fact.from.node) !== true &&
        apart?.has(fact.to.node) !== true;
      const fromOffset = resolveOffset(fact.from.node, fact.from.anchor, chain);
      const toOffset = resolveOffset(fact.to.node, fact.to.anchor, chain);
      if (fromOffset === undefined || toOffset === undefined) continue;
      participants.add(fact.from.node);
      participants.add(fact.to.node);
      // A chain of baselines (a fixed pitch between origins) starts at its
      // first member's origin; any other chain starts at its first member's
      // start edge.
      if (
        fact.chain === "spread" &&
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
  // members' baselines instead, so it carries one only as a stack: its
  // origin (`AnchorParticipantFact.origin`), on whichever part carries it,
  // a size-strong part included. A spread chain carries none and keeps its
  // sequence origin.
  const freeBaselines = new Map<NodeId, T>();
  if (freeOrigin !== undefined) {
    const placedByChain = new Set<NodeId>();
    const stackOrigins = new Map<NodeId, number>();
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
          (anchor) => nodeAnchorOffset(A, node, anchor, axis, sizes, targets),
          origin
        );
      // An interval (size-strong) has no baseline, and a chain places its
      // other members' baselines.
      if (sizes.has(node) || placedByChain.has(node)) return undefined;
      const target = targets.get(node);
      return target && freeBaselineOffset(A, target, axis);
    };
    for (const node of problem.participants) {
      const offset = baselineOffset(node);
      if (offset !== undefined) freeBaselines.set(node, offset);
    }
  }
  const { positions, conflicts: graphConflicts } = solveAxisProblem(
    A,
    axis,
    problem,
    freeOrigin === undefined
      ? undefined
      : { value: freeOrigin, baselines: freeBaselines }
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
export type RigidAttachment = { container: string; gap: [number, number] };

/**
 * Solve the placement of `targets` under `constraints` into a box per (node,
 * axis), without writing it back: the solve {@link solvePlacementConstraints}
 * writes back, which the claim walk also reads to learn where a layer's
 * constraints place its children (`claimPlacement.ts`).
 */
export function solvePlacementCells<T>(
  A: Arith<T>,
  constraints: PlacementConstraint[],
  targets: Map<string, SolvePlaceable<T>>,
  sizes: [number, number],
  posScales?: ConstraintPosScales<T>,
  gridTracks?: [TrackLayout, TrackLayout],
  dataPositioned?: [Set<string>, Set<string>],
  rigid?: Map<string, RigidAttachment>,
  freeOrigin?: FreeOrigin<T>,
  // Per axis, the targets that are no part of the plot (dressing, chrome):
  // a chain edge between two others lays them by their plots.
  apart?: [Set<string>, Set<string>]
): readonly [SolvedAxis<T>, SolvedAxis<T>] {
  const lowered = lowerPlacementConstraints(
    A,
    constraints,
    targets,
    sizes,
    posScales,
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
          gap: A.constant(gap[idx]),
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

export function solvePlacementConstraints(
  constraints: PlacementConstraint[],
  targets: Map<string, Placeable>,
  sizes: [number, number],
  posScales?: ConstraintPosScales,
  gridTracks?: [TrackLayout, TrackLayout],
  dataPositioned?: [Set<string>, Set<string>],
  rigid?: Map<string, RigidAttachment>,
  freeOrigin?: FreeOrigin,
  apart?: [Set<string>, Set<string>]
): PlacementConflict[] {
  const solved = solvePlacementCells(
    numbers,
    constraints,
    targets,
    sizes,
    posScales,
    gridTracks,
    dataPositioned,
    rigid,
    freeOrigin,
    apart
  );
  const conflicts = solved.flatMap((result) => result.conflicts);
  if (conflicts.length > 0) {
    const conflict = conflicts[0];
    throw new Error(
      `Constraint placement conflict on ${conflict.axis}: ${conflict.owner} ` +
        `asserts ${conflict.asserted}, but ${conflict.priorOwner} implies ` +
        `${conflict.implied}`
    );
  }

  // Single write-back per solved cell (replaces the three-way branch): a
  // size-strong cell (rank-2 determined) sets its extent; a position-only cell
  // pins its `min` anchor.
  solved.forEach((result, axisIndexValue) => {
    const axis = axisIndexValue as 0 | 1;
    const axisLabel = axisName(axis);
    for (const [name, cell] of result.cells) {
      const target = targets.get(name);
      if (!target) continue;
      if (cell.sizeStrong && cell.size !== undefined && target.setExtent) {
        target.setExtent(
          axisLabel,
          { min: cell.min, max: cell.min + cell.size },
          cell.sizeOwner
        );
      } else if (target.pinAnchor) target.pinAnchor(axis, cell.min, "min");
      else target.place(axis, cell.min, "min");
    }
    for (const [name, { size, owner }] of result.sizeOnly) {
      const target = targets.get(name);
      target?.setSizeOnly?.(axisLabel, size, owner);
    }
  });
  return conflicts;
}

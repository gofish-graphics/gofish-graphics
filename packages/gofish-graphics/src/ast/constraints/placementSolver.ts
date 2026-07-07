// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import { BBox } from "./bbox";
import {
  lowerPlacementConstraints,
  type PlacementConstraint,
} from "./placementLowering";
import type { TrackLayout } from "./grid";
import {
  axisIndex,
  type AlignAnchor,
  type Axis,
  type ConstraintPosScales,
} from "./shared";
import {
  anchorExpr,
  participantFact,
  relationFact,
  type AnchorFact,
  type NodeId,
} from "./placementFacts";
import { anchorOffset } from "./placementProgramLowerer";
import {
  axisName,
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
 */

/** A solved (node, axis) box: absolute `min`, `size`, and whether the size was
 *  rank-2 determined by strong pins (so the write-back sets the extent). */
export type SolvedCell = {
  min: number;
  size: number | undefined;
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
function closeSizes(
  axis: Axis,
  pins: AnchorFact[]
): {
  sizes: Map<NodeId, number>;
  owners: Map<NodeId, string>;
  conflicts: PlacementConflict[];
} {
  const boxes = new Map<NodeId, BBox>();
  const boxOwner = new Map<NodeId, string>();
  const conflicts: PlacementConflict[] = [];
  for (const fact of pins) {
    if (fact.type !== "anchor-pin") continue;
    if (fact.owner === "self-placement") continue; // weak seed, not a strong fact
    if (fact.anchor === "baseline") continue; // baseline is not a size box key
    // start→min, middle→center, end→max — the same edge classification
    // `anchorOffset` applies (a non-canonical value falls to the same branch).
    const boxKey =
      fact.anchor === "start"
        ? "min"
        : fact.anchor === "middle"
          ? "center"
          : "max";
    let box = boxes.get(fact.node);
    if (!box) {
      boxes.set(fact.node, (box = new BBox()));
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
  const sizes = new Map<NodeId, number>();
  const owners = new Map<NodeId, string>();
  for (const [node, box] of boxes) {
    if (!box.solved) continue;
    const size = box.read("size");
    if (size !== undefined) {
      sizes.set(node, size);
      owners.set(node, boxOwner.get(node)!);
    }
  }
  return { sizes, owners, conflicts };
}

/** Reduce one axis's anchor facts to a `min`-anchored {@link AxisProblem}, using
 *  the closed sizes to substitute each anchor's offset from `min`. */
function reduceToAxisProblem(
  axis: Axis,
  facts: AnchorFact[],
  strongSizes: Map<NodeId, number>,
  targets: Map<string, Placeable>
): AxisProblem {
  const relations: AxisProblem["relations"] = [];
  const pins: PlacementPinClaim[] = [];
  const participantFacts: AxisProblem["participantFacts"] = [];
  const participants = new Set<NodeId>();

  const resolveOffset = (
    node: NodeId,
    anchor: AlignAnchor
  ): number | undefined => {
    // A size-strong (interval/span) cell's local frame is `[0, size]`, so its
    // anchor offsets read straight off the closed size — the substitution that
    // was the `spannedSize` branch of `anchorOffset`, now that sizes are known.
    const strong = strongSizes.get(node);
    if (strong !== undefined) {
      if (anchor === "start" || anchor === "baseline") return 0;
      return anchor === "middle" ? Math.abs(strong) / 2 : Math.abs(strong);
    }
    const target = targets.get(node);
    if (!target) return undefined;
    return anchorOffset(target, axis, anchor);
  };

  for (const fact of facts) {
    if (fact.type === "anchor-pin") {
      const offset = resolveOffset(fact.node, fact.anchor);
      if (offset === undefined) continue;
      participants.add(fact.node);
      pins.push({
        node: fact.node,
        value: fact.value - offset,
        owner: fact.owner,
      });
      continue;
    }
    if (fact.type === "anchor-relation") {
      const fromOffset = resolveOffset(fact.from.node, fact.from.anchor);
      const toOffset = resolveOffset(fact.to.node, fact.to.anchor);
      if (fromOffset === undefined || toOffset === undefined) continue;
      participants.add(fact.from.node);
      participants.add(fact.to.node);
      relations.push(
        relationFact(
          anchorExpr(fact.from.node, axis, "start"),
          anchorExpr(fact.to.node, axis, "start"),
          fromOffset + fact.gap - toOffset,
          fact.owner
        )
      );
      continue;
    }
    // anchor-participant
    participants.add(fact.node);
    participantFacts.push(participantFact(fact.node, axis, fact.owner));
  }

  return { relations, pins, participantFacts, participants };
}

/** Solve one axis's anchor program into `(min, size)` per node, plus any cell or
 *  graph over-determination conflicts. */
function solveRank2Axis(
  axis: Axis,
  facts: AnchorFact[],
  targets: Map<string, Placeable>
): { cells: Map<NodeId, SolvedCell>; conflicts: PlacementConflict[] } {
  const { sizes, owners, conflicts: sizeConflicts } = closeSizes(axis, facts);
  const problem = reduceToAxisProblem(axis, facts, sizes, targets);
  const { positions, conflicts: graphConflicts } = solveAxisProblem(
    axis,
    problem
  );

  const idx = axisIndex(axis);
  const cells = new Map<NodeId, SolvedCell>();
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
  return { cells, conflicts: [...sizeConflicts, ...graphConflicts] };
}

export function solvePlacementConstraints(
  constraints: PlacementConstraint[],
  targets: Map<string, Placeable>,
  sizes: [number, number],
  posScales?: ConstraintPosScales,
  gridTracks?: [TrackLayout, TrackLayout],
  dataPositioned?: [Set<string>, Set<string>]
): PlacementConflict[] {
  const lowered = lowerPlacementConstraints(
    constraints,
    targets,
    sizes,
    posScales,
    gridTracks,
    dataPositioned
  );

  const solved = [
    solveRank2Axis("x", lowered.anchorProgram.axes[0], targets),
    solveRank2Axis("y", lowered.anchorProgram.axes[1], targets),
  ] as const;
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
  });
  return conflicts;
}

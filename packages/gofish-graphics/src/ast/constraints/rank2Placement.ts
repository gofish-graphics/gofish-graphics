// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import { BBox } from "./bbox";
import { axisIndex, type AlignAnchor, type Axis } from "./shared";
import { envFlag } from "../../util";
import {
  anchorExpr,
  participantFact,
  relationFact,
  type AnchorFact,
  type AnchorProgram,
  type NodeId,
} from "./placementFacts";
import { anchorOffset } from "./placementProgramLowerer";
import {
  axisName,
  placementKey,
  solveAxisProblem,
  type AxisProblem,
  type PlacementPinClaim,
} from "./differenceGraph";
import type { SpanExtent } from "./span";

/**
 * The rank-2 placement solve (#39 stage 5), run in SHADOW alongside the shipped
 * rank-1 solver (`placementSolver.ts`). It consumes the anchor program — facts
 * that name a node anchor without the pre-evaluated `min` offset — and resolves
 * each (node, axis) box `(min, size)` in two phases:
 *
 *   1. Cell closure. A per-node {@link BBox} fed the node's STRONG anchor pins
 *      (constraint-owned; not the weak `self-placement` seed). A cell that
 *      reaches rank 2 — an interval/span target's two edges — has its size
 *      determined and its local frame reset to `[0, size]`; every other cell
 *      takes its weak layout size. This is exactly `setExtent`'s two-tier reset
 *      rule, made explicit.
 *   2. Difference graph. With sizes known, every anchor reduces to `min + offset`
 *      via the SAME {@link anchorOffset} arithmetic the shipped lowering does —
 *      just moved from lowering-time to post-closure. The reduced pins/relations
 *      go through the shared {@link solveAxisProblem} (BFS components, pin
 *      offsets, distribute/normalized origins), unchanged.
 *
 * The result is compared to the shipped positions (final `min`) and sizes
 * (span extent, else layout size) per (node, axis). By construction the two
 * agree — the reduction reproduces `classifyAxisFacts` — so a divergence is a
 * bug in the port (or a case the rank-2 model can't reproduce), logged once
 * behind `GOFISH_SOLVER_CHECK`.
 */

const TOLERANCE = 1e-6;
const enabled = (): boolean => envFlag("GOFISH_SOLVER_CHECK");

// Report each tag once so a story's output stays readable (mirrors the ledger
// and shadow.ts discipline). A gate cares about "any divergence", not the count.
const _reported = new Set<string>();
function report(tag: string, rank2: number, shipped: number): void {
  if (_reported.has(tag)) return;
  _reported.add(tag);
  console.warn(
    `[solver-check] ${tag}: rank2=${rank2} rank1=${shipped} (Δ=${rank2 - shipped})`
  );
}

type Rank2Box = { min: number; size: number | undefined };

/** Cell closure for one axis: each node's size-strong extent (undefined when the
 *  node's size falls to its weak layout default). Only STRONG pins participate —
 *  the `self-placement` seed is weak and never determines the box. */
function closeSizes(pins: AnchorFact[]): Map<NodeId, number> {
  const boxes = new Map<NodeId, BBox>();
  for (const fact of pins) {
    if (fact.type !== "anchor-pin") continue;
    if (fact.owner === "self-placement") continue; // weak seed, not a strong fact
    if (fact.anchor === "baseline") continue; // baseline is not a size-determining box key
    // start→min, middle→center, end→max — same edge classification `anchorOffset`
    // applies (a non-canonical `max`/`min` value falls to the same branch there).
    const boxKey =
      fact.anchor === "start"
        ? "min"
        : fact.anchor === "middle"
          ? "center"
          : "max";
    let box = boxes.get(fact.node);
    if (!box) boxes.set(fact.node, (box = new BBox()));
    box.add(boxKey, fact.value, fact.owner);
  }
  const strong = new Map<NodeId, number>();
  for (const [node, box] of boxes) {
    if (!box.solved) continue;
    const size = box.read("size");
    if (size !== undefined) strong.set(node, size);
  }
  return strong;
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
    const target = targets.get(node);
    if (!target) return undefined;
    return anchorOffset(target, axis, anchor, strongSizes.get(node));
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

/** Solve one axis's anchor program into `(min, size)` per node. */
function solveRank2Axis(
  axis: Axis,
  facts: AnchorFact[],
  targets: Map<string, Placeable>
): Map<NodeId, Rank2Box> {
  const strongSizes = closeSizes(facts);
  const problem = reduceToAxisProblem(axis, facts, strongSizes, targets);
  const { positions } = solveAxisProblem(axis, problem);

  const idx = axisIndex(axis);
  const out = new Map<NodeId, Rank2Box>();
  for (const [node, min] of positions) {
    const strong = strongSizes.get(node);
    const size = strong ?? targets.get(node)?.dims[idx].size;
    out.set(node, { min, size });
  }
  return out;
}

/**
 * Shadow entry point: run the rank-2 solve on both axes and compare to the
 * shipped rank-1 positions/sizes. Reads pre-commit target state (the shadow runs
 * before the commit mutates targets), exactly as the shipped lowering did.
 * Zero-cost unless `GOFISH_SOLVER_CHECK` is set.
 */
export function shadowCheckRank2Placement(
  anchorProgram: AnchorProgram,
  shippedPositions: [Map<NodeId, number>, Map<NodeId, number>],
  spanExtents: Map<string, SpanExtent>,
  targets: Map<string, Placeable>
): void {
  if (!enabled()) return;

  for (const axis of ["x", "y"] as const) {
    const idx = axisIndex(axis);
    const rank2 = solveRank2Axis(axis, anchorProgram.axes[idx], targets);
    const shipped = shippedPositions[idx];

    for (const [node, box] of rank2) {
      const shippedMin = shipped.get(node);
      if (shippedMin === undefined) {
        // Rank-2 placed a node the shipped solver did not — a membership
        // divergence (should not happen: both programs share the same guards).
        report(`rank2.placed-extra ${axis} ${node}`, box.min, NaN);
        continue;
      }
      if (Math.abs(box.min - shippedMin) > TOLERANCE) {
        report(`rank2.min ${axis} ${node}`, box.min, shippedMin);
      }

      // Shipped size: a span target's determined extent, else the node's layout
      // size (unchanged by the pending commit for a non-span node).
      const span = spanExtents.get(placementKey(axisName(idx), node));
      const shippedSize = span?.size ?? targets.get(node)?.dims[idx].size;
      if (
        box.size !== undefined &&
        shippedSize !== undefined &&
        Math.abs(box.size - shippedSize) > TOLERANCE
      ) {
        report(`rank2.size ${axis} ${node}`, box.size, shippedSize);
      }
    }

    // A node the shipped solver placed but rank-2 dropped is also a divergence.
    for (const [node, shippedMin] of shipped) {
      if (!rank2.has(node)) {
        report(`rank2.dropped ${axis} ${node}`, NaN, shippedMin);
      }
    }
  }
}

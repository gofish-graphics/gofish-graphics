// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { AlignAnchor, AlignValue, Axis, ConstraintRef } from "./shared";
import { axisIndex, type KeyOf } from "./shared";
import { MeanOperand, meanLeaves, nodesRead, type AlignOperand } from "./mean";
import { isUNDEFINED } from "../underlyingSpace";
import type { PlacementFactEmitter } from "./placementFacts";
import type { SolvePlaceable } from "./placementProgramLowerer";
import type { Arith } from "../solver/arith";

/**
 * Value spec for one axis of an `align` constraint. A single anchor
 * is shared by every operand (the common case). An array gives each operand
 * its own anchor positionally — `align({x: ["middle", "start"]}, [A, B])`
 * aligns A's center with B's start. The array length must equal the number
 * of operands. `"span"`/`"size"` (#726) are whole-constraint values, not
 * per-operand — a heterogeneous array of point anchors has no span/size
 * equivalent, so they are rejected inside an array (see `normalizedAnchors`).
 */
export type AlignAxisSpec = AlignValue | AlignAnchor[];

export interface AlignConstraint {
  type: "align";
  x?: AlignAxisSpec;
  y?: AlignAxisSpec;
  /** The operands as written: nodes, and means of positions
   *  ({@link MeanOperand}). Every operand is at the same point on each
   *  axis; a mean's point is the mean of its operands' anchors. */
  operands: AlignOperand[];
  /** Every node the align reads, in order (`nodesRead`): its node operands
   *  and the nodes its means average. This is what every constraint names
   *  as its `children`, which the passes that resolve and place nodes
   *  read. */
  children: ConstraintRef[];
}

export interface AlignOptions {
  x?: AlignAxisSpec;
  y?: AlignAxisSpec;
}

export const createAlignConstraint = (
  { x, y }: AlignOptions,
  operands: AlignOperand[]
): AlignConstraint => {
  if (x === undefined && y === undefined) {
    throw new Error(
      "Constraint.align: at least one of `x` or `y` must be specified"
    );
  }
  const means = operands.filter((o) => o instanceof MeanOperand);
  if (means.length > 0) {
    for (const [axis, spec] of [
      ["x", x],
      ["y", y],
    ] as const)
      if (spec === "span" || spec === "size")
        throw new Error(
          `Constraint.align: "${spec}" on ${axis} copies the extent of an ` +
            `operand that is already placed, but ${means[0].name} is a ` +
            `position, not a node: it has no extent of its own, and the ` +
            `solve places it with the rest. Use a point anchor ("start", ` +
            `"middle", "end", "baseline") with a mean.`
        );
    if (means.length === operands.length)
      throw new Error(
        `Constraint.align: every operand (${operands
          .map((o) => o.name)
          .join(", ")}) is a mean. A mean is placed by the nodes it ` +
          `averages, so means set equal to each other place no node; ` +
          `align at least one node to a mean.`
      );
  }
  return { type: "align", x, y, operands, children: nodesRead(operands) };
};

function normalizedAnchors(
  spec: AlignAnchor | AlignAnchor[],
  count: number
): AlignAnchor[] {
  if (!Array.isArray(spec)) return new Array<AlignAnchor>(count).fill(spec);
  if (spec.length !== count) {
    throw new Error(
      `Constraint.align: anchor array length ${spec.length} must match number of operands ${count}`
    );
  }
  return spec;
}

export function lowerAlignPlacement<T>(
  constraint: AlignConstraint,
  owner: string,
  {
    A,
    emitter,
    targets,
    keyOf,
    isPinned,
    isDataPositioned,
  }: {
    A: Arith<T>;
    emitter: PlacementFactEmitter<T>;
    targets: Map<string, SolvePlaceable<T>>;
    keyOf: KeyOf;
    isPinned: (axis: Axis, key: string) => boolean;
    isDataPositioned: (axis: 0 | 1, key: string) => boolean;
  }
): void {
  // The operands this solve places, each with its key, read once.
  const children = constraint.children
    .map((ref) => ({ ref, key: keyOf(ref) }))
    .filter(({ key }) => targets.has(key));

  /**
   * `"span"`/`"size"` (#726): equate an interval statistic against the first
   * PINNED (already-placed) child — the source — rather than a point anchor.
   * Scope: the unbound-target case only (§3.5 of
   * operators-over-placed-nodes.md) — a target with no intrinsic size on this
   * axis (`isUNDEFINED` on its resolved space). A target that already has an
   * intrinsic size is an ownership conflict (two writers for one cell): report
   * it, don't clobber or silently skip.
   */
  const emitSpanOrSize = (axis: Axis, kind: "span" | "size") => {
    const idx = axisIndex(axis);
    if (children.length < 2) return;
    const source = children.find(({ key }) => isPinned(axis, key));
    if (!source) {
      throw new Error(
        `Constraint.align: "${kind}" on axis "${axis}" (${owner}) needs an ` +
          `already-placed source — none of [${children
            .map((c) => c.ref.name)
            .join(", ")}] is placed yet.`
      );
    }
    const placed = targets.get(source.key)!;
    const sourceMin = placed.dims[idx].min;
    const sourceSize = placed.dims[idx].size;
    if (sourceMin === undefined || sourceSize === undefined) {
      throw new Error(
        `Constraint.align: "${kind}" on axis "${axis}" (${owner}) source ` +
          `"${source.ref.name}" has no resolved extent yet.`
      );
    }
    for (const { ref, key } of children) {
      if (key === source.key) continue;
      const target = targets.get(key)!;
      const space = target.spaceOn?.(idx);
      if (space === undefined || !isUNDEFINED(space)) {
        throw new Error(
          `Constraint.align: "${kind}" on axis "${axis}" (${owner}) cannot ` +
            `set "${ref.name}"'s ${
              kind === "size" ? "size" : "position and size"
            } — it already has an intrinsic ${
              axis === "x" ? "width" : "height"
            } (writer: "${ref.name}"'s own size option). "${kind}" only ` +
            `applies to a target with no intrinsic size on that axis.`
        );
      }
      if (kind === "span") {
        emitter.pin({
          axis,
          target: { key, anchor: "start" },
          value: sourceMin,
          owner,
        });
        emitter.pin({
          axis,
          target: { key, anchor: "end" },
          value: A.add(sourceMin, sourceSize),
          owner,
        });
      } else {
        emitter.pinSize({ axis, key, value: sourceSize, owner });
      }
    }
  };

  const emit = (axis: Axis, spec: AlignAxisSpec | undefined) => {
    if (spec === undefined) return;
    if (spec === "span" || spec === "size") {
      emitSpanOrSize(axis, spec);
      return;
    }
    // Each operand's anchor, by its place among the operands as written.
    const anchors = normalizedAnchors(spec, constraint.operands.length);
    const entries = constraint.operands.flatMap((ref, index) =>
      ref instanceof MeanOperand
        ? []
        : [{ ref, key: keyOf(ref), anchor: anchors[index] }]
    );
    const nodes = entries.filter(({ key }) => targets.has(key));
    if (nodes.length === 0) return;
    alignNodes(axis, nodes);
    // A mean is one more operand at the same point: the first node's anchor
    // is at the mean of the same anchor of the nodes the mean averages. A
    // mean any of whose nodes this solve does not place is left out, as a
    // relation to such a node is.
    constraint.operands.forEach((operand, index) => {
      if (!(operand instanceof MeanOperand)) return;
      const leaves = meanLeaves(operand).map(({ ref, weight }) => ({
        key: keyOf(ref),
        anchor: anchors[index],
        weight,
      }));
      if (!leaves.every(({ key }) => targets.has(key))) return;
      emitter.mean({
        axis,
        target: { key: nodes[0].key, anchor: nodes[0].anchor },
        operands: leaves,
        owner,
      });
    });
  };

  /** Put the node operands at one point on `axis`. */
  const alignNodes = (
    axis: Axis,
    entries: { ref: ConstraintRef; key: string; anchor: AlignAnchor }[]
  ) => {
    const idx = axisIndex(axis);

    // Two-phase semantics:
    // 1. the first already-placed target can define the shared baseline;
    // 2. already-placed targets are not themselves moved.
    //
    // Keeping these separate matters for chart+legend layers: the chart may
    // be the baseline source while the legend is the only target align
    // writes. A target its own data places (`placedByOwnData`: a scatter
    // facet panel, a `region` in its cell) is placed before the solve, so
    // it is pinned, and is never moved either.
    const source = entries.find(({ key }) => isPinned(axis, key));
    const movable = entries.filter(
      ({ key }) => !isPinned(axis, key) && !isDataPositioned(idx, key)
    );
    if (movable.length === 0) {
      // Nothing this constraint can write is either the deliberate
      // data-positioned case (scatter facets, nested partitions: stay
      // silent, `align` never fights a node its own data places) or a
      // genuine "every operand is already placed" no-op, which is worth an
      // honest diagnostic (#725 item 6) rather than a silent nothing.
      if (!entries.some(({ key }) => isDataPositioned(idx, key))) {
        console.warn(
          `[align] ${owner} on axis "${axis}": nothing movable — every ` +
            `operand [${entries.map((c) => c.ref.name).join(", ")}] is ` +
            `already placed.`
        );
      }
      return;
    }

    if (source) {
      for (const target of movable) {
        emitter.relate({
          axis,
          from: { key: source.key, anchor: source.anchor },
          to: { key: target.key, anchor: target.anchor },
          gap: A.zero,
          owner,
        });
      }
      return;
    }

    for (let i = 1; i < movable.length; i++) {
      emitter.relate({
        axis,
        from: { key: movable[0].key, anchor: movable[0].anchor },
        to: { key: movable[i].key, anchor: movable[i].anchor },
        gap: A.zero,
        owner,
      });
    }
    emitter.include({
      axis,
      key: movable[0].key,
      owner,
    });
  };
  emit("x", constraint.x);
  emit("y", constraint.y);
}

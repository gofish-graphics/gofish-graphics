// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { ConstraintRef } from "./shared";

/**
 * The mean of its operands' positions: an operand of `Constraint.align`
 * that is no node. It has no ink and takes no room. On each axis the align
 * reads one anchor of it, and that anchor is the mean of the same anchor of
 * each of its operands: under `"middle"` the mean of their middles, under
 * `"start"` of their starts, under `"baseline"` of their origins. An
 * operand may be a mean itself, which then weighs as one operand
 * ({@link meanLeaves}).
 */
export class MeanOperand {
  constructor(public readonly operands: readonly AlignOperand[]) {}

  /** How the mean reads in a message: `mean(a, b)`. */
  get name(): string {
    return `mean(${this.operands.map((o) => o?.name).join(", ")})`;
  }
}

/** An operand of `Constraint.align`: a node, or a mean of positions. */
export type AlignOperand = ConstraintRef | MeanOperand;

/** The mean of the positions of `operands`, as an operand of
 *  `Constraint.align`. */
export function mean(operands: readonly AlignOperand[]): MeanOperand {
  if (!Array.isArray(operands) || operands.length === 0)
    throw new Error(
      "mean: expected a list of at least one operand, e.g. mean([a, b])."
    );
  return new MeanOperand([...operands]);
}

/** The nodes `operands` read, in order: each node operand, and each node a
 *  mean among them averages, at any depth. A node may appear more than
 *  once. */
export const nodesRead = (operands: readonly AlignOperand[]): ConstraintRef[] =>
  operands.flatMap((o) =>
    o instanceof MeanOperand ? nodesRead(o.operands) : [o]
  );

/** The nodes a mean averages, each with its weight: a mean over `n`
 *  operands gives each `1/n`, and a mean among them shares its weight out
 *  over its own operands, so the weights sum to 1. */
export const meanLeaves = (
  m: MeanOperand,
  weight = 1
): { ref: ConstraintRef; weight: number }[] =>
  m.operands.flatMap((o) =>
    o instanceof MeanOperand
      ? meanLeaves(o, weight / m.operands.length)
      : [{ ref: o, weight: weight / m.operands.length }]
  );

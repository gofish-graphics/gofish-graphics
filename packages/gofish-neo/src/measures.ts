/**
 * Per-node classification measures over the shared label tree. Every
 * measure is defined "one node vs. the rest": `n` plays the role of a class
 * (possibly an aggregate of several leaf classes, for an internal node).
 */

import type { TreeNode } from "./labelTree";
import { total, totalColumn, totalRow, type Matrix } from "./matrix";

export type Measure =
  | "precision"
  | "recall"
  | "accuracy"
  | "countActual"
  | "countObserved"
  | "truePositives"
  | "trueNegatives"
  | "falsePositives"
  | "falseNegatives";

/**
 * True positives for `node`: the sum of the leaf-diagonal `M[c,c]` for each
 * individual LEAF `c` in `node`'s range — NOT the full row/column block sum.
 * For an internal node covering leaves {B, C}, this is `M[B,B] + M[C,C]`,
 * excluding the off-diagonal confusions `M[B,C]` / `M[C,B]` between B and C.
 */
export function truePositives(matrix: Matrix, node: TreeNode): number {
  let sum = 0;
  for (let i = node.start; i < node.end; i++) {
    sum += matrix[i]![i]!;
  }
  return sum;
}

/**
 * Computes TP/FP/FN for `node` from the underlying matrix primitives exactly
 * once each — the shared basis for `falsePositives`/`falseNegatives`/
 * `trueNegatives`/`accuracy`, so a caller that needs more than one of these
 * quantities (e.g. `accuracy`) never recomputes `truePositives` per quantity.
 */
function tpFpFn(
  matrix: Matrix,
  node: TreeNode
): { tp: number; fp: number; fn: number } {
  const tp = truePositives(matrix, node);
  const fp = totalColumn(matrix, node) - tp;
  const fn = totalRow(matrix, node) - tp;
  return { tp, fp, fn };
}

/** False positives for `node`: everything predicted as `node` that wasn't actually `node`. */
export function falsePositives(matrix: Matrix, node: TreeNode): number {
  return tpFpFn(matrix, node).fp;
}

/** False negatives for `node`: everything actually `node` that wasn't predicted as `node`. */
export function falseNegatives(matrix: Matrix, node: TreeNode): number {
  return tpFpFn(matrix, node).fn;
}

/**
 * True negatives for `node`, using the standard one-vs-rest definition:
 * `total() - TP - FP - FN`.
 *
 * Declared divergence from the reference implementation: Apple's
 * ml-hierarchical-confusion-matrix defines TN as
 * `(whole-matrix leaf-diagonal sum) - TP`, i.e. every OTHER class's own
 * diagonal cell counts as a true negative for `node`, while confusions
 * BETWEEN two other classes (neither of which is `node`) are silently
 * excluded from `node`'s true negatives — under that definition
 * `TP + TN + FP + FN` does not equal the grand total. We use the textbook
 * one-vs-rest definition instead, so the four quantities partition the
 * grand total exactly.
 */
export function trueNegatives(matrix: Matrix, node: TreeNode): number {
  const { tp, fp, fn } = tpFpFn(matrix, node);
  return total(matrix) - tp - fp - fn;
}

/** `countActual(node)` = totalRow(node): how many records were actually `node`. */
export function countActual(matrix: Matrix, node: TreeNode): number {
  return totalRow(matrix, node);
}

/** `countObserved(node)` = totalColumn(node): how many records were predicted/observed as `node`. */
export function countObserved(matrix: Matrix, node: TreeNode): number {
  return totalColumn(matrix, node);
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** `precision(node)` = TP / countObserved(node), guarded to 0 when the denominator is 0. */
export function precision(matrix: Matrix, node: TreeNode): number {
  return safeDivide(truePositives(matrix, node), countObserved(matrix, node));
}

/** `recall(node)` = TP / countActual(node), guarded to 0 when the denominator is 0. */
export function recall(matrix: Matrix, node: TreeNode): number {
  return safeDivide(truePositives(matrix, node), countActual(matrix, node));
}

/**
 * `accuracy(node)` = (TP + TN) / (TP + TN + FP + FN). With our textbook TN
 * definition, `TP + TN + FP + FN` equals the grand total, so this is
 * equivalently `(TP + TN) / total()`. Guarded to 0 when the total is 0.
 */
export function accuracy(matrix: Matrix, node: TreeNode): number {
  const { tp, fp, fn } = tpFpFn(matrix, node);
  const tn = total(matrix) - tp - fp - fn;
  return safeDivide(tp + tn, tp + tn + fp + fn);
}

/** Computes the named `measure` for `node` against `matrix`. */
export function computeMeasure(
  measure: Measure,
  matrix: Matrix,
  node: TreeNode
): number {
  switch (measure) {
    case "precision":
      return precision(matrix, node);
    case "recall":
      return recall(matrix, node);
    case "accuracy":
      return accuracy(matrix, node);
    case "countActual":
      return countActual(matrix, node);
    case "countObserved":
      return countObserved(matrix, node);
    case "truePositives":
      return truePositives(matrix, node);
    case "trueNegatives":
      return trueNegatives(matrix, node);
    case "falsePositives":
      return falsePositives(matrix, node);
    case "falseNegatives":
      return falseNegatives(matrix, node);
  }
}

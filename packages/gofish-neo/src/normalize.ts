/**
 * Visual-scaling normalizers: map a (rowNode, colNode) cell's raw count to
 * a `[0, 1]` scale for encoding (color/size). These never change the
 * displayed raw counts — they only describe how the renderer should scale
 * a cell visually.
 */

import { frontier, type TreeNode } from "./labelTree";
import { frequency, totalColumn, totalRow, type Matrix } from "./matrix";
import type { Normalization } from "./spec";

/** Maps a (rowNode, colNode) cell to a `[0, 1]` visual-scale value. */
export type Normalizer = (rowNode: TreeNode, colNode: TreeNode) => number;

/**
 * Builds a normalizer of the given kind:
 *  - `"row"`: value = count / totalRow(rowNode). Guarded to 0 for a
 *    zero-total row (declared divergence: the reference implementation lets
 *    a degenerate 0/0 domain produce NaN; we treat "no data" as 0, never NaN).
 *  - `"column"`: symmetric, over totalColumn(colNode).
 *  - `"total"`: linear rescale over the domain
 *    `[min positive frontier-cell count, max frontier-cell count]`, computed
 *    only over frontier×frontier cells (given `collapsed`). A cell at or
 *    below 0 maps to 0. If every frontier cell is 0 (degenerate domain),
 *    every cell maps to 0 rather than NaN.
 */
export interface NormalizerOptions {
  /**
   * "total" mode only: exclude diagonal (rowNode === colNode) frontier cells
   * from the domain computation, so a handful of dominant correct-prediction
   * cells don't wash out the color/size contrast among the (usually more
   * interesting) confusions. Diagonal cells still render — their value is
   * clamped to the domain max rather than excluded from the output. Ignored
   * for "row"/"column" normalization, which has no shared domain to exclude
   * cells from.
   */
  excludeDiagonal?: boolean;
}

export function buildNormalizer(
  tree: TreeNode,
  matrix: Matrix,
  normalization: Normalization,
  collapsed: Iterable<string> = [],
  options: NormalizerOptions = {}
): Normalizer {
  if (normalization === "row") {
    return (rowNode, colNode) => {
      const denom = totalRow(matrix, rowNode);
      return denom === 0 ? 0 : frequency(matrix, rowNode, colNode) / denom;
    };
  }
  if (normalization === "column") {
    return (rowNode, colNode) => {
      const denom = totalColumn(matrix, colNode);
      return denom === 0 ? 0 : frequency(matrix, rowNode, colNode) / denom;
    };
  }

  // "total": domain is over frontier x frontier cells (optionally excluding
  // the diagonal).
  const frontierNodes = frontier(tree, collapsed);
  let min = Infinity;
  let max = -Infinity;
  for (const r of frontierNodes) {
    for (const c of frontierNodes) {
      if (options.excludeDiagonal && r === c) continue;
      const v = frequency(matrix, r, c);
      if (v > 0) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  const degenerate = !Number.isFinite(min) || !Number.isFinite(max);

  return (rowNode, colNode) => {
    const v = frequency(matrix, rowNode, colNode);
    if (degenerate || v <= 0) return 0;
    if (max === min) return 1;
    // A diagonal cell excluded from the domain can exceed it; clamp rather
    // than let it run past 1.
    return Math.min(1, (v - min) / (max - min));
  };
}

/**
 * Dense leaf×leaf matrix construction and block-sum queries. The tree is
 * shared between axes (see labelTree.ts), so any (rowNode, colNode)
 * frequency is a rectangular sum over `matrix[row.start:row.end][col.start:col.end]`.
 */

import { buildLabelTree, nodeIndex, type TreeNode } from "./labelTree";
import {
  condition,
  dimensions,
  filter as filterRecords,
  linearizeRecords,
  marginalize,
  nest,
  normalizeRecords,
  type Confusion,
} from "./pipeline";
import { applyDefaults, type NeoSpec } from "./spec";

/** Dense leaf×leaf count matrix: `matrix[actualLeafIndex][observedLeafIndex]`. */
export type Matrix = number[][];

/** Result of running the full pipeline: the shared label tree and its dense matrix. */
export interface Built {
  tree: TreeNode;
  matrix: Matrix;
}

/**
 * Runs the fixed pipeline (condition → filter → linearize → nest →
 * marginalize) over `records` according to `spec`, then builds the shared
 * label tree from the resulting leaf labels and a dense leaf×leaf matrix of
 * summed counts.
 */
export function buildMatrix(records: Confusion[], spec: NeoSpec): Built {
  const resolved = applyDefaults(spec);
  const dims = dimensions(records);
  let recs = normalizeRecords(records, dims);
  if (resolved.where) recs = condition(recs, resolved.where);
  if (resolved.filter && resolved.filter.length > 0)
    recs = filterRecords(recs, resolved.filter);
  recs = linearizeRecords(recs);
  recs = nest(recs, resolved.classes);
  const cells = marginalize(recs, resolved.classes[0]!);

  const labels: string[] = [];
  for (const cell of cells) {
    labels.push(cell.actual, cell.observed);
  }
  const tree = buildLabelTree(labels);

  const n = tree.end; // root always covers [0, n)
  const matrix: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  const index = nodeIndex(tree);
  for (const cell of cells) {
    const rowNode = index.get(cell.actual);
    const colNode = index.get(cell.observed);
    if (!rowNode || !colNode) {
      throw new Error(
        `marginalized label "${cell.actual}"/"${cell.observed}" not found in built tree`
      );
    }
    // Cells are leaves of the tree by construction (they were exactly the
    // labels the tree was built from), so each spans exactly one index.
    matrix[rowNode.start]![colNode.start]! += cell.count;
  }

  return { tree, matrix };
}

/** Block-sum frequency for the (rowNode, colNode) cell — the value shown at their intersection. */
export function frequency(
  matrix: Matrix,
  rowNode: TreeNode,
  colNode: TreeNode
): number {
  let sum = 0;
  for (let r = rowNode.start; r < rowNode.end; r++) {
    for (let c = colNode.start; c < colNode.end; c++) {
      sum += matrix[r]![c]!;
    }
  }
  return sum;
}

/** Grand total over the whole matrix. */
export function total(matrix: Matrix): number {
  let sum = 0;
  for (const row of matrix) {
    for (const v of row) sum += v;
  }
  return sum;
}

/** Sum over `node`'s row block (its leaves as actual/rows) across ALL columns. */
export function totalRow(matrix: Matrix, node: TreeNode): number {
  let sum = 0;
  for (let r = node.start; r < node.end; r++) {
    for (let c = 0; c < matrix.length; c++) {
      sum += matrix[r]![c]!;
    }
  }
  return sum;
}

/** Sum over `node`'s column block (its leaves as observed/columns) across ALL rows. */
export function totalColumn(matrix: Matrix, node: TreeNode): number {
  let sum = 0;
  for (let c = node.start; c < node.end; c++) {
    for (let r = 0; r < matrix.length; r++) {
      sum += matrix[r]![c]!;
    }
  }
  return sum;
}

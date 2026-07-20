import { buildLabelTree, findNode, type TreeNode } from "./labelTree";
import type { Matrix } from "./matrix";

/**
 * Canonical fixture used across matrix/normalize/measures tests: a tree
 * root -> {A, BC -> {B, C}}, with A=[0,1), B=[1,2), C=[2,3), BC=[1,3), and a
 * raw actual(row)×observed(col) matrix over [A,B,C].
 */
export function fixture(): {
  tree: TreeNode;
  matrix: Matrix;
  A: TreeNode;
  B: TreeNode;
  C: TreeNode;
  BC: TreeNode;
} {
  const tree = buildLabelTree(["A", "BC:B", "BC:C"]);
  const A = findNode(tree, "A")!;
  const B = findNode(tree, "BC:B")!;
  const C = findNode(tree, "BC:C")!;
  const BC = findNode(tree, "BC")!;
  const matrix: Matrix = [
    [3, 5, 2],
    [3, 4, 3],
    [1, 2, 7],
  ];
  return { tree, matrix, A, B, C, BC };
}

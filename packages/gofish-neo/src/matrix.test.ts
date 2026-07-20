import { describe, expect, it } from "vitest";
import { buildLabelTree, findNode, type TreeNode } from "./labelTree";
import { frequency, total, totalColumn, totalRow, type Matrix } from "./matrix";

/**
 * Canonical fixture used across matrix/normalize/measures tests: a tree
 * root -> {A, BC -> {B, C}}, with A=[0,1), B=[1,2), C=[2,3), BC=[1,3), and a
 * raw actual(row)×observed(col) matrix over [A,B,C].
 */
function fixture(): {
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

describe("fixture sanity", () => {
  it("has the expected leaf ranges", () => {
    const { A, B, C, BC } = fixture();
    expect([A.start, A.end]).toEqual([0, 1]);
    expect([B.start, B.end]).toEqual([1, 2]);
    expect([C.start, C.end]).toEqual([2, 3]);
    expect([BC.start, BC.end]).toEqual([1, 3]);
  });
});

describe("total / totalRow / totalColumn", () => {
  it("matches the worked totals", () => {
    const { matrix, tree, A, BC, B, C } = fixture();
    expect(total(matrix)).toBe(30);
    expect(totalRow(matrix, tree)).toBe(30);
    expect(totalRow(matrix, A)).toBe(10);
    expect(totalRow(matrix, BC)).toBe(20);
    expect(totalRow(matrix, B)).toBe(10);
    expect(totalRow(matrix, C)).toBe(10);

    expect(totalColumn(matrix, tree)).toBe(30);
    expect(totalColumn(matrix, A)).toBe(7);
    expect(totalColumn(matrix, BC)).toBe(23);
    expect(totalColumn(matrix, B)).toBe(11);
    expect(totalColumn(matrix, C)).toBe(12);
  });
});

describe("frequency (block sum)", () => {
  it("slices BC x BC as a 2x2 block", () => {
    const { matrix, BC } = fixture();
    expect(frequency(matrix, BC, BC)).toBe(16); // 4+3+2+7
  });

  it("agrees with a single cell for leaf x leaf", () => {
    const { matrix, A, B } = fixture();
    expect(frequency(matrix, A, B)).toBe(matrix[0]![1]);
  });
});

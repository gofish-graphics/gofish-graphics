import { describe, expect, it } from "vitest";
import { buildLabelTree, findNode, type TreeNode } from "./labelTree";
import type { Matrix } from "./matrix";
import {
  accuracy,
  falseNegatives,
  falsePositives,
  precision,
  recall,
  trueNegatives,
  truePositives,
} from "./measures";

/** See matrix.test.ts for the canonical-fixture description. */
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

describe("per-leaf measures", () => {
  it("matches the worked TP/FP/FN/TN", () => {
    const { matrix, A, B, C } = fixture();
    expect([
      truePositives(matrix, A),
      truePositives(matrix, B),
      truePositives(matrix, C),
    ]).toEqual([3, 4, 7]);
    expect([
      falsePositives(matrix, A),
      falsePositives(matrix, B),
      falsePositives(matrix, C),
    ]).toEqual([4, 7, 5]);
    expect([
      falseNegatives(matrix, A),
      falseNegatives(matrix, B),
      falseNegatives(matrix, C),
    ]).toEqual([7, 6, 3]);
    expect([
      trueNegatives(matrix, A),
      trueNegatives(matrix, B),
      trueNegatives(matrix, C),
    ]).toEqual([16, 13, 15]);
  });

  it("precision/recall/accuracy match the worked fractions", () => {
    const { matrix, A, B, C } = fixture();
    expect(precision(matrix, A)).toBeCloseTo(3 / 7);
    expect(precision(matrix, B)).toBeCloseTo(4 / 11);
    expect(precision(matrix, C)).toBeCloseTo(7 / 12);

    expect(recall(matrix, A)).toBeCloseTo(3 / 10);
    expect(recall(matrix, B)).toBeCloseTo(4 / 10);
    expect(recall(matrix, C)).toBeCloseTo(7 / 10);

    expect(accuracy(matrix, A)).toBeCloseTo((3 + 16) / 30);
    expect(accuracy(matrix, B)).toBeCloseTo((4 + 13) / 30);
    expect(accuracy(matrix, C)).toBeCloseTo((7 + 15) / 30);
  });

  it("guards zero denominators to 0, never NaN", () => {
    const zero: Matrix = [
      [0, 0],
      [0, 0],
    ];
    const tree = buildLabelTree(["X", "Y"]);
    const X = findNode(tree, "X")!;
    expect(precision(zero, X)).toBe(0);
    expect(recall(zero, X)).toBe(0);
    expect(accuracy(zero, X)).toBe(0);
  });
});

describe("internal-node measures (block-excluding TP)", () => {
  it("TP(BC) excludes the B<->C off-diagonal confusions", () => {
    const { matrix, BC } = fixture();
    // M[B,B] + M[C,C] = 4 + 7 = 11, NOT the full block sum (16).
    expect(truePositives(matrix, BC)).toBe(11);
    expect(falsePositives(matrix, BC)).toBe(23 - 11);
    expect(falseNegatives(matrix, BC)).toBe(20 - 11);
  });
});

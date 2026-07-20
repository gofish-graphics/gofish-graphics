import { describe, expect, it } from "vitest";
import { buildLabelTree, findNode, type TreeNode } from "./labelTree";
import { frequency, type Matrix } from "./matrix";
import { buildNormalizer } from "./normalize";
import { fixture } from "./testFixture";

/** `frequency` is precomputed by callers now that `Normalizer` takes `count`. */
function f(matrix: Matrix, rowNode: TreeNode, colNode: TreeNode): number {
  return frequency(matrix, rowNode, colNode);
}

describe("row / column normalization", () => {
  it("normalizes each row to fractions of its row total", () => {
    const { tree, matrix, A, B, C } = fixture();
    const normalize = buildNormalizer(tree, matrix, "row");
    expect(normalize(A, A, f(matrix, A, A))).toBeCloseTo(3 / 10);
    expect(normalize(A, B, f(matrix, A, B))).toBeCloseTo(5 / 10);
    expect(normalize(A, C, f(matrix, A, C))).toBeCloseTo(2 / 10);
  });

  it("normalizes each column to fractions of its column total", () => {
    const { tree, matrix, A, B, C } = fixture();
    const normalize = buildNormalizer(tree, matrix, "column");
    expect(normalize(A, A, f(matrix, A, A))).toBeCloseTo(3 / 7);
    expect(normalize(B, A, f(matrix, B, A))).toBeCloseTo(3 / 7);
    expect(normalize(C, A, f(matrix, C, A))).toBeCloseTo(1 / 7);
  });

  it("guards a zero-total row/column to 0, not NaN", () => {
    const tree = buildLabelTree(["X", "Y"]);
    const X = findNode(tree, "X")!;

    const zeroRowMatrix: Matrix = [
      [0, 0],
      [1, 1],
    ];
    const rowNorm = buildNormalizer(tree, zeroRowMatrix, "row");
    expect(rowNorm(X, X, f(zeroRowMatrix, X, X))).toBe(0);
    expect(Number.isNaN(rowNorm(X, X, f(zeroRowMatrix, X, X)))).toBe(false);

    const zeroColMatrix: Matrix = [
      [0, 1],
      [0, 1],
    ];
    const colNorm = buildNormalizer(tree, zeroColMatrix, "column");
    expect(colNorm(X, X, f(zeroColMatrix, X, X))).toBe(0);
    expect(Number.isNaN(colNorm(X, X, f(zeroColMatrix, X, X)))).toBe(false);
  });
});

describe("total normalization", () => {
  it("linearly rescales over [min positive, max] frontier-cell counts", () => {
    const { tree, matrix, A, BC } = fixture();
    const normalize = buildNormalizer(tree, matrix, "total", [BC.id]);
    // Frontier is [A, BC]; positive frequencies: A×A=3, A×BC=7, BC×A=4, BC×BC=16.
    // domain = [3, 16].
    expect(normalize(A, A, f(matrix, A, A))).toBeCloseTo(0); // at the min
    expect(normalize(BC, BC, f(matrix, BC, BC))).toBeCloseTo(1); // at the max
    expect(normalize(BC, A, f(matrix, BC, A))).toBeCloseTo((4 - 3) / (16 - 3));
  });

  it("respects the collapsed frontier (full leaf frontier gives a different domain)", () => {
    const { tree, matrix, B, C } = fixture();
    // Without collapsing BC, the frontier is the true leaves [A, B, C].
    const normalize = buildNormalizer(tree, matrix, "total");
    // Positive leaf x leaf frequencies range over the whole matrix: min=1, max=7.
    expect(normalize(C, C, f(matrix, C, C))).toBeCloseTo(1); // matrix[2][2] = 7, the max
    expect(normalize(B, C, f(matrix, B, C))).toBeCloseTo((3 - 1) / (7 - 1)); // matrix[1][2] = 3
  });

  it("excludeDiagonal: domain skips diagonal cells, which still render clamped to the max", () => {
    const { tree, matrix, A, B, C } = fixture();
    // Full leaf frontier [A, B, C]; diagonal cells are A×A=3, B×B=4, C×C=7.
    // Off-diagonal positive frequencies: A×B=5, A×C=2, B×A=3, B×C=3, C×A=1, C×B=2.
    // Excluding the diagonal, domain = [1, 5].
    const normalize = buildNormalizer(tree, matrix, "total", [], {
      excludeDiagonal: true,
    });
    expect(normalize(A, B, f(matrix, A, B))).toBeCloseTo(1); // 5, the off-diagonal max
    expect(normalize(C, A, f(matrix, C, A))).toBeCloseTo(0); // 1, the off-diagonal min
    // Diagonal cells are clamped to the domain max (1), not extrapolated past it.
    expect(normalize(C, C, f(matrix, C, C))).toBeCloseTo(1); // 7 > max(5) => clamped
    expect(normalize(A, A, f(matrix, A, A))).toBeCloseTo((3 - 1) / (5 - 1));
  });

  it("maps every cell to 0 when the frontier domain is degenerate (all zero)", () => {
    const tree = buildLabelTree(["X", "Y"]);
    const X = findNode(tree, "X")!;
    const Y = findNode(tree, "Y")!;
    const zeroMatrix: Matrix = [
      [0, 0],
      [0, 0],
    ];
    const normalize = buildNormalizer(tree, zeroMatrix, "total");
    expect(normalize(X, X, f(zeroMatrix, X, X))).toBe(0);
    expect(normalize(X, Y, f(zeroMatrix, X, Y))).toBe(0);
    expect(Number.isNaN(normalize(X, Y, f(zeroMatrix, X, Y)))).toBe(false);
  });
});

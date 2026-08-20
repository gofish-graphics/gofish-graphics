import { describe, expect, it } from "vitest";
import { frequency, total, totalColumn, totalRow } from "./matrix";
import { fixture } from "./testFixture";

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

import { describe, expect, it } from "vitest";
import { frontier } from "./labelTree";
import { buildMatrix, frequency, total } from "./matrix";
import type { Confusion } from "./pipeline";
import type { NeoSpec } from "./spec";

describe("buildMatrix end-to-end", () => {
  it("builds a tree + matrix for a simple one-dimensional spec", () => {
    const records: Confusion[] = [
      { actual: ["class:cat"], observed: ["class:cat"], count: 5 },
      { actual: ["class:cat"], observed: ["class:dog"], count: 1 },
      { actual: ["class:dog"], observed: ["class:dog"], count: 4 },
    ];
    const spec: NeoSpec = { classes: ["class"] };
    const { tree, matrix } = buildMatrix(records, spec);
    expect(total(matrix)).toBe(10);
    // tree: root -> class -> {cat, dog}
    const classNode = tree.children[0]!;
    const cat = classNode.children.find((n) => n.name === "cat")!;
    const dog = classNode.children.find((n) => n.name === "dog")!;
    expect(frequency(matrix, cat, cat)).toBe(5);
    expect(frequency(matrix, cat, dog)).toBe(1);
    expect(frequency(matrix, dog, dog)).toBe(4);
  });

  it("collapsing a node yields the expected frontier and a block-summed cell", () => {
    const records: Confusion[] = [
      {
        actual: ["class:animal:cat"],
        observed: ["class:animal:cat"],
        count: 3,
      },
      {
        actual: ["class:animal:cat"],
        observed: ["class:animal:dog"],
        count: 2,
      },
      {
        actual: ["class:animal:dog"],
        observed: ["class:animal:cat"],
        count: 1,
      },
      {
        actual: ["class:animal:dog"],
        observed: ["class:animal:dog"],
        count: 4,
      },
      { actual: ["class:plant"], observed: ["class:plant"], count: 6 },
    ];
    const spec: NeoSpec = { classes: ["class"] };
    const { tree, matrix } = buildMatrix(records, spec);

    // tree: root -> class -> {animal -> {cat, dog}, plant}
    const classNode = tree.children[0]!;
    const animal = classNode.children.find((n) => n.name === "animal")!;
    const front = frontier(tree, [animal.id]);
    expect(front.map((n) => n.name).sort()).toEqual(["animal", "plant"].sort());

    // animal x animal is the block sum of cat/dog x cat/dog: 3+2+1+4 = 10.
    expect(frequency(matrix, animal, animal)).toBe(10);
  });
});

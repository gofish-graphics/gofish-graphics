import { describe, expect, it } from "vitest";
import {
  buildLabelTree,
  findNode,
  frontier,
  isLeaf,
  leaves,
  postorder,
  preorder,
} from "./labelTree";

describe("buildLabelTree", () => {
  it("shares a common prefix across labels (trie merge)", () => {
    const tree = buildLabelTree(["a:b", "a:c"]);
    // root -> a -> {b, c}
    expect(tree.children).toHaveLength(1);
    const a = tree.children[0]!;
    expect(a.name).toBe("a");
    expect(a.children.map((c) => c.name)).toEqual(["b", "c"]);
  });

  it("assigns contiguous, children-concatenated postorder leaf ranges (3-level tree)", () => {
    // root -> x -> {p -> {m, n}, q:leaf2}, root -> y -> {leaf3, leaf4}
    // (p:{m,n} has 2 children so it survives; q:leaf2 is a single-leaf
    // chain and gets pruned into one "q:leaf2" leaf — see the prune test.)
    const tree = buildLabelTree([
      "x:p:m",
      "x:p:n",
      "x:q:leaf2",
      "y:leaf3",
      "y:leaf4",
    ]);

    // Every leaf gets a unit range, and every internal node's range is
    // exactly the union of its children's ranges (first child's start to
    // last child's end) — checked recursively over the whole tree.
    function checkInvariant(node: typeof tree) {
      if (isLeaf(node)) {
        expect(node.end - node.start).toBe(1);
        return;
      }
      expect(node.start).toBe(node.children[0]!.start);
      expect(node.end).toBe(node.children[node.children.length - 1]!.end);
      // Children's ranges concatenate with no gaps or overlaps.
      for (let i = 1; i < node.children.length; i++) {
        expect(node.children[i]!.start).toBe(node.children[i - 1]!.end);
      }
      for (const c of node.children) checkInvariant(c);
    }
    checkInvariant(tree);

    // The root's total range width equals the number of true leaves.
    expect(tree.end - tree.start).toBe(leaves(tree).length);
  });

  it("prunes single-leaf-child chains into one joined-name node", () => {
    // "a:b:c" alone -> root -> a -> b -> c, with a and b each single-child
    // chains down to the leaf c; should collapse to root -> "a:b:c" leaf.
    const tree = buildLabelTree(["a:b:c"]);
    expect(tree.children).toHaveLength(1);
    const collapsed = tree.children[0]!;
    expect(collapsed.name).toBe("a:b:c");
    expect(collapsed.id).toBe("a:b:c");
    expect(isLeaf(collapsed)).toBe(true);
  });

  it("does not collapse a node with more than one child", () => {
    const tree = buildLabelTree(["a:b", "a:c"]);
    const a = tree.children[0]!;
    expect(a.name).toBe("a");
    expect(a.children).toHaveLength(2);
  });
});

describe("preorder / postorder", () => {
  it("visits every node", () => {
    const tree = buildLabelTree(["a:b", "a:c"]);
    const pre: string[] = [];
    preorder(tree, (n) => pre.push(n.name));
    expect(pre[0]).toBe(""); // synthetic root has empty name
    expect(pre).toContain("a");
    expect(pre).toContain("b");
    expect(pre).toContain("c");

    const post: string[] = [];
    postorder(tree, (n) => post.push(n.name));
    expect(post[post.length - 1]).toBe(""); // root visited last
  });
});

describe("leaves / frontier", () => {
  it("reports true leaves by default", () => {
    const tree = buildLabelTree(["a:b", "a:c"]);
    const a = tree.children[0]!;
    expect(
      leaves(tree)
        .map((n) => n.name)
        .sort()
    ).toEqual(["b", "c"]);
    expect(a.children.every(isLeaf)).toBe(true);
  });

  it("reports a blocked (don't-descend) node itself as a leaf", () => {
    const tree = buildLabelTree(["a:b", "a:c"]);
    const a = tree.children[0]!;
    const blocked = leaves(tree, (n) => n.id !== a.id);
    expect(blocked.map((n) => n.name)).toEqual(["a"]);
  });

  it("frontier() collapses given node ids", () => {
    // "x:y" is a single-leaf-child chain, so it prunes into one "x:y" leaf.
    const tree = buildLabelTree(["a:b", "a:c", "x:y"]);
    const a = tree.children.find((n) => n.name === "a")!;
    const result = frontier(tree, [a.id]);
    expect(result.map((n) => n.name).sort()).toEqual(["a", "x:y"]);
  });
});

describe("findNode", () => {
  it("finds a node by id", () => {
    const tree = buildLabelTree(["a:b", "a:c"]);
    expect(findNode(tree, "a")?.name).toBe("a");
    expect(findNode(tree, "a:b")?.name).toBe("b");
    expect(findNode(tree, "nope")).toBeUndefined();
  });
});

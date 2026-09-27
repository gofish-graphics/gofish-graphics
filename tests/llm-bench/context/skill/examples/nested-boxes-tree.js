// Nested Boxes Tree
// A file-tree diagram built purely from the nest constraint — each subtree is a box sized to wrap its children plus padding, sizes propagating outward.

import {
  Constraint,
  createMark,
  layer,
  rect,
  stackY,
  text,
} from "gofish-graphics";
const sample = {
  name: "project",
  children: [
    {
      name: "src",
      children: [
        { name: "index.ts" },
        {
          name: "ast",
          children: [
            { name: "node.ts" },
            { name: "render.tsx" },
            { name: "spread.tsx" },
          ],
        },
        {
          name: "marks",
          children: [{ name: "rect.tsx" }, { name: "circle.tsx" }],
        },
      ],
    },
    {
      name: "tests",
      children: [{ name: "tree.test.ts" }, { name: "layout.test.ts" }],
    },
    { name: "README.md" },
  ],
};
const depthFill = ["#e3edf7", "#dbe6f3", "#cfdcec", "#c2d2e6"];
const leafFill = "#fff3e0";
const Subtree = createMark(({ node, depth }) => buildSubtree(node, depth));
function buildSubtree(node, depth) {
  // The labeled "header" block: a small rect with the node's name centered.
  const header = layer({ w: 96, h: 22 }, [
    rect({
      w: 96,
      h: 22,
      rx: 4,
      fill: node.children?.length
        ? depthFill[Math.min(depth, depthFill.length - 1)]
        : leafFill,
      stroke: "#5a7da6",
      strokeWidth: 1,
    }).name("box"),
    text({
      text: node.name,
      fontSize: 11,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fill: "#1d3557",
    }).name("label"),
  ]).relate(({ box, label }) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, label]),
  ]);
  if (!node.children?.length) return header;
  // Stack [header, ...childSubtrees] vertically — header on top, children below.
  const inner = stackY({ spacing: 8, alignment: "middle" }, [
    header,
    ...node.children.map((c) => Subtree({ node: c, depth: depth + 1 })),
  ]);
  // Wrap the inner stack in a containing rect.
  return layer([
    rect({
      rx: 6,
      fill: "#fafbfd",
      stroke: "#9bb1c4",
      strokeWidth: 1.25,
    }).name("outer"),
    inner.name("inner"),
  ]).relate(({ outer, inner }) => [
    Constraint.nest({ x: 10, y: 10 }, [outer, inner]),
  ]);
}
const container = document.getElementById("app");
Subtree({ node: sample, depth: 0 }).render(container, {});

import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Layer, Constraint, StackY, rect, text } from "../../src/lib";

// A tree visualization built purely from Constraint.contain.
// Each subtree is a Layer of [outerRect, innerStack] with a contain constraint
// that sizes outerRect to innerStack's intrinsic dims + padding. Layer's
// pre-pass topo-sorts so the innermost subtree is laid out first; sizes
// propagate outward through the chained contain constraints.

const meta: Meta = {
  title: "Low Level Syntax/Nested Boxes Tree",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1200, step: 20 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 20 } },
  },
};
export default meta;

type Args = { w: number; h: number };

type TreeNode = { name: string; children?: TreeNode[] };

const sample: TreeNode = {
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

// Each node renders as a rounded rect labeled with its name. Internal nodes
// also wrap their children in a containing rect via Constraint.contain.
function buildSubtree(node: TreeNode, depth: number): any {
  // The labeled "header" block: a small rect with the node's name centered.
  const header = Layer({ w: 96, h: 22 }, [
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
  ]).constrain(({ box, label }) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, label]),
  ]);

  if (!node.children?.length) return header;

  // Stack [header, ...childSubtrees] vertically — header on top, children below.
  const inner = StackY({ spacing: 8, alignment: "middle" }, [
    header,
    ...node.children.map((c) => buildSubtree(c, depth + 1)),
  ]);

  // Wrap the inner stack in a containing rect.
  return Layer([
    rect({
      rx: 6,
      fill: "#fafbfd",
      stroke: "#9bb1c4",
      strokeWidth: 1.25,
    }).name("outer"),
    inner.name("inner"),
  ]).constrain(({ outer, inner }) => [
    Constraint.contain({ x: 10, y: 10 }, [outer, inner]),
  ]);
}

export const NestedBoxesTree: StoryObj<Args> = {
  args: { w: 720, h: 560 },
  render: (args: Args) => {
    const container = initializeContainer();
    buildSubtree(sample, 0).render(container, { w: args.w, h: args.h });
    return container;
  },
};

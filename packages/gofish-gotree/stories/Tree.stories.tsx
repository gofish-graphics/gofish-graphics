import type { Meta, StoryObj } from "@storybook/html";
import { circle, rect, text, Layer, Constraint } from "gofish-graphics";
import { tree } from "../src";

const meta: Meta = {
  title: "GoTree / Node-Link",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 1200, step: 20 } },
    h: { control: { type: "number", min: 200, max: 1000, step: 20 } },
  },
};
export default meta;

type Args = { w: number; h: number };

const sampleData = {
  name: "root",
  children: [
    {
      name: "A",
      children: [
        { name: "A1" },
        {
          name: "A2",
          children: [{ name: "A2a" }, { name: "A2b" }],
        },
      ],
    },
    {
      name: "B",
      children: [{ name: "B1" }, { name: "B2" }, { name: "B3" }],
    },
    { name: "C" },
  ],
};

const fileTreeData = {
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

const depthColor = ["#1f3a5f", "#4682b4", "#7baed1", "#c0d8ec"];

const initContainer = () => {
  const container = document.createElement("div");
  container.style.margin = "20px";
  document.body.appendChild(container);
  return container;
};

export const NodeLink: StoryObj<Args> = {
  args: { w: 600, h: 400 },
  render: (args: Args) => {
    const container = initContainer();
    tree(
      {
        node: (d) =>
          circle({
            r: 10,
            fill: depthColor[Math.min(d.depth, depthColor.length - 1)],
            stroke: "#1f3a5f",
            strokeWidth: 1,
          }),
        link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 1.5 },
        parentChild: {
          type: "spread",
          dir: "y",
          spacing: 48,
          alignment: "middle",
        },
        sibling: { type: "spread", dir: "x", spacing: 24, alignment: "start" },
        mode: "topDown",
      },
      sampleData
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Composed-mark example: each tree node is a rounded rect with a centered text
// label, built from gofish-graphics primitives. The node factory closes over the
// hierarchy datum, so `d.data.name` flows from the user's tree into the label.
const labeledNode = (d: any) =>
  Layer({ w: 96, h: 26 }, [
    rect({
      w: 96,
      h: 26,
      rx: 6,
      fill: d.children ? "#dbe6f3" : "#f5f7fa",
      stroke: "#4682b4",
      strokeWidth: 1.25,
    }).name("box"),
    text({
      text: d.data.name,
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fill: "#1d3557",
    }).name("label"),
  ]).constrain(({ box, label }: any) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, label]),
  ]);

export const LabeledFileTree: StoryObj<Args> = {
  args: { w: 760, h: 460 },
  render: (args: Args) => {
    const container = initContainer();
    tree(
      {
        node: labeledNode,
        link: { interpolation: "linear", stroke: "#9bb1c4", strokeWidth: 1.5 },
        parentChild: {
          type: "spread",
          dir: "y",
          spacing: 36,
          alignment: "middle",
        },
        sibling: { type: "spread", dir: "x", spacing: 12, alignment: "start" },
      },
      fileTreeData
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

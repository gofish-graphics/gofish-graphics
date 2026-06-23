import { circle } from "gofish-graphics";
import { tree, spread } from "../src";

const sampleData = {
  name: "root",
  children: [
    {
      name: "A",
      children: [
        { name: "A1" },
        { name: "A2", children: [{ name: "A2a" }, { name: "A2b" }] },
      ],
    },
    {
      name: "B",
      children: [{ name: "B1" }, { name: "B2" }, { name: "B3" }],
    },
    { name: "C" },
  ],
};

const depthColor = ["#1f3a5f", "#4682b4", "#7baed1", "#c0d8ec"];

export const testTreeNodeLink = (_size: { width: number; height: number }) =>
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
      parentChild: spread({ dir: "y", spacing: 48, alignment: "middle" }),
      sibling: spread({ dir: "x", spacing: 24, alignment: "start" }),
    },
    sampleData
  );

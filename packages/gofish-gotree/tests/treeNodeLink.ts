import { circle } from "gofish-graphics";
import { tree } from "../src";

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

export const testTreeNodeLink = (size: { width: number; height: number }) =>
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
  );

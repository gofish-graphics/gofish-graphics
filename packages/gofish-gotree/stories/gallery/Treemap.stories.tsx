import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — Treemap (gallery/Treemap/dsl2.json).
// dsl: AxisIndependent, bottom-up.
//   X: Root include (pad 0.16) / Subtree align       → pc nest x, sib align x
//   Y: Root include (pad 0.03) / Subtree flatten 0.19 → pc nest y, sib distribute y
//   parentChild = combine({ x: nest, y: nest })   — parent CONTAINS its subtree
//   sibling     = combine({ x: align, y: distribute }) — siblings stack into vertical slices
// A treemap: every parent rectangle wraps its children (nest on both axes);
// siblings subdivide the parent — aligned to a common width on x, stacked on y
// → horizontal slices. Leaf area is value-driven (h ∝ d.data.value).
// Node = rectangle, link = none, color = depth (blue ramp, dark root → light leaf).
const meta: Meta = { title: "GoTree / Gallery / Treemap" };
export default meta;

// Internal/parent nodes nest on BOTH axes, so they must be UNSIZED on both x
// and y — the rect grows to wrap its subtree. Leaves are sized by data: width
// fixed (siblings align to a shared x extent) and height proportional to value
// so the treemap is area-proportional.
const node = (d: any) =>
  d.height === 0
    ? rect({ w: 92, h: 14 * d.data.value, fill: byDepth()(d) })
    : rect({ fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

export const Treemap: StoryObj = {
  render: () =>
    mount({
      node,
      link: "none",
      // Root relation: parent box wraps its subtree on both axes.
      // x pad larger (0.16 rel) than y pad (0.03 rel) per the dsl.
      parentChild: combine({
        x: { kind: "nest", pad: 9 },
        y: { kind: "nest", pad: 2 },
      }),
      // Subtree relation: siblings align to a common width (x) and stack
      // vertically (y) with a flatten margin (0.19 rel).
      sibling: combine({
        x: { kind: "align", alignment: "middle" },
        y: { kind: "distribute", spacing: 9 },
      }),
    }),
};

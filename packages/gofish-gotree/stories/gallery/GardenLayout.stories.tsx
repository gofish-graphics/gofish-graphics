import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — GardenLayout (the "ReadableTreeLayout" subtree).
// dsl: Mode bottom-up ; node=circle, color=class, link=orthogonal.
//   X.Root within / X.Subtree flatten ; Y.Root juxtapose / Y.Subtree align.
// Mapped (include→nest, juxtapose/flatten→distribute, within/align→align):
//   parentChild = combine({ x: align(middle, "within"), y: distribute("juxtapose") })
//   sibling     = combine({ x: distribute("flatten"),    y: align(middle, "align") })
// → parent sits centered above its child row (x align), separated vertically
//   (y distribute, reversed so the root lands at the top in GoFish's y-up
//   space); siblings spread horizontally in a single row (x distribute) on a
//   shared baseline (y align). Structurally a classic node-link tree.
//
// TODO: needs orthogonal links implemented — GoTree's spec asks for
// "orthogonal" (elbow) links; gofish-gotree only supports straight links, so
// this uses { interpolation: "linear" }.
const node = (d: any) =>
  circle({
    r: 10,
    fill: byDepth()(d),
    stroke: "#08306b",
    strokeWidth: 1,
  });

export const GardenLayout: StoryObj = {
  render: () =>
    mount({
      node,
      link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 1.5 },
      parentChild: combine({
        x: { kind: "align", alignment: "middle" },
        y: { kind: "distribute", spacing: 48, order: "reverse" },
      }),
      sibling: combine({
        x: { kind: "distribute", spacing: 24 },
        y: { kind: "align", alignment: "middle" },
      }),
    }),
};

const meta: Meta = { title: "GoTree / Gallery / GardenLayout" };
export default meta;

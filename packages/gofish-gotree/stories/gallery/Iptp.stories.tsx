import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — iptp.
// dsl: mode bottom-up; X.Root juxtapose / X.Subtree flatten ;
//      Y.Root juxtapose / Y.Subtree align(top).
//   parentChild = (distribute x, distribute y)  — parent juxtaposed against its
//     subtree on BOTH axes, so each level steps down (y) and across (x).
//   sibling = (distribute x, align y[top→"end" in y-up]) — siblings flatten
//     along x and share a top edge.
// node = rectangle colored by depth, links = none.
const meta: Meta = { title: "GoTree / Gallery / iptp" };
export default meta;

// Uniform tall-bar rectangle nodes, colored by depth (dark root → light leaves).
const node = (d: any) => rect({ w: 16, h: 90, fill: byDepth()(d) });

export const Iptp: StoryObj = {
  render: () =>
    mount({
      node,
      link: "none",
      parentChild: combine({
        x: { kind: "distribute", spacing: 6 },
        // order:"reverse" puts the parent at HIGH y (top of screen, y-up) so the
        // root sits above its subtree — matching the reference's root-at-top.
        y: { kind: "distribute", spacing: 6, order: "reverse" },
      }),
      sibling: combine({
        x: { kind: "distribute", spacing: 6 },
        y: { kind: "align", alignment: "end" },
      }),
    }),
};

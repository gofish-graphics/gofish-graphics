import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — cheops.
// dsl: AxisIndependent, mode bottom-up. node=triangle, link=none, color=depth.
//   X: Root include / Subtree flatten (margin -0.22, space-between)
//   Y: Root juxtapose (margin 0.01) / Subtree align (Alignment "top")
// Mapping: include→nest, juxtapose/flatten→distribute, align→align.
//   parentChild = combine({ x: nest (include), y: distribute (juxtapose) })
//   sibling     = combine({ x: distribute (flatten, NEGATIVE spacing → overlap),
//                           y: align (Alignment "top" → high y in y-up → "end") })
// "Cheops" = pyramid of nested triangles; the negative sibling spacing overlaps
// adjacent siblings, and nest is on X ONLY (internal nodes unsized on x, fixed
// height) so each parent grows horizontally to wrap its subtree while every
// level keeps a fixed row height. parentChild y uses order "reverse" so the
// parent lands at high y (top of screen) — the bottom-up pyramid.
//
// TODO: needs a triangle mark for cheops — gofish has no triangle mark, so
// nodes are rendered as `rect` placeholders here.
const meta: Meta = { title: "GoTree / Gallery / cheops" };
export default meta;

// Triangle-placeholder nodes, colored by depth. Internal nodes are left UNSIZED
// on x (the nest axis) so the parent box grows to wrap its subtree horizontally;
// height is fixed on every node so levels stack as equal-height rows.
const ROW_H = 80;
const LEAF_W = 26;
// White stroke stands in for the gaps between the reference's triangles — with a
// rect placeholder and one color per depth, overlapping siblings would otherwise
// merge into a single solid block and the structure would be invisible.
const node = (d: any) =>
  d.height === 0
    ? // TODO: needs a triangle mark for cheops
      rect({
        w: LEAF_W,
        h: ROW_H,
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 1,
      })
    : // TODO: needs a triangle mark for cheops
      rect({ h: ROW_H, fill: byDepth()(d), stroke: "white", strokeWidth: 1 });

export const Cheops: StoryObj = {
  render: () =>
    mount({
      node,
      link: "none",
      mode: "bottomUp",
      parentChild: combine({
        x: { kind: "nest", pad: 0 },
        y: { kind: "distribute", spacing: 2 },
      }),
      sibling: combine({
        x: { kind: "distribute", spacing: -8 },
        y: { kind: "align", alignment: "end" },
      }),
    }),
};

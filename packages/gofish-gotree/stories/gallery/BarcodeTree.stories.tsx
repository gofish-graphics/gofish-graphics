import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — barcodetree.
// dsl: mode bottom-up; node=rectangle, link=none, color=depth.
//   X: Root juxtapose (margin 0.25h) / Subtree flatten (margin 0.25h)
//   Y: Root include / Subtree align
//   parentChild = (distribute x, nest y)   sibling = (distribute x, align y)
// Mapping: include→nest, juxtapose/flatten→distribute, align→align(middle).
// Thin vertical bars packed left-to-right like a barcode. Each parent bar sits
// left of its subtree (distribute x); nest is on Y ONLY, so internal nodes are
// fixed-narrow-width but UNSIZED on y — the parent bar grows vertically to wrap
// its subtree (include). Siblings flatten along x and align on y. Color = depth
// (dark→light gray, matching the dsl ColorRange #070707 → #929598).
const meta: Meta = {
  title: "GoTree / Gallery / barcodetree",
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Barcode Tree",
      description:
        "A barcode tree that encodes the hierarchy as thin nested bars stacked along an axis.",
    },
  },
};
export default meta;

const grays = ["#070707", "#3b3e41", "#6c6f72", "#929598", "#b6b9bc"];

// Thin rectangles. Leaves get a fixed narrow width and a tall height (the
// barcode "bar"); internal nodes keep the same narrow width but are UNSIZED on
// y (the nest axis) so the parent box grows to wrap its subtree vertically.
const node = (d: any) =>
  d.height === 0
    ? rect({ w: 12, h: 80, fill: byDepth(grays)(d) })
    : rect({ w: 12, fill: byDepth(grays)(d) });

export const BarcodeTree: StoryObj = {
  render: () =>
    mount({
      node,
      link: "none",
      parentChild: combine({
        x: { kind: "distribute", spacing: 4 },
        y: { kind: "nest", pad: 6 },
      }),
      sibling: combine({
        x: { kind: "distribute", spacing: 4 },
        y: { kind: "align", alignment: "middle" },
      }),
    }),
};

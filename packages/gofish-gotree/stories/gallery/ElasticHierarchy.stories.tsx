import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — ElasticHierarchy (Treemap template).
// dsl (mode bottom-up): X.Root include (pad 0.06) / X.Subtree flatten (margin 0.12);
//   Y.Root include (pad 0.25/0.24) / Y.Subtree align.
//   parentChild = (nest x, nest y)   sibling = (distribute x, align y)
// MAPPING: include→nest, juxtapose/flatten→distribute, within/align→align.
// Each parent box ENCLOSES its subtree on both axes (nest); the larger Y pad
// leaves a "header" band of empty space above/below the contained children,
// while siblings sit side-by-side in a row (distribute x, aligned middle on y).
// Leaves are sized by datum (value); internal/parent rects are UNSIZED on both
// axes (the nest axes) so each box grows to wrap its subtree.
const meta: Meta = {
  title: "GoTree / Gallery / ElasticHierarchy",
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Elastic Hierarchy",
      description:
        "A nested-rectangle hierarchy where each parent's box stretches to contain its distributed children.",
    },
  },
};
export default meta;

// rectangle nodes, colored by depth. Leaves carry the size (height scaled by
// `value`); internal nodes are left unsized on both axes so nest grows the
// parent box to inner.intrinsicDims + 2*pad.
const node = (d: any) =>
  d.height === 0
    ? rect({
        w: 26,
        h: 24 + (d.data.value ?? 1) * 12,
        fill: byDepth()(d),
        stroke: "#08306b",
        strokeWidth: 1,
      })
    : rect({ fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1.5 });

export const ElasticHierarchy: StoryObj = {
  render: () =>
    mount({
      node,
      link: "none",
      // include on both axes → nest. Larger y pad makes the parent "header"
      // band of empty space; small x pad hugs the subtree horizontally.
      parentChild: combine({
        x: { kind: "nest", pad: 8 },
        y: { kind: "nest", pad: 22 },
      }),
      // flatten x → distribute (margin → spacing); align y → align middle.
      sibling: combine({
        x: { kind: "distribute", spacing: 8 },
        y: { kind: "align", alignment: "middle" },
      }),
    }),
};

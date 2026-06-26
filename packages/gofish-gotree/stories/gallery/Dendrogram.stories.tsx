import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — dendrogram.
// dsl: node=hidden, link=curveStepAfter (orthogonal brackets), color=depth,
//      mode=bottom-up.
//   X.Root include  / X.Subtree flatten
//   Y.Root juxtapose / Y.Subtree align (alignment bottom)
// Mapping (include→nest, juxtapose/flatten→distribute, within/align→align):
//   parentChild = combine({ x: nest  (parent box grows to span its subtree),
//                           y: distribute (parent stacked above its subtree) })
//                  on y puts the root at the TOP (y-up); leaves
//                 fall to the bottom (mode=bottom-up).
//   sibling     = combine({ x: distribute (siblings laid out flat side-by-side),
//                           y: align (siblings share a baseline) })
//
// nest is on X ONLY → internal nodes are left UNSIZED on x (the nest axis) so
// the parent box grows horizontally to wrap its subtree, but keep a fixed
// height. Leaves are fully fixed-size.
//
// Alignment "bottom": GoFish is y-up, so the screen bottom is LOW y → align
// "start". Verified against ref/dendrogram.png (leaves sit on the baseline).
//
// TODO: needs step/orthogonal (curveStepAfter) links implemented — using
//       {route:"straight"} yields straight diagonal edges instead of the
//       reference's right-angle brackets.
// NOTE: node="hidden" → render a zero-area transparent rect so the tree still
//       has a node to position the links against.
const meta: Meta = {
  title: "GoTree / Gallery / dendrogram",
};
export default meta;

// A multi-level tree so the bracketing reads clearly.
const sub = (p: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `${p}${i}` }));
const dendroData = {
  name: "root",
  children: [
    {
      name: "A",
      children: [
        { name: "A0", children: sub("A0", 3) },
        { name: "A1", children: sub("A1", 2) },
      ],
    },
    {
      name: "B",
      children: [
        { name: "B0", children: sub("B0", 2) },
        { name: "B1", children: sub("B1", 3) },
        { name: "B2", children: sub("B2", 2) },
      ],
    },
    {
      name: "C",
      children: [
        { name: "C0", children: sub("C0", 3) },
        { name: "C1", children: sub("C1", 2) },
      ],
    },
  ],
};

// Hidden node: a zero-area transparent rect that still gives the link endpoints
// something to anchor to. Internal nodes are unsized on x (the nest axis) so the
// parent box grows to span its subtree; they keep a fixed (tiny) height. Leaves
// are fully fixed-size.
const node = (d: any) =>
  d.height === 0
    ? rect({ w: 1, h: 1, fill: "transparent", strokeWidth: 0 })
    : rect({ h: 1, fill: "transparent", strokeWidth: 0 });

export const Dendrogram: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Dendrogram",
      description:
        "A dendrogram with hidden internal nodes and bracket-style links, as used for clustering trees.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 900, h: 520 });
    tree(
      {
        node,
        // curveStepAfter unsupported → linear (straight edges). color=depth:
        // the hidden nodes carry no visible color, so honor it on the links —
        // each link colored by its target node's depth.
        link: (_src: any, tgt: any) => ({
          route: "straight",
          stroke: byDepth()(tgt),
          strokeWidth: 1.5,
        }),
        parentChild: combine({
          x: { kind: "nest", pad: 0 },
          y: { kind: "distribute", spacing: 70 },
        }),
        sibling: combine({
          x: { kind: "distribute", spacing: 22 },
          // "bottom" alignment: y-up → screen bottom is low y → "start".
          y: { kind: "align", alignment: "start" },
        }),
      },
      dendroData
    ).render(container, { w: 900, h: 520 });
    return container;
  },
};

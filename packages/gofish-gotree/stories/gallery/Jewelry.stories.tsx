import type { Meta, StoryObj } from "@storybook/html";
import { circle, rect } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — JewelryTree.
// dsl: X.Root include / X.Subtree flatten ; Y.Root within / Y.Subtree align ;
//      Mode bottom-up, Node circle, Link straight, Color none.
//   parentChild = (nest x, align-middle y)   sibling = (distribute x, align-middle y)
// Mapping: include→nest, flatten→distribute, within/align→align(middle).
// Each parent CONTAINS its subtree horizontally (nest on X only) and is
// centered on it vertically (align y); siblings string out left→right
// (distribute x) sharing a vertical center (align y) — beads on a string.
//
// Compromise (per brief): nest grows a *bbox*, and a circle is sized by a
// single radius, so an internal "circle" can't grow on X only. Internal
// nodes are therefore rects left UNSIZED on X (fixed height) so the parent
// box wraps its subtree horizontally; leaves stay circles sized by value.
// The light internal fill reads as the enclosing "setting" around the
// darker leaf "stones".
const meta: Meta = { title: "GoTree / Gallery / Jewelry" };
export default meta;

// Darker-than-default ramp so deep leaves stay visible as "stones" against
// the light enclosing "settings" (the default blue ramp fades to near-white).
const stoneBlues = ["#08306b", "#08519c", "#2171b5", "#4292c6", "#6baed6"];

const node = (d: any) =>
  d.height === 0
    ? circle({ r: 7 + (d.data.value ?? 1) * 2, fill: byDepth(stoneBlues)(d) })
    : rect({
        h: 30,
        rx: 15,
        fill: "#c6dbef",
        stroke: "#6baed6",
        strokeWidth: 1,
      });

export const Jewelry: StoryObj = {
  render: () =>
    mount({
      node,
      link: { curve: "straight", stroke: "#6baed6", strokeWidth: 2 },
      parentChild: combine({
        x: { kind: "nest", pad: 6 },
        y: { kind: "align", alignment: "middle" },
      }),
      sibling: combine({
        x: { kind: "distribute", spacing: 4 },
        y: { kind: "align", alignment: "middle" },
      }),
    }),
};

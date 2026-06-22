import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { combine, alternate, byDepth, mount } from "./_shared";

// GoTree gallery port — Treemap (gallery/Treemap/dsl1.json ⇄ dsl2.json).
// The original alternates two templates by depth (axes swapped):
//   dsl1: X flatten / Y align   → siblings stack side-by-side on X  (DICE)
//   dsl2: X align  / Y flatten  → siblings stack on Y               (SLICE)
// parentChild is CONSTANT nest×nest (every parent box wraps its subtree on both
// axes); only the SIBLING subdivision alternates slice↔dice every level via
// `alternate([dice, slice])`. That swap is the essence of a squarified-looking
// treemap — it avoids the tall-thin-column look of a single fixed template.
// Node = rectangle, link = none, color = depth (blue ramp, dark root → light leaf).
const meta: Meta = {
  title: "GoTree / Gallery / Treemap",
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Treemap",
      description:
        "A space-filling treemap that recursively alternates slice and dice subdivision to size rectangles by value.",
    },
  },
};
export default meta;

// Internal/parent nodes nest on BOTH axes, so they must be UNSIZED on both x and
// y — the rect grows to wrap its subtree. Leaves are sized by data so areas read
// proportionally (height ∝ d.data.value).
const node = (d: any) =>
  d.height === 0
    ? rect({ w: 92, h: 14 * d.data.value, fill: byDepth()(d) })
    : rect({ fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

const P = 9; // parent→subtree pad (small, constant)
const G = 9; // sibling spacing

// DICE: siblings side-by-side on x, centered on y.
const dice = combine({
  x: { kind: "distribute", spacing: G },
  y: { kind: "align", alignment: "middle" },
});
// SLICE: siblings stacked on y, centered on x.
const slice = combine({
  x: { kind: "align", alignment: "middle" },
  y: { kind: "distribute", spacing: G },
});

export const Treemap: StoryObj = {
  render: () =>
    mount({
      node,
      link: "none",
      // Parent box wraps its subtree on both axes at every depth (constant).
      parentChild: combine({
        x: { kind: "nest", pad: P },
        y: { kind: "nest", pad: P },
      }),
      // Siblings subdivide the parent, swapping dice↔slice every level.
      sibling: alternate([dice, slice]),
    }),
};

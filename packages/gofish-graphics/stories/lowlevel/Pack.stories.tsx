import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { circle, ellipse, pack, polygon } from "../../src/lib";

// `pack` places each child by its enclosing circle. Circles enclose
// themselves, an ellipse encloses as the circle of its larger radius, and a
// polygon as the smallest circle through its vertices. A pack nested in a pack
// is packed by the circle around its own children.
//
// Not gallery-tagged: a test of the operator, not a visualization.
const meta: Meta = {
  title: "Low Level Syntax/Pack",
};
export default meta;

const colors = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f"];

export const MixedShapes: StoryObj = {
  render: () => {
    const container = initializeContainer();

    pack({}, [
      circle({ r: 60, fill: colors[0] }),
      circle({ r: 22, fill: colors[1] }),
      ellipse({ w: 90, h: 44, fill: colors[2] }),
      circle({ r: 38, fill: colors[3] }),
      polygon({
        points: [
          [0, 0],
          [70, 0],
          [35, 60],
        ],
        fill: colors[4],
      }),
      circle({ r: 12, fill: colors[0] }),
      pack({}, [
        circle({ r: 26, fill: colors[1] }),
        circle({ r: 18, fill: colors[2] }),
        circle({ r: 14, fill: colors[3] }),
        circle({ r: 9, fill: colors[4] }),
        circle({ r: 6, fill: colors[0] }),
      ]),
      circle({ r: 30, fill: colors[4] }),
    ]).render(container, { w: 420, h: 420 });

    return container;
  },
};

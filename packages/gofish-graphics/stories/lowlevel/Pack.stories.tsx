import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { circle, enclose, ellipse, pack, polygon, Shape } from "../../src/lib";

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

// A pack inside an enclose. The pack's outline is its children's outlines, so
// the blob hugs the circles rather than the pack's box.
export const Enclosed: StoryObj = {
  render: () => {
    const container = initializeContainer();

    enclose({ shape: Shape.blob(), padding: 8, fill: "#eee", stroke: "#333" }, [
      pack({ spacing: 4 }, [
        circle({ r: 40, fill: colors[0] }),
        circle({ r: 26, fill: colors[1] }),
        circle({ r: 18, fill: colors[2] }),
        circle({ r: 30, fill: colors[3] }),
        circle({ r: 12, fill: colors[4] }),
        circle({ r: 22, fill: colors[0] }),
      ]),
    ]).render(container, { w: 300, h: 300 });

    return container;
  },
};

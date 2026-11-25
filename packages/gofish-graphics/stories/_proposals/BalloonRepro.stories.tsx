import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { layer, spread, rect, ellipse, Coord } from "../../src/lib";

// Scratch repros for the balloon chart (Low Level Syntax/Balloon Chart):
// where a `layer({ box: true })` lands inside `Coord.wavy()`.

const meta: Meta = {
  title: "Proposals/Balloon Repro",
};
export default meta;

// A red point rect and a blue box layer holding the same rect, both at
// x 40 to 50 and y 40 to 50. In a linear space they coincide. In the wavy
// space the point rect is drawn at the warped image of its center; the box
// is expected to land there too, since its content is drawn flat but the
// box itself is placed in the parent's space.
export const BoxVsPoint: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.wavy(), x: 0, y: 0 }, [
      rect({ x: 0, y: 0, w: 100, h: 1, fill: "#ddd" }),
      rect({ x: 40, y: 40, w: 10, h: 10, fill: "#e63946" }),
      layer({ box: true, x: 40, y: 40 }, [
        rect({ x: 0, y: 0, w: 10, h: 10, fill: "#457b9d", opacity: 0.6 }),
      ]),
    ]).render(container, { w: 200, h: 200 });
    return container;
  },
};

// A string and a balloon in a zero-gap chain along y. The chain relates
// both of the string's y edges, so the string is a length of the space and
// bends with it. The balloon is a box (drawn flat). Its bottom should sit on
// the string's top.
export const ChainStringToBox: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer(
      { coord: Coord.wavy(), x: 0, y: 0 },
      [20, 50, 80].map((h, i) =>
        spread(
          { x: 15 + 30 * i, y: 0, dir: "y", spacing: 0, alignment: "middle" },
          [
            rect({ w: 1, h, fill: "black" }),
            layer({ box: true }, [
              ellipse({ cx: 10, cy: 10, w: 20, h: 20, fill: "#457b9d" }),
            ]),
          ]
        )
      )
    ).render(container, { w: 200, h: 200 });
    return container;
  },
};

// The same chain with a plain layer (no box) of two point ellipses on top:
// a small knot at the bottom and a body above it. Each ellipse is a point,
// drawn flat at the warped image of its own center, so the knot meets the
// string, and the body is moved by a different amount than the knot.
export const ChainStringToLayer: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer(
      { coord: Coord.wavy(), x: 0, y: 0 },
      [20, 50, 80].map((h, i) =>
        spread(
          { x: 15 + 30 * i, y: 0, dir: "y", spacing: 0, alignment: "middle" },
          [
            rect({ w: 1, h, fill: "black" }),
            layer([
              ellipse({ cx: 10, cy: 2, w: 8, h: 4, fill: "#e63946" }),
              ellipse({ cx: 10, cy: 14, w: 20, h: 20, fill: "#457b9d" }),
            ]),
          ]
        )
      )
    ).render(container, { w: 200, h: 200 });
    return container;
  },
};

import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Coord, layer, rect, spread, stack, v } from "../../src/lib";

// Shows a case of the embedding rule for review (not gallery-tagged). A small
// rose: six months edge to edge around the circle, each a stack of two bars
// with a literal width along the angle and no emX. The spread relates both
// edges of each month's stack along the angle, but the stack only aligns its
// bars at their baseline there, which pins one point of each bar. So no
// relation fixes a bar's extent along the angle, its width stays ink, and
// each bar draws as a thin band, whether or not the two widths agree.
const meta: Meta = { title: "Proposals/Stack In Chain Embedding" };
export default meta;

const WEDGE = (Math.PI * 2) / 6;
const months = [
  [3, 2],
  [5, 1],
  [2, 4],
  [4, 3],
  [6, 2],
  [3, 5],
];

const rose = (innerWidth: number): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.clock(), w: 300, h: 300 }, [
      spread(
        { dir: "x", spacing: 0 },
        months.map(([a, b]) =>
          stack({ dir: "y" }, [
            rect({ w: innerWidth, h: v(a), fill: "#457b9d" }),
            rect({ w: WEDGE, h: v(b), fill: "#e9c46a" }),
          ])
        )
      ),
    ]).render(container, { w: 300, h: 300 });
    return container;
  },
});

/** Both bars of a month have the same width. */
export const OneWidth = rose(WEDGE);

/** The inner bar is a little narrower than the outer one. */
export const TwoWidths = rose(WEDGE * 0.8);

/** The same rose with each month a stack in a layer of width `WEDGE`, and
 *  bars with no width of their own: each bar fills its month along the
 *  angle, so its width is a length of the space by itself. */
export const BarsFillMonth: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.clock(), w: 300, h: 300 }, [
      spread(
        { dir: "x", spacing: 0 },
        months.map(([a, b]) =>
          layer({ w: WEDGE }, [
            stack({ dir: "y" }, [
              rect({ h: v(a), fill: "#457b9d" }),
              rect({ h: v(b), fill: "#e9c46a" }),
            ]),
          ])
        )
      ),
    ]).render(container, { w: 300, h: 300 });
    return container;
  },
};

import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Coord, layer, rect, spread, stack, v } from "../../src/lib";

// Shows one embedding rule for review (not gallery-tagged): marks aligned at
// one anchor with the same literal size share both edges, so they embed.
// A small rose: six months edge to edge around the circle, each a stack of
// two bars with a literal width along the angle and no emX.
const meta: Meta = { title: "Proposals/Equal Size Embedding" };
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

/** Both bars of a month have the same width: every bar draws as a wedge. */
export const OneWidth = rose(WEDGE);

/** The inner bar is a little narrower than the outer one. */
export const TwoWidths = rose(WEDGE * 0.8);

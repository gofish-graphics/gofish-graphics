import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, catchLocations } from "../../src/data/catch";
import { layer, spread, ellipse, rect, Coord } from "../../src/lib";
import { color, color6, mix } from "../../src/color";
import _ from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Balloon Chart",
};
export default meta;

type Args = { w: number; h: number };

const scatterData = _(seafood)
  .groupBy("lake")
  .map((lakeData, lake) => ({
    lake,
    x: catchLocations[lake].x,
    y: catchLocations[lake].y,
    collection: lakeData.map((item) => ({
      species: item.species,
      count: item.count,
    })),
  }))
  .value();

export const Default: StoryObj<Args> = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Balloon Chart",
      description:
        "A whimsical scatterplot of fishing-catch locations where each lake's value floats as a colored balloon on a wavy string.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    const colorMap = {
      0: color.red,
      1: color.blue,
      2: color.green,
      3: color.yellow,
      4: color.purple,
      5: color.orange,
    };

    // A balloon, drawn y-up: the knot at the bottom (y 0 to 4) and the body
    // above it (y 4 to 34), centered on x = 15. It is a box, so the wavy
    // space does not bend it.
    const Balloon = (palette) =>
      layer({ box: true }, [
        ellipse({ cx: 15, cy: 19, w: 24, h: 30, fill: palette[4] }),
        ellipse({ cx: 12, cy: 23, w: 7, h: 11, fill: palette[3] }),
        rect({ cx: 15, cy: 2, w: 8, h: 4, fill: palette[5], rx: 3, ry: 2 }),
        rect({ cx: 15, cy: 2, w: 5, h: 2.4, fill: palette[6], rx: 2, ry: 1 }),
      ]);

    // Each string and its balloon are a chain along y with no gap, so the
    // string's top edge is the balloon's bottom edge. The chain fixes both of
    // the string's edges, so the string is a length of the space and bends
    // with it.
    // TODO: a box in a coordinate space is drawn at its unwarped position
    // (repro: Proposals/Balloon Repro), so the balloons do not yet sit
    // exactly on their strings.
    layer(
      { coord: Coord.wavy(), x: 0, y: 0 },
      scatterData.map((data, i) =>
        spread({ x: data.x, y: 0, dir: "y", spacing: 0, alignment: "middle" }, [
          rect({ w: 1, h: data.y, fill: color.black }),
          Balloon([
            null,
            null,
            null,
            mix(color6[i % 6], color.white, 0.5),
            color6[i % 6],
            mix(color6[i % 6], color.black, 0.1),
            mix(color6[i % 6], color.black, 0.35),
          ]),
        ])
      )
    ).render(container, {
      axes: true,
    });

    return container;
  },
};

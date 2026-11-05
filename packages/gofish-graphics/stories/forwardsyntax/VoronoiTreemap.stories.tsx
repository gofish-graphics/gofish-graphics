import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { countryPopulations } from "../../src/data/countryPopulations";
import {
  chart,
  enclose,
  rect,
  region,
  Shape,
  Tile,
  treemap,
} from "../../src/lib";

// Voronoi treemaps (Balzer and Deussen 2005): each level cuts its region
// into convex cells with an area proportional to population. Each `treemap`
// in the flow is one level and hands each child its cell, and `region()`
// draws the cell it is in. Gaps between siblings come from `spacing`.
const meta: Meta = {
  title: "Forward Syntax/Voronoi Treemap",
};
export default meta;

// Countries by region and continent, three Voronoi levels in the chart's
// box.
export const Default: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(countryPopulations, { axes: false, w: 480, h: 480 })
      .flow(
        treemap({
          by: "continent",
          size: "pop",
          spacing: 5,
          tile: Tile.voronoi,
        }),
        treemap({
          by: "region",
          size: "pop",
          spacing: 2.5,
          tile: Tile.voronoi,
        }),
        treemap({ size: "pop", spacing: 1, tile: Tile.voronoi })
      )
      .mark(region({ fill: "continent" }))
      .render(container);

    return container;
  },
};

// The same levels in a circle: the `enclose` above the treemap hands its
// oval down as the region the treemap fills.
export const Circle: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Voronoi Treemap",
      description:
        "Seventy countries as cells of a circle with areas proportional to population, nested in a cell for each region and a larger cell for each continent.",
    },
  },
  render: () => {
    const container = initializeContainer();

    chart(countryPopulations, { axes: false, w: 480, h: 480 })
      .flow(
        enclose({ shape: Shape.oval, fill: "none" }),
        treemap({
          by: "continent",
          size: "pop",
          spacing: 5,
          tile: Tile.voronoi,
        }),
        treemap({
          by: "region",
          size: "pop",
          spacing: 2.5,
          tile: Tile.voronoi,
        }),
        treemap({ size: "pop", spacing: 1, tile: Tile.voronoi })
      )
      .mark(region({ fill: "continent" }))
      .render(container);

    return container;
  },
};

// Continents as squarified rectangles, with Voronoi levels inside each: a
// rectangle is convex, so a Voronoi treemap can fill it.
export const SquarifyThenVoronoi: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(countryPopulations, { axes: false, w: 480, h: 480 })
      .flow(
        treemap({ by: "continent", size: "pop", spacing: 8 }),
        treemap({
          by: "region",
          size: "pop",
          spacing: 2.5,
          tile: Tile.voronoi,
        }),
        treemap({ size: "pop", spacing: 1, tile: Tile.voronoi })
      )
      .mark(region({ fill: "continent" }))
      .render(container);

    return container;
  },
};

// The classic slice-and-dice treemap (Shneiderman 1992): one level slices,
// the next dices, one flow step each.
export const SliceThenDice: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(countryPopulations, { axes: false, w: 320, h: 320 })
      .flow(
        treemap({ by: "continent", size: "pop", spacing: 4, tile: Tile.slice }),
        treemap({ by: "region", size: "pop", spacing: 2, tile: Tile.dice })
      )
      .mark(rect({ fill: "continent" }))
      .render(container);

    return container;
  },
};

// An outline around each continent: in a Voronoi cell, `Shape.box` is the
// cell itself, so the `enclose` between the levels draws the continent's
// cell and hands it down.
export const ContinentOutlines: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(countryPopulations, { axes: false, w: 480, h: 480 })
      .flow(
        treemap({
          by: "continent",
          size: "pop",
          spacing: 6,
          tile: Tile.voronoi,
        }),
        enclose({
          shape: Shape.box,
          fill: "none",
          stroke: "#333",
          strokeWidth: 1.5,
        }),
        treemap({ by: "region", size: "pop", spacing: 3, tile: Tile.voronoi }),
        treemap({ size: "pop", spacing: 1, tile: Tile.voronoi })
      )
      .mark(region({ fill: "continent" }))
      .render(container);

    return container;
  },
};

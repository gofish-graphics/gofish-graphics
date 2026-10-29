import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  countryPopulations,
  type CountryPopulation,
} from "../../src/data/countryPopulations";
import { chart, circle, compose, enclose, pack, Shape } from "../../src/lib";

// Bubble treemaps (Görtler et al., TVCG 2018): a nested circle pack in which
// each group is drawn as a contour that hugs its children. Each `enclose` in
// the flow wraps the groups of the `pack` above it, and that pack packs the
// contours.
const meta: Meta = {
  title: "Forward Syntax/Bubble Treemap",
};
export default meta;

// TODO(#967): `pack` cannot scale a data-driven size yet, so the radius is
// computed in pixels (area proportional to population) instead of
// `circle({ r: "pop" })`.
const country = (d: CountryPopulation[]) =>
  circle({ r: 1.6 * Math.sqrt(d[0].pop), fill: "continent" })(d);

// Countries packed by region, regions by continent, with a contour around
// each region and each continent.
export const Default: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Bubble Treemap",
      description:
        "Seventy countries as circles sized by population, packed by region and continent, with a contour of circular arcs around each region and a wider one around each continent.",
    },
  },
  render: () => {
    const container = initializeContainer();

    chart(countryPopulations)
      .flow(
        pack({ by: "continent", spacing: 4 }),
        enclose({
          shape: Shape.arcs({ radius: 12 }),
          padding: 4,
          fill: "none",
          stroke: "#333",
          strokeWidth: 1.5,
        }),
        pack({ by: "region", spacing: 4 }),
        enclose({
          shape: Shape.arcs({ radius: 8 }),
          padding: 4,
          fill: "none",
          stroke: "#999",
        }),
        pack()
      )
      .mark(country)
      .render(container, { w: 720, h: 600 });

    return container;
  },
};

// Each region's contour sits `uncertainty` pixels from its countries, so a
// less certain region reads as a looser outline. (The column is made up; see
// src/data/countryPopulations.ts.)
export const Uncertainty: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(countryPopulations)
      .flow(
        pack({ by: "continent", spacing: 4 }),
        enclose({
          shape: Shape.arcs({ radius: 12 }),
          padding: 4,
          fill: "none",
          stroke: "#333",
          strokeWidth: 1.5,
        }),
        pack({ by: "region", spacing: 4 }),
        enclose({
          shape: Shape.arcs({ radius: 8 }),
          padding: "uncertainty",
          fill: "none",
          stroke: "#999",
        }),
        pack()
      )
      .mark(country)
      .render(container, { w: 760, h: 640 });

    return container;
  },
};

// A bubble treemap as a helper: `compose` packages the list of pack and
// enclose steps, one pair per level, as one flow step. It builds the same
// tree as writing the steps out, with one shape and padding at every level.
const bubbleTreemap = ({
  by,
  shape = Shape.arcs(),
  spacing = 4,
  padding = 4,
}: {
  by: string[];
  shape?: Shape.Shape;
  spacing?: number;
  padding?: number;
}) =>
  compose(
    ...by.flatMap((key) => [
      pack({ by: key, spacing }),
      enclose({ shape, padding, fill: "none" }),
    ]),
    pack()
  );

export const Composed: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(countryPopulations)
      .flow(bubbleTreemap({ by: ["continent", "region"] }))
      .mark(country)
      .render(container, { w: 720, h: 600 });

    return container;
  },
};

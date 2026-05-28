import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { catchLocationsArray, seafood, catchLocations } from "../../src/data/catch";
import { drivingShifts } from "../../src/data/drivingShifts";
import { Chart, layer, select, line, rect, stack } from "../../src/lib";
import { circle, scatter } from "../../src/lib";
import { clock } from "../../src/ast/coordinateTransforms/clock";
import _ from "lodash";

const meta: Meta = {
  title: "Forward Syntax V3/Scatter",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

export const Basic: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(catchLocationsArray)
      .flow(scatter({ by: "lake",  x: "x", y: "y" }))
      .mark(circle({ r: 5 }))
      .render(container, {
        w: args.w,
        h: args.h,
        axes: true,
      });

    return container;
  },
};

export const Connected: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      Chart(drivingShifts)
        .flow(scatter({ by: "year",  x: "miles", y: "gas" }))
        .mark(circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 }).name("points")),
      Chart(select("points"))
        .mark(line({ stroke: "black", strokeWidth: 2 }))
        .zOrder(-1),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

export const WithPieGlyphs: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    const scatterData = _(seafood)
      .groupBy("lake")
      .map((lakeData, lake) => ({
        lake,
        x: catchLocations[lake as keyof typeof catchLocations].x,
        y: catchLocations[lake as keyof typeof catchLocations].y,
        collection: lakeData.map((item) => ({
          species: item.species,
          count: item.count,
        })),
      }))
      .value();

    Chart(scatterData)
      .flow(scatter({ by: "lake",  x: "x", y: "y" }))
      .mark((data) =>
        Chart(data[0].collection, { coord: clock() })
          .flow(stack({ by: "species",  dir: "x", /* h: "count" */ h: 20 }))
          .mark(rect({ w: "count", fill: "species" }))
      )
      .render(container, {
        w: args.w,
        h: args.h,
        axes: true,
      });

    return container;
  },
};

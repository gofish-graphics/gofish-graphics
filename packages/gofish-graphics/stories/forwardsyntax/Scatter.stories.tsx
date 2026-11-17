import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  catchLocationsArray,
  catchDataWithLocations,
  seafood,
} from "../../src/data/catch";
import { drivingShifts } from "../../src/data/drivingShifts";
import { chart, line, rect, stack, join } from "../../src/lib";
import { circle, scatter, Coord } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Scatter",
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

    chart(catchLocationsArray, { w: args.w, h: args.h })
      .flow(scatter({ by: "lake",  cx: "x", cy: "y" }))
      .mark(circle({ r: 5 }))
      .render(container);

    return container;
  },
};

export const Connected: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Connected Scatter Plot",
      description:
        "A connected scatter plot tracing gas price against miles driven over successive years, with a line threading the points in chronological order to reveal the path through time.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(drivingShifts, { w: args.w, h: args.h })
      .flow(scatter({ by: "year", cx: "miles", cy: "gas" }))
      .mark(circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 }))
      .layer(line({ stroke: "black", strokeWidth: 2 }))
      .render(container);

    return container;
  },
};

export const WithPieGlyphs: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Scatter Plot with Pie Glyphs",
      description:
        "A scatter plot placing each lake at its geographic location and drawing a miniature pie chart of its species composition as the point glyph.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(catchLocationsArray, { w: args.w, h: args.h })
      .flow(scatter({ by: "lake",  cx: "x", cy: "y" }))
      // The glyph chart leaves off its data: as a nested mark it inherits its
      // parent partition (the lake's row), joins in that lake's catch rows, and
      // draws them as a polar pie — no `(data) => chart(data, ...)` callback.
      .mark(
        chart({ coord: Coord.clock() })
          .flow(
            join(seafood, { on: "lake" }),
            stack({ by: "species",  dir: "x", /* h: "count" */ h: 20 })
          )
          .mark(rect({ w: "count", fill: "species" }))
      )
      .render(container);

    return container;
  },
};

// Same pie-glyph chart from a single *denormalized* table: `catchDataWithLocations`
// stamps each lake's x/y onto every catch row, so the scatter partition already
// carries each glyph's rows — the nested chart inherits them directly, no join.
export const WithPieGlyphsDenormalized: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(catchDataWithLocations, { w: args.w, h: args.h })
      .flow(scatter({ by: "lake", cx: "x", cy: "y" }))
      .mark(
        chart({ coord: Coord.clock() })
          .flow(stack({ by: "species", dir: "x", h: 20 }))
          .mark(rect({ w: "count", fill: "species" }))
      )
      .render(container);

    return container;
  },
};

// The three anchors a scatter places by, on shared axes. Each tier draws a
// translucent square at every point: `cx`/`cy` centers it there, `x`/`y`
// puts its start edges (left, bottom) there, and `x2`/`y2` its end edges
// (right, top). The black dots sit on the data points.
const anchorPoints = [
  { id: "a", u: 2, v: 2 },
  { id: "b", u: 6, v: 8 },
  { id: "c", u: 10, v: 4 },
];

const anchorSquares = (keys: object, fill: string) =>
  chart(anchorPoints)
    .flow(scatter({ by: "id", ...keys }))
    .mark(rect({ w: 60, h: 60, fill, opacity: 0.35 }));

export const Anchors: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(anchorPoints, { w: args.w, h: args.h })
      .flow(scatter({ by: "id", cx: "u", cy: "v" }))
      .mark(rect({ w: 60, h: 60, fill: "orange", opacity: 0.35 }))
      .layer(anchorSquares({ x: "u", y: "v" }, "steelblue"))
      .layer(anchorSquares({ x2: "u", y2: "v" }, "seagreen"))
      .layer(
        chart(anchorPoints)
          .flow(scatter({ by: "id", cx: "u", cy: "v" }))
          .mark(circle({ r: 3, fill: "black" }))
      )
      .render(container);

    return container;
  },
};

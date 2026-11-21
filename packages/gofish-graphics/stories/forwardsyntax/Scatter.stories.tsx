import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  catchLocationsArray,
  catchDataWithLocations,
  seafood,
} from "../../src/data/catch";
import { drivingShifts } from "../../src/data/drivingShifts";
import { penguins } from "../../src/data/penguins";
import { chart, derive, line, rect, stack, join, Curve } from "../../src/lib";
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
      .flow(scatter({ by: "lake",  x: "x", y: "y" }))
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
      .flow(scatter({ by: "year", x: "miles", y: "gas" }))
      .mark(circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 }))
      .layer(line({ stroke: "black", strokeWidth: 2 }))
      .render(container);

    return container;
  },
};

const measured = penguins.filter(
  (p) => p["Flipper Length (mm)"] !== null && p["Body Mass (g)"] !== null
);

/** The least-squares line of `y` on `x` through `rows`, as two rows at the
 *  least and the greatest `x`, with the same column names as the rows, so
 *  a line through them shares the scatter's axes. */
const leastSquares = (rows: Record<string, any>[], x: string, y: string) => {
  const n = rows.length;
  const mx = rows.reduce((a, r) => a + r[x], 0) / n;
  const my = rows.reduce((a, r) => a + r[y], 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const r of rows) {
    sxy += (r[x] - mx) * (r[y] - my);
    sxx += (r[x] - mx) ** 2;
  }
  const slope = sxy / sxx;
  const xs = rows.map((r) => r[x]);
  return [Math.min(...xs), Math.max(...xs)].map((t) => ({
    [x]: t,
    [y]: my + slope * (t - mx),
  }));
};

export const TrendLine: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(measured, { w: args.w, h: args.h })
      .flow(scatter({ x: "Flipper Length (mm)", y: "Body Mass (g)" }))
      .mark(circle({ r: 2.5, fill: "#9aa7b8" }))
      .layer(
        chart(measured)
          .flow(
            derive((rows) =>
              leastSquares(rows, "Flipper Length (mm)", "Body Mass (g)")
            )
          )
          .mark(
            line({
              x: "Flipper Length (mm)",
              y: "Body Mass (g)",
              stroke: "#c0392b",
              strokeWidth: 2,
              curve: Curve.linear(),
            })
          )
      )
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
      .flow(scatter({ by: "lake",  x: "x", y: "y" }))
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
      .flow(scatter({ by: "lake", x: "x", y: "y" }))
      .mark(
        chart({ coord: Coord.clock() })
          .flow(stack({ by: "species", dir: "x", h: 20 }))
          .mark(rect({ w: "count", fill: "species" }))
      )
      .render(container);

    return container;
  },
};

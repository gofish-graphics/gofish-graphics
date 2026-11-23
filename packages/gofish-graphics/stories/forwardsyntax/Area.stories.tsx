import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { unemployment } from "../../src/data/unemployment";
import { chart, stack, Baseline } from "../../src/lib";
import { ribbon, line, group, Coord, Unit } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Area",
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

// The six industries with the most unemployment over the decade, one for
// each color of the default palette.
const largest = [
  "Wholesale and Retail Trade",
  "Manufacturing",
  "Leisure and hospitality",
  "Business services",
  "Construction",
  "Education and Health",
];

export const Basic: StoryObj<Args> = {
  args: { w: 560, h: 300 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Area Chart",
      description:
        "Unemployment in US construction month by month from 2000 to 2010, drawn as one filled area over a time axis.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    const construction = unemployment.filter(
      (d) => d.series === "Construction"
    );

    chart(construction, {
      w: args.w,
      h: args.h,
      schema: { date: Unit.time() },
      axes: { x: { title: false }, y: { title: "Unemployed (thousands)" } },
    })
      .mark(ribbon({ x: "date", h: "count", opacity: 0.8 }))
      .render(container);

    return container;
  },
};

export const Stacked: StoryObj<Args> = {
  args: { w: 560, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Stacked Area Chart",
      description:
        "Unemployment in the six largest US industries month by month from 2000 to 2010, stacked into bands so the top edge is their total and each band is one industry.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    const rows = unemployment.filter((d) => largest.includes(d.series));

    chart(rows, {
      w: args.w,
      h: args.h,
      schema: { date: Unit.time() },
      axes: { x: { title: false }, y: { title: "Unemployed (thousands)" } },
    })
      .flow(stack({ by: "series", dir: "y" }))
      .mark(ribbon({ x: "date", h: "count", fill: "series" }))
      .render(container);

    return container;
  },
};

// A stacked area about its middle (`Baseline.middle()`, d3's
// `stackOffsetSilhouette`): each band keeps its thickness, and the stack is
// centered at every date. A test, not a gallery visualization.
export const StackedMiddle: StoryObj<Args> = {
  args: { w: 560, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(unemployment, {
      w: args.w,
      h: args.h,
      schema: { date: Unit.time() },
    })
      .flow(stack({ by: "series", dir: "y", baseline: Baseline.middle() }))
      .mark(ribbon({ x: "date", h: "count", fill: "series" }))
      .render(container);

    return container;
  },
};

// Series sampled at different x: outside its own rows a series has
// thickness 0, so the bands above it step down onto the band below where it
// starts and ends. A test, not a gallery visualization.
export const StackedUnevenSamples: StoryObj<Args> = {
  args: { w: 420, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    const rows = [
      ...[0, 2, 4, 6, 8].map((x, i) => ({ s: "a", x, v: [3, 4, 2, 5, 3][i] })),
      ...[1, 2.5, 5, 7].map((x, i) => ({ s: "b", x, v: [1, 2, 3, 1][i] })),
      ...[0, 3, 8].map((x, i) => ({ s: "c", x, v: [2, 1, 2][i] })),
    ];

    chart(rows, { w: args.w, h: args.h })
      .flow(stack({ by: "s", dir: "y" }))
      .mark(ribbon({ x: "x", h: "v", fill: "s" }))
      .render(container);

    return container;
  },
};

// A stacked area under a clock: the stack moves each band along r by its
// offset, and the band is resampled through the clock. A test, not a
// gallery visualization.
export const StackedPolar: StoryObj<Args> = {
  args: { w: 420, h: 420 },
  render: (args: Args) => {
    const container = initializeContainer();
    const industries = ["Construction", "Finance", "Manufacturing"];
    const rows = unemployment.filter(
      (d) => industries.includes(d.series) && d.date.startsWith("2009")
    );

    chart(rows, {
      coord: Coord.clock(),
      w: args.w,
      h: args.h,
      schema: { date: Unit.time() },
    })
      .flow(stack({ by: "series", dir: "y" }))
      .mark(ribbon({ x: "date", h: "count", fill: "series" }))
      .render(container);

    return container;
  },
};

// The shape form of `ribbon` under a coordinate transform: each band is the
// exact curve through its rows, resampled through the clock. A test of the
// composition, not a gallery visualization.
export const Polar: StoryObj<Args> = {
  args: { w: 420, h: 420 },
  render: (args: Args) => {
    const container = initializeContainer();
    const industries = ["Construction", "Finance"];
    const rows = unemployment.filter(
      (d) => industries.includes(d.series) && d.date.startsWith("2009")
    );

    chart(rows, {
      coord: Coord.clock(),
      w: args.w,
      h: args.h,
      schema: { date: Unit.time() },
    })
      .flow(group({ by: "series" }))
      .mark(ribbon({ x: "date", h: "count", fill: "series", opacity: 0.6 }))
      .render(container);

    return container;
  },
};

// The shape forms of `ribbon` and `line`, labeled by their outlines: a band's
// label goes inside it (`Placement.interior()`, the default for a filled
// region), a line's at its end (`Placement.end()`, the default for an open
// path). A test, not a gallery visualization.
export const Labeled: StoryObj<Args> = {
  args: { w: 560, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    const schema = { date: Unit.time() };
    const construction = unemployment.filter(
      (d) => d.series === "Construction"
    );
    const lines = unemployment.filter(
      (d) => d.series === "Finance" || d.series === "Information"
    );

    chart(construction, { w: args.w, h: args.h, schema })
      .mark(ribbon({ x: "date", h: "count", opacity: 0.4 }).label("series"))
      .layer(
        chart(lines, { schema })
          .flow(group({ by: "series" }))
          .mark(
            line({ x: "date", y: "count", stroke: "series" }).label("series")
          )
      )
      .render(container);

    return container;
  },
};

export const Layered: StoryObj<Args> = {
  args: { w: 560, h: 300 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Layered Area Chart",
      description:
        "Unemployment in three US industries from 2000 to 2010, drawn as translucent areas over one time axis, so where they overlap the seasons and the 2008 rise can be compared.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    const industries = ["Manufacturing", "Construction", "Finance"];
    const rows = unemployment.filter((d) => industries.includes(d.series));

    chart(rows, {
      w: args.w,
      h: args.h,
      schema: { date: Unit.time() },
      axes: { x: { title: false }, y: { title: "Unemployed (thousands)" } },
    })
      .flow(group({ by: "series" }))
      .mark(ribbon({ x: "date", h: "count", fill: "series", opacity: 0.5 }))
      .render(container);

    return container;
  },
};

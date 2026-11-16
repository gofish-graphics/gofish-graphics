import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { unemployment } from "../../src/data/unemployment";
import { chart, spread, stack } from "../../src/lib";
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
        "Fish catch counts by lake split into stacked bands by species, each a colored filled area.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(seafood, { h: args.h })
      .flow(
        spread({ by: "lake", dir: "x", spacing: 64 }),
        stack({ by: "species", dir: "y" })
      )
      .mark(ribbon({ h: "count", fill: "species", opacity: 0.8 }))
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
// label goes inside it (`Place.interior()`, the default for a filled
// region), a line's at its end (`Place.end()`, the default for an open
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

    chart(rows, { w: args.w, h: args.h, schema: { date: Unit.time() } })
      .flow(group({ by: "series" }))
      .mark(ribbon({ x: "date", h: "count", fill: "series", opacity: 0.5 }))
      .render(container);

    return container;
  },
};

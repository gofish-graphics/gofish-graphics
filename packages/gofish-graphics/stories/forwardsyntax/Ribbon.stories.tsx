import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import {
  chart,
  spread,
  scatter,
  rect,
  stack,
  derive,
  layer,
  selectAll,
} from "../../src/lib";
import { area, group } from "../../src/lib";
import { orderBy } from "lodash";
import { clock } from "../../src/ast/coordinateTransforms/clock";

const meta: Meta = {
  title: "Forward Syntax V3/Ribbon",
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
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Ribbon Chart",
      description:
        "A ribbon chart tracking fish catch by species across six lakes, where each species' band is reordered at every lake so the largest sits on top and ribbons cross as rankings change.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      chart(seafood)
        .flow(
          spread({ by: "lake",  dir: "x", spacing: 64 }),
          derive((d) => orderBy(d, "count", "asc")),
          stack({ by: "species",  dir: "y" })
        )
        .mark(rect({ h: "count", fill: "species" }).name("bars")),
      chart(selectAll("bars"))
        .flow(group({ by: "species" }))
        .mark(area({ opacity: 0.8 })),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

// Same ribbon as `Basic`, expressed with the `.layer()` chaining API instead
// of the manual `layer([...])` + `selectAll("bars")` form. The previous tier's
// marks flow into `.layer()` implicitly (no `.name`), and `group({ by })`
// reads the bare field off the refs (no `datum.` prefix). Should render
// identically to `Basic`.
export const Layered: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(seafood, { axes: true })
      .flow(
        spread({ by: "lake", dir: "x", spacing: 64 }),
        derive((d) => orderBy(d, "count", "asc")),
        stack({ by: "species", dir: "y" })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .layer(
        chart() // empty scope = the previous tier's marks
          .flow(group({ by: "species" }))
          .mark(area({ opacity: 0.8 }))
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};

export const Polar: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Polar Ribbon Chart",
      description:
        "The lake-by-lake fish catch ribbons wrapped around a polar layout, coiling each species into a swirling spiral of nested colored bands.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    layer({ coord: clock() }, [
      chart(seafood)
        .flow(
          scatter({
            by: "lake",
            x: "lake",
            w: 2 * Math.PI,
            axes: { x: false, y: true },
          }).translate({ y: 50 }),
          derive((d) => orderBy(d, "count", "asc")),
          stack({ by: "species", dir: "y", label: false })
        )
        .mark(rect({ w: 0.1, h: "count", fill: "species" }).name("bars")),
      chart(selectAll("bars"))
        .flow(group({ by: "species" }))
        .mark(area({ opacity: 0.8 })),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

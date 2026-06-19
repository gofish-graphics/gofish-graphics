import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import {
  Chart,
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
      Chart(seafood)
        .flow(
          spread({ by: "lake",  dir: "x", spacing: 64 }),
          derive((d) => orderBy(d, "count", "asc")),
          stack({ by: "species",  dir: "y" })
        )
        .mark(rect({ h: "count", fill: "species" }).name("bars")),
      Chart(selectAll("bars"))
        .flow(group({ by: "datum.species" }))
        .mark(area({ opacity: 0.8 })),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
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
      Chart(seafood)
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
      Chart(selectAll("bars"))
        .flow(group({ by: "datum.species" }))
        .mark(area({ opacity: 0.8 })),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

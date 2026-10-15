import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, catchLocations } from "../../src/data/catch";
import {
  chart,
  scatter,
  stack,
  rect,
  layer,
  petal,
  Constraint,
  Coord,
} from "../../src/lib";
import { color } from "../../src/color";

const meta: Meta = {
  title: "Forward Syntax/Flower Chart",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 1400, step: 20 } },
    h: { control: { type: "number", min: 200, max: 800, step: 20 } },
  },
};
export default meta;

type Args = { w: number; h: number };

// Fixed radius of every flower head, in pixels. The petals fan out to this
// shared length; only their colors and angular widths vary with the data.
const FLOWER_RADIUS = 40;

// Each species row tagged with its lake's planting location on x.
const stemData = seafood.map((d) => ({
  ...d,
  x: catchLocations[d.lake as keyof typeof catchLocations].x,
}));

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Flower Chart",
      description:
        "A distribution rendered as a meadow, where each binned count grows a layered flower of colored petals atop a green stem.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    // One flower head: a polar fan of petals, one per species, each as wide
    // as that species' count. It has no data of its own, so as a nested mark
    // it inherits each lake's rows.
    const flower = chart({ coord: Coord.polar(), axes: false })
      .flow(stack({ by: "species", dir: "x", h: FLOWER_RADIUS }))
      // TODO(#1111): lighten the petals, as the low-level version did.
      .mark(petal({ w: "count", fill: "species" }));

    // One plant per lake, planted at the lake's x location: a thin green stem
    // as tall as the lake's total catch, with the flower centered on its top.
    chart(stemData, { axes: false })
      .flow(scatter({ by: "lake", x: "x" }))
      .mark(
        layer([
          rect({ w: 4, h: "count", fill: color.green[5] }).name("stem"),
          flower.name("flower"),
        ]).relate(({ stem, flower }) => [
          Constraint.align({ x: "middle", y: ["end", "middle"] }, [
            stem,
            flower,
          ]),
        ])
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

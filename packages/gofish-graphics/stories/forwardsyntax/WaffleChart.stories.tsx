import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { Chart, spread, rect, derive } from "../../src/lib";
import { repeat } from "../../src/lib";
import _ from "lodash";

const meta: Meta = {
  title: "Forward Syntax V3/Waffle Chart",
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Waffle Chart",
      description:
        "A waffle chart of fish catch across six lakes, where each catch becomes a colored square tiled into per-lake columns so the species mix reads as a grid of unit cells.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(seafood, { axes: true })
      .flow(
      spread({ by: "lake",  spacing: 8, dir: "x", axes: false }),
        derive((d) => d.flatMap((d) => repeat(d, "count"))),
        derive((d) => _.chunk(d, 5)),
        spread({ spacing: 2, dir: "y" }),
        spread({ spacing: 2, dir: "x" })
      )
      .mark(rect({ w: 8, h: 8, fill: "species" }))
      .render(container, {});

    return container;
  },
};

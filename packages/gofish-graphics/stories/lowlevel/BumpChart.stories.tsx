import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { newCarColors } from "../../src/data/newCarColors";
import { frame, spread, connectY, ellipse, ref, For, v } from "../../src/lib";
import { groupBy } from "lodash";
import _ from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Bump Chart",
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Bump Chart",
      description:
        "A bump chart tracing the popularity ranking of new-car colors from 2000 to 2015, with one colored line per color rising and falling through the yearly rank positions.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    frame({}, [
      For(groupBy(newCarColors, "Year"), (d, key) =>
        spread(
          { dir: "y", x: ((key as number) - 2000) * 30, spacing: 16, alignment: "start" },
          For(_.sortBy(d, "Rank"), (d) =>
            ellipse({ w: 8, h: 8, fill: v(d.Color) }).name(`${d.Color}-${d.Year}`)
          )
        )
      ),
      For(groupBy(newCarColors, "Color"), (d) =>
        connectY(
          { strokeWidth: 2, mode: "center" },
          For(d, (d) => ref(`${d.Color}-${d.Year}`))
        )
      ),
    ]).render(container, {});

    return container;
  },
};

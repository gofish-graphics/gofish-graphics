import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { titanic } from "../../src/data/titanic";
import { chart, stack, rect } from "../../src/lib";
import { color6, gray } from "../../src/color";

const meta: Meta = {
  title: "Low Level Syntax/Nested Mosaic Chart",
};
export default meta;

const classColor: Record<string, string> = {
  First: color6[0],
  Second: color6[1],
  Third: color6[2],
  Crew: color6[3],
};

export const Default: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Nested Mosaic Chart",
      description:
        "Titanic survival broken down by passenger class as a mosaic plot, where each cell's width and height encode the proportions of a two-way contingency table.",
    },
  },
  render: () => {
    const container = initializeContainer();

    // Three nested spines, alternating axes (class → sex → survived). Each level
    // `normalize`s its own stacking axis into a local fill scope (the conditional
    // proportion), and carries its raw Σcount up the CROSS axis (`w`/`h`) as the
    // marginal/conditional magnitude. `count` is read raw at every level, so the
    // marginal × conditional × conditional product composes to any depth.
    chart(titanic, { axes: true })
      .flow(
        stack({ by: "class", dir: "y", normalize: true }),
        stack({ by: "sex", dir: "x", h: "count", normalize: true }),
        stack({ by: "survived", dir: "y", w: "count", normalize: true })
      )
      .mark(
        rect({
          h: "count",
          fill: (d: any) => (d.survived === "No" ? gray : classColor[d.class]),
          stroke: "white",
          strokeWidth: 1,
        })
      )
      .render(container, { w: 500, h: 500 });

    return container;
  },
};

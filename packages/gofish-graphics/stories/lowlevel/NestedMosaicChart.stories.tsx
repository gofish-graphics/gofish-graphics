import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { titanic } from "../../src/data/titanic";
import { spreadY, spreadX, stackY, rect, For, v } from "../../src/lib";
import { color6, gray } from "../../src/color";
import { groupBy } from "lodash";
import _ from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Nested Mosaic Chart",
};
export default meta;

const classColor = {
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
    spreadY(
      // The class axis is ORDINAL, so it stays y-down (reads top→bottom) — the
      // first class (First) is at the top and Crew at the bottom natively (#629).
      { spacing: 4, alignment: "start" },
      For(groupBy(titanic, "class"), (items, cls) =>
        spreadX(
          { key: cls, h: _(items).sumBy("count") / 10, spacing: 2, alignment: "middle" },
          For(groupBy(items, "sex"), (sItems, sex) =>
            stackY(
              {
                w: (_(sItems).sumBy("count") / _(items).sumBy("count")) * 100,
                alignment: "middle",
                sharedScale: true,
                // y-down: reverse so the colored (survived) part stacks ABOVE
                // the gray (did-not-survive) part.
                reverse: true,
              },
              For(groupBy(sItems, "survived"), (items, survived) =>
                rect({
                  h: v(_(items).sumBy("count")),
                  fill: survived === "No" ? gray : classColor[cls],
                })
              )
            )
          )
        )
      )
    ).render(container, {
      axes: true,
    });
    return container;
  }
}

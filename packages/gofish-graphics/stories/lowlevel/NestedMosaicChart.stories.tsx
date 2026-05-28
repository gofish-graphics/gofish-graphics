import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { titanic } from "../../src/data/titanic";
import { spreadY, spreadX, stackY, rect, For, v } from "../../src/lib";
import { color6, gray } from "../../src/color";
import { groupBy } from "lodash";
import _ from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Nested Mosaic Chart",
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

const classColor = {
  First: color6[0],
  Second: color6[1],
  Third: color6[2],
  Crew: color6[3],
};

export const Default: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    spreadY(
      { reverse: true, spacing: 4, alignment: "middle" },
      For(groupBy(titanic, "class"), (items, cls) =>
        spreadX(
          { key: cls, h: _(items).sumBy("count") / 10, spacing: 2, alignment: "middle" },
          For(groupBy(items, "sex"), (sItems, sex) =>
            stackY(
              {
                reverse: true,
                w: (_(sItems).sumBy("count") / _(items).sumBy("count")) * 100,
                alignment: "middle",
                sharedScale: true,
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
      w: args.w,
      h: args.h,
      axes: true,
    });
    return container;
  }
}

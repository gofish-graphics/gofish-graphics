import type { Meta, StoryObj } from "@storybook/html";
import { groupBy, maxBy, orderBy, sumBy } from "lodash";
import { initializeContainer } from "../helper";
import { treemap, circle, Spread, chart, palette } from "../../src/lib";
import {
  titanicPassengers,
  type TitanicPassenger,
} from "../../src/data/titanicPassengers";

const meta: Meta = {
  title: "atom/TitanicUnitDots",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 900, step: 10 } },
    h: { control: { type: "number", min: 200, max: 900, step: 10 } },
    paddingInner: { control: { type: "number", min: 0, max: 6, step: 0.5 } },
  },
};

export default meta;

type Args = { w: number; h: number; paddingInner: number };

export const Default: StoryObj<Args> = {
  args: { w: 1000, h: 320, paddingInner: 0 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Titanic Fare Circle Treemap",
      description: "Each Titanic passenger drawn as a circle sized by fare paid and colored by survival, packed into a squarified treemap and faceted by passenger class.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(titanicPassengers, { color: palette(["#2b8cbe", "#ff8408"]) }).facet({by: "pclass", dir: "x"})
      .flow(treemap({ h: "fare", valueField: "fare", paddingInner: args.paddingInner, tile: "squarifyCircle", sort: "desc", flipY: true}))
      .mark(circle({ fill: "survived", stroke: "#ccc", strokeWidth: 1 }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

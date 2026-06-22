import type { Meta, StoryObj } from "@storybook/html";
import { chunk, groupBy, orderBy, sumBy } from "lodash";
import { initializeContainer } from "../helper";

import { table } from "../../src/lib";

import { chart, Treemap, circle, derive, rect, repeat, spread, palette } from "../../src/lib";
import {
  titanicPassengers,
  type TitanicPassenger,
} from "../../src/data/titanicPassengers";
import { from } from "solid-js";

/**
 * Data: [intuinno/unit `titanic3.csv`](https://github.com/intuinno/unit/blob/master/app/data/titanic3.csv)
 */

const meta: Meta = {
  title: "atom/TitanicFacet",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 900, step: 10 } },
    h: { control: { type: "number", min: 200, max: 900, step: 10 } },
    paddingInner: { control: { type: "number", min: 0, max: 6, step: 0.5 } },
  },
};

export default meta;

type Args = { w: number; h: number; paddingInner: number };

export const Default: StoryObj<Args> = {
  args: { w: 720, h: 480, paddingInner: 0 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Titanic Survival Unit Grid",
      description: "A faceted grid of unit dots showing each Titanic passenger colored by survival, broken out by passenger class and sex.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    
     chart(titanicPassengers, { color: palette(["#2b8cbe", "#ff8408"]) })
        .flow(table({
                by: {x: "pclass", y: "sex"},
              }))
      .mark((d) => chart(d)
            .flow(
              derive((rows) => orderBy(rows, ["survived"], ["desc"])),
              derive((rows) => chunk(rows, Math.ceil(Math.sqrt(rows.length)))),
              spread({ spacing: 2, dir: "y" }),
              spread({ spacing: 2, dir: "x" })
            )
            .mark(circle({ r: 4, fill: "survived" }))
        )
      .render(container, { w: args.w, h: args.h, axes: true },);

    return container;
  },
};

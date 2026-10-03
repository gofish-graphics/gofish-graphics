import type { Meta, StoryObj } from "@storybook/html";
import { chunk, orderBy } from "lodash";
import { initializeContainer } from "../helper";

import { chart, table, circle, derive, spread, palette } from "../../src/lib";
import {
  titanicPassengers,
  type TitanicPassenger,
} from "../../src/data/titanicPassengers";

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
    
     chart(titanicPassengers, { color: palette(["#2b8cbe", "#ff8408"]), axes: true })
        .flow(table({
                by: {x: "pclass", y: "sex"},
                // Content-sized tracks (σ-affine 6e) pack facets to their dot
                // blocks; declared gutters replace the equal-split slack the
                // old box-division provided by accident. The Atom-faithful
                // semantics (equal cells, fit-derived unit size) is #663.
                spacing: 32,
              }))
      .mark(chart()
            .flow(
              derive((rows) => orderBy(rows, ["survived"], ["desc"])),
              derive((rows) => chunk(rows, Math.ceil(Math.sqrt(rows.length)))),
              // Fill each cell bottom-up (y-down free space: reverse so the
              // partial last row lands at the top), like a waffle that grows up.
              spread({ spacing: 2, dir: "y", reverse: true }),
              spread({ spacing: 2, dir: "x" })
            )
            .mark(circle({ r: 4, fill: "survived" }))
        )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

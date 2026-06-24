import type { Meta, StoryObj } from "@storybook/html";
import { chunk, orderBy } from "lodash";
import { initializeContainer } from "../helper";

import { chart, circle, derive, palette, spread } from "../../src/lib";
import { titanicPassengers } from "../../src/data/titanicPassengers";

/**
 * Atom replication — `unit_column_chart_shared.json`
 * (https://github.com/intuinno/unit/blob/master/app/data/unit_column_chart_shared.json).
 *
 * Atom layout pipeline:
 *   layout1: gridxy · subgroup groupby `pclass` · aspect `fillX` · size uniform (shared)
 *   layout2: gridxy · subgroup flatten · aspect `maxfill` · sort `survived`
 *   mark: circle · color `survived` · size max
 *
 * GoFish equivalent: facet by `pclass` on x (one column per class), then inside
 * each column sort by survival, wrap the rows into a fixed-width grid, and spread
 * the unit dots in y (up) and x. Dot size is fixed (`r`), so it is shared across
 * columns — taller columns simply hold more passengers, giving column heights that
 * encode class counts (third class is the largest).
 */

const meta: Meta = {
  title: "atom/UnitColumnChart",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 900, step: 10 } },
    h: { control: { type: "number", min: 200, max: 900, step: 10 } },
    cols: { control: { type: "number", min: 4, max: 30, step: 1 } },
  },
};

export default meta;

type Args = { w: number; h: number; cols: number };

export const Default: StoryObj<Args> = {
  args: { w: 520, h: 420, cols: 14 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Titanic Unit Column Chart",
      description:
        "Each Titanic passenger is a dot, wrapped into one column per cabin class and colored by survival; equal dot sizes make the column heights read as class counts.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(titanicPassengers, {
      color: palette(["#2b8cbe", "#ff8408"]),
      // x = pclass (the columns); y is the dot-row index, so suppress it.
      axes: { x: true, y: false },
    })
      .flow(spread({ by: "pclass", dir: "x", spacing: 24, alignment: "start" }))
      .mark((d) =>
        chart(d)
          .flow(
            derive((rows) => orderBy(rows, ["survived"], ["desc"])),
            derive((rows) => chunk(rows, args.cols)),
            spread({ spacing: 2, dir: "y" }),
            spread({ spacing: 2, dir: "x" })
          )
          .mark(circle({ r: 4, fill: "survived" }))
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

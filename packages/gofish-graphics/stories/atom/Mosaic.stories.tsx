import type { Meta, StoryObj } from "@storybook/html";
import { groupBy, orderBy } from "lodash";
import { initializeContainer } from "../helper";

import { chart, derive, normalize, palette, rect, spread, stack } from "../../src/lib";
import { titanicPassengers } from "../../src/data/titanicPassengers";

/**
 * Atom replication — `mosaic.json`
 * (https://github.com/intuinno/unit/blob/master/app/data/mosaic.json).
 *
 * Atom layout pipeline:
 *   layout1: gridxy · subgroup groupby `pclass` · aspect `fillY` · size count (shared)
 *   layout2: gridxy · subgroup groupby `survived` · aspect `fillX` · size count
 *   mark: circle · color `survived` · size count
 *
 * Atom's defining move here is `size: { type: "count" }` — every container is sized
 * by how many records it holds, so the mosaic's cell *areas* are proportional to the
 * crosstab counts. GoFish has no `count` sizing operator, so we aggregate to one row
 * per (pclass × survived) cell up front, then reuse the canonical mosaic recipe
 * (`spread` → `normalize` → `stack`, see Forward Syntax V3 / Mosaic Chart): each class
 * is a column whose stacked blocks' heights are proportional to the survival counts
 * within that class.
 *
 * Two pieces of Atom's `size: count` do NOT survive the translation and are tracked
 * as feature gaps in stories/atom/README.md: (1) column *width* ∝ class size — gofish
 * `spread` lays out equal-width columns — and (2) the unit/dot-filled rendering, where
 * passengers pack into the count-proportional cells.
 */

type Cell = {
  pclass: 1 | 2 | 3;
  survived: 0 | 1;
  count: number;
};

const mosaicCells: Cell[] = orderBy(
  Object.entries(groupBy(titanicPassengers, "pclass")).flatMap(([pclass, rows]) =>
    Object.entries(groupBy(rows, "survived")).map(([survived, srows]) => ({
      pclass: Number(pclass) as 1 | 2 | 3,
      survived: Number(survived) as 0 | 1,
      count: srows.length,
    }))
  ),
  ["pclass"],
  ["asc"]
);

const meta: Meta = {
  title: "atom/Mosaic",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 900, step: 10 } },
    h: { control: { type: "number", min: 200, max: 900, step: 10 } },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 520, h: 420 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Titanic Survival Mosaic",
      description:
        "A mosaic plot of Titanic survival: each column's width is proportional to the number of passengers in that cabin class, and each block's height to how many survived or died.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(mosaicCells, { color: palette(["#2b8cbe", "#ff8408"]) })
      .flow(
        spread({ by: "pclass", dir: "x", spacing: 6 }),
        derive((rows) => normalize(orderBy(rows, ["survived"], ["desc"]), "count")),
        stack({ by: "survived", dir: "y" })
      )
      .mark(rect({ h: "count", fill: "survived", stroke: "white", strokeWidth: 1 }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

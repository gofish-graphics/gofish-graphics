import type { Meta, StoryObj } from "@storybook/html";
import { groupBy, orderBy } from "lodash";
import { initializeContainer } from "../helper";

import { chart, derive, normalize, palette, rect, stack } from "../../src/lib";
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
 * Atom's defining move here is `size: { type: "count" }` — every container is sized by
 * how many records it holds, so the mosaic's cell *areas* read as the crosstab. Atom's
 * mosaic is single-axis-proportional at each level (`fillY` then `fillX`), and that is
 * exactly the **main-axis** case GoFish's scoped σ solve already handles: we aggregate
 * to one row per (pclass × survived) cell, then drive a horizontal `stack` with a
 * `w: "classTotal"` size-claim so column widths resolve ∝ class size, and a `normalize`d
 * vertical `stack` so each column fills the height split by survival count. A true 2-D
 * mosaic, no `count` operator required.
 *
 * The one piece still missing is the unit/dot-filled rendering (passengers packed into
 * the count-proportional cells); see [`UnitMosaic`](./UnitMosaic.stories.tsx) for that
 * and stories/atom/README.md gap #1 for why it currently needs a hand-built grid.
 */

type Cell = {
  pclass: 1 | 2 | 3;
  survived: 0 | 1;
  count: number;
  classTotal: number;
};

const mosaicCells: Cell[] = orderBy(
  Object.entries(groupBy(titanicPassengers, "pclass")).flatMap(([pclass, rows]) => {
    const classTotal = rows.length;
    return Object.entries(groupBy(rows, "survived")).map(([survived, srows]) => ({
      pclass: Number(pclass) as 1 | 2 | 3,
      survived: Number(survived) as 0 | 1,
      count: srows.length,
      classTotal,
    }));
  }),
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

    chart(mosaicCells, { color: palette(["#2b8cbe", "#ff8408"]), axes: true })
      .flow(
        // columns by class — width resolves ∝ classTotal through the σ solve
        stack({ by: "pclass", dir: "x", spacing: 2 }),
        // survival fractions within each class column
        derive((rows) => normalize(orderBy(rows, ["survived"], ["desc"]), "count")),
        // stacked segments fill the column height
        stack({ by: "survived", dir: "y" })
      )
      .mark(rect({ w: "classTotal", h: "count", fill: "survived", stroke: "white", strokeWidth: 1 }))
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

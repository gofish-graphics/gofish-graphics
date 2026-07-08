import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";

import { chart, palette, rect, stack, field } from "../../src/lib";
import { titanicPassengers } from "../../src/data/titanicPassengers";

/**
 * Atom replication — `mosaic.json`
 * (https://github.com/intuinno/unit/blob/master/app/data/mosaic.json).
 *
 * Atom's defining move is `size: { type: "count" }` — every container is sized
 * by how many records it holds, so the mosaic's cell areas read as the crosstab.
 * GoFish expresses that directly with data-driven operator `size` (#4/#20/#700):
 * the horizontal `stack` sizes each class column by `size: "count"` (the raw Σ
 * over that class = the marginal), and the vertical `stack`'s
 * `size: field("count").normalize()` replaces the raw count with each entry's
 * SHARE of its column, filling the height split by survival share (the
 * conditional). Width = raw Σ, height = normalized fraction, both off one field —
 * no per-cell aggregation, no precomputed `classTotal`, no `normalize` derive.
 *
 * `count: 1` per passenger is the only prep (until a first-class count-of-records
 * size lands); the stacks aggregate the raw rows.
 */

// `count: 1` per passenger so the stacks aggregate; sorted so every class
// column stacks survived/died in the same order.
const passengers = titanicPassengers
  .map((p) => ({ ...p, count: 1 }))
  .sort((a, b) => a.pclass - b.pclass || b.survived - a.survived);

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

    chart(passengers, { color: palette(["#2b8cbe", "#ff8408"]), axes: true })
      .flow(
        // columns by class — width ∝ each class's passenger count (marginal)
        stack({ by: "pclass", dir: "x", size: "count" }),
        // survival share within each class column (conditional), filling height
        stack({ by: "survived", dir: "y", size: field("count").normalize() })
      )
      .mark(rect({ fill: "survived", stroke: "white", strokeWidth: 1 }))
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

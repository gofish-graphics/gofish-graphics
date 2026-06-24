import type { Meta, StoryObj } from "@storybook/html";
import { orderBy } from "lodash";
import { initializeContainer } from "../helper";

import { chart, circle, palette, spread } from "../../src/lib";
import { titanicPassengers } from "../../src/data/titanicPassengers";

/**
 * Atom replication — `violin.json`
 * (https://github.com/intuinno/unit/blob/master/app/data/violin.json).
 *
 * Atom layout pipeline:
 *   layout1: gridxy · subgroup groupby `pclass` · aspect `fillX`
 *   layout2: gridxy · subgroup bin `age` (numBin 19) · aspect `fillY` · direction `BT`
 *   layout3: gridxy · subgroup passthrough · size count · direction `LR` · align `center`
 *   layout4: gridxy · subgroup flatten · aspect `maxfill` · sort `survived`
 *   mark: circle · color `survived`
 *
 * The violin shape comes from layout3's `align: "center"` + `direction: "LR"`: each
 * age bin's records are laid out as a single horizontal, center-aligned row whose
 * width grows with the bin count. Stacking those centered rows up the age axis
 * (layout2, `direction: "BT"`) traces a symmetric density silhouette — a unit
 * ("wheat plot") violin.
 *
 * GoFish equivalent: bin `age` up front (Atom's `bin` subgroup has no row-preserving
 * counterpart — see stories/atom/README.md), facet by `pclass`, spread the age bins up
 * the y axis, then within each bin spread the unit dots along x with
 * `alignment: "center"` so the row is centered. One dot per passenger, colored by
 * survival.
 */

const AGE_BIN = (age: number) => Math.floor(age / 2) * 2;

const agedPassengers = orderBy(
  titanicPassengers
    .map((p) => ({ ...p, ageNum: p.age === undefined ? NaN : Number(p.age) }))
    .filter((p) => Number.isFinite(p.ageNum))
    .map((p) => ({ ...p, ageBin: AGE_BIN(p.ageNum) })),
  ["ageBin", "survived"],
  ["asc", "desc"]
);

const meta: Meta = {
  title: "atom/Violin",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 1200, step: 10 } },
    h: { control: { type: "number", min: 200, max: 900, step: 10 } },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 680, h: 260 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Titanic Unit Violin",
      description:
        "Per-class age violins built from unit dots: each age bin is a centered horizontal row of passengers, so stacking the bins up the age axis traces a symmetric density silhouette, colored by survival.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(agedPassengers, {
      color: palette(["#2b8cbe", "#ff8408"]),
      // x = pclass (the violins); y is the dot-row index, so suppress it.
      axes: { x: true, y: false },
    })
      .flow(spread({ by: "pclass", dir: "x", spacing: 48, alignment: "middle" }))
      .mark((panel) =>
        chart(panel)
          .flow(spread({ by: "ageBin", dir: "y", spacing: 1, alignment: "middle" }))
          .mark((bin) =>
            chart(bin)
              .flow(spread({ dir: "x", spacing: 1, alignment: "middle" }))
              .mark(circle({ r: 2, fill: "survived" }))
          )
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

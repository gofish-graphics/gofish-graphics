import type { Meta, StoryObj } from "@storybook/html";
import { chunk, orderBy } from "lodash";
import { initializeContainer } from "../helper";

import { chart, circle, derive, palette, spread } from "../../src/lib";
import { titanicPassengers } from "../../src/data/titanicPassengers";

/**
 * Atom replication — `unit_small_multiple.json` / `titanic_spec1.json`
 * (https://github.com/intuinno/unit/blob/master/app/data/unit_small_multiple.json).
 *
 * Atom layout pipeline:
 *   layout1: gridxy · subgroup bin `age` (numBin 15, shared) · aspect `parent`
 *   layout2: gridxy · subgroup groupby `pclass` · aspect `fillX`
 *   layout3: gridxy · subgroup flatten · sort `survived`
 *   mark: circle · color `survived`
 *
 * GoFish equivalent: bin `age` into decades up front (Atom's `bin` subgroup has no
 * row-preserving counterpart — see stories/atom/README.md), facet by `pclass` into
 * small-multiple panels, then within each panel spread the age bins along x and grow
 * a thin column of unit dots per bin. The result is a per-class age histogram whose
 * bars are made of individual passengers, colored by survival.
 */

const AGE_DECADE = (age: number) => Math.floor(age / 10) * 10;

const agedPassengers = titanicPassengers
  .map((p) => ({ ...p, ageNum: p.age === undefined ? NaN : Number(p.age) }))
  .filter((p) => Number.isFinite(p.ageNum))
  .map((p) => ({ ...p, ageBin: AGE_DECADE(p.ageNum) }));

const meta: Meta = {
  title: "atom/UnitHistogram",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 1200, step: 10 } },
    h: { control: { type: "number", min: 200, max: 900, step: 10 } },
    width: { control: { type: "number", min: 1, max: 6, step: 1 } },
  },
};

export default meta;

type Args = { w: number; h: number; width: number };

export const Default: StoryObj<Args> = {
  args: { w: 900, h: 380, width: 3 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Titanic Unit Histogram",
      description:
        "Small-multiple age histograms — one panel per cabin class — where every bar is a stack of unit dots, one per passenger, colored by survival.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(agedPassengers, {
      color: palette(["#2b8cbe", "#ff8408"]),
      // x = pclass (the panels); y is the dot-row index, so suppress it.
      axes: { x: true, y: false },
    })
      .flow(spread({ by: "pclass", dir: "x", spacing: 40, alignment: "start" }))
      .mark((panel) =>
        chart(panel)
          .flow(spread({ by: "ageBin", dir: "x", spacing: 6, alignment: "start" }))
          .mark((bin) =>
            chart(bin)
              .flow(
                derive((rows) => orderBy(rows, ["survived"], ["desc"])),
                derive((rows) => chunk(rows, args.width)),
                spread({ spacing: 1.5, dir: "y" }),
                spread({ spacing: 1.5, dir: "x" })
              )
              .mark(circle({ r: 3, fill: "survived" }))
          )
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

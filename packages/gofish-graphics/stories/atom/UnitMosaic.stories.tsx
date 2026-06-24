import type { Meta, StoryObj } from "@storybook/html";
import { chunk, groupBy, orderBy } from "lodash";
import { initializeContainer } from "../helper";

import { chart, circle, derive, palette, spread } from "../../src/lib";
import { titanicPassengers } from "../../src/data/titanicPassengers";

/**
 * Atom replication — the headline Titanic unit mosaic (paper Fig. 1b; the
 * `mosaic.json` family in https://github.com/intuinno/unit/tree/master/app/data).
 *
 * Class × sex rows, survived columns, every count-proportional cell filled with one
 * dot per passenger. Atom builds this with `size: { type: "count" }`, which sizes each
 * container by its member count so the cell *areas* read as the crosstab.
 *
 * This is a WORKAROUND, not a faithful replica (tracked in #624): Atom sizes each
 * cell's dots per-cell (`size: max, isShared: false`) to fill a count-proportional
 * rectangle, so dot sizes vary across cells. GoFish has no `count` sizing operator
 * nor a fill-capable mark (see stories/atom/README.md, gap #1), so this story uses a
 * single global dot size and fakes the cell areas instead: with a fixed dot size a cell
 * holding `n`
 * dots in `R` rows occupies `R × ceil(n/R)` grid slots — area ∝ n for *any* R. Choosing
 * `R ∝ (class,sex) group size` makes every sub-block the same height, so the blocks tile
 * into a mosaic whose heights encode class/sex counts and whose column splits encode
 * survival — all from plain `spread`s over a fixed-size `circle`. Dots fill each cell
 * *column by column* (`R` tall) so the leftover lands in one short right-hand column
 * rather than a ragged partial row, keeping every cell's top and bottom edges flush.
 */

const DOTS_PER_ROW = 34; // target group-size per dot-row; tunes the mosaic's aspect

// Rows per (class, sex) block — shared by its Yes/No cells so they tile flush.
const rowsByGroup = new Map<string, number>(
  Object.entries(groupBy(titanicPassengers, (p) => `${p.pclass}|${p.sex}`)).map(
    ([key, rows]) => [key, Math.max(1, Math.round(rows.length / DOTS_PER_ROW))]
  )
);

// One global sort pins every nested `spread`'s group order: pclass ascending (1st row
// ends up at the bottom), sex ascending (female below male), survived descending
// (survived/blue column on the left), so the Yes/No split is consistent across blocks.
const mosaicPassengers = orderBy(
  titanicPassengers.map((p) => ({
    ...p,
    gridRows: rowsByGroup.get(`${p.pclass}|${p.sex}`) ?? 1,
  })),
  ["pclass", "sex", "survived"],
  ["asc", "asc", "desc"]
);

const meta: Meta = {
  title: "atom/UnitMosaic",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 200, max: 1000, step: 10 } },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 300 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Titanic Unit Mosaic",
      description:
        "The headline Atom unit mosaic: Titanic passengers as dots, blocked into class × sex rows and survived columns, where each count-proportional cell is filled one dot per passenger and colored by survival.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(mosaicPassengers, { color: palette(["#2b8cbe", "#ff8408"]) })
      // pclass rows: 1st at the bottom, 3rd at the top
      .flow(spread({ by: "pclass", dir: "y", spacing: 6, alignment: "start" }))
      .mark((cls) =>
        chart(cls)
          // sex sub-rows within a class: female bottom, male top
          .flow(spread({ by: "sex", dir: "y", spacing: 3, alignment: "start" }))
          .mark((sexRow) =>
            chart(sexRow)
              // survived columns: survived (blue) left, died (orange) right
              .flow(spread({ by: "survived", dir: "x", spacing: 3, alignment: "start" }))
              .mark((cell) =>
                chart(cell)
                  .flow(
                    // Fill column-by-column — each column `gridRows` tall — so
                    // every cell has flush top and bottom edges and only the
                    // last column is short. (Row-major chunking instead left a
                    // ragged partial *row* spanning the whole cell width, which
                    // broke the band boundaries.)
                    derive((rows) => chunk(rows, rows[0]?.gridRows ?? 1)),
                    spread({ spacing: 1, dir: "x" }),
                    spread({ spacing: 1, dir: "y", reverse: true })
                  )
                  .mark(circle({ r: 3, fill: "survived" }))
              )
          )
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

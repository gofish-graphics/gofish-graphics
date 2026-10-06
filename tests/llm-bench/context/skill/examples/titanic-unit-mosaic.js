// Titanic Unit Mosaic
// The headline Atom unit mosaic: Titanic passengers as dots, blocked into class × sex rows and survived columns, where each count-proportional cell is filled one dot per passenger and colored by survival.

import { chart, circle, derive, palette, spread } from "gofish-graphics";
import { chunk, groupBy, orderBy } from "lodash";
import { titanicPassengers } from "./dataset";
const DOTS_PER_ROW = 34;
const rowsByGroup = new Map(
  Object.entries(groupBy(titanicPassengers, (p) => `${p.pclass}|${p.sex}`)).map(
    ([key, rows]) => [key, Math.max(1, Math.round(rows.length / DOTS_PER_ROW))],
  ),
);
const mosaicPassengers = orderBy(
  titanicPassengers.map((p) => ({
    ...p,
    gridRows: rowsByGroup.get(`${p.pclass}|${p.sex}`) ?? 1,
  })),
  ["pclass", "sex", "survived"],
  ["asc", "asc", "desc"],
);
const container = document.getElementById("app");
chart(mosaicPassengers, { color: palette(["#2b8cbe", "#ff8408"]) })
  .flow(
    // pclass rows: 1st at the bottom, 3rd at the top
    spread({ by: "pclass", dir: "y", spacing: 6, alignment: "start" }),
    // sex sub-rows within a class: female bottom, male top
    spread({ by: "sex", dir: "y", spacing: 3, alignment: "start" }),
    // survived columns: survived (blue) left, died (orange) right
    spread({ by: "survived", dir: "x", spacing: 3, alignment: "start" }),
  )
  .mark(
    chart()
      .flow(
        // Fill column-by-column — each column `gridRows` tall — so
        // every cell has flush top and bottom edges and only the
        // last column is short. (Row-major chunking instead left a
        // ragged partial *row* spanning the whole cell width, which
        // broke the band boundaries.)
        derive((rows) => chunk(rows, rows[0]?.gridRows ?? 1)),
        spread({ spacing: 1, dir: "x" }),
        spread({ spacing: 1, dir: "y", reverse: true }),
      )
      .mark(circle({ r: 3, fill: "survived" })),
  )
  .render(container, { w: 400, h: 300 });

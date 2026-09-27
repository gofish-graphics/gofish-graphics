// Titanic Unit Column Chart
// Each Titanic passenger is a dot, wrapped into one column per cabin class and colored by survival; equal dot sizes make the column heights read as class counts.

import { chart, circle, derive, palette, spread } from "gofish-graphics";
import { chunk, orderBy } from "lodash";
import { titanicPassengers } from "./dataset";
const container = document.getElementById("app");
chart(titanicPassengers, {
  color: palette(["#2b8cbe", "#ff8408"]),
  // x = pclass (the columns) at the bottom (y-end), under the upward-filling
  // columns; y is the dot-row index, so suppress it.
  axes: { x: { side: "end" }, y: false },
})
  // Bottom-align the columns (y-down free space: "end" = bottom) so the
  // unit stacks share a baseline and grow upward. (The pclass tick labels
  // collapsing to the origin is a pre-existing nested-chart axis limitation,
  // independent of y-up/down.)
  .flow(spread({ by: "pclass", dir: "x", spacing: 24, alignment: "end" }))
  .mark(
    chart()
      .flow(
        derive((rows) => orderBy(rows, ["survived"], ["desc"])),
        derive((rows) => chunk(rows, 14)),
        // Reverse the rows so the ragged partial row lands at the top.
        spread({ spacing: 2, dir: "y", reverse: true }),
        spread({ spacing: 2, dir: "x" }),
      )
      .mark(circle({ r: 4, fill: "survived" })),
  )
  .render(container, { w: 520, h: 580 });

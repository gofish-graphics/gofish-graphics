// Titanic Survival Unit Grid
// A faceted grid of unit dots showing each Titanic passenger colored by survival, broken out by passenger class and sex.

import { chart, circle, derive, palette, spread, table } from "gofish-graphics";
import { chunk, orderBy } from "lodash";
import { titanicPassengers } from "./dataset";
const container = document.getElementById("app");
chart(titanicPassengers, { color: palette(["#2b8cbe", "#ff8408"]), axes: true })
  .flow(
    table({
      by: { x: "pclass", y: "sex" },
      // Content-sized tracks (σ-affine 6e) pack facets to their dot
      // blocks; declared gutters replace the equal-split slack the
      // old box-division provided by accident. The Atom-faithful
      // semantics (equal cells, fit-derived unit size) is #663.
      spacing: 32,
    }),
  )
  .mark(
    chart()
      .flow(
        derive((rows) => orderBy(rows, ["survived"], ["desc"])),
        derive((rows) => chunk(rows, Math.ceil(Math.sqrt(rows.length)))),
        // Fill each cell bottom-up (y-down free space: reverse so the
        // partial last row lands at the top), like a waffle that grows up.
        spread({ spacing: 2, dir: "y", reverse: true }),
        spread({ spacing: 2, dir: "x" }),
      )
      .mark(circle({ r: 4, fill: "survived" })),
  )
  .render(container, { w: 720, h: 480 });

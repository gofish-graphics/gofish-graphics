// Titanic Unit Histogram
// Small-multiple age histograms — one panel per cabin class — where every bar is a stack of unit dots, one per passenger, colored by survival.

import { chart, circle, derive, field, palette, spread } from "gofish-graphics";
import { chunk, orderBy } from "lodash";
import { titanicPassengers } from "./dataset";
const AGE_DECADE = (age) => Math.floor(age / 10) * 10;
const agedPassengers = titanicPassengers
  .map((p) => ({ ...p, ageNum: p.age === undefined ? NaN : Number(p.age) }))
  .filter((p) => Number.isFinite(p.ageNum))
  .map((p) => ({ ...p, ageBin: AGE_DECADE(p.ageNum) }));
const container = document.getElementById("app");
chart(agedPassengers, {
  color: palette(["#2b8cbe", "#ff8408"]),
  // x = pclass (the panels) at the bottom (y-end); y is the dot-row index,
  // so suppress it.
  axes: { x: { side: "end" }, y: false },
})
  // Bottom-align panels and their age-bin bars (y-down free space: "end" =
  // bottom) so every unit stack shares a baseline and grows upward.
  .flow(
    spread({ by: "pclass", dir: "x", spacing: 40, alignment: "end" }),
    // Age bins in ascending order along x — `spread` lays groups out in
    // data-appearance order, so sort by the bin key first (as the strip
    // plot sorts before its categorical spread).
    spread({
      by: field("ageBin").sort(),
      dir: "x",
      spacing: 6,
      alignment: "end",
    }),
  )
  .mark(
    chart()
      .flow(
        derive((rows) => orderBy(rows, ["survived"], ["desc"])),
        derive((rows) => chunk(rows, 3)),
        // Reverse so the ragged partial row lands at the top.
        spread({ spacing: 1.5, dir: "y", reverse: true }),
        spread({ spacing: 1.5, dir: "x" }),
      )
      .mark(circle({ r: 3, fill: "survived" })),
  )
  .render(container, { w: 900, h: 560 });

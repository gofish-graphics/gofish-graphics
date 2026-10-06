// Titanic Unit Violin
// Per-class age violins built from unit dots: each age bin is a centered horizontal row of passengers, so stacking the bins up the age axis traces a symmetric density silhouette, colored by survival.

import { chart, circle, palette, spread } from "gofish-graphics";
import { orderBy } from "lodash";
import { titanicPassengers } from "./dataset";
const AGE_BIN = (age) => Math.floor(age / 2) * 2;
const agedPassengers = orderBy(
  titanicPassengers
    .map((p) => ({ ...p, ageNum: p.age === undefined ? NaN : Number(p.age) }))
    .filter((p) => Number.isFinite(p.ageNum))
    .map((p) => ({ ...p, ageBin: AGE_BIN(p.ageNum) })),
  ["ageBin", "survived"],
  ["asc", "desc"],
);
const container = document.getElementById("app");
chart(agedPassengers, {
  color: palette(["#2b8cbe", "#ff8408"]),
  // x = pclass (the violins) at the bottom (y-end); y is the dot-row index,
  // so suppress it.
  axes: { x: { side: "end" }, y: false },
})
  .flow(
    spread({ by: "pclass", dir: "x", spacing: 48, alignment: "middle" }),
    // Reverse so age increases UPWARD (youngest bin at the bottom) in
    // y-down free space — the density silhouette stacks up the age axis.
    spread({
      by: "ageBin",
      dir: "y",
      spacing: 1,
      alignment: "middle",
      reverse: true,
    }),
    spread({ dir: "x", spacing: 1, alignment: "middle" }),
  )
  .mark(circle({ r: 2, fill: "survived" }))
  .render(container, { w: 680, h: 260 });

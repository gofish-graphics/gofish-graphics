// Nested Mosaic Chart
// Titanic survival broken down by passenger class as a mosaic plot, where each cell's width and height encode the proportions of a two-way contingency table.

import { chart, color6, field, gray, rect, stack } from "gofish-graphics";
import { titanic } from "./dataset";
const classColor = {
  First: color6[0],
  Second: color6[1],
  Third: color6[2],
  Crew: color6[3],
};
const container = document.getElementById("app");
// Three nested spines, alternating axes (class → sex → survived). Each
// level's `size: field("count").normalize()` replaces its stacking axis
// with each entry's SHARE of the window (the conditional proportion),
// which becomes a data-driven size claim that makes that entry's subtree
// a local self-scaling region — so the fill composes through all three
// levels: marginal × conditional × conditional, to any depth, off one
// raw field. Stacking order now follows DATA order at every level (the
// old `normalize: true` layout hack reversed order via a `declaredYUp`
// fallback that this `size`-claim mechanism doesn't need — an intended
// fix, not a regression).
chart(titanic, { axes: true })
  .flow(
    stack({ by: "class", dir: "y", size: field("count").normalize() }),
    stack({ by: "sex", dir: "x", size: field("count").normalize() }),
    stack({ by: "survived", dir: "y", size: field("count").normalize() }),
  )
  .mark(
    rect({
      fill: (d) => (d.survived === "No" ? gray : classColor[d.class]),
      stroke: "white",
      strokeWidth: 1,
    }),
  )
  .render(container, { w: 500, h: 500 });

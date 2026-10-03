// Pie Chart
// A pie chart breaking down total fish catch by species, with each wedge's angle proportional to its share of the catch.

import { chart, clock, rect, stack } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, { coord: clock(), axes: true, padding: 80 })
  .flow(stack({ by: "species", dir: "x" }))
  .mark(rect({ w: "count", fill: "species" }))
  .render(container, {
    w: 400,
    h: 400,
  });

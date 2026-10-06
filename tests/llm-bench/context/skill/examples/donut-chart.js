// Donut Chart
// A donut chart of fish catch by species, where the open center leaves a ring of wedges sized by each species' share of the total.

import { chart, clock, rect, stack } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, { coord: clock(), axes: true, padding: 60 })
  .flow(stack({ by: "species", dir: "x", y: 50, h: 50 }))
  .mark(rect({ w: "count", fill: "species" }))
  .render(container, {
    w: 400,
    h: 400,
  });

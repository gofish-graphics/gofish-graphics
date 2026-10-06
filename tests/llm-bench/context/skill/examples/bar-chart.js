// Bar Chart
// A vertical bar chart of total fish catch counts across six lakes.

import { chart, rect, spread } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, { axes: true })
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(rect({ h: "count" }))
  .render(container, {
    w: 400,
    h: 400,
  });

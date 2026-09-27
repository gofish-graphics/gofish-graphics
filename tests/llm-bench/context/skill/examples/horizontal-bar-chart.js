// Horizontal Bar Chart
// Total fish catch counts across six lakes shown as horizontal bars.

import { chart, rect, spread } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, { axes: true })
  .flow(spread({ by: "lake", dir: "y" }))
  .mark(rect({ w: "count" }))
  .render(container, {
    w: 400,
    h: 400,
  });

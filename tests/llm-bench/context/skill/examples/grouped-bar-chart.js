// Grouped Bar Chart
// Fish catch counts per lake, with bars grouped side by side by species.

import { chart, rect, spread, stack } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, { axes: true })
  .flow(
    spread({ by: "lake", dir: "x" }), //
    stack({ by: "species", dir: "x" }),
  )
  .mark(rect({ h: "count", fill: "species" }))
  .render(container, {
    w: 400,
    h: 400,
  });

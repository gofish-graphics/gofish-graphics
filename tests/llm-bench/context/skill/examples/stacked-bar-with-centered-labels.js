// Stacked Bar with Centered Labels
// Catch counts by lake stacked by species, with each segment's value centered inside it in auto-contrasting text.

import { chart, rect, spread, stack } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, { axes: true })
  .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
  .mark(
    rect({ h: "count", fill: "species" }).label("count", {
      position: "center",
      fontSize: 10,
    }),
  )
  .render(container, { w: 400, h: 300 });

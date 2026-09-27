// Stacked Bar Chart with Labels
// A stacked bar chart of fish catch counts per lake, with each species segment labeled in place.

import { chart, rect, spread, stack } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, { axes: true })
  .flow(
    spread({ by: "lake", dir: "x" }), //
    stack({ by: "species", dir: "y" }),
  )
  .mark(
    rect({ h: "count", fill: "species" }).label("species", {
      position: "center",
      color: "white",
      fontSize: 12,
    }),
  )
  .render(container, {
    w: 400,
    h: 400,
  });

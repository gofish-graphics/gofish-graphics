// Streamgraph
// A streamgraph of fish catch by species across six lakes, with the stacked bands centered around a wandering baseline so each species reads as a flowing organic layer.

import { chart, ribbon, spread, stack } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, { axes: true })
  .flow(
    spread({ by: "lake", dir: "x", spacing: 64, alignment: "middle" }),
    stack({ by: "species", dir: "y" }),
  )
  .mark(ribbon({ h: "count", fill: "species", opacity: 0.8 }))
  .render(container, {
    w: 400,
    h: 400,
  });

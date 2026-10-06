// Stacked Area Chart
// Fish catch counts by lake split into stacked bands by species, each a colored filled area.

import { chart, ribbon, spread, stack } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, { axes: true })
  .flow(
    spread({ by: "lake", dir: "x", spacing: 64 }),
    stack({ by: "species", dir: "y" }),
  )
  .mark(ribbon({ h: "count", fill: "species", opacity: 0.8 }))
  .render(container, {
    w: 400,
    h: 400,
  });

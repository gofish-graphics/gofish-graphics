// Ribbon Chart
// A ribbon chart tracking fish catch by species across six lakes, where each species' band is reordered at every lake so the largest sits on top and ribbons cross as rankings change.

import { chart, field, rect, ribbon, spread, stack } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, { axes: true })
  .flow(
    spread({ by: "lake", dir: "x", spacing: 64 }),
    stack({ by: field("species").sort("count"), dir: "y" }),
  )
  .mark(rect({ h: "count", fill: "species" }))
  .layer(ribbon({ opacity: 0.8 }))
  .render(container, {
    w: 400,
    h: 400,
  });

// Highlighted Ribbon Chart
// Species catch flows across lakes as stacked ribbons, with Salmon and Trout picked out in color against gray.

import {
  chart,
  field,
  palette,
  rect,
  ribbon,
  spread,
  stack,
} from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, {
  color: palette({ Salmon: "#e15759", Trout: "#4e79a7" }),
  axes: true,
})
  .flow(
    spread({ by: "lake", dir: "x", spacing: 64 }),
    stack({ by: field("species").sort("count"), dir: "y" }),
  )
  .mark(rect({ h: "count", fill: "species" }))
  .layer(ribbon({ opacity: 0.6 }))
  .render(container, { w: 400, h: 400 });

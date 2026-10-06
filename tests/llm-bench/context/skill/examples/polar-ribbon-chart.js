// Polar Ribbon Chart
// The lake-by-lake fish catch ribbons wrapped around a polar layout, coiling each species into a swirling spiral of nested colored bands.

import {
  chart,
  clock,
  field,
  group,
  layer,
  rect,
  ribbon,
  scatter,
  selectAll,
  stack,
} from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
layer({ coord: clock() }, [
  chart(seafood)
    .flow(
      scatter({
        by: "lake",
        x: "lake",
        w: 2 * Math.PI,
        axes: { x: false, y: true },
      }).translate({ y: 50 }),
      stack({ by: field("species").sort("count"), dir: "y", label: false }),
    )
    .mark(rect({ w: 0.1, h: "count", fill: "species" }).name("bars")),
  chart(selectAll("bars"))
    .flow(group({ by: "species" }))
    .mark(ribbon({ opacity: 0.8 })),
]).render(container, {
  w: 400,
  h: 400,
  axes: true,
});

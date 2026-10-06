// Layered Area Chart
// Five overlapping series drawn as translucent filled areas so their changing magnitudes can be compared across a shared x-axis.

import { chart, group, ribbon, spread } from "gofish-graphics";
import { streamgraphData } from "./dataset";
const container = document.getElementById("app");
chart(streamgraphData, { axes: true })
  .flow(spread({ by: "x", dir: "x", spacing: 50 }), group({ by: "c" }))
  .mark(ribbon({ h: "y", fill: "c", opacity: 0.7 }))
  .render(container, {
    w: 500,
    h: 300,
  });

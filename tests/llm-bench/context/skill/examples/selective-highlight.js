// Selective Highlight
// Stacked catch bars by lake with only the Salmon segments colored and every other species muted to gray.

import { chart, palette, rect, spread, stack } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, { color: palette({ Salmon: "#e15759" }), axes: true })
  .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "x" }))
  .mark(rect({ h: "count", fill: "species" }))
  .render(container, { w: 400, h: 400 });

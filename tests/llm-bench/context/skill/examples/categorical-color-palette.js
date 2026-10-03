// Categorical Color Palette
// Fish catch totals per species as a bar chart colored by a categorical tableau10 palette.

import { chart, palette, rect, spread } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, { color: palette("tableau10"), axes: true })
  .flow(spread({ by: "species", dir: "x" }))
  .mark(rect({ h: "count", fill: "species" }))
  .render(container, { w: 400, h: 400 });

// Faceted Scatter Plot
// Gas prices over the years shown as small-multiple scatter panels stacked vertically, one per side of the road.

import { chart, circle, scatter, spread } from "gofish-graphics";
import { drivingShifts } from "./dataset";
const container = document.getElementById("app");
chart(drivingShifts, { axes: true })
  .flow(
    spread({ by: "side", dir: "y", spacing: 50 }),
    scatter({ x: "year", y: "gas", axes: { x: false, y: true } }),
  )
  .mark(circle({ r: 3, fill: "#e07b39" }))
  .render(container, {
    w: 400,
    h: 800,
  });

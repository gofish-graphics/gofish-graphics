// Titanic Survival Mosaic
// A mosaic plot of Titanic survival: each column's width is proportional to the number of passengers in that cabin class, and each block's height to how many survived or died.

import { chart, field, palette, rect, stack } from "gofish-graphics";
import { titanicPassengers } from "./dataset";
const passengers = titanicPassengers
  .map((p) => ({ ...p, count: 1 }))
  .sort((a, b) => a.pclass - b.pclass || b.survived - a.survived);
const container = document.getElementById("app");
chart(passengers, { color: palette(["#2b8cbe", "#ff8408"]), axes: true })
  .flow(
    // columns by class — width ∝ each class's passenger count (marginal)
    stack({ by: "pclass", dir: "x", size: "count" }),
    // survival share within each class column (conditional), filling height
    stack({ by: "survived", dir: "y", size: field("count").normalize() }),
  )
  .mark(rect({ fill: "survived", stroke: "white", strokeWidth: 1 }))
  .render(container, { w: 520, h: 420 });

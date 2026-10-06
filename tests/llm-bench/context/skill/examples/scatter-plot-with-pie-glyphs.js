// Scatter Plot with Pie Glyphs
// A scatter plot placing each lake at its geographic location and drawing a miniature pie chart of its species composition as the point glyph.

import { chart, clock, join, rect, scatter, stack } from "gofish-graphics";
import { catchLocationsArray, seafood } from "./dataset";
const container = document.getElementById("app");
chart(catchLocationsArray, { axes: true })
  .flow(scatter({ by: "lake", x: "x", y: "y" }))
  // The glyph chart leaves off its data: as a nested mark it inherits its
  // parent partition (the lake's row), joins in that lake's catch rows, and
  // draws them as a polar pie — no `(data) => chart(data, ...)` callback.
  .mark(
    chart({ coord: clock() })
      .flow(
        join(seafood, { on: "lake" }),
        stack({ by: "species", dir: "x", /* h: "count" */ h: 20 }),
      )
      .mark(rect({ w: "count", fill: "species" })),
  )
  .render(container, {
    w: 400,
    h: 400,
  });

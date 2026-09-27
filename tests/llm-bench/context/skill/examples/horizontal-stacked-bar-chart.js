// Horizontal Stacked Bar Chart
// A horizontal stacked bar chart of barley yield by variety, with each bar segmented and colored by the six experimental field sites.

import { chart, palette, rect, spread, stack } from "gofish-graphics";
import data from "vega-datasets";
(async () => {
  const loaded = { barley: await data["barley.json"]() };
  const context = { loaded };
  const container = document.getElementById("app");
  chart(context.loaded.barley, { color: palette("tableau10"), axes: true })
    .flow(spread({ by: "variety", dir: "y" }), stack({ by: "site", dir: "x" }))
    .mark(rect({ w: "yield", fill: "site" }))
    .render(container, { w: 500, h: 400 });
})();

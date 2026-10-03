// Barley slope chart
// Barley yield change from 1931 to 1932 at six field sites, with one colored slope per variety showing which sites gained and which declined.

import { chart, line, scatter, spread } from "gofish-graphics";
import data from "vega-datasets";
(async () => {
  const loaded = { barley: await data["barley.json"]() };
  const context = { loaded };
  const container = document.getElementById("app");
  const barley = context.loaded.barley;
  chart(barley, { axes: true })
    .flow(
      spread({ by: "site", dir: "x", spacing: 110 }),
      spread({ by: "year", dir: "x", spacing: 36 }),
      scatter({ by: "variety", y: "yield" }),
    )
    .mark(line({ stroke: "variety", strokeWidth: 2 }))
    .render(container, {
      w: 700,
      h: 350,
    });
})();

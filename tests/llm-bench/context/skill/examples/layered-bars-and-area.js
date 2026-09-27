// Layered Bars and Area
// Barley yield across all six field sites: stacked bars per variety and year, overlaid with translucent areas connecting each site's yield across the two years. Morris and Grand Rapids are colored and raised above the gray remaining sites via a data-driven paint order.

import {
  chart,
  field,
  group,
  layer,
  palette,
  project,
  rect,
  ribbon,
  selectAll,
  spread,
  stack,
} from "gofish-graphics";
import data from "vega-datasets";
const isEmphasized = (site) => site === "Morris" || site === "Grand Rapids";
(async () => {
  const loaded = { barley: await data["barley.json"]() };
  const context = { loaded };
  const container = document.getElementById("app");
  const barley = context.loaded.barley;
  chart(barley, {
    color: palette({ Morris: "#e15759", "Grand Rapids": "#4e79a7" }),
    // `axes: true` on the OUTER chart unions the inner cells' yield spaces, so
    // it renders ONE global yield (y) axis plus the variety (x) axis — not a
    // per-cell y axis. Set it here on the topmost chart, not in `.render(...)`:
    // the render-level form doesn't thread through the nested facets yet (#646).
    axes: true,
  })
    .flow(spread({ by: "variety", dir: "x", spacing: 20 }))
    .mark(
      layer([
        // Empty-scope `chart()` inherits this variety cell's partition (#243).
        chart()
          .flow(
            spread({ by: "year", dir: "x", spacing: 40 }),
            stack({ by: field("site").sort("yield"), dir: "y" }),
          )
          .mark(rect({ h: "yield", fill: "site" }).name("bars")),
        chart(selectAll("bars"))
          .flow(group({ by: "site" }))
          .mark(
            ribbon({ opacity: 0.7 }).zOrder((a) =>
              isEmphasized(project(a, "site")) ? 1 : 0,
            ),
          ),
      ]),
    )
    .render(container, { w: 400, h: 400 });
})();

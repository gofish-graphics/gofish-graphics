// 1D Strip Plot
// A one-dimensional strip plot showing the distribution of daily precipitation in Seattle as thin tick marks along a single axis.

import { chart, rect, scatter } from "gofish-graphics";
import data from "vega-datasets";
(async () => {
  const loaded = { weather: await data["seattle-weather.csv"]() };
  const context = { loaded };
  const container = document.getElementById("app");
  chart(context.loaded.weather, { axes: { x: true, y: false } })
    .flow(scatter({ by: "date", x: "precipitation" }))
    .mark(rect({ w: 1, h: 10, fill: "rgb(31, 119, 180)", opacity: 0.7 }))
    .render(container, { w: 300, h: 50 });
})();

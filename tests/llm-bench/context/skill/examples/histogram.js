// Histogram
// A histogram of movie IMDB ratings, with films binned into rating intervals and each bar's height showing the count of films per bin.

import { bin, chart, derive, rect, scatter } from "gofish-graphics";
import data from "vega-datasets";
(async () => {
  const loaded = { movies: await data["movies.json"]() };
  const context = { loaded };
  const container = document.getElementById("app");
  chart(context.loaded.movies, { axes: true })
    .flow(derive(bin("IMDB Rating")), scatter({ xMin: "start", xMax: "end" }))
    .mark(rect({ h: "count" }))
    .render(container, { w: 500, h: 300 });
})();

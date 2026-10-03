// Circle Treemap
// Movie counts by major genre shown as a bubble chart of nested circles sized by each genre's frequency.

import { chart, circle, field, gray, treemap } from "gofish-graphics";
import data from "vega-datasets";
(async () => {
  const loaded = { movies: await data["movies.json"]() };
  const context = { loaded };
  const container = document.getElementById("app");
  const moviesRaw = context.loaded.movies;
  chart(moviesRaw)
    .flow(
      treemap({
        by: field("Major Genre").dropNulls(),
        size: "Worldwide Gross",
        paddingInner: 2,
        paddingOuter: 2,
        round: true,
      }),
    )
    .mark(
      circle({ fill: "Major Genre", stroke: gray, strokeWidth: 1 }).label(
        "Major Genre",
        { position: "center", color: "white", fontSize: 12 },
      ),
    )
    .render(container, { w: 700, h: 420 });
})();

// Treemap
// Movie counts by major genre laid out as a treemap of nested rectangles whose areas encode each genre's frequency.

import { chart, field, gray, rect, treemap } from "gofish-graphics";
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
        tile: "squarify",
        flipY: false,
      }),
    )
    .mark(
      rect({
        fill: "Major Genre",
        stroke: gray,
        strokeWidth: 1,
        rx: 2,
        ry: 2,
      }).label("Major Genre", {
        position: "center",
        color: "white",
        fontSize: 12,
      }),
    )
    .render(container, { w: 700, h: 420 });
})();

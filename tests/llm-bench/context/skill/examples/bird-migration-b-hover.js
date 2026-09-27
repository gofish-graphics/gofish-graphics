// Bird Migration B: Hover
// The same migration paths with interaction added: hovering a path thickens it, fades the rest, and reads the species' name out in the corner.

import {
  chart,
  geo,
  group,
  line,
  live,
  pointer,
  polygon,
  scatter,
  text,
} from "gofish-graphics";
import { birds, world110m } from "./dataset";
const basemap = (options = {}) =>
  chart(world110m, {
    coord: geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
    legend: false,
    ...options,
  }).mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }));
const container = document.getElementById("app");
const hover = pointer();
const hot = (d) => hover.datum()?.species === d?.species;
basemap()
  .layer(
    chart(birds)
      .flow(
        group({ by: "species" }),
        scatter({ by: "day", x: "lon", y: "lat" }),
      )
      .mark(
        line({
          stroke: "species",
          strokeWidth: live((d) => (hot(d) ? 3 : 0.1)),
          opacity: live((d) => (hot(d) ? 1 : 0.5)),
        }),
      ),
  )
  // Readout instead of a cursor-following tooltip: the tooltip the plan
  // prefers — a one-row `chart(hover)` placed at the pointer's data
  // position — needs `pointer().dataPos()` to invert a NON-affine
  // projection, which the interaction layer's affine frame scales cannot
  // express today. See the report / the plan note.
  .layer(
    text({
      text: live(() => hover.datum()?.species ?? ""),
      fontSize: 14,
      fill: "#333",
    }),
  )
  .render(container, { w: 600, h: 600 });

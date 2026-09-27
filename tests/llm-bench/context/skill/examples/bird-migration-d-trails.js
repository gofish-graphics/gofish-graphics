// Bird Migration D: Trails
// Adding animated path trails for the previous twenty days, with the current day's positions at full opacity.

import {
  between,
  chart,
  circle,
  filter,
  geo,
  polygon,
  scatter,
  timer,
} from "gofish-graphics";
import { birds, world110m } from "./dataset";
const basemap = (options = {}) =>
  chart(world110m, {
    coord: geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
    legend: false,
    ...options,
  }).mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }));
const container = document.getElementById("app");
const day = timer({ domain: [1, 365], step: 1, duration: 10000 });
basemap()
  .layer(
    chart(birds)
      .flow(
        // Day-of-year is cyclic, so the 20-day trail is a window on the
        // WRAPPED distance back from the playhead — it stays 20 days long
        // across the loop boundary instead of shrinking at the new year.
        filter((d) =>
          between((day() - d.day + 365) % 365, 0, 20, { closed: "left" }),
        ),
        scatter({ x: "lon", y: "lat" }),
      )
      .mark(
        circle({
          r: 3,
          fill: "species",
          opacity: (d) => (d.day === day() ? 1 : 0.1),
        }),
      ),
  )
  .render(container, { w: 600, h: 600 });

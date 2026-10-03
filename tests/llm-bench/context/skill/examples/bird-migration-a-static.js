// Bird Migration A: Static
// A static visualization of 72 bird species' yearly migrations, each species' daily positions threaded into one path over a map of the Americas.

import { chart, geo, group, line, polygon, scatter } from "gofish-graphics";
import { birds, world110m } from "./dataset";
const basemap = (options = {}) =>
  chart(world110m, {
    coord: geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
    legend: false,
    ...options,
  }).mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }));
const container = document.getElementById("app");
basemap()
  .layer(
    chart(birds)
      .flow(
        group({ by: "species" }),
        scatter({ by: "day", x: "lon", y: "lat" }),
      )
      .mark(line({ stroke: "species", strokeWidth: 1, opacity: 0.5 })),
  )
  .render(container, { w: 600, h: 600 });

// Bird Migration C: Animated
// Switching from static lines to animated circle marks: each species is one circle at its position on the current day, and the chart plays through the year in ten seconds.

import {
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
// The clock is a scale from the data's own `day` domain onto ten seconds of
// wall time, read backward — so `day()` is a day number, not a tick count.
const day = timer({ domain: [1, 365], step: 1, duration: 10000 });
basemap()
  .layer(
    chart(birds)
      .flow(
        filter((d) => d.day === day()),
        scatter({ x: "lon", y: "lat" }),
      )
      .mark(circle({ r: 3, fill: "species" })),
  )
  .render(container, { w: 600, h: 600 });

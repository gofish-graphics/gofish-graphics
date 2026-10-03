// Bird Migration D: Trails
// Adding animated path trails for the previous twenty days, with the current day's positions at full opacity.

import {
  chart,
  circle,
  geo,
  layer,
  polygon,
  scatter,
  time,
  timer,
} from "gofish-graphics";
import { birds, world110m } from "./dataset";
const basemap = (options = {}) =>
  chart(world110m, {
    coord: geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
    legend: false,
    ...options,
  }).mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }));
const trails = (day) =>
  chart(birds)
    .flow(
      // One keyframe per day. Day-of-year is cyclic, so early in January the
      // trail reaches back into December instead of stopping.
      time.sequence({ by: "day", on: day, cyclic: true }),
      scatter({ x: "lon", y: "lat" }),
    )
    .mark(
      // Each day's mark is two layers: a faint circle kept on screen for 20
      // days after its own (the trail), and a solid circle shown during its
      // day.
      layer([
        time.history({ last: 20 }, [
          circle({ r: 3, fill: "species", opacity: 0.1 }),
        ]),
        circle({ r: 3, fill: "species" }),
      ]),
    );
const container = document.getElementById("app");
const day = timer({ domain: [1, 365], step: 1, duration: 10000 });
basemap().layer(trails(day)).render(container, { w: 600, h: 600 });

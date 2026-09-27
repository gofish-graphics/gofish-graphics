// Bird Migration E: Controls
// Adding an interactive slider to scrub through the animation, with a play/pause button; dragging the slider pauses the clock and seeking is exact.

import {
  between,
  button,
  chart,
  circle,
  filter,
  frame,
  geo,
  gofish,
  polygon,
  scatter,
  slider,
  spreadX,
  spreadY,
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
// `padding: 0`: the chart's 30px coord padding is drawn OUTSIDE the node's
// box, so a padded map would paint 30px past the box the `spreadY` stacks
// against — and the controls would sit inside the map. At the root (panels
// A–D) that padding is just canvas margin; in a composition it has to go,
// and the spacing below is the composition's own business.
const map = basemap({ padding: 0 }).layer(
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
);
// The controls are ordinary marks, so they lay out under the map with the
// ordinary operators. The timer stays the single source of truth: the
// slider displays it one way and writes it the other, and a scrub takes
// ownership of the clock by pausing it (the paper's delegation rule).
const timeSlider = slider({
  value: day,
  onInput: (v) => {
    day.pause();
    day.set(v);
  },
  domain: day.domain,
  step: day.step,
  w: 300,
  // Day-of-year is a cycle, like the trail filter above: a scrub off either
  // end of the track continues around the year instead of stopping.
  wrap: true,
  format: (d) => `day ${d}`,
});
const playButton = button({
  label: () => (day.isPlaying() ? "❚❚" : "▶"),
  onClick: () => (day.isPlaying() ? day.pause() : day.play()),
});
// The THUNK form of the low-level terminal: the clock and the handle both
// change the SPEC (a filter, a placement), so the whole picture has to be
// re-evaluable — which is what a thunk gives a composition with no
// `chart()` builder at its root.
// `legend: false` and the map's size are options of the ROOT render here,
// not of the chart: the chart is no longer the root, so it is the enclosing
// composition that decides how big the map box is and whether the canvas
// grows a swatch column. `frame({ w, h })` is the low-level "this child is
// this many pixels" wrapper.
gofish(container, { w: 600, h: 660, legend: false }, () =>
  spreadY({ spacing: 12 }, [
    frame({ w: 600, h: 600 }, [map]),
    spreadX({ spacing: 8 }, [playButton, timeSlider]),
  ]),
);

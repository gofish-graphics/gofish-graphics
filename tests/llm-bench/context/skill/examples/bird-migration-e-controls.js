// Bird Migration E: Controls
// Adding an interactive slider to scrub through the animation, with a play/pause button; dragging the slider pauses the clock and seeking is exact.

import {
  button,
  chart,
  circle,
  frame,
  geo,
  gofish,
  layer,
  polygon,
  scatter,
  slider,
  spreadX,
  spreadY,
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
// `padding: 0`: the chart's 30px coord padding is drawn OUTSIDE the node's
// box, so a padded map would paint 30px past the box the `spreadY` stacks
// against — and the controls would sit inside the map. At the root (panels
// A–D) that padding is just canvas margin; in a composition it has to go,
// and the spacing below is the composition's own business.
const map = basemap({ padding: 0 }).layer(trails(day));
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
  // Day-of-year is a cycle, like the time axis above: a scrub off either
  // end of the track continues around the year instead of stopping.
  wrap: true,
  format: (d) => `day ${d}`,
});
const playButton = button({
  label: () => (day.isPlaying() ? "❚❚" : "▶"),
  onClick: () => (day.isPlaying() ? day.pause() : day.play()),
});
// The THUNK form of the low-level terminal: the button's caption changes
// the SPEC (a new caption measures differently), so the whole picture has
// to be re-evaluable — which is what a thunk gives a composition with no
// `chart()` builder at its root. The clock itself does not: the trails and
// the slider's handle and readout follow it at paint.
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

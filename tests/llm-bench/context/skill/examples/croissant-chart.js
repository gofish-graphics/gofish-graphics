// Croissant Chart
// A gaussian density sliced into gapped vertical bands of unequal width that hold their true x positions, sampling the distribution as a croissant chart over a hand-drawn standard-deviation axis.

import {
  Constraint,
  cut,
  datum,
  image,
  layer,
  rect,
  stack,
  text,
} from "gofish-graphics";
import bellCurveSvg from "./bellcurve.svg";
const container = document.getElementById("app");
const W = 400;
const inset = 16;
// Unequal weights: narrow bands in the tails, wide bands over the peak.
const weights = [1, 1.6, 2.4, 2.4, 1.6, 1];
const slices = cut(image({ href: bellCurveSvg, w: W, h: 120 }), {
  dir: "x",
  size: weights.map((wt) => datum(wt)),
  inset,
});
// Pad each slice back to its full logical extent: inset/2 of transparent
// space on each side along `dir`, via zero-cross-extent spacer rects.
const spacer = () => rect({ w: inset / 2, h: 0, fill: "none", stroke: "none" });
const padded = slices.map((slice) =>
  stack({ dir: "x" }, [spacer(), slice, spacer()]),
);
const bands = stack({ dir: "x" }, padded).name("bands");
// Hand-composed continuous x axis. The low-level Stack of masked slices has
// SIZE space (no continuous POSITION domain), so the renderer's `axes`
// option can't synthesize an axis — we draw one from public primitives. The
// axis is its own W-wide sub-layer: a full-width baseline rect plus numeric
// labels pinned by LITERAL pixel x (frac * W) in the sub-layer's frame. The
// domain is [-3, 3] standard deviations (the gaussian spans mu ± ~3sigma).
const axisTicks = [
  { frac: 0, label: "-3" },
  { frac: 0.25, label: "-1.5" },
  { frac: 0.5, label: "0" },
  { frac: 0.75, label: "1.5" },
  { frac: 1, label: "3" },
];
const axis = layer([
  rect({ w: W, h: 1.5, fill: "#999" }).name("axisLine"),
  ...axisTicks.map((t, i) =>
    text({ text: t.label, fontSize: 12, fill: "#555" }).name(`lab${i}`),
  ),
])
  .relate((g) => [
    // Pin the baseline rect at the sub-layer origin, then place each label's
    // center at its literal x = frac * W and drop it below the line.
    Constraint.align({ x: "start", y: "start" }, [g.axisLine]),
    ...axisTicks.flatMap((t, i) => [
      Constraint.position({ x: t.frac * W }, [g[`lab${i}`]]),
      Constraint.distribute({ dir: "y", spacing: 6 }, [
        g.axisLine,
        g[`lab${i}`],
      ]),
    ]),
  ])
  .name("axis");
layer([bands, axis])
  .relate(({ bands, axis }) => [
    // Axis row centered under the bands (both are W wide). y-down free
    // space: bands-first renders on top, axis below (issue #143/#16).
    Constraint.align({ x: "middle" }, [bands, axis]),
    Constraint.distribute({ dir: "y", spacing: 12 }, [bands, axis]),
  ])
  .render(container, { axes: false });

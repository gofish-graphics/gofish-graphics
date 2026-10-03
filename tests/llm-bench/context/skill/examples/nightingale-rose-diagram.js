// Nightingale Rose Diagram
// A polar rose chart of values across twelve sectors and six concentric rings shaded by a blues gradient.

import { chart, clock, gradient, rect, spread, stack } from "gofish-graphics";
const NUM_RINGS = 6;
const NUM_SECTORS = 12;
const roseData = Array.from({ length: NUM_RINGS * NUM_SECTORS }, (_, i) => {
  const sector = i % NUM_SECTORS;
  const ring = Math.floor(i / NUM_SECTORS);
  return {
    sector: `S${sector + 1}`,
    ring,
    value: 2 + 25 * Math.abs(Math.sin(sector * 1.3) * Math.cos(ring * 0.9 + 1)),
  };
});
const container = document.getElementById("app");
chart(roseData, { color: gradient("blues"), coord: clock(), axes: true })
  .flow(
    spread({ by: "sector", dir: "x", spacing: 0, axes: false }),
    stack({ by: "ring", dir: "y", axes: true }),
  )
  .mark(
    rect({
      w: (Math.PI * 2) / NUM_SECTORS,
      emX: true,
      h: "value",
      fill: "ring",
    }),
  )
  .render(container, { w: 400, h: 400 });

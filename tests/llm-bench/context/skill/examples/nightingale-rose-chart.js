// Nightingale Rose Chart
// A recreation of Florence Nightingale's polar-area diagram of Crimean War mortality, with each month's wedge extending by cause of death (disease, wounds, and other).

import { chart, clock, derive, rect, spread, stack } from "gofish-graphics";
import { nightingale } from "./dataset";
const container = document.getElementById("app");
chart(nightingale, { coord: clock(), axes: true })
  .flow(
    spread({ by: "Month", dir: "x", spacing: 0, axes: { x: false, y: true } }),
    stack({ by: "Type", dir: "y" }),
    /* TODO: push this into the h encoding of rect */
    derive((d) => d.map((d) => ({ ...d, Death: Math.sqrt(d.Death) }))),
  )
  .mark(
    /* TODO: remove emX wart */
    rect({ w: (Math.PI * 2) / 12, emX: true, h: "Death", fill: "Type" }),
  )
  .render(container, {
    w: 400,
    h: 400,
  });

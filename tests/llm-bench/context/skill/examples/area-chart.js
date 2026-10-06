// Area Chart
// Fish catch counts across six lakes drawn as a single smoothed filled area.

import { chart, ribbon, spread } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
// An area chart has no intrinsic width, so it fills the container: the
// six lakes are spread to span `args.w` (five gaps between them) instead of
// a fixed pixel spacing, which would leave the canvas partly empty.
const lakes = 6;
chart(seafood, { axes: true })
  .flow(spread({ by: "lake", dir: "x", spacing: 500 / (lakes - 1) }))
  .mark(ribbon({ h: "count", opacity: 0.8 }))
  .render(container, {
    w: 500,
    h: 300,
  });

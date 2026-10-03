// Waffle Chart
// A waffle chart of fish catch across six lakes, where each catch becomes a colored square tiled into per-lake columns so the species mix reads as a grid of unit cells.

import { chart, derive, rect, repeat, spread } from "gofish-graphics";
import _ from "lodash";
import { seafood } from "./dataset";
const container = document.getElementById("app");
// x-axis at the bottom (y-end) so the lake labels sit under the upward-
// filling waffle columns rather than above them.
chart(seafood, { axes: { x: { side: "end" } } })
  .flow(
    // Bottom-align the lake columns (y-down free space: "end" = bottom) so the
    // waffles sit on a shared baseline and fill upward rather than hang down.
    spread({ by: "lake", spacing: 8, dir: "x", axes: false, alignment: "end" }),
    derive((d) => d.flatMap((d) => repeat(d, "count"))),
    derive((d) => _.chunk(d, 5)),
    // Reverse the rows so the ragged (partial) last row lands at the TOP and
    // the full rows fill the baseline upward (y-down free space).
    spread({ spacing: 2, dir: "y", reverse: true }),
    spread({ spacing: 2, dir: "x" }),
  )
  .mark(rect({ w: 8, h: 8, fill: "species" }))
  .render(container, {});

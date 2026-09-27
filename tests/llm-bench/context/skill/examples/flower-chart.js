// Flower Chart
// A distribution rendered as a meadow, where each binned count grows a layered flower of colored petals atop a green stem.

import {
  chart,
  color,
  group,
  layer,
  petal,
  polar,
  rect,
  scatter,
  selectAll,
  spread,
  stackX,
  v,
} from "gofish-graphics";
import { catchLocations, seafood } from "./dataset";
const FLOWER_RADIUS = 40;
const stemData = seafood.map((d) => ({
  ...d,
  x: catchLocations[d.lake].x,
}));
const container = document.getElementById("app");
// The same shape as a labeled bar chart — but the bars are stems and the
// labels are flowers. The stems are a real bar chart, so their heights
// share one scale and grow with each lake's total catch (the `count` size
// channel auto-sums per lake); each flower is the stem's "label", placed on
// top of it via the selectAll + spread pattern.
layer([
  // Stems: one thin green bar per lake, planted at the lake's x location,
  // height = total catch (one chart, so all stems share the height scale).
  chart(stemData)
    .flow(scatter({ by: "lake", x: "x" }))
    .mark(rect({ w: 4, h: "count", fill: color.green[5] }).name("stems")),
  // Flowers: each stem's label. `selectAll("stems")` yields one ref per
  // lake (its datum is that lake's species rows); stack a polar petal fan
  // on top of the stem.
  chart(selectAll("stems"))
    .flow(group({ by: "lake" }))
    .mark((d) =>
      spread({ dir: "y", alignment: "middle", spacing: -FLOWER_RADIUS }, [
        d[0],
        layer({ coord: polar() }, [
          stackX(
            {
              h: FLOWER_RADIUS,
              spacing: 0,
              alignment: "start",
              sharedScale: true,
            },
            d[0].datum.map((r) =>
              petal({
                w: v(r.count),
                fill: v(r.species).lighten(0.5),
              }),
            ),
          ),
        ]),
      ]),
    ),
]).render(container, {
  w: 400,
  h: 400,
  axes: false,
});

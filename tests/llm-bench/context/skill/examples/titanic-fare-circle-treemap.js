// Titanic Fare Circle Treemap
// Each Titanic passenger drawn as a circle sized by fare paid and colored by survival, packed into a squarified treemap and faceted by passenger class.

import { chart, circle, palette, treemap } from "gofish-graphics";
import { titanicPassengers } from "./dataset";
const container = document.getElementById("app");
chart(titanicPassengers, { color: palette(["#2b8cbe", "#ff8408"]) })
  .facet({ by: "pclass", dir: "x" })
  .flow(
    treemap({
      h: "fare",
      size: "fare",
      paddingInner: 0,
      tile: "squarifyCircle",
      sort: "desc",
      flipY: true,
    }),
  )
  .mark(circle({ fill: "survived", stroke: "#ccc", strokeWidth: 1 }))
  .render(container, { w: 1000, h: 320 });

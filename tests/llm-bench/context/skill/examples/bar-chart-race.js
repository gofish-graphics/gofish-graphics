// Bar Chart Race
// Twenty years of brand values as an animated bar chart race, in which every brand slides to its new rank as the years go by.

import {
  chart,
  field,
  live,
  rect,
  scatter,
  spread,
  text,
  time,
  timer,
} from "gofish-graphics";
import { categoryBrands, everyYearBrands } from "./dataset";
const brands = everyYearBrands(categoryBrands);
const YEARS = [2000, 2019];
const DURATION = 20000;
const yearReadout = (clock, h) =>
  chart([{ value: 210000 }])
    .flow(scatter({ x: "value" }))
    .mark(
      text({
        text: live(() => String(Math.floor(clock()))),
        fontSize: 48,
        fill: "#ccc",
        y: h - 130,
      }).zOrder(-1),
    );
const container = document.getElementById("app");
const year = timer({ domain: YEARS, duration: DURATION });
chart(brands, { legend: false })
  .flow(
    time.sequence({ by: "year", on: year }),
    spread({
      by: field("name").sort("value", "desc"),
      dir: "y",
      sharedScale: true,
      spacing: 2,
    }),
  )
  .mark(
    rect({ w: "value", fill: "category" }).label("name", {
      position: "outset-right",
    }),
  )
  .layer(time.transition({ curve: "linear" }))
  .layer(yearReadout(year, 600))
  .render(container, {
    w: 600,
    h: 600,
    axes: { x: true, y: false },
  });

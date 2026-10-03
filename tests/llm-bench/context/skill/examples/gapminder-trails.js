// Gapminder Trails
// Five countries' fertility rate and life expectancy from 1955 to 2005, each a dot moving through the years that leaves a trail of its past years behind it.

import {
  animation,
  chart,
  circle,
  layer,
  line,
  live,
  scatter,
  text,
  time,
  timer,
} from "gofish-graphics";
import data from "vega-datasets";
const yearRange = (rows) => {
  const years = rows.map((d) => Number(d.year));
  return [Math.min(...years), Math.max(...years)];
};
const yearReadout = (clock) =>
  chart([{ fertility: 7.5, life_expect: 83 }])
    .flow(scatter({ x: "fertility", y: "life_expect" }))
    .mark(
      text({
        text: live(() => String(Math.floor(clock()))),
        fontSize: 48,
        fill: "#ccc",
      }).zOrder(-1),
    );
const TRAIL_COUNTRIES = [
  "China",
  "India",
  "United States",
  "Rwanda",
  "South Africa",
];
const trails = (rows, clock, curve, options = {}) =>
  chart(
    rows.filter((d) => TRAIL_COUNTRIES.includes(d.country)),
    options,
  )
    .flow(
      time.sequence({ by: "year", on: clock }),
      scatter({ by: "country", x: "fertility", y: "life_expect" }),
    )
    .mark(
      layer([
        time.history([circle({ r: 4, fill: "country", opacity: 0.3 })]),
        circle({ r: 4, fill: "country" }).transition({
          update: animation.tween({ curve }),
        }),
      ]),
    )
    .layer(
      line({
        along: "year",
        stroke: "country",
        strokeWidth: 1.5,
        opacity: 0.6,
        curve,
      }),
    );
(async () => {
  const loaded = { gapminder: await data["gapminder.json"]() };
  const context = { loaded };
  const container = document.getElementById("app");
  const gapminder = context.loaded.gapminder;
  const year = timer({ domain: yearRange(gapminder), duration: 10000 });
  trails(gapminder, year, "monotone")
    .layer(yearReadout(year))
    .render(container, { w: 500, h: 400, axes: true });
})();

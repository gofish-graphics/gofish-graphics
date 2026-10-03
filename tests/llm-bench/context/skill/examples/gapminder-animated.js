// Gapminder Animated
// Fifty years of every country's fertility rate and life expectancy, played as an animation in which each country is one moving dot.

import {
  chart,
  circle,
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
(async () => {
  const loaded = { gapminder: await data["gapminder.json"]() };
  const context = { loaded };
  const container = document.getElementById("app");
  const gapminder = context.loaded.gapminder;
  const year = timer({ domain: yearRange(gapminder), duration: 5000 });
  chart(gapminder, { legend: false })
    .flow(
      time.sequence({ by: "year", on: year }),
      scatter({ by: "country", x: "fertility", y: "life_expect" }),
    )
    .mark(circle({ r: 4, fill: "country" }))
    .layer(time.transition())
    .layer(yearReadout(year))
    .render(container, { w: 500, h: 400, axes: true });
})();

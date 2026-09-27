// Seattle Weather Stacked Bar Chart
// A vertical stacked bar chart of the count of Seattle weather days per month, with each bar segmented and colored by weather type.

import {
  chart,
  derive,
  field,
  palette,
  rect,
  spread,
  stack,
} from "gofish-graphics";
import data from "vega-datasets";
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
(async () => {
  const loaded = { weather: await data["seattle-weather.csv"]() };
  const context = { loaded };
  const container = document.getElementById("app");
  // Seattle weather data: count of days per weather type per month.
  // Vega-Lite uses `timeUnit: "month"` and `aggregate: "count"` declaratively.
  // GoFish equivalent: use derive() to extract month from date, then group and count.
  // TODO: need a better way of aggregating by count or whatever.
  chart(context.loaded.weather, {
    axes: true,
    color: palette({
      sun: "#e7ba52",
      fog: "#dfdfdf",
      drizzle: "#79a1d5",
      rain: "#1f77b4",
      snow: "#9467bd",
    }),
  })
    .flow(
      derive((d) =>
        d.map((row) => ({
          month: MONTHS[new Date(row.date).getMonth()],
          ...row,
        })),
      ),
      spread({ by: "month", dir: "x" }),
      stack({
        by: field("weather").sort(["sun", "fog", "drizzle", "rain", "snow"]),
        dir: "y",
      }),
    )
    .mark(rect({ h: field("date").count(), fill: "weather" }))
    .render(container, { w: 600, h: 300 });
})();

import { value } from "../ast/data";
import { rect } from "../ast/shapes/rect";
import _ from "lodash";
import { stackY } from "../ast/graphicalOperators/stackY";
import { stackX } from "../ast/graphicalOperators/stackX";
import { seattleWeather } from "../data/seatle-weather";
import { frame } from "../ast/graphicalOperators/frame";
import { ribbon } from "../lib";
import { ref } from "../ast/shapes/ref";

const colorScale = {
  sun: "#e7ba52",
  fog: "#c7c7c7",
  drizzle: "#aec7e8",
  rain: "#1f77b4",
  snow: "#9467bd",
};

const stackedBarDataset = _(seattleWeather).groupBy((d) => {
  const date = new Date(d.date);
  const monthNames = [
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
  return monthNames[date.getMonth()];
});

export const testVLStackedBar = () =>
  frame([
    stackX(
      { spacing: 20, sharedScale: true },
      _(stackedBarDataset)
        .toPairs()
        .sortBy(([month]) => {
          const monthOrder = {
            Jan: 0,
            Feb: 1,
            Mar: 2,
            Apr: 3,
            May: 4,
            Jun: 5,
            Jul: 6,
            Aug: 7,
            Sep: 8,
            Oct: 9,
            Nov: 10,
            Dec: 11,
          };
          return monthOrder[month as keyof typeof monthOrder];
        })
        .fromPairs()
        .map((d, month) =>
          stackY(
            { spacing: 0 },
            _(d)
              .groupBy("weather")
              .toPairs()
              .sortBy(([weather]) => {
                const order = { sun: 0, snow: 1, rain: 2, fog: 3, drizzle: 4 };
                return order[weather as keyof typeof order];
              })
              .map(([weather, d]) =>
                rect({
                  name: `${month}-${weather}`,
                  w: 12,
                  h: value(d.length),
                  fill: colorScale[weather as keyof typeof colorScale],
                })
              )
              .value()
          )
        )
        .value()
    ),
    _(seattleWeather)
      .groupBy("month")
      .map((items) =>
        ribbon(
          { dir: "x", opacity: 0.8, mixBlendMode: "multiply" },
          items.map((d) => {
            const date = new Date(d.date);
            const monthNames = [
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
            const month = monthNames[date.getMonth()];
            return ref(`${month}-${d.weather}`);
          })
        )
      )
      .value(),
  ]);

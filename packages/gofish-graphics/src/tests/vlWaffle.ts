import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";
import _ from "lodash";
import { seattleWeather } from "../data/seatle-weather";
import { spreadX } from "../ast/graphicalOperators/spreadX";
import { spreadY } from "../ast/graphicalOperators/spreadY";

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

export const testVLWaffle = (size: { width: number; height: number }) =>
  gofish(
    { width: size.width, height: size.height },
    spreadX(
      { spacing: 0},
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
        .map((d) =>
          spreadY(
            { spacing: 0, alignment: "start" },
            _(d)
              .sortBy((d) => {
                const order = { drizzle: 4, fog: 3, rain: 2, snow: 1, sun: 0 };
                return order[d.weather as keyof typeof order];
              })
              .chunk(3)
              .reverse()
              .map((d) =>
                spreadX(
                  { spacing: 0},
                  d.map((d) =>
                    rect({
                      w: 3.5,
                      h: 3.5,
                      fill: colorScale[d.weather as keyof typeof colorScale],
                    })
                  )
                )
              )
              .value()
          )
        )
        .value()
    )
  );

import { value } from "../ast/data";
import { rect } from "../ast/shapes/rect";
import _ from "lodash";
import { stackY } from "../ast/graphicalOperators/stackY";
import { stackX } from "../ast/graphicalOperators/stackX";
import { seattleWeather } from "../data/seatle-weather";
import { stackXTemplate } from "../templates/stackXTemplate";
import { stackYTemplate } from "../templates/stackYTemplate";

const colorScale = {
  sun: "#e7ba52",
  fog: "#c7c7c7",
  drizzle: "#aec7e8",
  rain: "#1f77b4",
  snow: "#9467bd",
};

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
const stackedBarDataset = _(seattleWeather)
  .map((d) => ({
    ...d,
    month: monthNames[new Date(d.date).getMonth()],
  }))
  .value();

export const testVLStackedBarRefactor = () =>
  stackXTemplate(
    stackedBarDataset,
    {
      spacing: 1,
      groupBy: { field: "month", sort: monthNames },
    },
    (monthData) =>
      stackYTemplate(
        monthData,
        {
          spacing: 0,
          groupBy: {
            field: "weather",
            sort: ["sun", "snow", "rain", "fog", "drizzle"],
          },
        },
        (d, weather) =>
          rect({
            w: 12,
            h: value(d.length),
            fill: colorScale[weather as keyof typeof colorScale],
          })
      )
  );

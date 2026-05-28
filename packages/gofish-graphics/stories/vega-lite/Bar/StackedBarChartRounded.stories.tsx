import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { Chart, spread, stack, rect, derive, palette } from "../../../src/lib";
import { groupBy } from "lodash";
import data from "vega-datasets";

// Mirrors: https://vega.github.io/vega-lite/examples/stacked_bar_count_corner_radius_mark.html

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

const meta: Meta = {
  title: "Vega-Lite/Stacked Bar Chart (Rounded Corners)",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 600, h: 300 },
  loaders: [async () => ({ weather: await data["seattle-weather.csv"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();

    // MISSING FEATURE: Per-corner radius is not supported. Vega-Lite supports
    // `cornerRadiusTopLeft` and `cornerRadiusTopRight` to round only the top corners
    // of each bar segment. GoFish's `rx`/`ry` applies the same radius to all four
    // corners of every bar.
    // arguably this should be done with some kind of clip path or something.
    Chart(context.loaded.weather as any[], {
      color: palette({ sun: "#e7ba52", fog: "#dfdfdf", drizzle: "#79a1d5", rain: "#1f77b4", snow: "#9467bd" }),
    })
      .flow(
        derive((d: any[]) => {
          const withMonth = d.map((row) => ({
            month: MONTHS[new Date(row.date).getMonth()],
            weather: row.weather,
          }));
          const result: { month: string; weather: string; count: number }[] =
            [];
          const byMonth = groupBy(withMonth, "month");
          for (const month of MONTHS) {
            if (!byMonth[month]) continue;
            const byWeather = groupBy(byMonth[month], "weather");
            for (const [weather, rows] of Object.entries(byWeather)) {
              result.push({ month, weather, count: (rows as any[]).length });
            }
          }
          return result;
        }),
        spread({ by: "month",  dir: "x" }),
        stack({ by: "weather",  dir: "y" })
      )
      .mark(rect({ h: "count", fill: "weather", rx: 3, ry: 3 }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

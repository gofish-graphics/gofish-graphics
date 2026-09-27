import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/bar-mean-line",
  kind: "create",
  data: "rainfall",
  size: { w: 640, h: 400 },
  instruction:
    "Make a vertical bar chart with one bar per `month`, left to right in the order the months " +
    "appear in the data. A bar's height is its `rain_mm`, measured from zero. Draw a horizontal " +
    "dashed line at the mean of the twelve `rain_mm` values, spanning the whole plot from the " +
    "left edge of the first bar to the right edge of the last bar (or wider), on top of the " +
    'bars. Label the line with the text "Mean = M", where M is the mean rounded to one ' +
    "decimal place, placed just above the line near its right end. Show each month's name " +
    "under its bar and a numeric vertical axis.",
  checks: [
    {
      check: "referenceLine",
      orientation: "vertical",
      category: "month",
      value: "rain_mm",
      at: "mean",
      label: "Mean = 52.1",
      dashed: true,
    },
    { check: "textIncludes", strings: ["Jan", "Jun", "Dec"] },
    { check: "sizeAbout" },
  ],
};
export default task;

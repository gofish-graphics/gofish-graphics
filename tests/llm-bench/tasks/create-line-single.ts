import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/line-single",
  kind: "create",
  data: "wheat",
  size: { w: 640, h: 400 },
  instruction:
    "Make a line chart of the price of wheat over time: `year` on the horizontal axis (numeric) " +
    "and `wheat` on the vertical axis (linear). Draw one line that connects the values in year " +
    'order. Title the horizontal axis "Year" and the vertical axis "Wheat price (shillings)".',
  checks: [
    { check: "lineSeries", x: "year", y: "wheat" },
    { check: "textIncludes", strings: ["Year", "Wheat price (shillings)"] },
    { check: "sizeAbout" },
  ],
};
export default task;

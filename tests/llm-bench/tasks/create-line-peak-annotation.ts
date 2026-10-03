import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/line-peak-annotation",
  kind: "create",
  data: "museum-visits",
  size: { w: 640, h: 400 },
  instruction:
    "Make a line chart of `visitors` (in thousands) by `year`: `year` on the horizontal axis " +
    "(numeric) and `visitors` on the vertical axis (linear). Draw one line that connects the " +
    "values in year order with straight segments. Mark the point with the highest `visitors` " +
    "with a filled circle of radius about 5 px centered on that point, and annotate it with " +
    'the text "Peak: V in Y", where V is that `visitors` value written with a comma as the ' +
    "thousands separator and Y is its year (for example Peak: 1,234 in 1999). Place the text " +
    "next to the marked point, no more than 30 px away from it.",
  checks: [
    { check: "lineSeries", x: "year", y: "visitors" },
    {
      check: "annotation",
      x: "year",
      y: "visitors",
      at: "max",
      text: "Peak: 1,587 in 2019",
    },
    { check: "sizeAbout" },
  ],
};
export default task;

import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "edit/bar-to-horizontal",
  kind: "edit",
  base: "create/bar-basic",
  data: "lake-totals",
  size: { w: 640, h: 400 },
  instruction:
    "Turn this into a horizontal bar chart: lakes along the vertical axis, and `count` as the bar " +
    "length along the horizontal axis, measured from zero. Keep everything else the same.",
  checks: [
    {
      check: "bars",
      orientation: "horizontal",
      category: "lake",
      value: "count",
      direction: "either",
    },
    {
      check: "textIncludes",
      strings: ["Lake A", "Lake B", "Lake C", "Lake D", "Lake E", "Lake F"],
    },
    { check: "sizeAbout" },
  ],
  // Changing orientation moves the category labels from the bottom axis to
  // the left one, so the chart's outer size changes with the axis layout.
  mayChange: ["size"],
};
export default task;

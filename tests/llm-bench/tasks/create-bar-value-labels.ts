import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/bar-value-labels",
  kind: "create",
  data: "store-sales",
  size: { w: 640, h: 400 },
  instruction:
    "Make a vertical bar chart with one bar per `store`, left to right in the order the stores " +
    "appear in the data. A bar's height is its `sales`, measured from zero. Print each bar's " +
    "value as text just above the top of its bar and horizontally centered on the bar, written " +
    "as a whole number with a comma as the thousands separator (for example 1,240). Show each " +
    "store's name under its bar and a numeric vertical axis.",
  checks: [
    {
      check: "bars",
      orientation: "vertical",
      category: "store",
      value: "sales",
      valueLabels: {},
    },
    {
      check: "textIncludes",
      strings: ["North", "South", "East", "West", "Central", "Online"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

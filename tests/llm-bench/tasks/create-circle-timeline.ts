import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/circle-timeline",
  kind: "create",
  group: "corpus-pilot",
  data: "quarterly-sales",
  size: { w: 640, h: 300 },
  instruction:
    "Make a circle timeline of `sales`: one horizontal row per `category`, top to bottom in " +
    "the order the categories appear in the data, with one filled circle per row of the data, " +
    "centered on its category's line at its `date` along a shared horizontal time axis. Each " +
    "circle's area is proportional to its `sales` (the same scale for every circle, so twice " +
    "the sales is twice the area), with the largest circle about 18 pixels in radius. Give " +
    "each category its own color and label each row with its category name.",
  checks: [
    {
      check: "strips",
      category: "category",
      value: "date",
      size: "sales",
      colorBy: "category",
    },
    {
      check: "textIncludes",
      strings: ["Furniture", "Office Supplies", "Technology"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/area",
  kind: "create",
  group: "corpus-pilot",
  data: "quarterly-sales",
  size: { w: 640, h: 400 },
  instruction:
    "Make a stacked area chart of `sales` over `date` (a time axis) by `category`: one filled " +
    "area per category, stacked from zero with no gaps, bottom to top in the order the " +
    "categories appear in the data, so the top edge of the stack at each date is the total " +
    "sales. Join the dates with straight lines. Give each category its own color and include " +
    "a legend that names each category. Use a linear vertical axis starting at zero.",
  checks: [
    { check: "stackedArea", x: "date", y: "sales", series: "category" },
    {
      check: "textIncludes",
      strings: ["Furniture", "Office Supplies", "Technology"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

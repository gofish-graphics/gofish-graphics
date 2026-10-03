import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/dot-strip-plot",
  kind: "create",
  group: "corpus-pilot",
  data: "monthly-subcategory-sales",
  size: { w: 640, h: 380 },
  instruction:
    "Make a dot strip plot of `sales`: one horizontal strip per `month`, top to bottom in the " +
    "order the months appear in the data, with one filled circle per row of the data placed " +
    "along a shared linear horizontal axis at its `sales`. All circles of a month are " +
    "centered on that month's horizontal line, with no vertical jitter. Color the circles by " +
    "`sub_category` (one color per sub-category) and include a legend that names each " +
    "sub-category. Label each strip with its month.",
  checks: [
    {
      check: "strips",
      category: "month",
      value: "sales",
      colorBy: "sub_category",
    },
    {
      check: "textIncludes",
      strings: ["January", "June", "Accessories", "Storage"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

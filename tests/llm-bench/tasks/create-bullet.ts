import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/bullet",
  kind: "create",
  group: "corpus-pilot",
  data: "sales-targets",
  size: { w: 640, h: 300 },
  instruction:
    "Make a bullet chart with one horizontal bullet per `category`, top to bottom in data " +
    "order, all on one shared linear scale from zero. Each bullet has three background bands, " +
    "from zero to `poor`, from `poor` to `average` and from `average` to `good`, in three " +
    "shades of gray (darkest for the lowest band); a thinner bar from zero to `sales` in a " +
    "dark color, centered on the bands and about a third of their height; and a short " +
    "vertical line across the bar at `target`, taller than the bar. Label each bullet with " +
    "its category name.",
  checks: [
    {
      check: "bullet",
      category: "category",
      value: "sales",
      target: "target",
      ranges: ["poor", "average", "good"],
    },
    {
      check: "textIncludes",
      strings: ["Technology", "Furniture", "Office Supplies"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

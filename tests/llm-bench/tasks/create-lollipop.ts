import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/lollipop",
  kind: "create",
  group: "corpus-pilot",
  data: "region-sales",
  size: { w: 560, h: 320 },
  instruction:
    "Make a horizontal lollipop chart of `sales` by `region`: for each region, a thin line " +
    "(the stem) from zero out to its sales value, ending in a filled circle centered on the " +
    "value. Stem lengths are measured from zero on one linear scale. Order the regions by " +
    "sales, largest at the top. Label each lollipop with its region name.",
  checks: [
    {
      check: "lollipop",
      orientation: "horizontal",
      category: "region",
      value: "sales",
      sort: "desc",
    },
    { check: "textIncludes", strings: ["South", "Central", "East", "West"] },
    { check: "sizeAbout" },
  ],
};
export default task;

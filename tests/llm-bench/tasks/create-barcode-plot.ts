import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/barcode-plot",
  kind: "create",
  group: "corpus-pilot",
  data: "state-average-sales",
  size: { w: 640, h: 300 },
  instruction:
    "Make a barcode plot of `avg_sales`: one horizontal row per `sub_category`, top to bottom " +
    "in the order they appear in the data, and in each row one short vertical line (a tick " +
    "about 15 pixels tall) per state, placed along a shared linear horizontal axis at the " +
    "state's `avg_sales`. All ticks in a row are centered on that row's line. Draw every tick " +
    "in the same color. Label each row with its sub-category name.",
  checks: [
    {
      check: "strips",
      category: "sub_category",
      value: "avg_sales",
      mark: "tick",
    },
    { check: "textIncludes", strings: ["Binders", "Paper", "Storage", "Art"] },
    { check: "sizeAbout" },
  ],
};
export default task;

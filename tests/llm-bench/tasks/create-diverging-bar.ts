import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/diverging-bar",
  kind: "create",
  group: "corpus-pilot",
  data: "profit-ratio",
  size: { w: 560, h: 480 },
  instruction:
    "Make a horizontal bar chart of `profit_ratio` by `sub_category`, one bar per " +
    "sub-category, top to bottom in the order they appear in the data. Every bar starts at " +
    "zero: negative ratios extend to the left of zero and positive ones to the right, with " +
    "lengths proportional to the ratio on one linear scale. Draw the bars with a negative " +
    "ratio in red (#d62728) and all other bars in one other color. Label each bar with its " +
    "sub-category name.",
  checks: [
    {
      check: "bars",
      orientation: "horizontal",
      category: "sub_category",
      value: "profit_ratio",
      highlight: { where: { profit_ratio: { max: -0.5 } }, color: "#d62728" },
    },
    {
      check: "textIncludes",
      strings: ["Furnishings", "Binders", "Storage", "Labels"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;
